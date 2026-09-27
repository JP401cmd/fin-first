-- Globale schakelaar "Automatisch bijwerken" voor bank- en brokerkoppelingen (W-018, ADR 0182).
--
-- WAAROM: bank (TrueLayer) en brokers (Trading 212) synchroniseerden alleen op
--   een knop. Wie de app een week niet opent, zag bij terugkomst verouderde
--   saldi en transacties. Sinds ADR 0182 start /overzicht bij het openen op de
--   achtergrond de BESTAANDE sync-route voor elke koppeling die langer dan
--   ~12 uur niet is bijgewerkt. De gebruiker is daarbij aanwezig (attended): er
--   komt geen cron, geen service-role en geen nieuw pad naar de bank bij. Deze
--   kolom is de keuze of dat mag.
--
-- DEFAULT true: automatisch bijwerken staat standaard AAN, voor nieuwe én
--   bestaande accounts. Motivering:
--     - het doet niets wat de gebruiker niet zelf met één klik doet: dezelfde
--       route, dezelfde dagrem (met reserve voor handmatig), hetzelfde moment
--       (hij heeft de app open);
--     - hij koppelde zijn bank of broker juist om niet zelf te hoeven bijhouden;
--       een opt-in zou het gedrag verstoppen achter een instelling die bijna
--       niemand vindt;
--     - de keuze blijft volledig omkeerbaar op /mijn/koppelingen.
--   Een koppeling die nog nooit synchroniseerde gaat nooit automatisch mee (het
--   correctiemoment van ADR 0069 blijft dicht bij de gebruiker; ADR 0158 regelt
--   de eerste ophaal).
--
-- FAIL-CLOSED IN DE CODE: de trigger vuurt alleen bij een expliciete `true`.
--   Zolang deze migratie niet is toegepast bestaat de kolom niet, levert
--   `select('*')` hem niet, en blijft de functie slapend. Daarmee is er geen
--   volgorde-afhankelijkheid tussen deploy en migratie.
--
-- Eén scalar boolean (geen jsonb): één globale keuze, geen map per koppeling.
--   Per koppeling kiezen komt pas als daar vraag naar is (dan een kolom op
--   bank_connection_accounts / broker_connections, via schemawijziging).
--
-- TOEGANGSMODEL (geen nieuwe RLS-policy nodig): profiles heeft de eigen-rij
--   policy "Users can manage own profile" (FOR ALL USING auth.uid() = id,
--   20260215000000_create_base_tables.sql). Deze kolom valt daaronder, net als
--   privacy_mode/display_mode. Schrijfpad: PUT /api/auto-sync, own-row update
--   via de anon RLS-client (`.eq('id', user.id)`), nooit service-role.
--
-- PUUR ADDITIEF; veilig her-uitvoerbaar via IF NOT EXISTS.

alter table public.profiles
  add column if not exists auto_sync_enabled boolean not null default true;

comment on column public.profiles.auto_sync_enabled is
  'W-018 / ADR 0182: mag /overzicht bij openen bank- en brokerkoppelingen die >12u niet gesynct zijn op de achtergrond bijwerken? Default true; eigen-rij pref.';
