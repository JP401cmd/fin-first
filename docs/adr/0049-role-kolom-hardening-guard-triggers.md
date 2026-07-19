---
status: accepted
date: 2026-07-19
elements:
  - technology-supabase
  - data-profiles
---

# 0049 — Rol-kolom-hardening via guard-triggers (retrospectieve vastlegging)

## Context

De security-audit bij de RLS-performance-sanering (ADR 0048) markeerde een
plausibel escalatie-gat: de own-row-policies op `profiles` en
`household_members` beperken alleen de rij, niet de kolommen — een ingelogde
gebruiker zou in theorie zijn eigen `role` naar `superadmin` (profiles) of
`owner` (household_members) kunnen schrijven. Superadmin-branches bestaan op
o.a. `app_settings`, `nibud_reference_data`, `news_articles` en
`questionnaires`.

## Besluit (bestaand, hier vastgelegd)

Het gat is al gedicht in de geshipte migraties `20260717132003` en
`20260717132201` (takeover-release 17 jul 2026) met twee BEFORE-triggers,
beide SECURITY INVOKER en dus niet door de aanroeper te omzeilen:

- `trg_guard_profiles_role` — BEFORE INSERT+UPDATE op `profiles`: blokkeert
  elke role-wijziging via anon/authenticated en elke INSERT met
  `role <> 'user'`.
- `trg_guard_household_member_role` — BEFORE UPDATE op `household_members`:
  blokkeert member→owner-promotie via de eigen rij.

Kolom-privilege-REVOKE is bewust NIET gekozen: de tabel-brede
UPDATE/INSERT-grants van Supabase maken een kolom-REVOKE aantoonbaar een
no-op; de triggers dekken het pad wel sluitend af. Legitieme role-schrijvers
lopen via service-role (ADR 0006) en de huishouden-invite/accept-flow is
gedekt door een strikte RLS-INSERT-policy.

## Verificatie (19 jul 2026, live)

- Negatieve test: authenticated `UPDATE profiles SET role='superadmin'` op
  eigen rij → geblokkeerd (42501).
- Positieve test: own-row-update zonder role-kolom → werkt.
- Triggers aanwezig in de remote migratielijst — geen drift.

## Consequenties

- Toekomstige security-audits kunnen de own-row-policy-vorm op deze tabellen
  als afgedekt beschouwen zolang de guard-triggers bestaan; wie de policies
  of triggers wijzigt, hertest het escalatiepad (incl. anon-rol, zie de
  leak-check-conventie in `.claude/skills/_shared/pijplijn-conventies.md`).
