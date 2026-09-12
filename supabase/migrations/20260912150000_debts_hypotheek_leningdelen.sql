-- ============================================================================
-- W-005 — Hypotheek met meerdere leningdelen (fundament)
-- ============================================================================
-- WAAROM
-- In Nederland is één hypotheek vrijwel altijd opgeknipt in leningdelen: losse
-- leningen onder één hypotheekschuld, elk met een eigen rente, aflossingsvorm
-- en rentevaste periode. De app kende tot nu toe alleen losse `debts`-rijen;
-- een gebruiker met drie delen zag drie ongerelateerde hypotheken.
--
-- HET MODEL — zelfverwijzing, geen aparte tabel
-- Elk leningdeel blijft een volwaardige `debts`-rij. Een nullable
-- `parent_debt_id` groepeert ze onder één hypotheek. Reden: een deel draagt
-- exact dezelfde eigenschappen als een gewone schuld (saldo, rente,
-- `repayment_type`, `fixed_rate_end_date`, betaling, `is_tax_deductible`) en
-- wordt door elke bestaande rekenmotor al per rij verwerkt. Een aparte
-- `debt_parts`-tabel zou al die kolommen moeten dupliceren — plus de RLS, de
-- huishouddeling en de partner-split. Zie ADR 0140.
--
-- DE HARDE INVARIANT — de hoofdrij is ZELF een leningdeel
-- De hoofdrij is geen leeg omhulsel met het totaal erin; hij is één van de
-- delen en draagt alleen zijn eigen saldo. Elke motor telt vandaag al álle
-- mortgage-rijen op (lib/box1-income.ts regel 156-158, lib/housing-strategy.ts
-- regel 317-338, lib/horizon-kernel/adapter/potten.ts regel 426). Zou de
-- hoofdrij het groepstotaal dragen, dan telt elk bedrag dubbel — stil, en in
-- drie motoren tegelijk. Deze migratie verandert daarom géén enkel bestaand
-- bedrag: zonder groepering rekent de app precies zoals hij nu rekent, en mét
-- groepering ook.
--
-- GEEN BACKFILL (eigenaarsbesluit 11-09-2026)
-- Bestaande losse hypotheekrijen worden niet automatisch aan elkaar geknoopt.
-- De app stelt samenvoegen vóór, de gebruiker bevestigt. Meting op productie
-- (12-09-2026): 12 actieve mortgage-rijen over 9 gebruikers, waarvan 0
-- gebruikers met meer dan één hypotheekrij op dezelfde woning. Er is vandaag
-- dus geen bestaande stapel om op te ruimen.
--
-- RLS-DEKKING VAN DE NIEUWE KOLOM (additieve kolom = expliciete check)
-- `debts` draagt al RLS; `parent_debt_id` erft deze bestaande policies
-- (gemeten tegen pg_policies, 12-09-2026):
--   * SELECT "View own or shared debts" (authenticated): eigen rij OF
--     ownership='shared' met household_id = user_household_id().
--   * INSERT "Users can insert own debts" (with check user_id = auth.uid()).
--   * UPDATE "Users can update own debts" (using user_id = auth.uid(); zonder
--     eigen WITH CHECK, dus Postgres gebruikt dezelfde expressie als check —
--     een rij naar een andere eigenaar verplaatsen kan niet).
--   * DELETE "Users can delete own debts" (using user_id = auth.uid()).
-- Die policies zeggen niets over de WAARDE van `parent_debt_id`: zonder extra
-- maatregel kan een gebruiker er de id van een rij van iemand anders in zetten
-- (de FK eist alleen dat het id bestaat). Daarom is de FK hieronder
-- SAMENGESTELD op (id, user_id) — zie 3. Het bedoelde schrijfpad is het
-- bestaande debts-mutatiepad (`app/api/debts/[id]`); dit is geen eigen-rij
-- preference, dus client-direct schrijven is hier niet de route.
-- ============================================================================

