import { describe, it, expect } from 'vitest';
import { isLayoutEngineReady, TreemapNode } from './index.js';

describe('@visoagent/layout', () => {
  it('reports layout engine readiness', () => {
    expect(isLayoutEngineReady()).toBe(true);
  });

  it('instantiates treemap nodes correctly', () => {
    const node: TreemapNode = {
      id: 'node-1',
      weight: 150,
    };
    expect(node.id).toBe('node-1');
    expect(node.weight).toBe(150);
  });
});
