---
id: 0180-snapshots-waarderingen-en-rollovers-zijn-eigen-rijen
title: 'Vermogenssnapshots, waarderingen en meegenomen budgetruimte zijn eigen rijen'
status: aanvaard
date: 2026-09-27
elements: [as-huishouden, do-huishouden, as-vermogen, as-budget]
---

# 0180 — Vermogenssnapshots, waarderingen en meegenomen budgetruimte zijn eigen rijen

`net_worth_snapshots` en `valuations` lezen voortaan alleen de eigen rij; de huishoud-tak verdwijnt uit hun SELECT-policy. Een waardering hoort bij een bezitting of schuld van de schrijver zelf. Meegenomen budgetruimte (`budget_rollovers`) schrijft alleen de aanmaker van het budget.

Eigenaarsbesluiten van 27 september 2026. Migratie `supabase/migrations/20260927120000_snapshots_waarderingen_rollovers_eigen_rij.sql`, terugweg en verificatie in `supabase/terugweg/`.

## Context

Een security-review (27 sep) vond op zes tabellen een SELECT-policy met de huishoud-disjunct `ownership = 'shared' AND household_id = user_household_id()`, terwijl die tabellen geen `trg_stamp_household_id` hebben en `ownership`/`household_id` door `authenticated` schrijfbaar zijn. De afbakening (live metadata, 27 sep) liet zien dat het echte gat kleiner en scherper is:

- **Alleen `net_worth_snapshots` en `valuations`** hebben de directe disjunct. Hun INSERT-check is alleen `auth.uid() = user_id`, en de FK eist alleen dat het huishouden bestaat. Wie een huishoud-uuid kent (een genodigde kan hem lezen via `household_invitations`), kan dus een rij in de weergave van een vreemd huishouden zetten — niet alleen in die van de eigen partner.
- **Het gedeelde leespad is geen gebruikte functie.** Geen app-, lib- of scriptcode schrijft `ownership = 'shared'` of een `household_id` op deze twee tabellen (0 van 249 en 0 van 75 rijen); alle dertien snapshot-lezers filteren al op `user_id`. Zeven waarderingslezers filteren op `entity_id` zonder `user_id` — een geïnjecteerde gedeelde waardering op de bezitting van een partner zou daar in de historie landen.
- **`budget_amounts`, `goal_links` en `transaction_splits`** leiden hun zichtbaarheid al af van de ouderrij (budget, doel, transactie); daar verandert niets. **`budget_rollovers`** leest correct via het budget, maar zijn INSERT/UPDATE toetst `budget_id` niet: een vreemde rij kan, door `UNIQUE(budget_id, period)`, de eigen rollover van de eigenaar voor die maand blokkeren.
- Er bestaan op 27 sep **0 huishoudens**; niets is vandaag uitbuitbaar. De deadline is de eerste geaccepteerde huishouduitnodiging, en dat is een gebruikersactie, geen release.

## Besluit

**D1 — `net_worth_snapshots`: alleen eigen rijen.** SELECT `to authenticated using (user_id = auth.uid())`; de schrijfpolicies van `{public}` naar `authenticated`, UPDATE met expliciete `with check`; CHECK `ownership = 'personal' AND household_id IS NULL`. Een snapshot is een aggregaat per persoon. Wil de app ooit een gezamenlijk vermogensverloop tonen, dan als optelsom van twee persoonlijke reeksen in een huishoudweergave — niet via deze kolom.

**D2 — `valuations`: alleen eigen rijen, en alleen bij je eigen bezitting of schuld.** Dezelfde policies en CHECK als D1, plus de guard `guard_valuation_entity_owner()` (BEFORE INSERT en BEFORE UPDATE van `entity_id`/`entity_type`/`user_id`): de eigenaar van de ouderrij in `assets` of `debts` moet `NEW.user_id` zijn. De guard toetst `NEW.user_id`, niet `auth.uid()`, zodat correcte service-role-schrijvers (cron, bank-sync) blijven werken; een update van alleen de waarde passeert hem niet, zodat een historische rij zonder ouder bewerkbaar blijft. De partner ziet de waarderingshistorie van een gedeelde bezitting **nog niet**; dat wordt, als het gewenst is, een afgeleide zichtbaarheid via de ouderrij mét de koppeling "auteur = eigenaar van de ouder" en een index op `(entity_type, entity_id)` — een perspectiefbesluit, geen securityfix.

**D3 — `budget_rollovers`: alleen de aanmaker schrijft.** INSERT/UPDATE `with check (user_id = auth.uid() AND budget_id hoort bij een budget met user_id = auth.uid())`; DELETE toetst alleen de eigen rij. Dat is precies wat de client al deed (de aanmaker-gate in de budgetten-pagina); de database dwingt het nu af. De SECURITY DEFINER-RPC's die rollovers opruimen (`save_budget_plan`, `resolve_budget_model_proposal`) worden niet geraakt.

## Afgewezen alternatieven

- **Stamp-trigger (`trg_stamp_household_id`) op beide tabellen.** Sluit het pad naar een vreemd huishouden, maar niet het scenario uit de review: een gebruiker kan zijn eigen rij nog steeds bij de partner laten verschijnen. Het maakt bovendien een deelfunctie officieel die niemand gebruikt.
- **Kolomrechten intrekken** (`REVOKE INSERT, UPDATE` op tabelniveau plus kolomgrants). Elke nieuwe kolom moet daarna expliciet gegrant worden, anders een 42501 bij schrijven — een onderhoudsval zonder winst boven D1/D2.
- **Waarderingen nu al afleiden van de ouderrij.** Nieuw gedrag (grafieken en KPI's van de partner tonen jouw historie) dat de eigenaar nog niet wil.

## Gevolgen

- Voor gebruikers verandert vandaag niets: er zijn geen gedeelde rijen en geen huishoudens.
- Een niet-eigenaar die een waardering bij een gedeelde bezitting van de ander probeert te schrijven, krijgt nu een 42501 in plaats van een halve schrijfactie (de ouder-update liep al stil op 0 rijen door de eigen-rij-UPDATE-policy op `assets`/`debts`). De batch-schrijvers in de check-in en het herwaarderen slaan niet-eigen entiteiten daarom over; de losse waarderingsmodals tonen die fout nog niet zichtbaar — vervolgkaart.
- `household_leave()` zet beide tabellen bij verlaten terug naar personal; dat voldoet aan de CHECK en is voortaan een no-op. De kolommen `ownership`/`household_id` blijven staan tot een latere, aparte migratie ze opruimt (expand-contract; niet in deze stap).
- ADR 0075 noemde `valuations.entity_id` als open punt zonder datalaag-guard; D2 dicht de schrijfkant.
- De terugweg staat vooraf klaar (`supabase/terugweg/terugweg_snapshots_waarderingen_rollovers_eigen_rij.sql`): hij zet de policies exact terug zoals gemeten en dropt CHECK en guard, zonder DML. Signalen dat het misging: een 42501 op een eigen entiteit, een 23514 op `*_alleen_persoonlijk`, een 42501 bij het automatisch aanmaken van een rollover op een eigen budget, of een fout in plaats van 0 rijen voor `anon`.
