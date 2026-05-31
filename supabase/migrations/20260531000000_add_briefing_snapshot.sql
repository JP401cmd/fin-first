-- Add briefing_snapshot to profiles.
--
-- Stores the frozen weekly /overzicht briefing per user so the briefing is
-- stable within an ISO week (Europe/Amsterdam) and the once-per-day manual
-- refresh can be tracked. Shape (jsonb):
--   {
--     "week": "YYYY-Www",            -- Amsterdam ISO week the snapshot is for
--     "lastManualRefresh": "YYYY-MM-DD", -- Amsterdam day of last manual refresh ('' = none)
--     "refreshedAt": "<ISO 8601>",   -- last (re)generation timestamp
--     "entries": BriefingEntry[]      -- the frozen briefjes
--   }
--
-- Nullable + additive: existing rows/queries are unaffected. Application code
-- already degrades gracefully when this column is absent.

alter table public.profiles
  add column if not exists briefing_snapshot jsonb;

comment on column public.profiles.briefing_snapshot is
  'Frozen weekly /overzicht briefing snapshot: { week, lastManualRefresh, refreshedAt, entries }. Regenerated automatically per Amsterdam ISO week; manual refresh allowed 1x/day.';
