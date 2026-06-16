-- Verbreedt de CHECK-constraint op public.bank_accounts.account_type naar de
-- volledige canonieke set rekeningtypen die de app zelf aanbiedt.
--
-- WAAROM deze migratie nodig is:
--   1) De constraint `bank_accounts_account_type_check` bestond WEL live in de
--      database, maar stond in GEEN ENKELE migratie in supabase/migrations/*.
--      De DB-staat en de migratieset liepen dus uit de pas. De basistabel-
--      migratie (20260215000000_create_base_tables.sql) definieert
--      `account_type TEXT DEFAULT 'checking'` zonder enige CHECK; de strengere
--      constraint is er buiten de migratieset om op gezet. Deze migratie
--      versiont dat feit alsnog, zodat een schone restore dezelfde regels heeft.
--
--   2) De live constraint stond maar drie waarden toe
--      ('checking', 'savings', 'contant_geld'), terwijl de UI zes rekeningtypen
--      aanbiedt. Bron-of-waarheid = `ACCOUNT_TYPES` in
--      components/app/account-form-modal.tsx, die deze zes values produceert:
--        checking, savings, joint, business, contant_geld, other
--      Daardoor faalde elke insert van 'joint' (En/of-rekening),
--      'business' (Zakelijke rekening) of 'other' (Overig) met
--      "violates check constraint bank_accounts_account_type_check" — zowel bij
--      het seeden van de testpersona "compleet" (lib/test-personas.ts, een
--      business-rekening) als voor echte gebruikers in productie.
--
-- Veiligheid: pure verbreding. Bestaande waarden zijn uitsluitend checking,
-- savings en contant_geld (geverifieerd op de live tabel); geen enkele rij
-- gebruikt joint/business/other, dus geen bestaande data wordt geraakt.

alter table public.bank_accounts
  drop constraint if exists bank_accounts_account_type_check;

alter table public.bank_accounts
  add constraint bank_accounts_account_type_check
  check (account_type in ('checking', 'savings', 'joint', 'business', 'contant_geld', 'other'));
