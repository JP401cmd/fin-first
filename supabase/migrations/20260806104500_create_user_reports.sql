-- Meldingen van testgebruikers — bug / vraag / aanbeveling.
-- Bron: melding-knop in de chat-header → POST /api/user-reports (auth-gated)
--       → public.user_reports (+ privé screenshot in user-report-screenshots).
-- Doorstroom: best-effort push naar de Notion Trifinity-queue vanuit de route,
--       met een dagelijkse cron-retry voor rijen die blijven hangen.
--
-- ── WAAROM een eigen tabel en niet `feedback` uitbreiden ─────────────────────
-- `public.feedback` is de bestaande in-app feedbackloop (/mijn/feedback,
-- /beheer/feedback) met een eigen levenscyclus: een korte tekst met status
-- new/reviewed die BINNEN de app afgehandeld wordt. Een melding heeft een
-- andere levensloop — hij verlaat het systeem (Notion-kaartje), draagt
-- syncstate (page-id, status, pogingen, laatste fout), technische context,
-- een toestemmingsvlag en een bijlage. Die state in `feedback` proppen zou de
-- bestaande tabel, routes en beheerpagina met vijf kolommen belasten die daar
-- nooit gevuld worden, en de check-constraint op `category` moeten oprekken.
-- `feedback` blijft daarom volledig onaangeraakt.
--
-- ── TOEGANGSMODEL (in gewone taal) ──────────────────────────────────────────
--   * Een gebruiker mag ALLEEN op eigen naam melden (INSERT met eigen user_id)
--     en ALLEEN zijn eigen meldingen teruglezen. Dat teruglezen is niet
--     cosmetisch: de route telt via de sessie-client de eigen meldingen van het
--     laatste uur voor de throttle (max 5/uur). Zonder eigen-rij SELECT zou die
--     telling stil 0 teruggeven en de throttle nooit afgaan.
--   * Beheer (superadmin) leest alles en mag triage-updates doen — zelfde
--     patroon als op `feedback`.
--   * Er is BEWUST GEEN update- of delete-policy voor de gewone gebruiker. Een
--     melding is een verzonden bericht, geen bewerkbaar document; en de
--     sync-velden (notion_page_id / notion_sync_status / -attempts /
--     -last_error) worden uitsluitend door de route en de cron geschreven via
--     de service-role, die RLS bypasst. Een gebruiker die zijn eigen
--     sync-status zou kunnen terugzetten, zou de cron oneindig werk kunnen
--     laten doen tegen een externe API.
--
-- ── TWEE BEWUSTE AFWIJKINGEN t.o.v. de vorm in 20260713130000_create_feedback ─
-- (Beide vormvariaties, geen semantische; expliciet benoemd zodat ze niet stil
--  zijn. De helper `public.is_superadmin()` wordt hergebruikt, niet vervangen.)
--
--  1. ÉÉN samengevoegde SELECT-policy i.p.v. twee losse (own + superadmin).
--     Twee permissieve SELECT-policies op dezelfde rol dwingen Postgres beide
--     per query te evalueren en leveren de Supabase-lint
--     `multiple_permissive_policies` op. `feedback` heeft dit probleem niet
--     omdat daar überhaupt geen eigen-rij SELECT bestaat — hier is die wél
--     nodig (throttle). De samengevoegde vorm is het huispatroon sinds
--     `20260719090650_perf_rls_merged_select_authenticated`; live geverifieerd
--     voorbeeld met exact deze combinatie: policy `ai_usage select own or
--     superadmin` (gemeten tegen `pg_policies`, 06-08-2026).
--
--  2. `(select public.is_superadmin())` i.p.v. kaal `is_superadmin()`.
--     `is_superadmin()` is STABLE SECURITY DEFINER met een eigen SELECT op
--     `profiles` erin (gemeten tegen `pg_proc`, 06-08-2026). SECURITY
--     DEFINER-functies worden nooit ge-inlined en STABLE-functies niet
--     constant-gefold, dus kaal draait hij PER RIJ. De scalar-subquery-wrapper
--     maakt er een InitPlan van — identieke semantiek (scalaire, stabiele,
--     read-only boolean), alleen plannerkosten wijzigen. Exact dezelfde
--     redenering en vorm als de wrap van `user_household_id()` in
--     `20260804055846_perf_rls_household_initplan_en_shared_index.sql`
--     (vervolg op ADR 0048). De live `feedback`-policies dragen nog de kale
--     vorm; die worden hier niet aangeraakt (buiten scope).
--
-- ── WAAROM WEL een FK op auth.users, terwijl `feedback` er geen heeft ────────
-- `public.feedback` heeft live GEEN enkele foreign key (gemeten tegen
-- `pg_constraint`, 06-08-2026) — historisch, want die tabel is ooit buiten de
-- migraties om ontstaan. Dat is hier geen voorbeeld om te volgen: sinds
-- `20260721140000_avg_ondelete_fk_erasure.sql` is de norm dat eigen
-- persoonsgegevens een FK → auth.users ON DELETE CASCADE dragen, als vangnet
-- naast `deleteAllUserData` zodat `admin.deleteUser()` (het AVG-verwijderrecht)
-- niet kan stranden en er geen orphan-UUID achterblijft. Deze tabel draagt
-- persoonsgegevens (e-mailadres, vrije tekst, user-agent, een screenshot-pad),
-- dus hij hoort in dat regime. 45 van de bestaande FK's naar auth.users staan
-- al zo (gemeten tegen `pg_constraint`, 06-08-2026), waaronder de systeemtabel
-- `ai_token_usage`.
-- LET OP voor de app-laag: het screenshot in de storage-bucket volgt deze
-- cascade NIET (storage.objects heeft geen FK op deze tabel) en een reeds
-- gepusht Notion-kaartje evenmin — beide zijn een aparte opruimstap.
--
-- Alles idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS) zodat re-apply een
-- no-op is. Geverifieerd vóór uitrol: `public.user_reports` bestond nog niet en
-- de bucket `user-report-screenshots` evenmin (06-08-2026).

