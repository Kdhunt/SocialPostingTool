import { describe, expect, it } from 'vitest';
import {
  audiencePreviewRequestSchema,
  createAudienceGroupRequestSchema,
  createCommunicationDestinationRequestSchema,
} from './audience.schema.js';

describe('createAudienceGroupRequestSchema', () => {
  it('accepts a name-only request (no hardcoded ward-specific vocabulary required)', () => {
    const result = createAudienceGroupRequestSchema.parse({ name: 'Whatever a ward wants to call it' });
    expect(result.name).toBe('Whatever a ward wants to call it');
  });

  it('rejects an empty name', () => {
    expect(() => createAudienceGroupRequestSchema.parse({ name: '' })).toThrow();
  });
});

describe('createCommunicationDestinationRequestSchema', () => {
  it('accepts a valid destination', () => {
    const result = createCommunicationDestinationRequestSchema.parse({ name: 'Ward email list', channel: 'Email' });
    expect(result.channel).toBe('Email');
  });

  it('rejects an unknown channel', () => {
    expect(() =>
      createCommunicationDestinationRequestSchema.parse({ name: 'Carrier pigeon', channel: 'Pigeon' }),
    ).toThrow();
  });
});

describe('audiencePreviewRequestSchema', () => {
  it('requires at least one audience group id', () => {
    expect(() => audiencePreviewRequestSchema.parse({ audienceGroupIds: [] })).toThrow();
  });

  it('accepts multiple audience group ids for overlap preview', () => {
    const result = audiencePreviewRequestSchema.parse({ audienceGroupIds: ['a1', 'a2'] });
    expect(result.audienceGroupIds).toEqual(['a1', 'a2']);
  });
});
