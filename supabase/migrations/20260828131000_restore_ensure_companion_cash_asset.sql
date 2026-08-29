-- RPC `ensure_companion_cash_asset` herstellen (Groep B — live bug 2 van 2).
--
-- ## Waarom dit bestand bestaat naast 20260403000001_ensure_companion_cash_asset
--
-- Dat april-bestand heeft NOOIT gedraaid. Gemeten op 28-08-2026 tegen de
-- productie-DB: `pg_proc` kent in schema `public` géén `ensure_companion_cash_asset`.
--
-- Dit is een echte live bug:
--   * `components/app/module-activation-modal.tsx` roept de RPC aan bij het
--     activeren van module "budgetteren" op een BESTAANDE rekening (r. ~540),
--     met `if (rpcErr) throw rpcErr` → die activering faalt vandaag hard.
--   * De twee andere aanroepen (r. ~565 en ~592, het "nieuwe rekening"-pad)
--     negeren de fout: supabase-js verwerpt niet, het resultaat wordt niet
--     gelezen. Die paden werken toevallig tóch, want de BEFORE INSERT-trigger
--     `trg_bank_account_auto_cash_asset` maakt het companion-bezit al aan.
--     De kapotte weg is dus precies en alleen de bestaande-rekening-weg.
--
-- De lineage-kop op productie is 20260827165521 (gemeten op naam, 28-08-2026);
-- een april-tijdstempel zou out-of-order draaien. Vandaar een nieuw bestand.
--
-- ## Waarom de BODY niet de april-versie is
--
-- Het april-lichaam klakkeloos terugzetten zou een regressie zijn. Gemeten
-- tegen het huidige schema en de live trigger `fn_auto_link_bank_account_asset`
-- (28-08-2026) wijkt het op drie punten af:
--
--   1. GEEN `is_archive_bucket`-uitzondering. De archiefrekening representeert
--      geen geld maar een verzamelplek en hoort géén companion-bezit te krijgen;
--      de live trigger slaat 'm expliciet over. De april-versie zou er wél één
--      aanmaken.
--   2. GEEN `account_number_encrypted`/`account_number_hash`. De live trigger
--      draagt `iban_encrypted`/`iban_hash` over naar het bezit. De april-versie
--      is van vóór de field-level-encryptie en laat die kolommen leeg — het
--      bezit zou dan zonder rekeningnummer-materiaal ontstaan, inconsistent met
--      elk bezit dat de trigger maakt.
--   3. Een `p_skip_auth_check`-PARAMETER. Dat is een IDOR-gat zodra de functie
--      via PostgREST bereikbaar is: SECURITY DEFINER + een door de client zelf
--      te zetten vlag die de eigenaarscontrole uitschakelt, betekent dat een
--      ingelogde gebruiker de functie kan aanroepen op de `bank_account_id` van
--      een WILLEKEURIGE andere gebruiker en daar rijen kan aanmaken/koppelen.
--      Die parameter komt hier niet terug; de eigenaarscontrole is
--      onvoorwaardelijk. De data-reparatielus uit het april-bestand (die de vlag
--      nodig had) is niet overgenomen: die is eenmalig en achterhaald.
--
-- ## Toegangsmodel
--
-- SECURITY DEFINER met `search_path = ''` en volledig gekwalificeerde namen.
-- De functie schrijft uitsluitend op rijen van de AANROEPER: de eerste stap is
-- een eigenaarscontrole op de bankrekening, en elke schrijfactie hangt aan die
-- gecontroleerde rij. EXECUTE wordt ingetrokken van `anon` en `public` en alleen
-- aan `authenticated` gegeven — de precedent uit
-- 20260717132632_security_hygiene_revoke_unused_secdef_rpcs.sql.

-- Ruim een eventuele oude 3-argument-variant op (bestaat niet op productie,
-- maar wel in een lokaal `db reset`-scenario dat het april-bestand wél afspeelt).
drop function if exists public.ensure_companion_cash_asset(uuid, boolean, boolean);
drop function if exists public.ensure_companion_cash_asset(uuid, boolean);

