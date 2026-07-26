import { describe, expect, it } from 'vitest';
import { validateCampaignForSubmission } from './campaign-submission-validation.js';

const validInput = {
  hasContent: true,
  audienceCount: 1,
  activeDestinationCount: 1,
  hasArchivedDestination: false,
};

describe('validateCampaignForSubmission', () => {
  it('is valid when content, audiences, and an active destination all exist', () => {
    expect(validateCampaignForSubmission(validInput)).toEqual({ valid: true, errors: [] });
  });

  it('rejects missing content', () => {
    const result = validateCampaignForSubmission({ ...validInput, hasContent: false });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /base message/.test(e))).toBe(true);
  });

  it('rejects empty audiences', () => {
    const result = validateCampaignForSubmission({ ...validInput, audienceCount: 0, activeDestinationCount: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /at least one audience/.test(e))).toBe(true);
  });

  it('rejects when a resolved destination has been archived', () => {
    const result = validateCampaignForSubmission({ ...validInput, hasArchivedDestination: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /archived/.test(e))).toBe(true);
  });

  it('rejects when audiences are selected but no active destination is linked', () => {
    const result = validateCampaignForSubmission({ ...validInput, activeDestinationCount: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /no active communication destination/.test(e))).toBe(true);
  });

  it('accumulates every applicable error at once', () => {
    const result = validateCampaignForSubmission({
      hasContent: false,
      audienceCount: 0,
      activeDestinationCount: 0,
      hasArchivedDestination: false,
    });
    expect(result.errors).toHaveLength(2);
  });
});
