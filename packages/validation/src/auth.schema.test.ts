import { describe, expect, it } from 'vitest';
import {
  loginRequestSchema,
  loginResponseSchema,
  authUserSchema,
  changeEmailRequestSchema,
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordWithTokenRequestSchema,
  verifyEmailRequestSchema,
} from './auth.schema.js';
import { EMAIL_INVALID_MESSAGE, EMAIL_REQUIRED_MESSAGE } from './email.schema.js';

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

describe('account email schemas', () => {
  it('accepts a forgot-password email', () => {
    expect(forgotPasswordRequestSchema.parse({ email: 'member@example.com' }).email).toBe('member@example.com');
  });

  it('requires a verification token', () => {
    expect(verifyEmailRequestSchema.safeParse({ token: '' }).success).toBe(false);
  });

  it('requires a 12-character password when completing a reset', () => {
    const short = resetPasswordWithTokenRequestSchema.safeParse({ token: 'tok', password: 'short' });
    expect(short.success).toBe(false);
    expect(
      resetPasswordWithTokenRequestSchema.parse({ token: 'tok', password: 'Fictional-Reset-42' }).password,
    ).toBe('Fictional-Reset-42');
  });
});

describe('changeEmailRequestSchema', () => {
  it('requires and normalizes email', () => {
    expect(changeEmailRequestSchema.safeParse({ email: '' }).success).toBe(false);
    expect(changeEmailRequestSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
    expect(changeEmailRequestSchema.parse({ email: '  Member@Example.COM  ' }).email).toBe('member@example.com');
  });

  it('reports field messages for missing and invalid addresses', () => {
    const missing = changeEmailRequestSchema.safeParse({ email: '' });
    expect(missing.success).toBe(false);
    if (missing.success) return;
    expect(missing.error.issues[0]?.message).toBe(EMAIL_REQUIRED_MESSAGE);

    const invalid = changeEmailRequestSchema.safeParse({ email: 'nope' });
    expect(invalid.success).toBe(false);
    if (invalid.success) return;
    expect(invalid.error.issues[0]?.message).toBe(EMAIL_INVALID_MESSAGE);
  });
});

describe('changePasswordRequestSchema', () => {
  it('requires the current password and a 12-character replacement', () => {
    const missingCurrent = changePasswordRequestSchema.safeParse({
      currentPassword: '',
      newPassword: 'Fictional-Reset-42',
    });
    expect(missingCurrent.success).toBe(false);

    const short = changePasswordRequestSchema.safeParse({
      currentPassword: 'Fictional-Password-42',
      newPassword: 'short',
    });
    expect(short.success).toBe(false);
  });

  it('rejects a new password that matches the current password', () => {
    const result = changePasswordRequestSchema.safeParse({
      currentPassword: 'Fictional-Password-42',
      newPassword: 'Fictional-Password-42',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path[0] === 'newPassword')).toBe(true);
  });

  it('accepts a fictional current and new password pair', () => {
    expect(
      changePasswordRequestSchema.parse({
        currentPassword: 'Fictional-Password-42',
        newPassword: 'Fictional-Reset-99x',
      }),
    ).toEqual({
      currentPassword: 'Fictional-Password-42',
      newPassword: 'Fictional-Reset-99x',
    });
  });
});
