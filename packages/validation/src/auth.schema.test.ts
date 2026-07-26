import { describe, expect, it } from 'vitest';
import { loginRequestSchema, loginResponseSchema, authUserSchema } from './auth.schema.js';

describe('loginRequestSchema', () => {
  it('accepts a valid username/password payload', () => {
    const result = loginRequestSchema.parse({ username: 'jane.doe', password: 'Fictional-Password-42' });
    expect(result.username).toBe('jane.doe');
  });

  it('rejects an empty username', () => {
    expect(() => loginRequestSchema.parse({ username: '', password: 'x' })).toThrow();
  });
});

describe('loginResponseSchema', () => {
  it('parses a ward_code_required response without a user payload', () => {
    const result = loginResponseSchema.parse({ status: 'ward_code_required', loginTicket: 'abc' });
    expect(result.status).toBe('ward_code_required');
  });

  it('parses an ok response with a user payload and never a password/hash field', () => {
    const user = authUserSchema.parse({
      id: 'user-1',
      wardId: 'ward-1',
      username: 'jane.doe',
      displayName: 'Jane Doe',
      permissions: ['directory.read'],
    });
    expect(user).not.toHaveProperty('passwordHash');
    expect(loginResponseSchema.parse({ status: 'ok', user })).toEqual({ status: 'ok', user });
  });
});