-- ── 1. Kolom + constraints in ÉÉN statement (bewust) ────────────────────────
-- De ERD is gescand, niet gecureerd: `scanTableRelations` in
-- scripts/architecture/generate.mjs leest foreign keys uit twee vormen — een
-- inline `REFERENCES` in CREATE TABLE, en `ALTER TABLE … ADD COLUMN … REFERENCES`
-- binnen ÉÉN statement. Een losse `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY`
-- ziet hij NIET (geverifieerd tegen de regex op regel 373-375, 12-09-2026).
-- Zou de FK hier als los statement staan, dan bleef de leningdeel-relatie
-- onzichtbaar in de ERD. Vandaar één samengesteld ALTER TABLE: Postgres voert
-- de acties in volgorde uit (unique vóór de FK die hem nodig heeft) en de
-- scanner ziet `add column … parent_debt_id … references public.debts`.
-- De DROP IF EXISTS-regels hierboven maken het geheel herhaalbaar.
alter table public.debts
  drop constraint if exists debts_parent_debt_id_fkey;
alter table public.debts
  drop constraint if exists debts_parent_debt_id_geen_zelfverwijzing;
alter table public.debts
  drop constraint if exists debts_id_user_id_key;

-- LET OP bij toekomstig onderhoud: hou dit statement vrij van puntkomma's,
-- óók in commentaar. De scanner-regex spant `[^;]*?` van de kolomnaam tot
-- `references`; één puntkomma in een toelichtende zin laat de ERD-relatie
-- stilzwijgend verdwijnen. De toelichting staat daarom onder het statement:
--   2  = zelfverwijzing uitgesloten (declaratief, want beide kolommen zitten
--        in dezelfde rij) — de langere cyclus gaat via de trigger in 4
--   3a = doelwit voor de samengestelde FK
--   3b = de FK zelf, verdedigd in blok 3 hieronder
alter table public.debts
  add column if not exists parent_debt_id uuid,
  add constraint debts_parent_debt_id_geen_zelfverwijzing
    check (parent_debt_id is null or parent_debt_id <> id),
  add constraint debts_id_user_id_key unique (id, user_id),
  add constraint debts_parent_debt_id_fkey
    foreign key (parent_debt_id, user_id)
    references public.debts (id, user_id)
    on delete set null (parent_debt_id);

comment on column public.debts.parent_debt_id is
  'Leningdeel-groepering: verwijst naar de hoofdrij van dezelfde hypotheek (zelfde eigenaar). NULL = zelfstandige schuld of hoofdrij. De hoofdrij is zelf ook een leningdeel en draagt NOOIT het groepstotaal — alle rekenmotoren tellen mortgage-rijen op, dus een totaal op de hoofdrij zou dubbel tellen. Maximaal één niveau diep (W-005 / ADR 0140).';

-- ── 3. Waarom de FK samengesteld is, en waarom SET NULL ────────────────────
-- Een gewone FK naar debts(id) zou een gebruiker toestaan naar de rij van een
-- andere gebruiker te wijzen: de INSERT-policy toetst alleen `user_id`, niet de
-- waarde van `parent_debt_id`. Door (parent_debt_id, user_id) naar
-- (id, user_id) te laten wijzen, dwingt referentiële integriteit het
-- eigenaarschap af — declaratief, niet te omzeilen, en ook niet door
-- service-role-schrijfpaden (die RLS wél passeren maar RI niet).
-- MATCH SIMPLE: staat `parent_debt_id IS NULL` toe zonder controle; `user_id`
-- is NOT NULL, dus zodra er een hoofdrij is, wordt de FK volledig getoetst.
--
-- ON DELETE SET NULL (parent_debt_id) — bewuste keuze, PG 15+ kolomvorm:
--   * CASCADE is verworpen: een hoofdrij verwijderen zou stil alle andere
--     leningdelen vernietigen — rijen die elk een eigen openstaande schuld van
--     tienduizenden euro's dragen. Een RI-cascade omzeilt RLS volledig en is
--     onomkeerbaar; precies het stille verlies dat we niet willen.
--   * RESTRICT/NO ACTION is verworpen: dan faalt het verwijderen van een
--     hypotheek met een harde DB-fout die de UI moet opvangen, ook wanneer de
--     gebruiker terecht één deel wil opruimen.
--   * SET NULL laat de delen staan als zelfstandige hypotheekrijen — de
--     situatie van vóór W-005, zichtbaar en herstelbaar. Geen enkel bedrag
--     verdwijnt; alleen de groepering valt uiteen. Dit spiegelt bovendien het
--     bestaande idioom op deze tabel: `debts_linked_asset_id_fkey` en
--     `debts_household_id_fkey` staan beide op ON DELETE SET NULL (gemeten
--     tegen pg_constraint, 12-09-2026).
-- De kolomvorm `SET NULL (parent_debt_id)` is nodig omdat de FK samengesteld
-- is: zonder kolomlijst zou Postgres ook `user_id` op NULL willen zetten, en
-- die kolom is NOT NULL.

