import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface TempDirectoryResult {
  dirPath: string;
  createFile: (relPath: string, content: string) => Promise<string>;
  cleanup: () => Promise<void>;
}

export async function createTempDirectory(
  prefix = 'visoagent-test-',
): Promise<TempDirectoryResult> {
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));

  const createFile = async (relPath: string, content: string): Promise<string> => {
    const fullPath = path.join(dirPath, relPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    return fullPath;
  };

  const cleanup = async (): Promise<void> => {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors in tests
    }
  };

  return {
    dirPath,
    createFile,
    cleanup,
  };
}
