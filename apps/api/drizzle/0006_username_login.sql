-- Username-based login. Email is no longer an auth identifier.
--
-- users.email / invites.email are KEPT (now nullable and unused by auth) so this
-- migration is reversible. A later migration can drop them once login is verified.

ALTER TABLE users ADD COLUMN IF NOT EXISTS username varchar(32);
ALTER TABLE invites ADD COLUMN IF NOT EXISTS username varchar(32);

-- Backfill: sanitized local part of the email, lowercased, stripped of anything
-- outside [a-z0-9._-]. Must satisfy the same rule the API enforces
-- (^[a-z0-9][a-z0-9._-]{2,31}$, i.e. 3-32 chars, leading char alphanumeric) so a
-- migrated account can still log in. 'user' is the prefix fallback, and the final
-- left(...,32) keeps the fallback from overflowing varchar(32).
--
-- Duplicates are disambiguated inside the same statement with row_number(). Two
-- earlier approaches were tested against a real Postgres and both failed the unique
-- index: a separate "UPDATE ... WHERE EXISTS (duplicate)" pass cannot see its own
-- writes, so it can neither converge nor be re-run; and a suffix derived from the
-- leading hex of the id is not distinct when two colliding rows share that prefix
-- (dup@x.com and dup@y.com both became 'dup-00000000'). row_number() is distinct by
-- construction within a collision group, and truncating the candidate to 21 chars
-- leaves room for '-' + 7 id chars + up to 3 digits and still caps at 32.
WITH base AS (
  SELECT id,
         left(
           CASE
             WHEN left(b, 1) ~ '[a-z0-9]' AND length(b) >= 3 THEN b
             ELSE 'user' || b
           END, 32
         ) AS candidate
  FROM (
    SELECT id,
           left(
             regexp_replace(
               lower(split_part(coalesce(email, ''), '@', 1)),
               '[^a-z0-9._-]', '', 'g'
             ),
             32
           ) AS b
    FROM users
  ) AS s
),
ranked AS (
  SELECT id,
         candidate,
         row_number() OVER (PARTITION BY candidate ORDER BY id) AS rn,
         count(*)     OVER (PARTITION BY candidate)           AS total
  FROM base
)
UPDATE users u
SET username = CASE
  WHEN r.total = 1 THEN r.candidate
  ELSE left(r.candidate, 21) || '-' || left(replace(r.id::text, '-', ''), 7) || r.rn::text
END
FROM ranked r
WHERE u.id = r.id AND u.username IS NULL;

-- Invites are NOT deduplicated. A pending invite is only unique per
-- (organization_id, username) -- the same username may legitimately hold a pending
-- invite in two different orgs, which access-control/routes.ts relies on. Rewriting
-- those to a suffix would show the invitee a username nobody ever typed.
UPDATE invites
SET username = left(CASE
      WHEN left(base, 1) ~ '[a-z0-9]' AND length(base) >= 3 THEN base
      ELSE 'user' || base
    END, 32)
FROM (
  SELECT id,
         left(
           regexp_replace(
             lower(split_part(coalesce(email, ''), '@', 1)),
             '[^a-z0-9._-]', '', 'g'
           ),
           32
         ) AS base
  FROM invites
) AS s
WHERE invites.id = s.id AND invites.username IS NULL;

-- SET NOT NULL below is deliberately the guard for an incomplete backfill: it fails
-- the migration loudly rather than deleting rows.
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE invites ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (username);
-- Non-unique, matching invites_username_idx in db/schema.ts. App-level dedupe of a
-- pending invite is per (organization_id, username), see access-control/routes.ts.
CREATE INDEX IF NOT EXISTS invites_username_idx ON invites (username);

-- Auth no longer uses email; keep the values but stop requiring them.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE invites ALTER COLUMN email DROP NOT NULL;
