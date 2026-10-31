import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { env } from './env';

// Database engine interface
export interface IDatabase {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<{ changes: number }>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

class SQLiteDatabase implements IDatabase {
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

    let sourcePath = filePath || candidatePaths.find(p => fs.existsSync(p));
    let dbPath = sourcePath || path.resolve(__dirname, '../../brightloop.sqlite');

    // In serverless environments (e.g. Vercel / AWS Lambda), the root filesystem is read-only.
    // Copy bundled sqlite database to writable /tmp directory.
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

    // Verify if tables are initialized; if not, apply schema migrations & seed automatically
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
    const migrationsDir = candidateDirs.find(d => fs.existsSync(d));
    if (migrationsDir) {
      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
      for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
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
    const seedsDir = seedDirs.find(d => fs.existsSync(d));
    if (seedsDir) {
      const files = fs.readdirSync(seedsDir).filter(f => f.endsWith('.sql')).sort();
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

export const db: IDatabase = new SQLiteDatabase();
