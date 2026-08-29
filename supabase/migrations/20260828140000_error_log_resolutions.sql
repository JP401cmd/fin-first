-- error_log_resolutions — "deze fóútsoort is afgehandeld" (ADR 0113).
--
-- Bron: /beheer/errors -> GET/POST/DELETE /api/admin/error-groups (superadmin-gated).
--
-- WAAROM EEN APARTE TABEL EN GEEN KOLOM OP `error_logs` — twee harde redenen:
--
--  1. ONTDUBBELEN. Gemeten op de productiestapel zijn honderden logregels een
--     handvol unieke problemen (ontdubbelfactor ~6x). De eenheid waarop beheer
--     werkt is de foutSOORT, niet de losse regel. Een vlag per rij lost het
--     ontdubbelen niet op; hij vermenigvuldigt het.
--
--  2. RETENTIE. De retentie-cron wist `error_logs`-rijen na 12 maanden
--     (lib/retention.ts). Een vlag per rij verdwijnt mét zijn rijen — je zou
--     "dit is behandeld" dus stilzwijgend kwijtraken. Een groepsrij overleeft
--     dat. Zie de prune onderaan deze toelichting.
--
-- `error_logs` blijft hierdoor volledig APPEND-ONLY: geen kolom erbij, geen
-- UPDATE-policy erop. Dat is de eerlijke eigenschap van een logboek.
--
-- SLEUTEL. `signature` is de SLEUTELLOZE digest uit lib/alerts/error-signature.ts
-- over (context, genormaliseerde message) — bewust géén HMAC. De HMAC-variant
-- (lib/alerts/fingerprint.ts) bestaat omdat de meldingen-sweep zijn sleutels in
-- het voor iedereen leesbare `app_settings` legt; hier is dat niet zo, en zou
-- rotatie van CRON_SECRET élke afgevinkte groep wees maken.
--
-- HEROPENEN is een pure AFLEIDING in het leespad, geen kolom en geen cron: een
-- groep staat weer open zodra er een `error_logs`-rij bestaat met
-- `created_at > resolved_at`. Een opgeloste fout die terugkomt heropent dus
-- zichzelf. Vandaar geen `resolved boolean`.
--
-- AVG. Deze tabel heeft geen `user_id` en valt daarmee buiten de user-scoped
-- inventaris van lib/user-data-tables.ts. `resolved_by` is de BEHEERDER die
-- afvinkte (operationele audit, spiegelt `admin_actions_log`), met
-- ON DELETE SET NULL zodat er na een accountverwijdering geen wees-uuid staat.

CREATE TABLE IF NOT EXISTS public.error_log_resolutions (
  signature       TEXT PRIMARY KEY,
  resolved_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Vrije beheerderstekst. NORM: bedoeld voor een kaartnummer of de oorzaak —
  -- géén gebruikersidentificerende tekst (naam, e-mail, IBAN, uuid). Deze tabel
  -- valt bewust buiten de user-scoped inventaris van lib/user-data-tables.ts en
  -- wordt dus niet per gebruiker gewist of geëxporteerd; een identificerende
  -- notitie zou daar stilzwijgend buiten vallen. De UI-placeholder stuurt hierop.
  note            TEXT,
  -- Volume op het moment van afvinken; maakt "hoeveel kwamen erbij" leesbaar.
  resolved_count  INTEGER NOT NULL DEFAULT 0,
  -- Nieuwste voorval op het moment van afvinken; ook de sleutel voor de prune.
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leesvolgorde van het scherm (recent afgevinkt bovenaan binnen de gesloten groep).
CREATE INDEX IF NOT EXISTS error_log_resolutions_resolved_at_idx
  ON public.error_log_resolutions USING btree (resolved_at DESC);

-- Prune-sleutel: de retentie-cron ruimt resoluties op waarvan de foutsoort al
-- 12 maanden niet meer is gezien (anders groeit deze tabel monotoon door,
-- terwijl zijn logregels allang gewist zijn).
CREATE INDEX IF NOT EXISTS error_log_resolutions_last_seen_idx
  ON public.error_log_resolutions USING btree (last_seen_at);

ALTER TABLE public.error_log_resolutions ENABLE ROW LEVEL SECURITY;

-- Beheer leest de resoluties. `(select public.is_superadmin())` — gewrapt, zodat
-- Postgres de helper één keer per query evalueert i.p.v. per rij
-- (initplan-conventie uit 20260810220000).
DROP POLICY IF EXISTS "error_log_resolutions superadmin select" ON public.error_log_resolutions;
CREATE POLICY "error_log_resolutions superadmin select" ON public.error_log_resolutions
  FOR SELECT TO authenticated
  USING ((select public.is_superadmin()));

-- Afvinken. WITH CHECK dwingt af dat een beheerder alleen op EIGEN naam afvinkt
-- — `resolved_by` is een audit-veld en mag niet op een collega gezet worden.
DROP POLICY IF EXISTS "error_log_resolutions superadmin insert" ON public.error_log_resolutions;
CREATE POLICY "error_log_resolutions superadmin insert" ON public.error_log_resolutions
  FOR INSERT TO authenticated
  WITH CHECK ((select public.is_superadmin()) AND resolved_by = (select auth.uid()));

-- Opnieuw afvinken van een HEROPENDE groep = een upsert op dezelfde signature.
-- Daarom een UPDATE-policy naast INSERT; dezelfde eigen-naam-eis.
DROP POLICY IF EXISTS "error_log_resolutions superadmin update" ON public.error_log_resolutions;
CREATE POLICY "error_log_resolutions superadmin update" ON public.error_log_resolutions
  FOR UPDATE TO authenticated
  USING ((select public.is_superadmin()))
  WITH CHECK ((select public.is_superadmin()) AND resolved_by = (select auth.uid()));

-- Vinkje weghalen (met terugwerkende kracht "toch niet afgehandeld").
DROP POLICY IF EXISTS "error_log_resolutions superadmin delete" ON public.error_log_resolutions;
CREATE POLICY "error_log_resolutions superadmin delete" ON public.error_log_resolutions
  FOR DELETE TO authenticated
  USING ((select public.is_superadmin()));

-- Geen enkele policy voor `anon`: zonder policy levert RLS nul rijen, maar
-- expliciet intrekken laat geen twijfel over de bedoeling.
REVOKE ALL ON public.error_log_resolutions FROM anon;
