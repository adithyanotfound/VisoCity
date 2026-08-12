import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { StorageOptions } from '../types.js';
import { getDatabaseDefaults } from '../db.js';
import { initSchema } from './schema.js';

export function createDatabase(options: StorageOptions = {}): DatabaseSync {
  const isMemory = options.inMemory || options.dbPath === ':memory:';

  let db: DatabaseSync;
  if (isMemory) {
    db = new DatabaseSync(':memory:');
  } else {
    const dbPath = options.dbPath ?? getDatabaseDefaults().dbPath;
    const dirname = path.dirname(dbPath);
    if (dirname && !fs.existsSync(dirname)) {
      fs.mkdirSync(dirname, { recursive: true });
    }
    db = new DatabaseSync(dbPath);
    // Set WAL mode for persistent files
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
  }

  initSchema(db);
  return db;
}