create function public.ensure_companion_cash_asset(
  p_bank_account_id uuid,
  p_has_budget_tracking boolean default false
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ba               record;
  v_caller           uuid;
  v_existing_asset_id uuid;
  v_new_asset_id     uuid;
begin
  v_caller := (select auth.uid());
  if v_caller is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  select * into v_ba
    from public.bank_accounts
   where id = p_bank_account_id;

  -- Eén antwoord voor "bestaat niet" en "niet van jou": geen existentie-orakel
  -- op andermans id's. Zelfde lijn als guard_bank_account_linked_asset.
  if not found or v_ba.user_id is distinct from v_caller then
    raise exception 'Deze rekening bestaat niet of is niet van jou'
      using errcode = '42501';
  end if;

  -- De archiefrekening krijgt bewust GEEN companion cash-bezit; spiegelt
  -- fn_auto_link_bank_account_asset.
  if v_ba.is_archive_bucket then
    return null;
  end if;

  -- Al correct gekoppeld: alleen de budget-vlag bijwerken.
  if v_ba.linked_asset_id is not null then
    if p_has_budget_tracking then
      update public.assets
         set has_budget_tracking = true
       where id = v_ba.linked_asset_id
         and user_id = v_caller;
    end if;
    return v_ba.linked_asset_id;
  end if;

  -- Wees-bezit dat ooit door het onboarding-pad is gemaakt alsnog koppelen.
  select id into v_existing_asset_id
    from public.assets
   where linked_bank_account_id = p_bank_account_id
     and asset_type = 'cash'
     and user_id = v_caller
   limit 1;

  if v_existing_asset_id is not null then
    update public.bank_accounts
       set linked_asset_id = v_existing_asset_id
     where id = p_bank_account_id
       and user_id = v_caller;

    if p_has_budget_tracking then
      update public.assets
         set has_budget_tracking = true
       where id = v_existing_asset_id
         and user_id = v_caller;
    end if;

    return v_existing_asset_id;
  end if;

  -- Nieuw companion cash-bezit. Kolomkeuze spiegelt bewust de live trigger
  -- fn_auto_link_bank_account_asset, inclusief de encrypted/hash-overdracht.
  insert into public.assets (
    user_id, name, asset_type, current_value, purchase_value,
    expected_return, monthly_contribution, institution,
    account_number_encrypted, account_number_hash,
    is_active, sort_order, ownership, household_id,
    net_worth_inclusion_pct, is_liquid, subtype,
    has_budget_tracking, linked_bank_account_id
  ) values (
    v_ba.user_id, v_ba.name, 'cash', v_ba.balance, v_ba.balance,
    0, 0, v_ba.bank_name,
    v_ba.iban_encrypted, v_ba.iban_hash,
    v_ba.is_active, coalesce(v_ba.sort_order, 0),
    coalesce(v_ba.ownership, 'personal'), v_ba.household_id,
    100, true, v_ba.account_type,
    p_has_budget_tracking, p_bank_account_id
  ) returning id into v_new_asset_id;

  update public.bank_accounts
     set linked_asset_id = v_new_asset_id
   where id = p_bank_account_id
     and user_id = v_caller;

  return v_new_asset_id;
end;
$$;

comment on function public.ensure_companion_cash_asset(uuid, boolean) is
  'Zorgt dat een bankrekening van de AANROEPER een gekoppeld companion cash-bezit heeft. '
  'Idempotent: geeft het bestaande bezit terug, koppelt een wees, of maakt er een. '
  'Slaat de archiefrekening over. Eigenaarscontrole is onvoorwaardelijk (geen skip-vlag).';

revoke all on function public.ensure_companion_cash_asset(uuid, boolean) from public;
revoke all on function public.ensure_companion_cash_asset(uuid, boolean) from anon;
grant execute on function public.ensure_companion_cash_asset(uuid, boolean) to authenticated;
