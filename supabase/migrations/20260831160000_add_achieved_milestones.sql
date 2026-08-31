-- Mijlpalen-log: een gepasseerde drempel wordt EENMALIG als gebeurtenis
-- vastgelegd, niet elk request opnieuw als stand herberekend.
--
-- ── DOEL ────────────────────────────────────────────────────────────────────
-- De app kende mijlpalen tot nu toe uitsluitend als live berekening
-- (lib/freedom-milestones.ts, lib/natural-milestones.ts). Een stand kan niet
-- gevierd worden — hij is elke dag opnieuw waar — en de enige twee vieringen
-- die er wél waren onthielden hun once-guard in localStorage, dus per apparaat.
-- Deze tabel legt het MOMENT VAN PASSEREN vast (`achieved_at`) en draagt met
-- `acknowledged_at` de cross-device once-guard: NULL = nog te vieren.
-- Volledige onderbouwing en de acht deelbesluiten: ADR 0123
-- (docs/adr/0123-een-mijlpaal-is-een-gebeurtenis-geen-stand.md).
--
-- ── TOEGANGSMODEL ───────────────────────────────────────────────────────────
-- Persoonlijk, geen huishoud-deling. Drie eigen-rij policies op
-- `auth.uid() = user_id`, alle drie `TO authenticated`:
--   SELECT  — de gebruiker leest zijn eigen log (tijdlijn "Bereikt", briefing).
--   INSERT  — de detectiemotor draait IN-BAND bij de /overzicht-load
--             (OverzichtSecondaryLoader) via de anon-RLS-client, als pure,
--             idempotente log-append met ON CONFLICT DO NOTHING. Er is geen
--             cron in deze omgeving (ADR 0123, context), dus een schema-motor
--             zou vanaf dag één stilstaan.
--   UPDATE  — uitsluitend het afvinken van de viering, via
--             POST /api/milestones/acknowledge.
--
-- ── WAAROM GEEN DELETE-POLICY ───────────────────────────────────────────────
-- Deze tabel is HISTORIE, geen stand. Een verwijderbare mijlpaal maakt de log
-- waardeloos als datering: wie een rij kan wissen kan een gebeurtenis opnieuw
-- laten "gebeuren" en de viering herhalen — precies de eigenschap die de
-- localStorage-guard onbruikbaar maakte. Er is dus bewust GEEN DELETE-policy.
-- Gevolg in de praktijk: een DELETE door `authenticated` levert géén fout maar
-- 0 geraakte rijen (RLS filtert alles weg vóór de verwijdering). Dat is de
-- gewenste vorm; een tabel-brede `REVOKE DELETE` zou alleen de foutvorm
-- veranderen (42501 i.p.v. een lege uitkomst) en verder niets toevoegen — hier
-- expliciet overwogen en niet gedaan, zodat de afweging niet stil is.
-- Accountverwijdering loopt langs de FK: `REFERENCES auth.users(id)
-- ON DELETE CASCADE`, conform de AVG-norm sinds
-- 20260721140000_avg_ondelete_fk_erasure.sql. Wissen op verzoek gaat dus via
-- het schrappen van de gebruiker, niet via een rij-delete uit de app.
--
-- ── WAAROM GEEN SERVICE-ROLE-PAD ────────────────────────────────────────────
-- Zowel de detectie als het afvinken gebeurt namens de INGELOGDE gebruiker op
-- diens eigen rijen; er is geen cross-user- of beheerlezing (ADR 0006 zou die
-- juist naar de service-role sturen). Een service-role-schrijfpad zou hier dus
-- alleen RLS omzeilen zonder iets mogelijk te maken. Merk op dat dit een
-- APPLICATIE-afspraak is en geen door RLS afgedwongen garantie: `service_role`
-- heeft BYPASSRLS, dus een policy "voor de service-role" zou sowieso zinloos
-- zijn — daarom staat hij er niet.
--
-- ── KOLOM-GESCOOPT SCHRIJFRECHT (de kern van de integriteit) ────────────────
-- RLS begrenst RIJEN, geen KOLOMMEN. Zonder extra maatregel kan een gebruiker
-- via PostgREST zijn eigen `achieved_at` of `milestone_key` herschrijven en
-- daarmee de log als historie waardeloos maken (ADR 0123, besluit 8).
--
-- Volgorde-eis: in dit project hebben `anon` en `authenticated` TABEL-BREDE
-- grants op nieuwe tabellen in schema public, gezet door ALTER DEFAULT
-- PRIVILEGES bij CREATE. Een kolom-GRANT is een no-op zolang de tabel-grant
-- er nog staat — exact de valkuil die in
-- 20260717132003_security_fix_profiles_role_escalation.sql is vastgelegd
-- ("een kolom-REVOKE(role) is een no-op tegen een tabel-grant"). De REVOKE
-- moet dus vóór de kolom-GRANT, en een REVOKE op tabelniveau haalt óók
-- eventuele kolomrechten weg — vandaar deze exacte volgorde:
--     1. CREATE TABLE            (default privileges zetten tabel-brede grants)
--     2. REVOKE UPDATE           (haalt de tabel-brede UPDATE weg)
--     3. GRANT UPDATE (acknowledged_at)
-- De SELECT/INSERT-grants worden hieronder EXPLICIET herhaald. Dat verandert
-- niets aan de rechten (default privileges gaven ze al) maar maakt de bedoelde
-- rechtenset zelfdocumenterend en onafhankelijk van de aanname over die
-- defaults. De aanname is inmiddels WEL live gemeten (security ship-gate
-- 31-08-2026, op spend_limits en import_idempotency: authenticated draagt
-- tabel-brede UPDATE, anon draagt SELECT/INSERT/UPDATE) — de REVOKE-vóór-GRANT
-- is dus noodzakelijk, niet defensief. Het blijvende meetpunt zit in de
-- leaktest (scripts/verify-achieved-milestones-rls.sql, geval 9 + 3b/3c), die
-- bij apply de werkelijke ACL uit information_schema leest.
--
-- `anon` wordt BEWUST niet aangeraakt: geen enkele policy is `TO anon`, dus
-- anon ziet nul rijen. De projectconventie (canoniek in
-- .claude/skills/_shared/pijplijn-conventies.md, "Leak-checks — altijd óók de
-- anon-rol") is dat anon een LEGE SET krijgt en geen policy-fout: een fout
-- i.p.v. een lege set duidt op een rolset-/execute-rechten-regressie, niet op
-- correcte afscherming. Zo gevangen bij ADR 0048. Een REVOKE op anon zou dat
-- signaal juist wegnemen.
--
-- ── WAT DE LOG NIET GARANDEERT ──────────────────────────────────────────────
-- De schrijver is de RLS-client van de gebruiker zelf, dus de INSERT is
-- client-geauthored: een gebruiker kan bij het aanmaken een `achieved_at` of
-- `source` van eigen keuze meegeven. Deze migratie garandeert onveranderlijkheid
-- NA het feit, niet server-attestatie. Dat is bewust: het effect is eigen-rij en
-- zelf-toegebracht, en cross-user is het onmogelijk (INSERT-policy WITH CHECK).
--
-- ── ADDITIEVE KOLOM OP `profiles` — expliciete RLS-dekkingscheck ────────────
-- `milestones_seeded_at` markeert dat de motor ooit voor deze gebruiker heeft
-- gedraaid, zodat de eerste run niets viert (ADR 0123, besluit 5).
--   Dekkende policy: "Users can manage own profile" ON public.profiles
--   FOR ALL USING ((select auth.uid()) = id) — row-level, dus deze nieuwe kolom
--   valt automatisch onder de bestaande eigen-rij SELECT/UPDATE. Op `profiles`
--   bestaat geen kolom-scoped grant; `authenticated` heeft daar een tabel-brede
--   UPDATE (zie 20260717132003). Er wordt hier dus GEEN nieuw schrijfgat
--   geopend en er ontstaat ook geen kolom die niemand mag schrijven.
--   Bedoeld schrijfpad: own-row read-modify-write via de anon RLS-client,
--   nooit service-role — spiegel van app/api/appearance.
--   ASYMMETRIE, expliciet aanvaard: `achieved_milestones.achieved_at` is
--   kolom-gescoopt onschrijfbaar, maar `profiles.milestones_seeded_at` blijft
--   voor de eigenaar vrij schrijfbaar (een tabel-brede REVOKE UPDATE op
--   profiles zou élk bestaand voorkeuren-schrijfpad breken). Dat is niet erg,
--   want de échte once-guard is de UNIQUE (user_id, milestone_key): wie zijn
--   seed-vlag leegt, botst bij de volgende run op de bestaande rijen en krijgt
--   dus geen tweede rij en geen tweede viering. `milestones_seeded_at` is
--   daarmee een MODUS-vlag, geen integriteitsgrens.
--
-- Alles idempotent (IF NOT EXISTS / DROP … IF EXISTS) zodat re-apply een no-op is.

-- ── 1. Tabel ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.achieved_milestones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Stabiele, door de motor gevormde sleutel (bv. 'vermogen-100k', zie lib/milestones/types.ts). Draagt
  -- samen met user_id de idempotentie; zie de UNIQUE onderaan deze definitie.
  milestone_key   TEXT NOT NULL,

  kind            TEXT NOT NULL
    CONSTRAINT achieved_milestones_kind_check
    CHECK (kind IN ('vermogen', 'vrijheid', 'schuldenvrij', 'noodfonds', 'doel')),

  -- DE DREMPEL die gepasseerd werd (100000, 50) — nadrukkelijk niet de stand.
  threshold_value NUMERIC,
  -- De GEMETEN STAND op het moment van detectie. Twee kolommen omdat "je
  -- passeerde €100.000" en "je stond op €103.412" verschillende feiten zijn;
  -- één kolom zou de viering en de datering op dezelfde waarde laten leunen.
  observed_value  NUMERIC,

  achieved_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL = nog te vieren. Het afvinken is cross-device omdat het hier staat en
  -- niet in localStorage. Enige kolom die `authenticated` mag UPDATE'n.
  acknowledged_at TIMESTAMPTZ,

  -- 'seed' = stil toebedeeld bij de eerste run (al gepasseerd vóór de motor
  -- bestond, `acknowledged_at` meteen gevuld); 'detect' = live waargenomen.
  source          TEXT NOT NULL DEFAULT 'detect'
    CONSTRAINT achieved_milestones_source_check
    CHECK (source IN ('detect', 'seed')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- DE once-guard. Een drempel die na een dip opnieuw wordt gepasseerd botst
  -- hierop (ON CONFLICT DO NOTHING) → geen tweede rij, geen tweede viering.
  CONSTRAINT achieved_milestones_user_key_uniq UNIQUE (user_id, milestone_key)
);

COMMENT ON TABLE public.achieved_milestones IS
  'Log van gepasseerde mijlpalen per gebruiker: één rij per (user_id, milestone_key), eenmalig geschreven op het moment van passeren. Historie, geen stand — er is bewust geen DELETE-policy. acknowledged_at is de cross-device once-guard voor de viering. Zie ADR 0123.';
COMMENT ON COLUMN public.achieved_milestones.threshold_value IS
  'De gepasseerde DREMPEL (bv. 100000 bij vermogen, 50 bij vrijheids-percentage) — niet de gemeten stand.';
COMMENT ON COLUMN public.achieved_milestones.observed_value IS
  'De canonieke gemeten stand op het moment van detectie (netWorth / freedomPct / totalDebts / emergencyFund uit de bundel). De motor rekent niets zelf uit; ADR 0123 besluit 3.';
COMMENT ON COLUMN public.achieved_milestones.acknowledged_at IS
  'NULL = nog te vieren. Gezet door POST /api/milestones/acknowledge. Enige kolom waarop authenticated UPDATE-recht heeft (kolom-gescoopte GRANT); achieved_at en milestone_key zijn daardoor na het feit onveranderlijk.';
COMMENT ON COLUMN public.achieved_milestones.source IS
  '''detect'' = live waargenomen passage; ''seed'' = stil toebedeeld bij de eerste run van de motor voor deze gebruiker (acknowledged_at meteen gevuld, dus geen viering).';

-- ── 2. Indexen ──────────────────────────────────────────────────────────────

-- Leespad 1: "de tijdlijn van deze gebruiker, nieuwste eerst". Dekt tevens de
-- FK-kolom user_id (de UNIQUE-index staat op (user_id, milestone_key) en is
-- voor dit sorteerpad niet bruikbaar).
CREATE INDEX IF NOT EXISTS achieved_milestones_user_achieved_idx
  ON public.achieved_milestones USING btree (user_id, achieved_at DESC);

-- Leespad 2: "heeft deze gebruiker iets ONGEVIERDS?" — de vraag die bij élke
-- /overzicht-load gesteld wordt en in verreweg de meeste gevallen nul rijen
-- oplevert. Partieel, zodat de index klein blijft: gevierde mijlpalen (het
-- overgrote deel op termijn) staan er niet in.
CREATE INDEX IF NOT EXISTS achieved_milestones_user_unacked_idx
  ON public.achieved_milestones USING btree (user_id, achieved_at DESC)
  WHERE acknowledged_at IS NULL;

-- ── 3. RLS — drie eigen-rij policies, bewust geen vierde ────────────────────

ALTER TABLE public.achieved_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "achieved_milestones own select" ON public.achieved_milestones;
CREATE POLICY "achieved_milestones own select" ON public.achieved_milestones
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "achieved_milestones own insert" ON public.achieved_milestones;
CREATE POLICY "achieved_milestones own insert" ON public.achieved_milestones
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- USING én WITH CHECK: zonder WITH CHECK zou een UPDATE de rij naar een andere
-- user_id kunnen schrijven (USING toetst alleen de OUDE rij). In de praktijk
-- blokkeert de kolom-gescoopte grant dat al — user_id is niet schrijfbaar —
-- maar de policy mag daar niet van afhangen: een latere, ruimere GRANT zou het
-- gat dan stil heropenen.
DROP POLICY IF EXISTS "achieved_milestones own update" ON public.achieved_milestones;
CREATE POLICY "achieved_milestones own update" ON public.achieved_milestones
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- GEEN DELETE-policy. Zie het kopcommentaar: de log is historie.

-- ── 4. Kolom-gescoopt schrijfrecht ──────────────────────────────────────────
-- Volgorde is dwingend, zie kopcommentaar. Beide statements zijn idempotent.

REVOKE UPDATE ON TABLE public.achieved_milestones FROM authenticated;

-- Expliciet herhaald: verandert niets (default privileges gaven deze al) maar
-- legt de bedoelde rechtenset vast in plaats van hem te erven.
GRANT SELECT, INSERT ON TABLE public.achieved_milestones TO authenticated;

-- Het enige UPDATE-recht dat een ingelogde gebruiker heeft.
GRANT UPDATE (acknowledged_at) ON TABLE public.achieved_milestones TO authenticated;

-- ── 5. Additieve kolom op profiles ──────────────────────────────────────────
-- Zie de RLS-dekkingscheck in het kopcommentaar. Puur additief.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS milestones_seeded_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.milestones_seeded_at IS
  'Tijdstip waarop de mijlpaal-motor voor het eerst voor deze gebruiker draaide. NULL = nog nooit gedraaid → de eerstvolgende run logt alle reeds gepasseerde drempels STIL (source=''seed'', acknowledged_at gevuld) en viert niets. Bewust een eigen kolom en niet de afleiding "de log is leeg": een verse gebruiker met nul gepasseerde drempels zou anders in seed-modus blijven hangen en zijn eerste échte mijlpaal stil inslikken (ADR 0123, besluit 5). Modus-vlag, geen integriteitsgrens — de echte once-guard is achieved_milestones.UNIQUE(user_id, milestone_key). Eigen-rij: gelezen/geschreven via de own-row anon RLS-client (nooit service-role), gedekt door de bestaande profiles-policy USING (auth.uid() = id).';
