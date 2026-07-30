-- Eigenaarschapsinvariant op bank_connections.target_bank_account_id.
--
-- Waarom deze migratie (security-bevinding, fase 4 van
-- specs/bank-connect-doelrekening/plan.md):
-- `POST /api/bank-connect/auth-link` valideert het eigenaarschap van de gekozen
-- doelrekening netjes server-side (`loadTargetAccount`, expliciet
-- `.eq('user_id', ...)`), maar de datalaag scope't alleen de RIJ en niet de
-- WAARDE van deze kolom. De policy `Users can manage own connections` is
-- `for all` met `using (auth.uid() = user_id)` en `with_check = null`,
-- `authenticated` heeft tabel-brede INSERT/UPDATE-grants, en de FK-check zelf
-- draait als tabel-eigenaar en omzeilt RLS. Een huishoud-partner mag de `id` van
-- een gedeelde `bank_accounts`-rij van de ander LEZEN (de SELECT-policy op
-- `bank_accounts` is bréder dan eigen-rij) en kon daarmee vanuit de browser
-- rechtstreeks zijn eigen `bank_connections`-rij naar die rekening laten wijzen —
-- de route omzeild, niet gebroken. Vandaag zonder impact (niets leest de kolom),
-- maar fase 5 gaat hem consumeren: dan landt de bankkoppeling van de aanvaller op
-- de rekening van het slachtoffer, met transacties op andermans `account_id`.
--
-- Dit is de invariant die NIET van één oplettende aanroeper mag afhangen:
--   target_bank_account_id IS NULL  OR  eigenaar(target) = bank_connections.user_id
--
-- RLS-dekking van de kolom (regel: additieve kolom = expliciete dekkingscheck):
-- de kolom erft `Users can manage own connections` — eigen-rij lezen én
-- schrijven via de anon/authenticated RLS-client. Dat blijft het bedoelde
-- schrijfpad (`auth-link` insert een pending-rij met een EIGEN
-- `bank_accounts.id`); deze trigger begrenst alleen de toegestane WAARDE.
--
-- Waarom een trigger en geen samengestelde FK: een FK
-- `(target_bank_account_id, user_id) -> bank_accounts(id, user_id)` zou de
-- invariant declaratief afdwingen, maar levert een Engelse Postgres-FK-fout
-- inclusief de sleutelwaarden in DETAIL, en vraagt een extra unieke index plus
-- een kolom-specifieke `on delete set null (...)`. Een trigger geeft één vaste,
-- Nederlandse, id-vrije melding — gelijk aan de 400 van de route.
--
-- `security definer` + `set search_path = ''`: de eigenaarschapslezing moet
-- gezaghebbend zijn en niet door de (bredere) SELECT-policy op `bank_accounts`
-- of een search_path-truc te misleiden. Stijl gespiegeld van
-- `public.guard_profiles_role` (20260717132003).
create or replace function public.guard_bank_connection_target_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_owner uuid;
begin
  -- Geen doelrekening = niets te bewaken. `null` moet ALTIJD mogen: de meeste
  -- koppelingen hebben geen voorkeur, en de callback nult de kolom bewust
  -- (consume-once) — óók vanuit de service-role.
  if new.target_bank_account_id is null then
    return new;
  end if;

  -- Alleen valideren wanneer de verwijzing (of de eigenaar van de koppeling zelf)
  -- verandert. Zo kan een latere status/token-UPDATE op een rij die de voorkeur al
  -- draagt nooit alsnog stuklopen — bijvoorbeeld als een rekening later door
  -- huishoud-reparenting van eigenaar wisselt.
  if tg_op = 'UPDATE'
     and new.target_bank_account_id is not distinct from old.target_bank_account_id
     and new.user_id is not distinct from old.user_id then
    return new;
  end if;

  select ba.user_id
    into v_target_owner
  from public.bank_accounts ba
  where ba.id = new.target_bank_account_id;

  -- Eén antwoord voor "bestaat niet" en "niet van jou": geen existentie-orakel op
  -- andermans id's, geen id's of andermans gegevens in de melding. Zelfde tekst als
  -- de 400 van `auth-link`, zodat de gebruiker altijd hetzelfde leest.
  if v_target_owner is null or v_target_owner is distinct from new.user_id then
    raise exception 'Deze rekening bestaat niet of is niet van jou'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Hygiëne (precedent: de harden_*/revoke_anon-migraties): een trigger draait
-- ongeacht EXECUTE-grants, dus de eindgebruikerrollen hoeven de functie niet zelf
-- te kunnen aanroepen.
revoke all on function public.guard_bank_connection_target_account() from anon, authenticated;

drop trigger if exists trg_guard_bank_connection_target_account on public.bank_connections;
create trigger trg_guard_bank_connection_target_account
  before insert or update on public.bank_connections
  for each row execute function public.guard_bank_connection_target_account();

comment on column public.bank_connections.target_bank_account_id is
  'Door de gebruiker in wizardstap 2 gekozen doelrekening (fase 4). Twee invarianten: (1) CONSUME-ONCE — de callback nult deze kolom na toepassing, zodat een herautorisatie 90 dagen later niet stilletjes dezelfde oude voorkeur herhaalt; (2) EIGENAARSCHAP — de rekening moet toebehoren aan bank_connections.user_id, afgedwongen door trigger trg_guard_bank_connection_target_account (null mag altijd).';
