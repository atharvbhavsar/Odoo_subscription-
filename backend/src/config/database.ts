import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { Pool, PoolClient, types } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from './env';

// Database engine interface
export interface IDatabase {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<{ changes: number }>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * Translates SQLite syntax to standard PostgreSQL dialect:
 * - Replaces ? parameter placeholders with $1, $2, ...
 * - Translates datetime('now') to CURRENT_TIMESTAMP
 * - Translates date('now') to CURRENT_DATE
 * - Translates strftime('%Y-%m', col) to SUBSTR(CAST(col AS TEXT), 1, 7)
 * - Translates julianday(x) to CAST(x AS DATE)
 * - Translates INSERT OR IGNORE INTO to INSERT INTO ... ON CONFLICT DO NOTHING
 * - Translates case-sensitive LIKE to case-insensitive ILIKE
 */
export function toPgSql(sql: string): string {
  let paramIndex = 1;
  let pgSql = sql;

  // datetime('now') -> CURRENT_TIMESTAMP
  pgSql = pgSql.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');
  // date('now') -> CURRENT_DATE
  pgSql = pgSql.replace(/date\('now'\)/gi, 'CURRENT_DATE');

  // strftime('%Y-%m', col) -> SUBSTR(CAST(col AS TEXT), 1, 7)
  pgSql = pgSql.replace(/strftime\('%Y-%m',\s*([^)]+)\)/gi, 'SUBSTR(CAST($1 AS TEXT), 1, 7)');

  // julianday(col) -> CAST(col AS DATE)
  pgSql = pgSql.replace(/julianday\(([^)]+)\)/gi, 'CAST($1 AS DATE)');

  // INSERT OR IGNORE INTO
  if (/^INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(pgSql)) {
    pgSql = pgSql.replace(/^INSERT\s+OR\s+IGNORE\s+INTO\b/i, 'INSERT INTO ');
    if (!/ON\s+CONFLICT\b/i.test(pgSql)) {
      pgSql += ' ON CONFLICT DO NOTHING';
    }
  }

  // LIKE -> ILIKE
  pgSql = pgSql.replace(/\bLIKE\b/g, 'ILIKE');

  // ? placeholders -> $1, $2, ...
  pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);

  return pgSql;
}

export class PostgresDatabase implements IDatabase {
  private pool: Pool;
  private txStorage = new AsyncLocalStorage<PoolClient>();

  constructor(connectionString: string) {
    // Parse int8 (type 20, e.g. COUNT(*)) as integer
    types.setTypeParser(20, (val: string) => parseInt(val, 10));
    // Parse numeric/decimal (type 1700) as float
    types.setTypeParser(1700, (val: string) => parseFloat(val));

    this.pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client:', err);
    });
  }

  private async getClient(): Promise<{ client: PoolClient; isTx: boolean }> {
    const txClient = this.txStorage.getStore();
    if (txClient) {
      return { client: txClient, isTx: true };
    }
    const client = await this.pool.connect();
    return { client, isTx: false };
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const pgSql = toPgSql(sql);
    const { client, isTx } = await this.getClient();
    try {
      const res = await client.query(pgSql, params);
      return res.rows as T[];
    } finally {
      if (!isTx) client.release();
    }
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async execute(sql: string, params: any[] = []): Promise<{ changes: number }> {
    const pgSql = toPgSql(sql);
    const { client, isTx } = await this.getClient();
    try {
      const res = await client.query(pgSql, params);
      return { changes: res.rowCount || 0 };
    } finally {
      if (!isTx) client.release();
    }
  }

  async exec(sql: string): Promise<void> {
    const { client, isTx } = await this.getClient();
    try {
      await client.query(sql);
    } finally {
      if (!isTx) client.release();
    }
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.txStorage.run(client, async () => {
        return await fn();
      });
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export class SQLiteDatabase implements IDatabase {
  private db: DatabaseSync;

  constructor(filePath?: string) {
    const candidatePaths = [
      path.resolve(__dirname, '../../brightloop.sqlite'),
      path.resolve(__dirname, '../../../database/brightloop.sqlite'),
      path.resolve(process.cwd(), 'brightloop.sqlite'),
      path.resolve(process.cwd(), '../database/brightloop.sqlite'),
      path.resolve('/var/task', 'brightloop.sqlite'),
      path.resolve('/var/task/backend', 'brightloop.sqlite'),
    ];

    let sourcePath = filePath || candidatePaths.find((p) => fs.existsSync(p));
    let dbPath = sourcePath || path.resolve(__dirname, '../../brightloop.sqlite');

    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      const tmpPath = path.join('/tmp', 'brightloop.sqlite');
      if (!fs.existsSync(tmpPath) && sourcePath && fs.existsSync(sourcePath)) {
        try {
          fs.copyFileSync(sourcePath, tmpPath);
        } catch (e) {
          console.warn('Notice: Could not copy bundled sqlite to /tmp:', e);
        }
      }
      dbPath = tmpPath;
    }

    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');

    this.ensureInitialized();
  }

  private ensureInitialized() {
    try {
      const stmt = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
      const table = stmt.get();
      if (!table) {
        console.log('Tables not found in active database, bootstrapping schema and seeds...');
        this.runBootstrapMigrations();
      }
    } catch (e) {
      console.warn('Initialization check warning:', e);
    }
  }

  private runBootstrapMigrations() {
    const candidateDirs = [
      path.resolve(__dirname, '../../database/migrations'),
      path.resolve(__dirname, '../../../database/migrations'),
      path.resolve(process.cwd(), 'database/migrations'),
      path.resolve('/var/task/database/migrations'),
    ];
    const migrationsDir = candidateDirs.find((d) => fs.existsSync(d));
    if (migrationsDir) {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
      for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        const statements = sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
        for (const s of statements) {
          try {
            this.db.exec(s);
          } catch (err: any) {
            if (err.message && err.message.toLowerCase().includes('duplicate column name')) continue;
          }
        }
      }
    }

    const seedDirs = [
      path.resolve(__dirname, '../../database/seeds'),
      path.resolve(__dirname, '../../../database/seeds'),
      path.resolve(process.cwd(), 'database/seeds'),
      path.resolve('/var/task/database/seeds'),
    ];
    const seedsDir = seedDirs.find((d) => fs.existsSync(d));
    if (seedsDir) {
      const files = fs.readdirSync(seedsDir).filter((f) => f.endsWith('.sql')).sort();
      for (const file of files) {
        const sql = fs.readFileSync(path.join(seedsDir, file), 'utf-8');
        try {
          this.db.exec(sql);
        } catch (e) {
          // ignore seed conflict
        }
      }
    }
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    const result = stmt.all(...params);
    return result as T[];
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async execute(sql: string, params: any[] = []): Promise<{ changes: number }> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return { changes: Number(result.changes) };
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const res = await fn();
      this.db.exec('COMMIT;');
      return res;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }
}

const useSqlite = process.env.USE_SQLITE === 'true' || (env.DATABASE_URL && env.DATABASE_URL.startsWith('sqlite'));
const dbUrl = env.DATABASE_URL || process.env.DATABASE_URL;

export const db: IDatabase = !useSqlite && dbUrl
  ? new PostgresDatabase(dbUrl)
  : new SQLiteDatabase();
