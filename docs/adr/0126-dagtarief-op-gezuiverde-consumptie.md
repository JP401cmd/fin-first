---
id: 0126-dagtarief-op-gezuiverde-consumptie
title: 'Dagtarief op gezuiverde consumptie, gescheiden van de runway'
status: aanvaard
date: 2026-09-02
elements: [as-budget, as-vermogen, do-budget, do-transactie]
---

# 0126 — Dagtarief op gezuiverde consumptie, gescheiden van de runway

## Context

De canonieke dagtarief-bron (`lib/expense-rate.ts`, voedt élke €→vrijheidstijd-
conversie via `dailyExpenseRate`) rekende op **álle** negatieve transacties in
het 12-maands rolling venster — geen transfer-filter, geen budgettype-filter.
Op een productie-account bestond ~60% van het 12-maandstotaal uit één
hypotheekaflossing (`transaction_type` NULL, op een `archive`-budget "Eigen
rekening") plus één terugbetaald voorschot (type `transfer`, ook archief). De
grondslag zakte daardoor van ~€19.700 naar ~€7.500/mnd zodra die twee posten
buiten beschouwing bleven; de vrijheidstijd-kop op /overzicht verschoof van
3 jaar 3 maanden naar ~8 jaar 3 maanden.

De budgetgebaseerde sommen sloten archief al uit — `computeYearlyMustExpenses`
en `budget-spending.ts` filteren op budgettype. De transactiegebaseerde
grondslag deed dat niet: hetzelfde bedrag gaf op de budgetpagina een andere
"hoeveel dagen kost dit" dan op /overzicht. Dat gat is met dit besluit gedicht.

Dit is **PR A** van een driedelig besluit. PR A (dit besluit) levert D1/D2 —
de grondslag zelf. PR B levert de runway (D3). PR C levert exports en de
verwijdering van `computeFreedomTotal`.

## Besluit (architectuur-triage, eigenaar akkoord)

### D1 — twee grootheden, twee bronnen

*Dagtarief* is **marginaal**: "wat koopt één euro aan tijd". Rust op
gezuiverde consumptie, via `dailyExpenseRate`/`calculateFreedomTime` —
gebruikt voor badges, tips, budgetdetail, rapporten.

*Runway* is **totaal**: "hoe lang kom ik mee als ik nu stop". Komt uit één
geforceerde horizon-kernel-run — gebruikt voor de kop op /overzicht, de
deelkaart en de briefing-mail.

De som van marginale dagen is per definitie **niet** gelijk aan de runway:
rendement, AOW, Box 3 en woonstrategie zitten wél in een kernel-run en niet in
een 12-maands transactiegemiddelde. Dat is het verschil tussen een prijs en
een projectie — geen inconsistentie die moet sluiten. Een derde
vrijheidstijd-grootheid naast deze twee is verboden.

### D2 — de consumptie-definitie

Een aggregaatrij (maand × budget × type, uit `tx_month_aggregate`) telt mee
als consumptie wanneer:

1. `sum_negatief < 0`,
2. het geen (joint-)transfer is (`isRealAggRow`), én
3. het **geërfde** budgettype (via `buildBudgetTypeMap`, child erft parent)
   niet in `EXCLUDED_BUDGET_TYPES` zit (`'archive' · 'income' · 'savings'`).

Één functie draagt die definitie: `consumptionExpenseRows` in
`lib/expense-rate.ts`, gebouwd op een nieuwe `excludeBudgetIds`-optie in
`lib/server-data/tx-aggregates.ts#aggToExpenseRows`. Geen enkele caller bouwt
meer een eigen `aggToExpenseRows(txAgg, { … })` voor het dagtarief.

Expliciete randen, met opzet zo gekozen:

- **Ongecategoriseerd (`budget_id` null) telt MEE.** `EXCLUDED_BUDGET_TYPES`
  is een blocklist, geen allowlist — een transactie zonder budget heeft geen
  bekend type om op uit te sluiten.
- **Een onbekend budget telt mee**, om dezelfde reden.
- **`debt` telt MEE.** Een aflossing is een uitgave — dit spiegelt
  `EXPENSE_DIRECTION_BUDGET_TYPES` in `lib/budget-spending.ts`. Gevolg,
  eerlijk benoemd: wie zijn hypotheek op een `debt`-budget boekt in plaats
  van op archief, krijgt de aflossing wél in zijn dagtarief. Dat is een
  keuze, geen bug, en ligt nu vast — een gebruiker die zijn hypotheek als
  `debt` in plaats van `archive` categoriseert krijgt dus welbewust een ander
  dagtarief dan iemand die hem archiveert.

### D2b — de geloofwaardigheidsvloer staat bij de producent

Een maandgrondslag onder `CREDIBLE_MONTHLY_BASIS_MIN` (€100/mnd,
`lib/format.ts`) telt in `recentDailyExpenseRateFromRows` als "geen rijen":
de uitkomst valt door naar de schatting-tak (`source: 'estimate'`) en zonder
schatting naar `source: 'none'`. Dezelfde vloer geldt voor de schatting zélf
— een profielinschatting van €50/mnd is even ongeloofwaardig. Invariant:
`monthlyExpenses` is altijd 0 óf ≥ de vloer, in elke tak, en `'transactions'`
impliceert dus een geloofwaardige transactiebasis.

Dit is geen nieuwe regel maar de al gedocumenteerde intentie van
`credibleMonthlyBasis` ("0 is bewust dezelfde uitkomst als geen data",
UR2-03), verplaatst van vier consumenten naar één producent. D2 maakt die
verplaatsing noodzakelijk: vóór de zuivering kreeg een account met vooral
overboekingen een opgeblazen maar plausibel ogend tarief; ná de zuivering zou
het een piepklein-maar-niet-nul tarief houden — waarmee €10.000 spaargeld als
"414 jaar vrijheid" leest op elk oppervlak dat alleen op
`source === 'transactions'` of `dailyRate > 0` toetst (de assets-, abonnementen-,
noodfonds- en pensioenwidget, `freedom-time-label`, `budgets-client`,
`totaalplan-blocks`). De vier kop-kiezers pasten de vloer al zelf toe; die
zien nu 0 in plaats van €2 en vallen door zoals bedoeld.

Gevolg dat expliciet aanvaard is: een gebruiker zonder geloofwaardige basis
verliest zijn vrijheidslabels in plaats van een verkeerd getal te zien. Geen
claim gaat boven een onjuiste claim.

### D3 — de runway rekent met de pensioen-uitgave (PR B, nog te bouwen)

De runway rekent met `retirement_expense_method` /
`retirement_expense_custom_amount` van de gebruiker, niet met huidige
consumptie, zodat de kop en de vrijheidsleeftijd op hetzelfde scherm één
model delen. Eigenaar-besluit. Verworpen alternatief: de consumptiegrondslag
uit D2 injecteren als `custom_amount` voor de pensioenfase — verworpen omdat
dat de marginale grondslag (D1) alsnog in de totale grootheid zou lekken en
de scheiding van D1 weer ongedaan zou maken op precies het scherm waarvoor ze
bedoeld is.

### Fasering

- **PR A (dit besluit)** — D1/D2: de consumptie-grondslag, in
  `lib/expense-rate.ts`, `lib/server-data/tx-aggregates.ts` en de zes
  callers (`fetchExpenseRowsForRate`, `dashboard-data-loader.ts`,
  `core-data-loader.ts`, `cashflow-kpis.ts`, `horizon/raw-data-loader.ts`,
  `spend-limits/loader.ts`).
- **PR B** — de runway (D3).
- **PR C** — exports + verwijdering van `computeFreedomTotal`.

## Bewust open punten

### Huishoud-beperking (belangrijk, nog niet gefixt)

De aggregaatrijen komen uit een huishoud-brede bron (`tx_month_aggregate`
over `transactions`: zichtbaar bij `ownership='shared'` binnen het
huishouden), maar de budgettype-map komt uit een smallere lezing
(`getBudgets`: eigen rijen óf `ownership='shared'`). In het default
budgetmodel `'separate'` zijn partnerbudgetten `personal` en dus onzichtbaar
voor die map. Een gedeelde transactie op een partner-*archief*budget valt
daardoor door de blocklist en telt als eigen consumptie.

Geverifieerd op de live database: `transactions.budget_id` draagt
`ON DELETE SET NULL`, dus een verwijderd budget levert nooit een onbekende
id op — de enige bron van "onbekend" is de partner, niet een opgeruimd
budget. Kan vandaag niet vuren: nul huishoudens in productie (nagemeten),
daarom niet in PR A gefixt. Voorgestelde oplossing voor later: een SECURITY
DEFINER-RPC die uitsluitend `id, parent_id, budget_type` van de
huishoudpartner teruggeeft (privacy-neutraal — geen bedragen, geen namen) en
die in `buildBudgetTypeMap` wordt meegemengd.

### Bredere archief-blindheid (bewust buiten PR A)

De overige transactiegebaseerde sommen — `aggExpenseByMonthAbs`, de
effective `monthlyExpenses`, `currentMonth*`, de 6-maands
spaarquote-meting — blijven budgettype-blind: `TxMonthAggregateRow` draagt
`budget_id`, geen type. Dit besluit repareert alleen de dagtarief-grondslag.

## Gevolgen

- Zes callers lopen nu door `consumptionExpenseRows` in plaats van een eigen
  `aggToExpenseRows(txAgg, { realOnly: false })`-aanroep; een tweede
  grondslag zou opnieuw twee vrijheidstijden voor hetzelfde bedrag geven.
- `EXCLUDED_BUDGET_TYPES` is nu geëxporteerd uit `lib/budget-utils.ts` en
  gedeeld tussen `computeYearlyMustExpenses` en `consumptionExpenseRows` —
  één lijst, twee lezers.
- `lib/server-data/tx-aggregates.ts#ReduceOpts` draagt een nieuwe
  `excludeBudgetIds`-optie, de spiegel van het bestaande `budgetIds`.
- De vrijheidstijd-kop op /overzicht, de deelkaart en de briefing-mail
  blijven vooralsnog op de oude (totale) grondslag tot PR B — D1 maakt dat
  verschil expliciet in plaats van het stilzwijgend te laten voortbestaan.

## Alternatieven overwogen

- **Eén vrijheidstijd-grootheid, de runway ook op consumptie laten rekenen**:
  verworpen. Dat zou het onderscheid prijs/projectie wegpoetsen en de
  pensioenfase-aanname (D3) buiten spel zetten — de runway moet juist een
  ánder model mogen gebruiken dan het huidige-uitgaven-dagtarief.
- **`debt` uitsluiten naast archief/inkomsten/sparen**: verworpen op
  eigenaar-verzoek. Een aflossing is een reële cadeau-uitgave van tijd; ze
  categorisch uitsluiten zou consumptie onderschatten voor iedereen met een
  lopende lening op een niet-archiefbudget.
- **Consumptie injecteren als `retirement_expense_custom_amount`** (D3):
  verworpen, zie D3 hierboven.
