import { describe, expect, it } from 'vitest';
import {
  createPersonRequestSchema,
  createContactMethodRequestSchema,
  personDetailSchema,
  personSearchQuerySchema,
} from './directory.schema.js';

describe('createPersonRequestSchema', () => {
  it('accepts a minimal person with just a name', () => {
    const result = createPersonRequestSchema.parse({ firstName: 'Jane', lastName: 'Doe' });
    expect(result).toEqual({ firstName: 'Jane', lastName: 'Doe' });
  });

  it('accepts an optional date of birth in date-only ISO form', () => {
    const result = createPersonRequestSchema.parse({ firstName: 'Jane', lastName: 'Doe', dateOfBirth: '2015-06-01' });
    expect(result.dateOfBirth).toBe('2015-06-01');
  });

  it('rejects an empty first name', () => {
    expect(() => createPersonRequestSchema.parse({ firstName: '', lastName: 'Doe' })).toThrow();
  });
});

describe('createContactMethodRequestSchema', () => {
  it('accepts a phone contact method', () => {
    const result = createContactMethodRequestSchema.parse({ type: 'Phone', value: '555-010-1234' });
    expect(result.type).toBe('Phone');
  });

  it('rejects an unknown contact method type', () => {
    expect(() => createContactMethodRequestSchema.parse({ type: 'Fax', value: 'x' })).toThrow();
  });
});

describe('personDetailSchema', () => {
  it('represents a minor-restricted record with dateOfBirth withheld rather than omitted', () => {
    const result = personDetailSchema.parse({
      id: 'p1',
      firstName: 'Jane',
      lastName: 'Doe',
      preferredName: null,
      gender: 'Female',
      dateOfBirth: null,
      isMinor: true,
      isActive: true,
      restricted: true,
      contactMethods: [],
      householdMemberships: [],
      relationships: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(result.restricted).toBe(true);
    expect(result.dateOfBirth).toBeNull();
  });
});

describe('personSearchQuerySchema', () => {
  it('coerces limit and includeInactive from query string values', () => {
    const result = personSearchQuerySchema.parse({ query: 'doe', includeInactive: 'true', limit: '10' });
    expect(result).toEqual({ query: 'doe', includeInactive: true, limit: 10 });
  });

  it('allows an empty query object (all fields optional)', () => {
    expect(personSearchQuerySchema.parse({})).toEqual({});
  });
});
