-- AI-toestemming is een echte opt-in: gelogd, omkeerbaar, vóór het eerste
-- cloud-contact. ADR 0155, kaart UR3-16 (beta-voorwaarde golf 1).
--
-- ── Waarom ────────────────────────────────────────────────────────────────────
-- /privacy §3 belooft "Toestemming (AVG art. 6 lid 1 sub a) — de AI-functies …
-- opt-in", maar `profiles.ai_enabled` staat sinds 20260307000002 standaard op
-- true, er is geen keuzemoment en geen bewijs van een keuze. Een schakelaar die
-- standaard aanstaat is geen toestemming (art. 4 lid 11 en art. 7 lid 1 AVG;
-- HvJ Planet49, C-673/17). Deze migratie levert de drie dingen die de code
-- daarvoor mist:
--
--   1. een DEFAULT die "geen uitspraak" als "uit" leest (nieuwe accounts),
--   2. twee profielkolommen die de EFFECTIEVE keuze dragen (wanneer, welke versie),
--   3. een append-only bewijstabel `consent_events` voor élke keuze en omkering.
--
-- De pensioen-PDF-toestemming (ADR 0035, token `pension_pdf_ai_v1`) verhuist
-- van een `console.log` in app/api/pension/parse naar dezelfde tabel.
--
-- ── Bestaande accounts (eigenaarsbesluit: pragmatisch) ────────────────────────
-- Bestaande rijen worden NIET aangeraakt: `ai_enabled` blijft daar `true` tot de
-- gebruiker bij het eerstvolgende bezoek de blokkerende keuze-overlay
-- beantwoordt (components/app/ai-consent-interstitial.tsx, getriggerd op
-- `ai_consent_at IS NULL`). De testers zijn persoonlijk uitgenodigd; een harde
-- backfill naar false zou hun lopende gebruik zonder aankondiging breken. Het
-- strikte alternatief (eerst uit, dan vragen) is één UPDATE en blijft mogelijk
-- als correctiemigratie.
--
-- ── Toegangsmodel consent_events ──────────────────────────────────────────────
-- PERSOONLIJK, geen huishouddeling. Twee eigen-rij policies, `TO authenticated`:
--   INSERT — `user_id = auth.uid()`: je kunt alleen je eigen keuze vastleggen.
--   SELECT — eigen rijen: /mijn/privacy toont wanneer je koos, en de
--            AVG-zelfexport kan ze meenemen.
-- GEEN UPDATE en GEEN DELETE voor gebruikers: bewijs is append-only. Dat een
-- gebruiker zijn eigen bewijs niet kan wissen is bedoeld — bij een klacht is
-- precies dit wat aangetoond moet kunnen worden (art. 7 lid 1). De table-grants
-- UPDATE/DELETE worden ingetrokken zodat een poging 42501 geeft, geen stille nul.
-- GEEN superadmin-policy (ADR 0006/0146): beheer heeft hier geen leespad nodig.
-- Bij accountverwijdering ruimt de FK-cascade de rijen op (lib/user-data-tables.ts:
-- RETENTION_ALLOWLIST — behouden bij reset, want de keuze geldt voor het account,
-- niet voor de data).
--
-- ── Schrijfpad ────────────────────────────────────────────────────────────────
-- Uitsluitend `POST /api/consent/ai` (sessie-client, zod, error-envelope ADR
-- 0044): eerst het event, dan de profielrij. De pensioen-route schrijft alleen
-- `kind = 'pension_pdf'`; de persona-seed (lib/seed-persona.ts) stempelt een
-- testaccount als post-onboarding met `source = 'seed'`. De CHECK-lijsten
-- spiegelen lib/ai/consent.ts (bewaakt door lib/ai/consent.test.ts).
--
-- ── Uitrolvolgorde ────────────────────────────────────────────────────────────
-- Migratie VÓÓR de code. De app-shell leest `profiles.ai_consent_at` via
-- select('*'); ontbreekt de kolom dan leest dat als "nog niet gekozen" en toont
-- de overlay, waarna de POST op de ontbrekende kolom faalt. Andersom (migratie
-- eerst, code later) is veilig: de default-kanteling raakt alleen accounts die
-- daarna worden aangemaakt, en die doorlopen de nieuwe onboarding.
--
-- ── Terugweg ──────────────────────────────────────────────────────────────────
-- Correctiemigratie: `alter table public.profiles alter column ai_enabled set
-- default true;` + `drop table public.consent_events;` + de twee kolommen
-- droppen — pas nadat de route en de drie keuze-oppervlakken zijn verwijderd.

