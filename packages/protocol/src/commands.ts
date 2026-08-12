import { z } from 'zod';

export const MayorCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session.auth'),
    token: z.string(),
  }),
  z.object({
    type: z.literal('repo.select'),
    repoPath: z.string(),
  }),
  z.object({
    type: z.literal('session.prompt'),
    cityId: z.string(),
    prompt: z.string(),
    model: z.enum(['opus', 'sonnet', 'haiku']),
    effort: z.enum(['low', 'medium', 'high', 'max']),
    permissionMode: z.enum(['default', 'auto']),
    contextPaths: z.array(z.string()),
  }),
  z.object({
    type: z.literal('session.interrupt'),
    cityId: z.string(),
  }),
  z.object({
    type: z.literal('permit.resolve'),
    permitId: z.string(),
    decision: z.enum(['allow', 'deny']),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal('city.travel'),
    cityId: z.string(),
  }),
  z.object({
    type: z.literal('city.refresh'),
    cityId: z.string().optional(),
  }),
  z.object({
    type: z.literal('world.request'),
    cityId: z.string().optional(),
  }),
  z.object({
    type: z.literal('diff.request'),
    cityId: z.string(),
    filePath: z.string(),
  }),
]);

export type MayorCommand = z.infer<typeof MayorCommandSchema>;
