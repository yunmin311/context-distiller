/**
 * Small helper for generating unique-enough ids for in-memory objects
 * (fragments, groups). Ids never leave the current session, so a UUID or a
 * random suffix is sufficient — there is no persistence or server involved.
 */
export function createId(prefix = 'f'): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}
