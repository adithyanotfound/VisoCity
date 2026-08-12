import { describe, it, expect } from 'vitest';
import { isGitClientReady, GitClientOptions } from './index.js';

describe('@visoagent/git', () => {
  it('reports git client readiness', () => {
    expect(isGitClientReady()).toBe(true);
  });

  it('accepts valid git client options', () => {
    const options: GitClientOptions = {
      repoPath: '/workspace/target-repo',
    };
    expect(options.repoPath).toBe('/workspace/target-repo');
  });
});
