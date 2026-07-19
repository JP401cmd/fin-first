---
id: 0050-transactie-maandaggregaat-rpc
title: 'Transactie-maandaggregaat via SECURITY INVOKER RPC + fix stille PostgREST-afkap (max_rows=1000)'
status: aanvaard
date: 2026-07-19
elements: [t-supabase, t-platform]
---

# 0050 — Transactie-maandaggregaat (SQL-RPC) + stille-afkap-bugfix

## Context

De server-loaders (`dashboard-`, `horizon-`, `lever-scores-data-loader`) haalden per
request DUIZENDEN ruwe transactie-rijen op om er in JS SUM/GROUP-BY op te doen
(12-/6-maands inkomen, uitgaven, spaarquote, dagtarief, maand-histories).

Twee problemen:

1. **Stille rekenfout (correctheid).** PostgREST kapt elk antwoord af op
   `max_rows` (`supabase/config.toml` = 1000) — óók als de client een hogere
   `.limit()` vraagt (een `.limit(2000)` is boven de cap een NO-OP). Voor
   gebruikers met **>1000 transacties per venster** werden `last12Income`,
   `extrapolatedIncome`, `income6m`/`expenses6m`, de 6-maands spaarquote en het
   12-maands dagtarief daardoor **stil te laag**. Dit is op de live database
   reëel: meerdere accounts hebben 1010–1393 transacties in het rollende
   12-maands-venster (geverifieerd 19 jul 2026).
2. **Egress + fragiliteit.** Duizenden rijen ophalen om er enkele getallen van te
   maken is duur en per definitie afkap-gevoelig.

## Besluit

Een **`SECURITY INVOKER`** SQL-functie
`public.tx_month_aggregate(p_from date, p_to date, p_own_only boolean default false)`
(migratie `20260719131916_perf_tx_month_aggregates.sql`) die per
`(maand 'YYYY-MM', budget_id, transaction_type)` de som van de positieve en de
negatieve bedragen (`numeric`, exact) + de telling teruggeeft over `[p_from, p_to)`.
De loaders reduceren die enkele aggregaat-rijen terug tot exact dezelfde getallen
(gedeelde reducers in `lib/server-data/tx-aggregates.ts`); een aggregaat kan per
definitie niet afkappen.

Toegangsmodel:

- **SECURITY INVOKER** (nooit DEFINER): de functie draait onder de RLS van de
  aanroeper. De bestaande `transactions`-SELECT-policy ("eigen rijen OF gedeelde
  huishoud-rijen") geldt onverkort — de functie kan geen rij teruggeven die de
  aanroeper niet óók via een gewone `select` zou zien. Geverifieerd met
  cross-user-impersonatie (gebruiker ziet exact eigen rijen, geen lek) en de
  anon-rol (0 rijen, géén fout).
- **`p_own_only`**: `true` beperkt extra tot `user_id = auth.uid()` (eigen rijen,
  excl. gedeeld huishouden) voor loaders die dat semantisch nodig hebben; `false`
  (default) is RLS-breed — identiek aan de loaders die op RLS leunden.
- `search_path = ''` + volledig gekwalificeerde namen; `EXECUTE` alleen voor
  `authenticated` + `anon` (PUBLIC krijgt niets). Geen nieuwe security-/performance-
  advisor (de functie verschijnt niet in de `SECURITY DEFINER`-lijst).

## Grondslag-scheiding (transfer-filter blijft per loader)

De transfer-filter (`isRealTx`: geen `(joint_)transfer`) verschilt bewust per
loader — dashboard/lever filteren transfers eruit, horizon telt ze mee, het
canonieke dagtarief telt alle types. Daarom geeft de functie `transaction_type`
als **dimensie** terug en blijft het filteren in JS (via de `realOnly`-vlag van de
reducers). Zo reproduceert elke loader **byte-identiek** zijn huidige gedrag.

## Consequenties

- **Correctheid hersteld** voor >1000-tx-accounts; te bewijzen met de parity-test
  (`tx-aggregates.parity.test.ts`) inclusief een >1000-rijen-getuige die aantoont
  dat de oude, afgekapte reductie afweek terwijl het aggregaat de volle waarheid geeft.
- **Week-/dag-granulariteit** (weekoverzicht) blijft een eigen, klein raw-venster
  (≤ 2 weken → nooit >1000 rijen) — een maandaggregaat levert die granulariteit niet.
- **Recurring-detectie** (`vaste-lasten-summary.ts`) blijft ruwe rijen nodig hebben
  en pagineert nu expliciet (`.range()` op `(date, id)`) i.p.v. stil op 1000 af te
  kappen; datumgrens tijdzone-veilig (`localMonthStartMonthsAgo`).
- Een SQL-**functie** (geen tabel) verschijnt niet in de ERD-scan; de Berekeningen-
  curatie wijzigt niet (de rekenmotoren krijgen dezelfde invoergetallen, alleen
  anders verkregen — "consume, don't recompute" blijft gelden).
