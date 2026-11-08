import { z } from 'zod';

/**
 * A yes/no query-string flag. Query values always arrive as strings, and
 * `z.coerce.boolean()` turns every non-empty string into `true` — including
 * "false" — so "Include inactive" / "Include archived" filters could never
 * be switched off. This accepts real booleans and the strings
 * "true"/"false"/"1"/"0" only.
 */
export const queryBooleanSchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');
