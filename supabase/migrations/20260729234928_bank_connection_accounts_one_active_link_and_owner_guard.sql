-- Fase 6 van specs/bank-connect-doelrekening/plan.md — FR5: één actieve
-- bankkoppeling per TriFinity-rekening, en één koppelrij per externe rekening.
--
-- Drie invarianten, alle drie in de DATALAAG omdat geen ervan van één
-- oplettende aanroeper mag afhangen:
--
--  (1) EEN ACTIEVE KOPPELING PER TRIFINITY-REKENING. Twee actieve koppelingen op
--      dezelfde `bank_accounts`-rij betekent twee bronnen die op dezelfde
--      `transactions.account_id` schrijven, met twee sync-cursors en twee saldi.
--      Een INACTIEVE tweede rij mag wél: dat is precies de zachte ontkoppeling
--      die de callback bij een reconnect hergebruikt in plaats van dupliceert.
--      Vandaar een PARTIËLE unieke index en geen constraint.
--      Deze index is óók het echte slot onder de bezet-controle in
--      `POST /api/bank-connect/relink`: die controle is een read-then-write en dus
--      een TOCTOU — twee gelijktijdige verhuizingen naar dezelfde rekening komen
--      er beide door. De routecontrole blijft de vriendelijke variant (409 met
--      uitleg), deze index is de grens.
--
--  (2) EEN KOPPELRIJ PER (gebruiker, externe rekening). De callback dedupliceert
--      hier al op (`external_account_id` is schakel 1 van de precedentieketen),
--      maar tot nu stond er op deze tabel GEEN ENKELE unieke constraint — de
--      aanname leefde alleen in code. Twee gelijktijdige koppelpogingen konden er
--      dus twee rijen van maken. `external_account_id` is NOT NULL, dus er is
--      geen NULL-uitweg waardoor rijen langs deze index glippen.
--
--  (3) EIGENAARSCHAP VAN `bank_account_id` — de erfenis uit fase 5.
--      Spiegelbeeld van `guard_bank_connection_target_account` (fase 4,
--      20260729222134) met exact dezelfde motivatie: RLS scope't de RÍJ, niet de
--      WAARDE van een FK-kolom daarop. De policy `Users can manage own connection
--      accounts` is `for all` voor rol `public` met
--      `using (auth.uid() = user_id)` en `with_check = null`; de FK-check zelf
--      draait als tabel-eigenaar en omzeilt RLS. Een huishoud-partner mag de `id`
--      van een gedeelde `bank_accounts`-rij van de ander LEZEN (de SELECT-policy
--      op `bank_accounts` is bréder dan eigen-rij) en kon daarmee vanuit de
--      browser zijn eigen koppelrij naar die rekening laten wijzen. Firsthand
--      vastgesteld: géén cross-user READ (die rij mag hij onder dezelfde policy
--      al lezen, en `syncAccountBalance` kan de partnerrij niet schrijven omdat de
--      UPDATE-policy owner-gescoped is), maar wél eigen-data-vervuiling op een
--      gedeelde rekening plus een misleidend dragerlabel op het correctiemoment.
--
--      De invariant die niet van de route mag afhangen:
--        bank_account_id IS NULL  OR  eigenaar(bank_account_id) = user_id
--
--      Ordening is hier geen detail: een BEFORE ROW-trigger draait vóór de
--      constraint-/indexcontroles, dus een poging op andermans rekening loopt op
--      (3) stuk en nooit op (1) — de unieke index vertelt daardoor nooit iets over
--      het bestaan van andermans koppelingen.
--
-- Pre-flight (0d, in hetzelfde tijdvenster als deze migratie gemeten): beide
-- overtreder-queries geven 0 rijen op remote; 2 koppelrijen totaal, 0 met een
-- vreemde drager. Een partiële unieke index faalt hard op bestaande data, dus dat
-- is geen formaliteit — zie restrisico 4 in het plan.

