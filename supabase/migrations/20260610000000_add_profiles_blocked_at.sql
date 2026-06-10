-- Account-blokkering voor superadmin-beheer (/beheer/gebruikers).
-- Nullable timestamptz: NULL = actief, gezet = geblokkeerd sinds dat moment.
-- De (app)-layout logt een geblokkeerde gebruiker uit zodra blocked_at gezet is.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz;

COMMENT ON COLUMN public.profiles.blocked_at IS
  'Tijdstip waarop het account geblokkeerd is (NULL = actief). Beheerd via /beheer/gebruikers.';
