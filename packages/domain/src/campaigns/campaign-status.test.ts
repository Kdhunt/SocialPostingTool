import { describe, expect, it } from 'vitest';
import {
  isCampaignEditable,
  isCampaignStatusTerminal,
  isValidCampaignStatusTransition,
} from './campaign-status.js';

describe('isValidCampaignStatusTransition', () => {
  it('allows submitting a draft for approval', () => {
    expect(isValidCampaignStatusTransition('Draft', 'PendingApproval')).toBe(true);
  });

  it('allows approving or rejecting a pending campaign', () => {
    expect(isValidCampaignStatusTransition('PendingApproval', 'Approved')).toBe(true);
    expect(isValidCampaignStatusTransition('PendingApproval', 'Rejected')).toBe(true);
  });

  it('rejects skipping straight from Draft to Sent', () => {
    expect(isValidCampaignStatusTransition('Draft', 'Sent')).toBe(false);
  });

  it('rejects skipping approval entirely (Draft -> Approved)', () => {
    expect(isValidCampaignStatusTransition('Draft', 'Approved')).toBe(false);
  });

  it('rejects any transition out of a terminal status', () => {
    expect(isValidCampaignStatusTransition('Sent', 'Draft')).toBe(false);
    expect(isValidCampaignStatusTransition('Cancelled', 'Draft')).toBe(false);
  });

  it('allows a rejected campaign to be revised back to Draft', () => {
    expect(isValidCampaignStatusTransition('Rejected', 'Draft')).toBe(true);
  });

  it('rejects resubmitting a rejected campaign without first revising it', () => {
    expect(isValidCampaignStatusTransition('Rejected', 'PendingApproval')).toBe(false);
  });
});

describe('isCampaignEditable', () => {
  it('is only editable while Draft', () => {
    expect(isCampaignEditable('Draft')).toBe(true);
    expect(isCampaignEditable('Rejected')).toBe(false);
    expect(isCampaignEditable('PendingApproval')).toBe(false);
    expect(isCampaignEditable('Sent')).toBe(false);
  });
});

describe('isCampaignStatusTerminal', () => {
  it('Sent and Cancelled are terminal', () => {
    expect(isCampaignStatusTerminal('Sent')).toBe(true);
    expect(isCampaignStatusTerminal('Cancelled')).toBe(true);
  });

  it('Draft is not terminal', () => {
    expect(isCampaignStatusTerminal('Draft')).toBe(false);
  });
});
