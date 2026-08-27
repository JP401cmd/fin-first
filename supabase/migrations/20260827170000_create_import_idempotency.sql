-- Duurzame idempotentie voor importpaden — tabel `import_idempotency`
--
-- ── WAAROM DIT NIET ZONDER MIGRATIE KAN ────────────────────────────────────
-- `app/api/onboarding/aangifte-import/route.ts` bewaakte dubbele submits met
-- een cache in PROCESGEHEUGEN (een Map met 24h-TTL plus een in-flight-Set).
-- Op Vercel is elke instantie kortlevend: die cache is bij een tweede submit
-- in de praktijk vaak leeg, waarna assets en debts opnieuw worden
-- weggeschreven. Alleen `balance_snapshots` werd beschermd, door zijn eigen
-- UNIQUE (user_id, snapshot_date, entity_type, entity_id).
--
-- Procesgeheugen kan per definitie geen antwoord geven op "is deze aangifte
-- al geïmporteerd?" — die vraag overleeft het proces. Er is dus een rij nodig.
--
-- ── DE SLEUTEL IS SERVER-BEPAALD ───────────────────────────────────────────
-- `key` is GEEN client-waarde. De route leidt hem af uit de INHOUD van de
-- payload (SHA-256 over de gecanonicaliseerde bedragen/namen/rijen —
-- `lib/aangifte/import-key.ts`), net zoals `/api/transactions/import` de
-- client-aangeleverde `import_hash` negeert en zelf herberekent. Dat is
-- wezenlijk: de oude client-`idempotency_key` was een verse randomUUID per
-- submit-poging, dus twee submits droegen nooit dezelfde sleutel. Een
-- duurzame bewaarplaats voor een instabiele sleutel lost niets op.
--
-- ── SCOPING VOLGT EIGENAARSCHAP ────────────────────────────────────────────
-- `assets` en `debts` zijn EIGEN-RIJ tabellen (`user_id`). De sleutel gaat
-- daarom MÉT `user_id` — zoals `investment_transactions`, niet zoals
-- `transactions` (die bewust zonder `user_id` dedupt omdat twee partners
-- dezelfde boeking op een gedeelde rekening niet allebei mogen inschrijven).
-- Twee gebruikers die toevallig dezelfde aangifte-inhoud importeren mogen
-- elkaar niet blokkeren.
--
-- ── WAAROM EEN EIGEN TABEL EN GEEN KOLOM ───────────────────────────────────
-- `app/api/onboarding/save-own-data/route.ts` bewaart zijn idempotentie-
-- sleutel duurzaam op `profiles.onboarding_idempotency_key`. Dat werkt voor
-- één sleutel per gebruiker. De aangifte-import is een BULK-WRITE over
-- meerdere tabellen en kan meerdere keren per gebruiker voorkomen (per
-- peildatum, per correctie), dus die vorm past hier niet.
--
-- ── WAAROM `scope` ─────────────────────────────────────────────────────────
-- `app/api/holdings/route.ts` draagt dezelfde in-memory cache met hetzelfde
-- defect. Met een scope-kolom kan dat pad later aanhaken zonder een tweede
-- tabel. Buiten scope van deze migratie; de kolom maakt het mogelijk.
--
-- ── PRIVACY ────────────────────────────────────────────────────────────────
-- De rij draagt een HASH en rij-UUID's — geen bedragen, geen namen in
-- klaartekst. `response` bevat uitsluitend de id-lijsten die de route toch al
-- aan de eigen gebruiker teruggeeft, en de logging blijft fase + foutcode.
--
-- Preciezer dan "bevat geen persoonsgegevens": `key` is een hash OVER
-- bedragen en namen en is daarmee gepseudonimiseerd, niet geanonimiseerd.
-- De afleiding neemt `user_id` mee in de hash-invoer, zodat twee gebruikers
-- met identieke aangifte-inhoud NIET dezelfde sleutel krijgen en de rijen
-- onderling niet correleerbaar zijn. Zie lib/aangifte/import-key.ts.
--
-- ── GEEN TTL / GEEN 24-UURS PURGE ──────────────────────────────────────────
-- Met een CONTENTsleutel is de claimrij geen tijdelijke cache meer maar het
-- duurzame antwoord op "is deze aangifte al geïmporteerd?". Een 24-uurspurge
-- zou de bug exact terugzetten voor iedereen die dezelfde aangifte een dag
-- later nogmaals uploadt. De rij wordt vrijgegeven door de DELETE-tak van de
-- route (bulk-verwijdering per peildatum), niet door een klok.
--
-- Idempotent (IF NOT EXISTS / DROP ... IF EXISTS) zodat re-apply een no-op is.

