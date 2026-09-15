-- Vragenlijsten — verspreidingsvoorkeur per lijst (ADR 0147 "gerichte verspreiding").
--
-- ── Doel ──────────────────────────────────────────────────────────────────────
-- Eén nullable jsonb-kolom op `questionnaires` die vastlegt AAN WIE en WANNEER een
-- lijst wordt aangeboden: de regels (wie komt in aanmerking), het moment (direct of
-- na een drempel) en of er een popup/prompt bij hoort. Zonder deze kolom kende de
-- app maar één verspreiding: elke actieve lijst is er meteen voor iedereen.
--
-- NULL = het oude gedrag, ongewijzigd: iedereen, direct, geen popup. Elke bestaande
-- rij houdt die betekenis, dus er is geen backfill en geen gedragsverandering bij
-- het uitrollen van deze migratie.
--
-- INHOUD: uitsluitend REGELS EN INSTELLINGEN — NOOIT gebruikers-id's, e-mailadressen
-- of andere persoonsgegevens. Dat is een harde eis, geen stijlvoorkeur: elke
-- ingelogde gebruiker mag de rijen van actieve lijsten lezen (zie Toegangsmodel),
-- dus alles wat hier in staat is de facto publiek binnen de ingelogde populatie.
-- De concrete toewijzing per persoon (handmatig/groep) staat in
-- `public.questionnaire_invitations` (migratie 20260915131000) — eigen-rij afgeschermd.
--
-- ── Toegangsmodel ─────────────────────────────────────────────────────────────
-- GEEN RLS-wijziging. De bestaande policies op `questionnaires` blijven exact zoals
-- ze zijn en dekken deze kolom automatisch (een ADD COLUMN erft de policies van de
-- tabel):
--   * "questionnaires select" (to authenticated) — USING: is_active OR service_role
--     OR superadmin. Dus: elke ingelogde gebruiker leest `verspreiding` van ACTIEVE
--     lijsten; concept-lijsten alleen superadmin/service_role.
--   * "questionnaires admin insert/update/delete" (to public) — USING/WITH CHECK:
--     service_role OR superadmin. De superadmin schrijft `verspreiding` dus via de
--     bestaande admin-update-policy met de gewone sessie-client (anon RLS-client),
--     precies zoals hij vandaag `title`/`is_active` schrijft. Geen service-role nodig,
--     geen nieuwe policy, geen nieuw schrijfpad.
--
-- EXPLICIET: targeting is een VERSPREIDINGSVOORKEUR, geen beveiligingsgrens.
-- Dat een gebruiker buiten de doelgroep valt, betekent dat hij de lijst niet
-- KRIJGT AANGEBODEN — niet dat hij hem niet kan zien. De regels zelf zijn leesbaar
-- (zie boven) en de zichtbaarheidsgrens die er wél toe doet, blijft `is_active`
-- plus de invulgrenzen uit 20260913130000 (eigen sessie, eigen antwoorden). Wie een
-- lijst per se wil invullen buiten zijn doelgroep om, kan dat — en dat is de
-- bedoelde vorm: dit is onderzoeksverspreiding, geen autorisatie. Bouw hier dus
-- nooit een beveiligingsaanname bovenop.
--
-- ── Schrijfpad ────────────────────────────────────────────────────────────────
-- PUT /api/admin/questionnaires/[id]/verspreiding — superadmin, sessie-client
-- (anon RLS-client), read-modify-write van deze ene kolom. Leespad:
-- GET /api/questionnaires leest `verspreiding` mee bij de actieve lijsten en
-- beslist compute-on-read of de lijst voor deze gebruiker in aanmerking komt.
-- Geen enkel ander pad schrijft deze kolom.
--
-- ── AVG ───────────────────────────────────────────────────────────────────────
-- Geen persoonsgegevens (zie Doel: regels en instellingen, geen id's). Daarom géén
-- indeling in lib/user-data-tables.ts en niets te wissen bij accountverwijdering:
-- `questionnaires` is beheerdersdata, geen gebruikersdata. De CHECK hieronder
-- dwingt alleen de vorm af (object), niet de inhoud — het verbod op id's is een
-- normregel in de route en de review, niet in de database.
--
-- ── Uitrolvolgorde ────────────────────────────────────────────────────────────
-- Mag vóór de code: een nieuwe nullable kolom die niemand leest verandert niets.
-- Andersom is óók veilig zolang de code de kolom tolerant leest (NULL = oud gedrag),
-- maar de volgorde migratie-eerst is de bedoelde.
--
-- ── Terugweg ──────────────────────────────────────────────────────────────────
-- Correctiemigratie met `alter table public.questionnaires drop column verspreiding;`
-- (de CHECK verdwijnt mee) — pas nadat de lees- en schrijfroutes zijn verwijderd.
-- Er worden geen rijen aangeraakt, dus terugdraaien kost geen data behalve de
-- ingestelde verspreidingsregels zelf.
--
-- ── Live gemeten vóór schrijven (15-09-2026) ──────────────────────────────────
--   * `mcp list_migrations`: laatst toegepaste versie = 20260913160000. De drie
--     migraties 20260915120000/121000/122000 staan wél in de repo maar zijn NIET
--     toegepast. Deze migratie bouwt daar dan ook niet op voort; alleen op de live
--     `questionnaires`-tabel.
--   * `pg_attribute`: questionnaires heeft id, title, description, is_active,
--     created_at, updated_at — nog géén `verspreiding`.
--   * `pg_policies`: "questionnaires select" to authenticated
--     USING (is_active OR (select auth.role()) = 'service_role' OR superadmin), plus
--     "questionnaires admin insert/update/delete" to public met service_role OR
--     superadmin. `relrowsecurity` = true, `relforcerowsecurity` = false.
--   * `information_schema.role_table_grants`: anon en authenticated hebben beide de
--     Supabase-brede tabelgrants op `questionnaires` (SELECT t/m UPDATE). De
--     afscherming zit dus volledig in RLS — ongewijzigd door deze migratie.

alter table public.questionnaires
  add column if not exists verspreiding jsonb;

comment on column public.questionnaires.verspreiding is
  'Verspreidingsvoorkeur (ADR 0147): aan wie en wanneer deze lijst wordt aangeboden. '
  'NULL = oud gedrag (iedereen, direct, geen popup). Bevat uitsluitend regels en '
  'instellingen, NOOIT gebruikers-id''s of e-mailadressen — elke ingelogde gebruiker '
  'leest deze kolom van actieve lijsten. Targeting is een verspreidingsvoorkeur, '
  'geen beveiligingsgrens; de persoonsgebonden toewijzing staat in '
  'questionnaire_invitations.';

-- Vormcheck: het veld is een object of het is er niet. Sluit uit dat er per ongeluk
-- een array, een losse string of een getal in belandt (jsonb accepteert dat allemaal),
-- waar de lezer een object verwacht. Idempotent toegevoegd.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.questionnaires'::regclass
      and conname = 'questionnaires_verspreiding_is_object'
  ) then
    alter table public.questionnaires
      add constraint questionnaires_verspreiding_is_object
      check (verspreiding is null or jsonb_typeof(verspreiding) = 'object');
  end if;
end $$;
