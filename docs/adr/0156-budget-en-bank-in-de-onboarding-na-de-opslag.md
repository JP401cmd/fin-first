---
id: 0156-budget-en-bank-in-de-onboarding-na-de-opslag
title: 'Budget en bankkoppeling komen terug in de onboarding — ná de opslag, met een afrondingsmarkering'
status: aanvaard
date: 2026-09-17
elements: [sp-registreren, sp-budget, as-budget, t-bankconnect, ext-truelayer]
---

# 0156 — Budget en bank in de onboarding, ná de opslag

De onboarding eindigt met twee stappen onder een eigen groep, "Je budget":
1. **Budget inrichten.** Je kiest een template of begint leeg, en werkt de categorieën bij (toevoegen, hernoemen, verwijderen).
2. **Bank koppelen.** Je koppelt aan een gekozen cash-rekening of aan een nieuwe.

Beide stappen zijn over te slaan, maar alleen via een bevestiging. Bij de bank is daarbij een reden verplicht. Ze draaien **ná** `POST /api/onboarding/save-own-data`. Een afrondingsmarkering in `profiles.module_guide_state['onboarding:afronding']` zorgt dat de bank-callback en de onboarding-pagina daar terugkeren, ook al staat `onboarding_completed` dan al op `true`.

Dit vult ADR 0130 aan (de welkomstgids pakt het op wat hier wordt overgeslagen). Het draait het besluit van mei 2026 terug dat budgetten uit de onboarding haalde.

## Context

- Een nieuwe gebruiker had na de onboarding geen budget en geen bankkoppeling. Beide kwamen pas via de welkomstgids of via coach-tips. De eigenaar wil dat de onboarding eindigt met een werkend budget.
- `save-own-data` wist bij elke (her)opslag **alle** budgetten en cash-bezittingen van de gebruiker. Een budget of koppeling van vóór die opslag verdwijnt dus.
- Onboarding-cashrekeningen hebben geen `bank_accounts`-companion. Ze waren daarom geen koppeldoel, en koppelen maakte een tweede cash-bezit aan naast de betaalrekening uit de stap Bezittingen.

## Besluit

1. **Na de opslag, buiten de navigatievolgorde.** `budget` en `bank` staan niet in `computeStepOrder`. Ze zijn alleen bereikbaar vanuit een geslaagde opslag of een hervatting. Terug naar een invulstap zou een tweede, wissende opslag uitlokken.

   **Aanvulling 17 sep 2026 (eigenaarsmelding na de livegang):** "Begin met TriFinity" moet de laatste knop zijn, direct gevolgd door het welkomscherm en de rondleiding. De volgorde is daarom: laatste vraag (`eindstrategie`) → opslaan → budget → bank → samenvatting (`klaar`, met "Begin met TriFinity") → welkom. Ook `klaar` staat nu buiten `computeStepOrder`, zonder terug- of "voeg nog iets toe"-actie. Een concept op `klaar` heelt naar `eindstrategie`. Na een herlaad (bank-omweg in de browser) zijn de sessie-antwoorden weg; dan wordt de samenvatting overgeslagen en gaat de bankstap direct naar het welkomscherm.
2. **Afrondingsmarkering** (`lib/onboarding/afronding.ts`):
   - Wordt geopend in dezelfde update die `onboarding_completed = true` zet.
   - Schuift door via `POST /api/onboarding/afronding` (own-row, zod). Die route heropent nooit een gesloten markering.
   - Verloopt na 24 uur.
   - Blijft na afronding staan met `stap: 'klaar'` en de uitkomst per stap, inclusief de overslaan-reden.
   - Wordt gelezen door de callback (`hoortBijOnboarding`) en de onboarding-pagina (hervatten).
3. **Eén budgeteditor, twee plekken waar hij draait.** De boom-editor van de planeditor wordt gedeeld. Opslaan gaat via hetzelfde `computeBudgetPlanDiff` → `POST /api/budgets/plan`. Er komt geen tweede formulier en geen tweede template-catalogus.
4. **Eigen rekening is verplicht.** Deze post zit altijd in het plan, is niet te verwijderen en niet te hernoemen, in de onboarding én in de app-planeditor. De transfer-herkenning heeft hem nodig. Een harde server-guard in `save_budget_plan` is backlog, want die vraagt een migratie.
5. **Koppeldoel aan de serverkant.** `GET /api/bank-connect/accounts` biedt ook companion-loze eigen cash-bezittingen aan. `POST /api/bank-connect/auth-link` accepteert `target_asset_id`, controleert eigendom, maakt de companion via `syncBankAccountCompanion` en loopt daarna het bestaande `target_bank_account_id`-pad. Zo ontstaat er geen dubbele rekening.

## Gevolgen

- De uitkomst van overslaan staat in de markering, niet in `deferred_onboarding_fields`. De coach leest daar alleen `income`, `assets` en `spaardoel`. Budget en rekening pakt de welkomstgids al op via `hasBudgets` en `hasBankConnection`.
- Een open markering stuurt een bankkoppeling die binnen 24 uur via de in-app wizard wordt gestart ook terug naar de onboarding. Dat is acceptabel: dat is precies de open stap.
- Wie midden in de afronding de app sluit, hervat bij het volgende bezoek aan `/onboarding`. De (app)-layout blokkeert niet: de markering verloopt en de welkomstgids neemt het over.