-- ── 4. Maximaal één niveau diep (en daarmee: geen cyclus) ───────────────────
-- Een CHECK kan geen andere rijen lezen, dus dit is een trigger. Twee regels,
-- samen sluitend:
--   (a) de hoofdrij van een deel mag zelf geen deel zijn;
--   (b) een rij die zélf delen draagt, mag geen deel worden.
-- Bewijs dat cyclus onmogelijk is: een cyclus van lengte 1 valt onder de CHECK
-- in 2. Een cyclus van lengte 2 (A→B, B→A) vereist bij de tweede stap dat A
-- geen hoofdrij heeft, maar A wijst al naar B — regel (a) weigert. Elke langere
-- cyclus vereist een keten van diepte >= 2 en valt onder (a) of (b).
--
-- SECURITY INVOKER (niet DEFINER): de trigger leest alleen rijen van dezelfde
-- gebruiker, die onder de bestaande SELECT-policy zichtbaar zijn. Zo is er geen
-- functie met verhoogde rechten om te hardenen. Zou de hoofdrij onzichtbaar
-- zijn (andere eigenaar), dan geeft deze trigger een duidelijke fout en zou de
-- FK uit 3 de schrijfactie sowieso weigeren — twee lagen, zelfde uitkomst.
create or replace function public.debts_leningdeel_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_parent public.debts%rowtype;
begin
  if new.parent_debt_id is null then
    return new;
  end if;

  -- Staat ook als CHECK in 2, maar die vuurt NA deze trigger. Zonder deze regel
  -- krijgt een zelfverwijzing de misleidende diepte-melding hieronder.
  if new.parent_debt_id = new.id then
    raise exception 'Een schuld kan niet zijn eigen hoofdrij zijn'
      using errcode = '23514';
  end if;

  select * into v_parent
  from public.debts d
  where d.id = new.parent_debt_id
    and d.user_id = new.user_id;

  if not found then
    raise exception 'De hoofdrij van dit leningdeel bestaat niet of hoort bij een andere gebruiker'
      using errcode = '23503';
  end if;

  if v_parent.parent_debt_id is not null then
    raise exception 'Een leningdeel kan niet onder een ander leningdeel hangen (maximaal een niveau diep)'
      using errcode = '23514';
  end if;

  if exists (select 1 from public.debts d where d.parent_debt_id = new.id) then
    raise exception 'Deze schuld draagt zelf leningdelen en kan daarom geen leningdeel worden'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.debts_leningdeel_guard() is
  'W-005: houdt de leningdeel-boom maximaal een niveau diep en sluit cycli uit. Aanvulling op debts_parent_debt_id_fkey (eigenaarschap) en de CHECK op zelfverwijzing.';

drop trigger if exists trg_debts_leningdeel_guard on public.debts;
create trigger trg_debts_leningdeel_guard
  before insert or update of parent_debt_id on public.debts
  for each row execute function public.debts_leningdeel_guard();

