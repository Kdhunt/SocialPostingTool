import { describe, expect, it } from 'vitest';
import { queryBooleanSchema } from './query.schema.js';
import { audienceSearchQuerySchema } from './audience.schema.js';
import { campaignSearchQuerySchema } from './campaign.schema.js';
import { personSearchQuerySchema } from './directory.schema.js';

describe('queryBooleanSchema', () => {
  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
    [true, true],
    [false, false],
  ])('reads %j as %j', (input, expected) => {
    expect(queryBooleanSchema.parse(input)).toBe(expected);
  });

  it('rejects anything else instead of guessing', () => {
    expect(queryBooleanSchema.safeParse('yes').success).toBe(false);
    expect(queryBooleanSchema.safeParse('').success).toBe(false);
  });
});

describe('search filters', () => {
  it('keeps inactive people hidden when the client sends includeInactive=false', () => {
    expect(personSearchQuerySchema.parse({ includeInactive: 'false' }).includeInactive).toBe(false);
    expect(personSearchQuerySchema.parse({ includeInactive: 'true' }).includeInactive).toBe(true);
    expect(personSearchQuerySchema.parse({}).includeInactive).toBeUndefined();
  });

  it('keeps archived audiences and campaigns hidden when the client sends includeArchived=false', () => {
    expect(audienceSearchQuerySchema.parse({ includeArchived: 'false' }).includeArchived).toBe(false);
    expect(campaignSearchQuerySchema.parse({ includeArchived: 'false' }).includeArchived).toBe(false);
  });
});
