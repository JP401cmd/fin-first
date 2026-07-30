-- De VIERDE datalaag-bescherming van ADR 0075 — `bank_accounts.linked_asset_id`.
--
-- Zelfde patroon, zelfde motivatie als haar twee zusterkolommen:
--   * `bank_connections.target_bank_account_id` (fase 4, 20260729222134)
--   * `bank_connection_accounts.bank_account_id` (fase 6, 20260729234928)
--
-- RLS scope't de RÍJ, niet de WAARDE van een FK-kolom daarop. De UPDATE-policy op
-- `bank_accounts` is eigen-rij (`auth.uid() = user_id`, mét expliciete
-- `with check`), maar de SELECT-policy op `assets` is bréder dan eigen-rij: een
-- huishoud-partner mag de `id` van een gedeelde bezitting van de ander LEZEN. Hij
-- kon daarmee vanuit de browser zijn EIGEN bankrekening laten wijzen naar de
-- bezitting van de ander. De FK-check zelf draait als tabel-eigenaar en omzeilt
-- RLS, dus die houdt het niet tegen.
--
-- Waarom dat schaadt: `linked_asset_id` is de 1-op-1-binding tussen een rekening
-- en haar cash-bezit. Meerdere surfaces (horizon-client, what-if, check-in,
-- assets-data-loader) lezen "losse" rekeningen als `is_active AND linked_asset_id
-- IS NULL` en tellen dát saldo BOVENOP de bezittingen. Een rekening die naar
-- andermans bezit wijst verdwijnt uit die telling én koppelt saldo-sync
-- (`lib/truelayer/balance-valuation.ts`, `balance-sync.ts`) aan een bezitting van
-- een ander. `syncAccountBalance` filtert sinds fase 8 elke schrijfronde op
-- `user_id` als code-side control, maar dat dekt één aanroeppad — geen invariant.
--
-- De invariant die niet van de route mag afhangen:
--   linked_asset_id IS NULL  OR  eigenaar(linked_asset_id) = user_id
--
-- Pre-flight (in hetzelfde tijdvenster als deze migratie gemeten, remote):
--   28 `bank_accounts`-rijen, 26 met een gevulde `linked_asset_id`;
--   0 met een niet-bestaande bezitting, 0 met een bezitting van een andere
--   gebruiker. De guard raakt dus geen enkele bestaande rij.
--
-- Rol-gesimuleerde verificatie (`set local role authenticated` +
-- `request.jwt.claims`, in een transactie die terugrolt), zes gevallen, alle zes
-- zoals ontworpen:
--   1 INSERT met eigen bezit                     → toegestaan
--   2 INSERT met bezit van een ander             → geweigerd 42501
--   3 INSERT met linked_asset_id = null          → toegestaan
--   4 UPDATE zonder waardewijziging (alleen naam) → toegestaan
--   5 UPDATE naar bezit van een ander            → geweigerd 42501
--   6 UPDATE naar null                           → toegestaan
-- Eindstand gelijk aan begintoestand (28 bank_accounts / 91 assets / 40
-- valuations), geen testrijen achtergebleven.

create or replace function public.guard_bank_account_linked_asset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  -- Geen gekoppeld bezit = niets te bewaken. `null` moet ALTIJD mogen: losse
  -- rekeningen (zonder cash-bezit) zijn een normale, veelvoorkomende toestand en
  -- de FK is ON DELETE SET NULL, dus de datalaag nult deze kolom zelf.
  if new.linked_asset_id is null then
    return new;
  end if;

  -- Alleen valideren bij een echte waardewijziging. Zo kan een latere
  -- naam-/saldo-/is_active-UPDATE op een rij die de koppeling al draagt nooit
  -- alsnog stuklopen — bijvoorbeeld als een bezitting later door
  -- huishoud-reparenting van eigenaar wisselt. `syncBankAccountCompanion`
  -- schrijft precies zulke updates (naam, type, saldo, eigendom) op bestaande
  -- companion-rijen.
  if tg_op = 'UPDATE'
     and new.linked_asset_id is not distinct from old.linked_asset_id
     and new.user_id is not distinct from old.user_id then
    return new;
  end if;

  select a.user_id
    into v_owner
  from public.assets a
  where a.id = new.linked_asset_id;

  -- Eén antwoord voor "bestaat niet" en "niet van jou": geen existentie-orakel op
  -- andermans id's, geen id's of andermans gegevens in de melding.
  if v_owner is null or v_owner is distinct from new.user_id then
    raise exception 'Deze bezitting bestaat niet of is niet van jou'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Hygiëne (precedent: 20260729222421): een trigger draait ongeacht
-- EXECUTE-grants. `public` staat er expliciet bij — functies krijgen bij creatie
-- EXECUTE aan PUBLIC, en rolspecifiek revoken is daar een no-op.
revoke all on function public.guard_bank_account_linked_asset() from public, anon, authenticated;

-- Ordening t.o.v. de bestaande BEFORE INSERT-trigger
-- `trg_bank_account_auto_cash_asset` (die `linked_asset_id` kán ZETTEN): Postgres
-- draait triggers van hetzelfde type op alfabetische naam. `trg_bank_account_auto_
-- cash_asset` < `trg_guard_bank_account_linked_asset`, dus de guard ziet de
-- uiteindelijke waarde inclusief wat die trigger heeft ingevuld. Dat is de juiste
-- volgorde: een automatisch gekoppeld bezit hoort net zo goed van de eigenaar te
-- zijn.
drop trigger if exists trg_guard_bank_account_linked_asset on public.bank_accounts;
create trigger trg_guard_bank_account_linked_asset
  before insert or update on public.bank_accounts
  for each row execute function public.guard_bank_account_linked_asset();

comment on column public.bank_accounts.linked_asset_id is
  'Het cash-bezit dat deze rekening representeert (null = losse rekening; die saldi worden BOVENOP de bezittingen geteld). Permanente 1-op-1-binding: nooit nullen bij het uitzetten van budgettering (zie lib/bank-account-companion.ts). EIGENAARSCHAP — de bezitting moet toebehoren aan bank_accounts.user_id, afgedwongen door trigger trg_guard_bank_account_linked_asset (null mag altijd). RLS scope''t de rij, niet de waarde van deze FK: de SELECT-policy op assets is huishoud-verbreed, dus een partner kan de id van een gedeelde bezitting van de ander lezen. Zie ADR 0075.';

-- ── Nagekomen aantekening (spiegel van de fase-6-noot; géén DDL-wijziging) ─────
-- De guard vergelijkt de eigenaar van de bezitting met `new.user_id`, niet met
-- `auth.uid()`. Dat `new.user_id` betrouwbaar IS, komt niet uit deze trigger maar
-- uit de policies op `bank_accounts` — en die zijn hier sterker dan bij fase 6:
-- `Users insert own bank_accounts` heeft `with check ((select auth.uid()) =
-- user_id)` en `Users update own bank_accounts` heeft diezelfde expressie zowel
-- als `using` als als `with check`. Er is dus geen impliciete-USING-afhankelijkheid
-- zoals bij `bank_connection_accounts`. Verzwak die `with check` niet: dan kan
-- iemand een rij mét `user_id` = slachtoffer langs deze guard planten.