-- ── 5. Delen hangen aan dezelfde woning als hun hoofdrij ────────────────────
-- WAAROM DIT EEN CONSTRAINT IS EN GEEN AFSPRAAK
-- Eigenaarsbesluit 2 zegt: de gekoppelde woning hoort op hypotheekniveau, niet
-- per deel. Dat is een UI-uitspraak (waar zet je het in), geen opslag-uitspraak.
-- Zouden delen `linked_asset_id` NULL krijgen omdat "de woning bij de hoofdrij
-- hoort", dan vallen ze stil uit drie aggregaties tegelijk, want alle drie
-- filteren op `linked_asset_id`:
--   * lib/box1-income.ts  — som van de aftrekbare hypotheekrente;
--   * lib/housing-strategy.ts — mortgageBalance + mortgageMonthlyPayment;
--   * lib/horizon-kernel/adapter/potten.ts — het gedeelde HYPOTHEEK_SLOT.
-- De delen zouden dan als losse schulden in de projectie belanden en de
-- renteaftrek zou te laag uitvallen. Daarom dragen delen de woning zélf, en
-- bewaakt de database dat die gelijk is aan die van de hoofdrij.
--
-- DEFERRABLE INITIALLY DEFERRED — bewust, want de invariant is wederzijds.
-- Zou de controle direct afgaan, dan bestaat er geen geldige volgorde om de
-- woning van een gegroepeerde hypotheek te wijzigen: de hoofdrij eerst wijzigen
-- botst op de delen, de delen eerst wijzigen botst op de hoofdrij. Uitgesteld
-- tot COMMIT mag de volgorde binnen één transactie vrij zijn en telt alleen de
-- eindtoestand. Gevolg voor de latere UI-snede: een woning-wijziging op een
-- gegroepeerde hypotheek moet in ÉÉN transactie (RPC), niet als losse PATCHes.
-- Bewust gekozen boven een cascade-trigger die de delen stilletjes meeschrijft:
-- `trg_stamp_household_id` draait BEFORE UPDATE en leidt `household_id` af uit
-- `auth.uid()`, dus een verborgen schrijfactie vanuit een service-role-context
-- zou het huishouden van de delen kunnen wissen. Een luide weigering is hier
-- veiliger dan een stille correctie.
create or replace function public.debts_leningdeel_woning_consistent()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_afwijkend integer;
begin
  -- Toets de hele groep waar deze rij in zit: als deel (deel.id = new.id) en
  -- als hoofdrij (deel.parent_debt_id = new.id). Is de rij inmiddels verwijderd,
  -- dan levert de join 0 rijen en slaagt de controle terecht.
  select count(*) into v_afwijkend
  from public.debts deel
  join public.debts hoofd on hoofd.id = deel.parent_debt_id
  where (deel.id = new.id or deel.parent_debt_id = new.id)
    and deel.linked_asset_id is distinct from hoofd.linked_asset_id;

  if v_afwijkend > 0 then
    raise exception 'Een leningdeel moet aan dezelfde woning gekoppeld zijn als zijn hoofdrij (% afwijkend[e] deel/delen)', v_afwijkend
      using errcode = '23514';
  end if;

  return null;
end;
$$;

comment on function public.debts_leningdeel_woning_consistent() is
  'W-005: bewaakt bij COMMIT dat elk leningdeel dezelfde linked_asset_id draagt als zijn hoofdrij. Uitgesteld omdat de invariant wederzijds is; een woning-wijziging op een gegroepeerde hypotheek hoort in een transactie.';

drop trigger if exists trg_debts_leningdeel_woning_consistent on public.debts;
create constraint trigger trg_debts_leningdeel_woning_consistent
  after insert or update of parent_debt_id, linked_asset_id on public.debts
  deferrable initially deferred
  for each row execute function public.debts_leningdeel_woning_consistent();

-- ── 6. Index ────────────────────────────────────────────────────────────────
-- Partieel, want verreweg de meeste schulden zijn geen leningdeel — spiegelt
-- `idx_debts_household` (partieel op household_id IS NOT NULL). Beide kolommen
-- omdat de FK uit 3 samengesteld is: de ON DELETE SET NULL-actie zoekt op
-- (parent_debt_id, user_id), en de UI zoekt de delen van een hoofdrij op.
create index if not exists idx_debts_parent_debt_id
  on public.debts (parent_debt_id, user_id)
  where parent_debt_id is not null;
