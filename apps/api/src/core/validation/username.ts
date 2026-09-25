// Login identifier rules: 3-32 chars, [a-z0-9._-], must start alphanumeric, no '@'.
// Shared by registration and invitations so both enforce identical rules.
// 1 leading char + 2-31 more = 3-32 total.
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function normalizeUsername(input: string | undefined | null): string {
  return (input || '').trim().toLowerCase();
}

export function isValidUsername(input: string | undefined | null): boolean {
  return USERNAME_RE.test(normalizeUsername(input));
}
