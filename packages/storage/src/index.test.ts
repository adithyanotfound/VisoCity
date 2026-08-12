import { describe, it, expect } from 'vitest';
import { getDatabaseDefaults, StorageOptions } from './index.js';

describe('@visoagent/storage', () => {
  it('returns default database options', () => {
    const defaults = getDatabaseDefaults();
    expect(defaults.dbPath).toBe('.visocity/world.db');
  });

  it('accepts custom storage options', () => {
    const options: StorageOptions = {
      dbPath: '/custom/path/world.db',
    };
    expect(options.dbPath).toBe('/custom/path/world.db');
  });
});
