import type { ConsentStatus } from './enums.js';

/**
 * Whether a contact method may be used to send a communication.
 *
 * Consent must NEVER be inferred from audience membership or any other
 * record (see AGENTS.md #8 and .cursor/rules/security.mdc). Only an
 * explicit `Granted` status permits sending; `Unknown`, `Denied`, and
 * `Withdrawn` all block it.
 */
export function isConsentedToSend(status: ConsentStatus): boolean {
  return status === 'Granted';
}
