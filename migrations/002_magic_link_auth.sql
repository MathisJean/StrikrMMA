-- Password authentication is removed entirely and replaced by email magic links,
-- reusing the auth_tokens mechanism already built for profile claiming.
--
-- Clicking a link (or typing the 6-digit code from the same email) proves the address
-- is real AND starts the session, so register / login / verify-email collapse into one
-- action. Nothing hashes or compares a password after this migration.
--
-- Safe to re-run.

-- No password database means no password database to leak.
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;

-- email_verified is redundant: a session can only ever start by consuming a token sent
-- to the address, so there is no unverified-but-logged-in state left to track. Nothing
-- in the codebase ever read this column.
ALTER TABLE users DROP COLUMN IF EXISTS email_verified;

-- corner was NOT NULL because it was chosen on the combined signup form. Signup is now
-- email-first, so the row exists before the athlete has picked a corner in onboarding.
ALTER TABLE users ALTER COLUMN corner DROP NOT NULL;

-- A user row can now exist (created by a verified magic link) before it has a username,
-- corner, profile or record, so completion has to be tracked explicitly.
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT false;

-- Existing real accounts already went through the old signup form and have everything
-- onboarding would ask for. Only unclaimed placeholders and new rows should be sent there.
UPDATE users SET onboarding_complete = true WHERE claimed = true AND username IS NOT NULL;

-- The users row is created when a magic link is CONSUMED, not when one is requested —
-- otherwise anyone could mint rows by submitting arbitrary addresses. Until then the
-- pending address lives on the token itself, so user_id has to be nullable.
ALTER TABLE auth_tokens ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS email VARCHAR(254);

-- A 6-digit code is an ALTERNATIVE to clicking the link, tied to the same token row.
-- It exists for in-app browsers (an Instagram ad link opens in a webview, and the link
-- click can land in a different browser context than the tab the person started in).
-- Typing the code back into the original tab has no such gap.
ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS code_hash VARCHAR(255);

-- 6 digits is only a million possibilities. The per-IP limiter on /auth/verify-code
-- slows guessing down; this caps guesses against one specific pending login.
ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS code_attempts INTEGER NOT NULL DEFAULT 0;

-- password_reset and email_verification are both replaced by 'magic_link'.
-- 'account_deletion' is new: with no password there is nothing to re-type as a
-- confirmation step, so a fresh emailed token takes its place.
ALTER TABLE auth_tokens DROP CONSTRAINT IF EXISTS auth_tokens_purpose_check;
ALTER TABLE auth_tokens ADD CONSTRAINT auth_tokens_purpose_check
	CHECK (purpose IN ('magic_link', 'profile_claim', 'account_deletion'));

-- Every magic-link lookup that is not by token_hash is by address + purpose.
CREATE INDEX IF NOT EXISTS idx_auth_tokens_email_purpose ON auth_tokens (LOWER(email), purpose);
