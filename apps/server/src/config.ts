import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

// Load environment variables from .env file if available
dotenv.config();

const ConfigSchema = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.coerce.number().int().positive().default(4100),
  webOrigin: z.string().default('http://127.0.0.1:5173'),
  repoPath: z.string().default(process.cwd()),
  maxBudgetUsd: z.coerce.number().positive().default(1.0),
  cloneRoot: z.string().default('.visocity/clones'),
  anthropicApiKey: z.string().optional(),
  githubClientId: z.string().optional(),
  githubClientSecret: z.string().optional(),
  githubAppSlug: z.string().optional(),
  githubToken: z.string().optional(),
  sessionSecret: z.string().optional(),
  databaseUrl: z.string().optional(),
  isProduction: z.boolean().default(process.env.NODE_ENV === 'production'),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): AppConfig {
  const raw = {
    host: process.env.HOST ?? '127.0.0.1',
    port: process.env.PORT ?? 4100,
    webOrigin: process.env.WEB_ORIGIN ?? 'http://127.0.0.1:5173',
    repoPath: process.env.SUDO_CITY_REPO ?? process.cwd(),
    maxBudgetUsd: process.env.SUDO_CITY_MAX_BUDGET_USD ?? 1.0,
    cloneRoot: process.env.SUDO_CITY_CLONE_ROOT ?? path.resolve(process.cwd(), '.visocity/clones'),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    githubClientId: process.env.GITHUB_CLIENT_ID,
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
    githubAppSlug: process.env.GITHUB_APP_SLUG,
    githubToken: process.env.GITHUB_TOKEN,
    sessionSecret: process.env.SESSION_SECRET,
    databaseUrl: process.env.DATABASE_URL,
    isProduction: process.env.NODE_ENV === 'production',
  };

  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('Invalid server configuration:', parsed.error.format());
    throw new Error('Invalid environment configuration');
  }

  return parsed.data;
}

export const config = loadConfig();
