// Ward code re-verification policy.
//
// The shared ward code must be re-entered on a device's first sign-in and
// again after the ward code is rotated. This is expressed as a pure
// function over the ward code version a device last verified against and
// the ward's currently active version — the application layer looks up
// both values and passes them in.

export interface WardCodeVerificationInput {
  /**
   * The ward code version this device/session last successfully verified
   * against, or `null` if this device has never verified the ward code
   * (e.g. first sign-in on a new device, or no session history found).
   */
  lastVerifiedWardCodeVersionId: string | null;
  /** The ward's currently active (non-retired) ward code version id. */
  activeWardCodeVersionId: string;
}

export function requiresWardCodeVerification(input: WardCodeVerificationInput): boolean {
  return (
    input.lastVerifiedWardCodeVersionId === null ||
    input.lastVerifiedWardCodeVersionId !== input.activeWardCodeVersionId
  );
}