-- ── 1. Tabel ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,

  -- Wat voor melding: bepaalt het formulier én de Notion-mapping
  -- (bug→Bug, aanbeveling→Feature, vraag→Vraag).
  report_type TEXT NOT NULL
    CONSTRAINT user_reports_report_type_check
    CHECK (report_type IN ('bug', 'vraag', 'aanbeveling')),

  -- Door de gebruiker bewerkbaar "scherm" (voorgevuld vanuit de route).
  -- NULL bij een aanbeveling: die hangt niet aan één scherm.
  screen_label TEXT,
  description TEXT NOT NULL,   -- wat ging er mis / de vraag / de wens
  expected TEXT,               -- "wat had je verwacht" — alleen bij bug

  -- Puur informatief: "mag TriFinity meekijken om dit te reproduceren?".
  -- Deze vlag verleent GEEN enkele technische toegang — beheer leest hoe dan
  -- ook via de service-role, en dit veld is enkel de vastgelegde wens van de
  -- gebruiker die in het Notion-kaartje wordt getoond.
  consent_inzage BOOLEAN NOT NULL DEFAULT false,

  -- Automatisch meegestuurde context (niet uitgevraagd).
  route TEXT,
  page_title TEXT,
  user_agent TEXT,
  viewport TEXT,
  app_version TEXT,

  -- Pad binnen de privé bucket user-report-screenshots: {user_id}/{id}.png
  screenshot_path TEXT,

  -- Notion-syncstate. Uitsluitend geschreven via de service-role (route + cron).
  notion_page_id TEXT,
  notion_sync_status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT user_reports_notion_sync_status_check
    CHECK (notion_sync_status IN ('pending', 'synced', 'error')),
  notion_sync_attempts INT NOT NULL DEFAULT 0,
  notion_last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_reports IS
  'Meldingen van testgebruikers (bug/vraag/aanbeveling) vanuit de chat-header. Supabase-first: de melding wordt hier vastgelegd voordat de best-effort push naar de Notion Trifinity-queue plaatsvindt, zodat een falend extern koppelvlak nooit een melding kost. RLS: eigen-rij insert + select (die select draagt de throttle-telling van 5/uur), superadmin leest en triageert; sync-velden worden alleen via de service-role geschreven. Bewust een eigen tabel naast public.feedback — andere levenscyclus (verlaat het systeem) en eigen syncstate.';

COMMENT ON COLUMN public.user_reports.screen_label IS
  'Door de gebruiker bewerkbare schermnaam, voorgevuld met resolveRouteTitle(pathname) ?? pathname. NULL bij report_type = aanbeveling.';
