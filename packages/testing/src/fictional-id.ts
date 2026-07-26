/**
 * Deterministic, clearly-fictional identifier generator for test fixtures.
 * Real member data must never be used in tests (see AGENTS.md); factories
 * added in later phases should build on helpers like this one rather than
 * hardcoding or importing real records.
 */
export function createFictionalId(prefix: string, sequence: number): string {
  const paddedSequence = String(sequence).padStart(6, '0');
  return `fictional-${prefix}-${paddedSequence}`;
}

/**
 * Fictional, non-deliverable email address safe for use in any test.
 * Uses the reserved `example.com` domain (RFC 2606) so nothing is ever
 * accidentally sent to a real recipient.
 */
export function createFictionalEmail(localPart: string): string {
  return `${localPart}@example.com`;
}
