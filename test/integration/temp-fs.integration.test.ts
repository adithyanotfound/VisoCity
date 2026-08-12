import { describe, it, expect } from 'vitest';
import { createTempDirectory } from '../helpers/temp-repo.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Temporary Test Filesystem Utility', () => {
  it('creates temporary directories and writes files correctly', async () => {
    const temp = await createTempDirectory('visoagent-unit-test-');

    expect(temp.dirPath).toBeDefined();

    const filePath = await temp.createFile('src/index.ts', 'console.log("hello test");');
    expect(filePath).toBe(path.join(temp.dirPath, 'src/index.ts'));

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('console.log("hello test");');

    await temp.cleanup();

    await expect(fs.access(temp.dirPath)).rejects.toThrow();
  });
});
