import { z } from 'zod';

export const FileDiffStatusSchema = z.enum(['added', 'modified', 'deleted', 'renamed']);
export type FileDiffStatus = z.infer<typeof FileDiffStatusSchema>;

export const FileDiffEntrySchema = z.object({
  path: z.string(),
  status: FileDiffStatusSchema,
  insertions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  oldPath: z.string().optional(),
});
export type FileDiffEntry = z.infer<typeof FileDiffEntrySchema>;

export const PullRequestOverlaySchema = z.object({
  cityId: z.string(),
  prNumber: z.number().int().positive(),
  title: z.string(),
  author: z.string(),
  baseSha: z.string(),
  headSha: z.string(),
  changedFiles: z.array(FileDiffEntrySchema),
});
export type PullRequestOverlay = z.infer<typeof PullRequestOverlaySchema>;
