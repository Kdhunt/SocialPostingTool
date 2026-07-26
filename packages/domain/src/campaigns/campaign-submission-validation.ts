// Validation rules applied before a campaign version may be submitted for
// approval (Draft -> PendingApproval). phases/07-campaigns.md explicitly
// calls out tests for "missing content", "empty audiences", and "archived
// destinations" — this is where those three checks live as pure,
// independently testable rules.

export interface CampaignSubmissionCheckInput {
  /** Whether the version has a non-empty base message OR every selected audience has its own override text. */
  hasContent: boolean;
  audienceCount: number;
  /** Destinations resolved from the selected audiences that are still active (not archived). */
  activeDestinationCount: number;
  /** True if resolution found at least one destination that is now archived. */
  hasArchivedDestination: boolean;
}

export interface CampaignSubmissionCheck {
  valid: boolean;
  errors: string[];
}

export function validateCampaignForSubmission(input: CampaignSubmissionCheckInput): CampaignSubmissionCheck {
  const errors: string[] = [];

  if (!input.hasContent) {
    errors.push('Add a base message (or an override for every selected audience) before submitting.');
  }

  if (input.audienceCount === 0) {
    errors.push('Select at least one audience before submitting.');
  }

  if (input.hasArchivedDestination) {
    errors.push('One of the resolved destinations has been archived. Remove or replace the affected audience before submitting.');
  }

  if (input.audienceCount > 0 && input.activeDestinationCount === 0) {
    errors.push('The selected audiences have no active communication destination linked. Link a destination before submitting.');
  }

  return { valid: errors.length === 0, errors };
}
