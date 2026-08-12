import { z } from 'zod';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  timestamp: z.string(),
  uptime: z.number().nonnegative().optional(),
  repoPath: z.string().optional(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
