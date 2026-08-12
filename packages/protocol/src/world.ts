import { z } from 'zod';

export const BuildingSchema = z.object({
  id: z.string(),
  path: z.string(),
  filename: z.string(),
  districtId: z.string(),
  language: z.string(),
  colorHex: z.string(),
  loc: z.number().int().nonnegative(),
  // Isometric Grid Coordinates:
  gridX: z.number().int(),
  gridY: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  elevation: z.number().int().nonnegative(),
});
export type Building = z.infer<typeof BuildingSchema>;

export const DistrictSchema = z.object({
  id: z.string(),
  path: z.string(),
  name: z.string(),
  loc: z.number().int().nonnegative(),
  gridX: z.number().int(),
  gridY: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  colorHex: z.string(),
});
export type District = z.infer<typeof DistrictSchema>;

export const RoadSchema = z.object({
  from: z.object({ x: z.number(), y: z.number() }),
  to: z.object({ x: z.number(), y: z.number() }),
});
export type Road = z.infer<typeof RoadSchema>;

export const WorldSnapshotSchema = z.object({
  cityId: z.string(),
  repoName: z.string(),
  commitSha: z.string(),
  totalLoc: z.number().int().nonnegative(),
  bounds: z.object({
    minX: z.number().int(),
    minY: z.number().int(),
    maxX: z.number().int(),
    maxY: z.number().int(),
  }),
  districts: z.array(DistrictSchema),
  buildings: z.array(BuildingSchema),
  roads: z.array(RoadSchema),
});
export type WorldSnapshot = z.infer<typeof WorldSnapshotSchema>;