COMMENT ON COLUMN public.user_reports.consent_inzage IS
  'Vastgelegde wens van de melder ("mag TriFinity meekijken?"). Informatief: verleent geen technische toegang en wordt door geen enkele policy gelezen.';
COMMENT ON COLUMN public.user_reports.screenshot_path IS
  'Pad in de privé bucket user-report-screenshots, vorm {user_id}/{report_id}.<ext>. De eerste padsegment MOET de user_id zijn — daar hangen de storage-policies aan.';
COMMENT ON COLUMN public.user_reports.notion_sync_status IS
  'pending → synced | error. Alleen geschreven door de service-role (route + cron /api/cron/user-reports-notion-sync). Bewust geen eigen-rij UPDATE-policy: anders kon een gebruiker de cron oneindig tegen de Notion-API laten werken.';

-- ── 2. Indexen ──────────────────────────────────────────────────────────────

-- Beheeroverzicht: nieuwste meldingen eerst.
CREATE INDEX IF NOT EXISTS user_reports_created_idx
  ON public.user_reports USING btree (created_at DESC);

-- Cron-retry: pakt uitsluitend rijen die nog niet gesynct zijn. Partieel, want
-- op termijn is 'synced' de overgrote meerderheid en die rijen hoeven nooit
-- gevonden te worden.
CREATE INDEX IF NOT EXISTS user_reports_sync_pending_idx
  ON public.user_reports USING btree (notion_sync_status)
  WHERE notion_sync_status <> 'synced';

-- Throttle-telling (eigen meldingen laatste uur) én dekking van de FK-kolom:
-- user_id is de leidende kolom, dus een losse FK-index is overbodig.
CREATE INDEX IF NOT EXISTS user_reports_user_created_idx
  ON public.user_reports USING btree (user_id, created_at DESC);

-- ── 3. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

-- Melden mag alleen op eigen naam.
DROP POLICY IF EXISTS "user_reports own insert" ON public.user_reports;
CREATE POLICY "user_reports own insert" ON public.user_reports
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- Eigen meldingen teruglezen (throttle-telling) OF beheer leest alles.
-- Eén samengevoegde policy — zie de kop, afwijking 1.
DROP POLICY IF EXISTS "user_reports select own or superadmin" ON public.user_reports;
CREATE POLICY "user_reports select own or superadmin" ON public.user_reports
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR (select public.is_superadmin())
  );

-- Beheer triageert (superadmin). Geen enkele andere UPDATE-policy: de
-- sync-updates lopen via de service-role.
DROP POLICY IF EXISTS "user_reports superadmin update" ON public.user_reports;
CREATE POLICY "user_reports superadmin update" ON public.user_reports
  FOR UPDATE TO authenticated
  USING ((select public.is_superadmin()))
  WITH CHECK ((select public.is_superadmin()));

-- ── 4. Privé bucket voor screenshots ────────────────────────────────────────
--
-- Spiegel van 20260316500001_create_pension_documents_bucket.sql: privé bucket,
-- harde size- en mime-limiet in de bucket zelf (dus ook afgedwongen als een
-- route ooit vergeet te valideren), en padgebonden policies waarbij het eerste
-- mapsegment de user_id MOET zijn. 4 MB / png+jpeg+webp conform het formulier.
--
-- BEWUST GEEN UPDATE- of DELETE-policy: een screenshot hoort bij een verzonden
-- melding en wordt precies één keer weggeschreven. Zonder UPDATE-policy is ook
-- een upload met upsert=true uitgesloten, dus een bestaand bestand kan niet
-- stilletjes vervangen worden. Beheer en de Notion-push lezen via de
-- service-role (signed URL), niet via een verbrede policy — ADR 0006.
--
-- LET OP: de bucket is niet publiek. Elke weergave vereist een signed URL; een
-- kale storage-URL geeft 400/403.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-report-screenshots',
  'user-report-screenshots',
  false,
  4194304,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload own report screenshots" ON storage.objects;
CREATE POLICY "Users can upload own report screenshots"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'user-report-screenshots'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

DROP POLICY IF EXISTS "Users can read own report screenshots" ON storage.objects;
CREATE POLICY "Users can read own report screenshots"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'user-report-screenshots'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);