-- ── 1. Tabel ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.import_idempotency (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Welk importpad de claim legt. Nu alleen 'aangifte_import'.
  scope        text NOT NULL,

  -- Server-afgeleide SHA-256 als hex (64 tekens). Zie kopcommentaar.
  key          text NOT NULL,

  -- Alleen gevuld voor de aangifte-import. Stuurt de ESCAPE HATCH: de
  -- DELETE-tak van de route ruimt de claims van één peildatum op, zodat een
  -- legitieme her-import na een bulk-verwijdering weer mag. Zonder deze
  -- kolom zou de contenthash zo'n her-import permanent blokkeren.
  peildatum    date,

  -- 'pending' = claim gelegd, schrijffase draait. 'done' = klaar, `response`
  -- is het antwoord dat een replay terugkrijgt.
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'done')),

  -- Het opgeslagen succes-antwoord (asset_ids/debt_ids). Alleen id's.
  response     jsonb,

  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  -- De route gebruikt GEEN upsert: hij doet een gewone INSERT en leest de
  -- 23505 (unique_violation) van deze PK als "er ligt al een claim". Die
  -- INSERT is meteen de synchronisatie — Postgres laat er precies één winnen.
  -- Haakt later een aanroeper aan die wél `upsert` doet, dan moet zijn
  -- `onConflict` EXACT deze drie kolommen noemen, anders geeft Postgres 42P10.
  PRIMARY KEY (user_id, scope, key)
);

COMMENT ON TABLE public.import_idempotency IS
  'Duurzame idempotentie-claims voor importpaden. Vervangt de cache in procesgeheugen die een koude start niet overleefde. Eén rij per (gebruiker, importpad, inhoudshash); de hash wordt SERVER-ZIJDIG afgeleid uit de payload-inhoud, nooit door de client aangeleverd.';
COMMENT ON COLUMN public.import_idempotency.key IS
  'Server-afgeleide SHA-256 (hex) over de gecanonicaliseerde payload — lib/aangifte/import-key.ts. Bewust NIET de client-idempotency_key: die was een verse randomUUID per submit-poging en dus niet stabiel.';
COMMENT ON COLUMN public.import_idempotency.peildatum IS
  'Alleen gevuld voor aangifte-import. Laat de DELETE-tak van de route de claims van één peildatum vrijgeven, zodat een bewuste her-import na bulk-verwijdering mogelijk blijft.';
COMMENT ON COLUMN public.import_idempotency.status IS
  'pending = schrijffase bezig (gelijktijdige tweede POST krijgt 409). done = response is het replay-antwoord. Een pending-claim ouder dan 15 minuten wordt door de route overgenomen, zodat een gecrashte request de gebruiker niet permanent blokkeert.';

-- ── 2. Index voor de escape hatch ──────────────────────────────────────────
--
-- De PK dekt de claim-lookup op (user_id, scope, key). Het ANDERE leespad is
-- de DELETE-tak: "alle claims van deze gebruiker, dit pad, deze peildatum".
-- Die query heeft geen `key` en kan de PK dus niet gebruiken.

CREATE INDEX IF NOT EXISTS idx_import_idem_user_scope_peildatum
  ON public.import_idempotency USING btree (user_id, scope, peildatum);

-- ── 3. RLS — vier eigen-rij-policies ───────────────────────────────────────
--
-- De route draait op de anon-RLS-client (`createClient`), dus de claim wordt
-- als de gebruiker ZELF geschreven. Geen service-role nodig, en dus ook geen
-- pad waarlangs een claim van een ander zichtbaar of manipuleerbaar is.

ALTER TABLE public.import_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_idempotency own select" ON public.import_idempotency;
CREATE POLICY "import_idempotency own select" ON public.import_idempotency
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "import_idempotency own insert" ON public.import_idempotency;
CREATE POLICY "import_idempotency own insert" ON public.import_idempotency
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- USING én WITH CHECK: zonder WITH CHECK kan een update de rij naar een
-- andere user_id schrijven (USING toetst alleen de OUDE rij).
DROP POLICY IF EXISTS "import_idempotency own update" ON public.import_idempotency;
CREATE POLICY "import_idempotency own update" ON public.import_idempotency
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "import_idempotency own delete" ON public.import_idempotency;
CREATE POLICY "import_idempotency own delete" ON public.import_idempotency
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));
