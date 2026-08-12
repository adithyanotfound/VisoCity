import { describe, it, expect } from 'vitest';
import { isScannerAvailable, WorldScannerOptions } from './index.js';

describe('@visoagent/worldgen', () => {
  it('reports scanner availability', () => {
    expect(isScannerAvailable()).toBe(true);
  });

  it('accepts valid scanner options', () => {
    const options: WorldScannerOptions = {
      repoPath: '/workspace/visoagent',
      maxFiles: 5000,
    };
    expect(options.repoPath).toBe('/workspace/visoagent');
    expect(options.maxFiles).toBe(5000);
  });
});
