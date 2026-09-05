import { describe, expect, it } from 'vitest';
import {
  createWardRequestSchema,
  fieldErrorsFromUnknown,
  fieldErrorsFromZodError,
  resetPasswordRequestSchema,
  rotateWardCodeRequestSchema,
} from './admin.schema.js';

const validCreateWard = {
  name: 'Fictional Test Ward',
  timeZone: 'America/Denver',
  adminUsername: 'ward.admin',
  adminDisplayName: 'Fictional Ward Admin',
  adminPassword: 'Fictional-Password-42',
  initialWardCode: 'fictional-ward-code',
};

describe('createWardRequestSchema', () => {
  it('accepts a valid fictional payload', () => {
    const result = createWardRequestSchema.parse(validCreateWard);
    expect(result).toEqual(validCreateWard);
  });

  it('reports that the admin password must be at least 12 characters', () => {
    const result = createWardRequestSchema.safeParse({
      ...validCreateWard,
      adminPassword: 'Short1',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrorsFromZodError(result.error).adminPassword).toBe(
      'Admin password must be at least 12 characters.',
    );
  });

  it('reports that the ward code must be at least 4 characters', () => {
    const result = createWardRequestSchema.safeParse({
      ...validCreateWard,
      initialWardCode: 'abc',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrorsFromZodError(result.error).initialWardCode).toBe(
      'Ward code must be at least 4 characters.',
    );
  });

  it('reports that the ward name is required', () => {
    const result = createWardRequestSchema.safeParse({
      ...validCreateWard,
      name: '',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrorsFromZodError(result.error).name).toBe('Ward name is required.');
  });
});

describe('fieldErrorsFromUnknown', () => {
  it('maps a ZodError thrown by parse and returns null for other errors', () => {
    let thrown: unknown;
    try {
      createWardRequestSchema.parse({ ...validCreateWard, adminPassword: 'short' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeDefined();
    expect(fieldErrorsFromUnknown(thrown)?.adminPassword).toBe(
      'Admin password must be at least 12 characters.',
    );
    expect(fieldErrorsFromUnknown(new Error('network'))).toBeNull();
  });
});

describe('resetPasswordRequestSchema', () => {
  it('reports that the password must be at least 12 characters', () => {
    const result = resetPasswordRequestSchema.safeParse({ password: 'Short1' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrorsFromZodError(result.error).password).toBe('Password must be at least 12 characters.');
  });

  it('accepts a fictional password that meets the length rule', () => {
    expect(resetPasswordRequestSchema.parse({ password: 'Fictional-Reset-42' }).password).toBe('Fictional-Reset-42');
  });
});

describe('rotateWardCodeRequestSchema', () => {
  it('reports that the ward code must be at least 4 characters', () => {
    const result = rotateWardCodeRequestSchema.safeParse({ newWardCode: 'abc' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrorsFromZodError(result.error).newWardCode).toBe('Ward code must be at least 4 characters.');
  });
});
