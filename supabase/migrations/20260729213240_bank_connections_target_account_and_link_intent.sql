-- Doelrekening-keuze en koppel-intentie op de pending bank_connections-rij.
--
-- Plan: specs/bank-connect-doelrekening/plan.md, fase 4 (FR1/FR2/FR13).
--
-- Waarom een kolom en geen state-string: de pending-rij bestaat al vóór de
-- OAuth-redirect (auth-link maakt 'm aan), dus de keuze heeft geen nieuw
-- transportmechanisme nodig. Het state-formaat blijft daarmee exact
-- `${connection.id}:${user.id.slice(0,8)}-${Date.now()}` — regressie-eis R2.
--
-- `on delete set null` is bewust: verwijdert de gebruiker de doelrekening
-- tussen redirect en callback, dan mag dat de koppeling niet blokkeren — alleen
-- de voorkeur laten vervallen.
--
-- `target_bank_account_id` is CONSUME-ONCE: de callback (fase 5) zet 'm op null
-- zodra de voorkeur is toegepast, zodat een herautorisatie 90 dagen later niet
-- stilletjes dezelfde oude voorkeur herhaalt. `link_intent` blijft juist wél
-- staan — dat is een feit over die koppelpoging, geen instructie.
alter table public.bank_connections
  add column if not exists target_bank_account_id uuid
  references public.bank_accounts(id) on delete set null;

alter table public.bank_connections
  add column if not exists link_intent text
  check (link_intent is null or link_intent in ('nieuw', 'herautoriseren'));

comment on column public.bank_connections.target_bank_account_id is
  'Door de gebruiker in wizardstap 2 gekozen doelrekening (fase 4). Consume-once: de callback nult deze kolom na toepassing.';

comment on column public.bank_connections.link_intent is
  'Intentie van deze koppelpoging: nieuw (wizard) of herautoriseren (herstelpad, fase 7). Blijft staan na de callback.';