-- 1. Profiel: effectieve keuze + default-kanteling ------------------------------

alter table public.profiles
  add column if not exists ai_consent_at      timestamptz,
  add column if not exists ai_consent_version text;

comment on column public.profiles.ai_consent_at is
  'Tijdstip van de laatste expliciete AI-keuze (ja of nee). NULL = nog nooit gekozen → '
  'de app toont de keuze (onboarding-stap of eenmalige overlay). ADR 0155.';
comment on column public.profiles.ai_consent_version is
  'Versie van de toestemmingsfeiten (lib/ai/privacy-facts.ts#AI_CONSENT_VERSION) '
  'waarvoor gekozen is. Een oudere versie dan de huidige = opnieuw voorleggen.';

-- Nieuwe accounts starten met AI uit; de trigger handle_new_user() schrijft alleen
-- (id), dus de default geldt (live geverifieerd 17-09-2026). Bestaande rijen
-- behouden hun waarde.
--
-- NOT NULL erbij: de kolom is live nullable (20260215 maakte 'm zo; 20260307's
-- `ADD COLUMN IF NOT EXISTS … NOT NULL` was een no-op) en de gate leest
-- `!== false`, dus een NULL zou als "aan" lezen — in een opt-in-regime mag
-- "geen uitspraak" niet "aan" betekenen. Live staan 0 NULL-rijen; de UPDATE is
-- de vangrail voor een omgeving waar dat anders ligt en volgt het besluit voor
-- bestaande accounts (pragmatisch: aan tot de keuze).
update public.profiles set ai_enabled = true where ai_enabled is null;
alter table public.profiles alter column ai_enabled set not null;
alter table public.profiles alter column ai_enabled set default false;

comment on column public.profiles.ai_enabled is
  'Kill-switch voor álle AI (cloud én lokaal). Sinds ADR 0155 standaard false: '
  'gaat pas aan door een expliciete keuze via POST /api/consent/ai.';

-- 2. Bewijstabel -----------------------------------------------------------------

create table if not exists public.consent_events (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  kind       text        not null check (kind in ('ai_cloud', 'pension_pdf')),
  decision   text        not null check (decision in ('granted', 'withdrawn')),
  version    text        not null,
  source     text        not null check (source in ('onboarding', 'interstitial', 'mijn-privacy', 'pension-upload', 'seed')),
  created_at timestamptz not null default now()
);

comment on table public.consent_events is
  'Append-only bewijs van elke AI-toestemmingskeuze en omkering (ADR 0155). '
  'Eigen-rij INSERT en SELECT; geen UPDATE/DELETE voor gebruikers; cascade bij accountverwijdering.';

create index if not exists consent_events_user_created_idx
  on public.consent_events (user_id, created_at desc);

alter table public.consent_events enable row level security;

drop policy if exists "consent_events own insert" on public.consent_events;
create policy "consent_events own insert"
  on public.consent_events
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "consent_events own select" on public.consent_events;
create policy "consent_events own select"
  on public.consent_events
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Append-only ook op grant-niveau (huisstijl 20260915121000): de default-ACL
-- geeft anon én authenticated álles op een nieuwe tabel. anon heeft hier niets
-- te zoeken (RLS levert toch 0 rijen, maar een grant die er niet is hoeft ook
-- niet door RLS gedekt te worden); authenticated houdt precies SELECT + INSERT.
revoke all on public.consent_events from anon;
revoke all on public.consent_events from authenticated;
grant select, insert on public.consent_events to authenticated;
