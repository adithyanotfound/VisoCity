import type { MayorCommand } from '@visoagent/protocol';

export const mockAuthCommand: MayorCommand = {
  type: 'session.auth',
  token: 'mock-bearer-token-xyz-123',
};

export const mockRepoSelectCommand: MayorCommand = {
  type: 'repo.select',
  repoPath: '/workspace/visoagent',
};

export const mockPromptCommand: MayorCommand = {
  type: 'session.prompt',
  cityId: 'main',
  prompt: 'Implement health check endpoint with JSON schema validation',
  model: 'sonnet',
  effort: 'high',
  permissionMode: 'default',
  contextPaths: ['apps/server/src/routes/health.ts'],
};

export const mockInterruptCommand: MayorCommand = {
  type: 'session.interrupt',
  cityId: 'main',
};

export const mockPermitResolveAllowCommand: MayorCommand = {
  type: 'permit.resolve',
  permitId: 'permit-5678',
  decision: 'allow',
};

export const mockPermitResolveDenyCommand: MayorCommand = {
  type: 'permit.resolve',
  permitId: 'permit-5678',
  decision: 'deny',
  reason: 'Operation violates security policy for sensitive directory',
};

export const mockCityTravelCommand: MayorCommand = {
  type: 'city.travel',
  cityId: 'pr-42',
};

export const mockCityRefreshCommand: MayorCommand = {
  type: 'city.refresh',
  cityId: 'main',
};

export const mockWorldRequestCommand: MayorCommand = {
  type: 'world.request',
  cityId: 'main',
};

export const mockDiffRequestCommand: MayorCommand = {
  type: 'diff.request',
  cityId: 'pr-42',
  filePath: 'src/main.ts',
};
