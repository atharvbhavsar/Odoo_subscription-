import fs from 'fs';
import path from 'path';
import { db } from './database';

export async function runSeeds() {
  console.log('Running database seeds...');
  const candidateDirs = [
    path.resolve(__dirname, '../../database/seeds'),
    path.resolve(__dirname, '../../../database/seeds'),
    path.resolve(process.cwd(), 'database/seeds'),
    path.resolve(process.cwd(), '../database/seeds'),
  ];
  const seedsDir = candidateDirs.find(d => fs.existsSync(d));
  if (!seedsDir) {
    console.warn('No seeds directory found in candidates:', candidateDirs);
    return;
  }

  const files = fs.readdirSync(seedsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    console.log(`Applying seed: ${file}`);
    const sql = fs.readFileSync(path.join(seedsDir, file), 'utf-8');
    await db.exec(sql);
  }
  console.log('Seeds applied successfully.');
}

if (require.main === module) {
  runSeeds()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
