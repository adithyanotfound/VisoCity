import { z } from 'zod';
import { WorldSnapshotSchema } from './world.js';
import { PullRequestOverlaySchema } from './diff.js';

export const CitySummarySchema = z.object({
  cityId: z.string(),
  label: z.string(),
  kind: z.enum(['main', 'pr', 'issue', 'local']),
  status: z.enum(['idle', 'building', 'ready', 'failed']),
  prNumber: z.number().optional(),
});
export type CitySummary = z.infer<typeof CitySummarySchema>;

export const GameEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session.started'),
    cityId: z.string(),
    sessionId: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal('assistant.message'),
    cityId: z.string(),
    textChunk: z.string(),
  }),
  z.object({
    type: z.literal('tool.started'),
    cityId: z.string(),
    toolName: z.string(),
    targetPath: z.string().optional(),
    input: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal('tool.completed'),
    cityId: z.string(),
    toolName: z.string(),
    targetPath: z.string().optional(),
    success: z.boolean(),
  }),
  z.object({
    type: z.literal('file.changed'),
    cityId: z.string(),
    filePath: z.string(),
    changeType: z.enum(['create', 'modify', 'delete']),
  }),
  z.object({
    type: z.literal('permit.requested'),
    cityId: z.string(),
    permitId: z.string(),
    toolName: z.string(),
    description: z.string(),
    targetPath: z.string().optional(),
  }),
  z.object({
    type: z.literal('session.usage'),
    cityId: z.string(),
    costUsd: z.number(),
    totalSpendUsd: z.number(),
    budgetLimitUsd: z.number(),
  }),
  z.object({
    type: z.literal('session.finished'),
    cityId: z.string(),
    status: z.enum(['completed', 'aborted', 'error']),
    summary: z.string().optional(),
  }),
]);
export type GameEvent = z.infer<typeof GameEventSchema>;

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('world.ready'),
    snapshot: WorldSnapshotSchema,
  }),
  z.object({
    type: z.literal('overlay'),
    overlay: PullRequestOverlaySchema,
  }),
  z.object({
    type: z.literal('event'),
    event: GameEventSchema,
  }),
  z.object({
    type: z.literal('cities.roster'),
    cities: z.array(CitySummarySchema),
  }),
  z.object({
    type: z.literal('diff.response'),
    filePath: z.string(),
    unifiedDiff: z.string(),
  }),
  z.object({
    type: z.literal('error'),
    message: z.string(),
    code: z.string().optional(),
  }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
