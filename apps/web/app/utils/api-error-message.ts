import { ApiRequestError } from '@ward-comms/api-client';

/** Shown instead of the API's "Missing required permission: one of [...]" text. */
export const NO_ACCESS_MESSAGE =
  'Your role doesn’t include access to this. Ask your unit administrator if you need it.';

/** A message fit to show a person for a failed request. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) {
    return error.status === 403 && error.message.startsWith('Missing required permission') ? NO_ACCESS_MESSAGE : error.message;
  }
  return fallback;
}
