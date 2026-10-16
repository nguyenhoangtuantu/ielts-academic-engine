// tests/config/env.test.ts
import { describe, it, expect } from 'vitest';
import { validateEnv } from '../../src/config/env';

describe('validateEnv', () => {
  it('throws when required environment variables are missing', () => {
    expect(() => validateEnv({})).toThrow(/OPENAI_API_KEY/);
  });
  it('passes and returns parsed config when valid', () => {
    const valid = {
      PORT: '3000',
      REDIS_URL: 'redis://localhost:6379',
      DATABASE_URL: 'postgresql://postgres:***@localhost:5432/db',
      OPENAI_API_KEY: 'sk-test',
      PAYOS_CLIENT_ID: 'cid',
      PAYOS_API_KEY: 'key',
      PAYOS_CHECKSUM_KEY: 'check'
    };
    expect(validateEnv(valid).PORT).toBe(3000);
  });
});