-- ── (3) Eigenaarschapsguard ────────────────────────────────────────────────────
-- `security definer` + `set search_path = ''`: de eigenaarschapslezing moet
-- gezaghebbend zijn en niet door de (bredere) SELECT-policy op `bank_accounts` of
-- een search_path-truc te misleiden. Stijl gespiegeld van
-- `public.guard_bank_connection_target_account`.
create or replace function public.guard_bank_connection_account_bank_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  -- Geen drager = niets te bewaken. `null` moet ALTIJD mogen: de callback maakt
  -- een koppelrij aan waarvan de rekening-aanmaak kan zijn mislukt, en het
  -- correctiemoment leest die toestand juist als fout.
  if new.bank_account_id is null then
    return new;
  end if;

  -- Alleen valideren bij een echte waardewijziging. Zo kan een latere
  -- status-/cursor-/saldo-UPDATE op een rij die de drager al draagt nooit alsnog
  -- stuklopen — bijvoorbeeld als een rekening later door huishoud-reparenting van
  -- eigenaar wisselt. Zelfde tijd-van-schrijven-aanname als de fase-4-trigger, en
  -- daarmee dezelfde voorwaarde bij een toekomstige reparenting-functie.
  if tg_op = 'UPDATE'
     and new.bank_account_id is not distinct from old.bank_account_id
     and new.user_id is not distinct from old.user_id then
    return new;
  end if;

  select ba.user_id
    into v_owner
  from public.bank_accounts ba
  where ba.id = new.bank_account_id;

  -- Eén antwoord voor "bestaat niet" en "niet van jou": geen existentie-orakel op
  -- andermans id's, geen id's in de melding. Zelfde tekst als de 400 van
  -- `auth-link`/`relink`, zodat de gebruiker altijd hetzelfde leest.
  if v_owner is null or v_owner is distinct from new.user_id then
    raise exception 'Deze rekening bestaat niet of is niet van jou'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Hygiëne (precedent: de harden_*/revoke_anon-migraties): een trigger draait
-- ongeacht EXECUTE-grants. `public` staat er expliciet bij — functies krijgen bij
-- creatie EXECUTE aan PUBLIC, en rolspecifiek revoken is daar een no-op (les uit
-- 20260729222421).
revoke all on function public.guard_bank_connection_account_bank_account() from public, anon, authenticated;

drop trigger if exists trg_guard_bank_connection_account_bank_account on public.bank_connection_accounts;
create trigger trg_guard_bank_connection_account_bank_account
  before insert or update on public.bank_connection_accounts
  for each row execute function public.guard_bank_connection_account_bank_account();

-- ── (1) Eén ACTIEVE koppeling per TriFinity-rekening ───────────────────────────
create unique index if not exists bank_connection_accounts_one_active_per_bank_account
  on public.bank_connection_accounts (bank_account_id)
  where is_active and bank_account_id is not null;

-- ── (2) Eén koppelrij per (gebruiker, externe rekening) ────────────────────────
create unique index if not exists bank_connection_accounts_one_per_external
  on public.bank_connection_accounts (user_id, external_account_id);

comment on column public.bank_connection_accounts.bank_account_id is
  'De TriFinity-rekening die deze bankrekening draagt (null = de aanmaak is mislukt; het correctiemoment leest dat als fout). Twee invarianten: (1) EEN ACTIEVE KOPPELING per rekening, afgedwongen door de partiële unieke index bank_connection_accounts_one_active_per_bank_account (een INACTIEVE tweede rij mag wél — dat is de zachte ontkoppeling die een reconnect hergebruikt); (2) EIGENAARSCHAP — de rekening moet toebehoren aan bank_connection_accounts.user_id, afgedwongen door trigger trg_guard_bank_connection_account_bank_account (null mag altijd).';

-- ── Nagekomen aantekening (security-review fase 6; géén DDL-wijziging) ─────────
-- De guard vergelijkt de eigenaar van de drager met `new.user_id`, niet met
-- `auth.uid()`. Dat `new.user_id` betrouwbaar IS, komt niet uit deze trigger maar
-- uit de policy: `Users can manage own connection accounts` is `for all` met
-- `using (auth.uid() = user_id)` en `with_check = null`, en Postgres hergebruikt
-- dan `USING` als post-write-check — die draait ná deze BEFORE-trigger.
--
-- Zet iemand daar later een expliciete `with check (true)` op (een plausibele
-- "fix" als een UPDATE ooit onterecht geweigerd lijkt), dan passeert een rij met
-- `user_id` = slachtoffer én `bank_account_id` = de eigen drager van dat
-- slachtoffer deze guard: je plant een koppelrij ónder een andere gebruiker en
-- bezet zijn rekening via de index hierboven. Geen leesleak, wél vervuiling.
-- Verifieerd met een rollback-probe: zonder `with check` weigert RLS die insert
-- zelf ('new row violates row-level security policy'). Dezelfde afhankelijkheid
-- geldt voor `guard_bank_connection_target_account` (fase 4).
comment on column public.bank_connection_accounts.external_account_id is
  'De stabiele rekening-identiteit van de provider — schakel 1 van de precedentieketen in de callback, en het enige veld dat een herautorisatie (elke 90 dagen) overleeft. Uniek per gebruiker, afgedwongen door bank_connection_accounts_one_per_external: die index verankert de dedup-aanname die de callback maakt, zodat twee gelijktijdige koppelpogingen er geen twee rijen van maken.';
