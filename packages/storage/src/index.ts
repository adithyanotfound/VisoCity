// Storage package placeholder for SQLite persistence
export interface StorageOptions {
  dbPath: string;
}

export function getDatabaseDefaults(): StorageOptions {
  return {
    dbPath: '.visocity/world.db',
  };
}
