import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  PAYOS_CLIENT_ID: z.string().min(1, 'PAYOS_CLIENT_ID is required'),
  PAYOS_API_KEY: z.string().min(1, 'PAYOS_API_KEY is required'),
  PAYOS_CHECKSUM_KEY: z.string().min(1, 'PAYOS_CHECKSUM_KEY is required'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(rawEnv: Record<string, unknown> = process.env): EnvConfig {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new Error(`Environment validation error: ${errorDetails}`);
  }
  return result.data;
}

let cachedEnv: EnvConfig | undefined;

export const env: EnvConfig = new Proxy({} as EnvConfig, {
  get(_target, prop: string | symbol) {
    if (typeof prop === 'symbol') {
      return undefined;
    }
    if (!cachedEnv) {
      cachedEnv = validateEnv(process.env);
    }
    return (cachedEnv as unknown as Record<string, unknown>)[prop];
  },
});
