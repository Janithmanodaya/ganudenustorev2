import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'ganudenu.sqlite');
export const db = new Database(dbPath, { fileMustExist: false });

// Pragmas for stability
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');