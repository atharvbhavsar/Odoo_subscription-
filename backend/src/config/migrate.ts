import fs from 'fs';
import path from 'path';
import { db } from './database';

export async function runMigrations() {
  console.log('Running database migrations...');
  const migrationsDir = path.resolve(__dirname, '../../../database/migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    console.log(`Applying migration: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    try {
      await db.exec(sql);
    } catch (err: any) {
      if (err.message && err.message.toLowerCase().includes('duplicate column name')) {
        // Safe idempotent column addition
        continue;
      }
      throw err;
    }
  }
  console.log('Migrations applied successfully.');
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

