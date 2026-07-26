import { describe, expect, it } from 'vitest';
import { createFictionalEmail, createFictionalId } from './fictional-id.js';

describe('createFictionalId', () => {
  it('pads the sequence and namespaces by prefix', () => {
    expect(createFictionalId('member', 1)).toBe('fictional-member-000001');
  });
});

describe('createFictionalEmail', () => {
  it('always uses the reserved example.com domain', () => {
    expect(createFictionalEmail('jane.doe')).toBe('jane.doe@example.com');
  });
});
