---
id: 0101-gedeelde-cash-weegt-in-de-leeslaag
title: 'Gedeeld geld weegt in de leeslaag, niet in een extra kolom'
status: aanvaard
date: 2026-08-11
elements: [as-vermogen, fn-vermogensregistratie, t-supabase]
---

Een gedeelde losse bankrekening telde bij béíde partners voor het volle saldo.
De SELECT-policy op `bank_accounts` is huishoud-verbreed (`auth.uid() = user_id
OR (ownership = 'shared' AND household_id = user_household_id())`), maar de
optelling erbovenop was ongewogen. Op huishoudniveau leverde dat 200% van het
werkelijke geld op, en de per-gebruiker weggeschreven `net_worth_snapshots`
zouden dat opgeblazen getal permanent in de historie vastleggen.

## Wat we NIET doen: een wegingskolom op `bank_accounts`

De voor de hand liggende zet — `bank_accounts` dezelfde kolom geven als
`assets`/`debts` — is afgewezen. `net_worth_inclusion_pct` is namelijk **geen
huishoudsplitsing**. Het is een handmatige 0–100-schuif in het bezitting-/
schuldformulier, default 100 en volledig onafhankelijk van `ownership`: een
bezitting op "gedeeld" zetten zet die schuif níet op 50. Productie bevestigt die
betekenis — de enige rijen met pct ≠ 100 zijn `eigen_huis`/`mortgage` met
`ownership = 'personal'`: mensen die mede-eigendom handmatig halveren zónder de
huishoudfunctie te gebruiken (gemeten read-only tegen productie, 11-08-2026).

Die kolom kopiëren zou een **derde** wegingsbegrip introduceren naast de twee die
er al zijn, permanente import- en triggerkosten meebrengen
(`fn_auto_link_bank_account_asset` en `syncBankAccountCompanion` zouden de waarde
naar de companion-bezitting moeten spiegelen), en bovendien de minderheid
repareren: 23 van de 26 rekeningen lopen via een gekoppelde cash-**bezitting**,
waar dezelfde hardcoded 100 staat.

## Wat we WEL doen: wegen waar we lezen

Het aandeel komt uit `households.split_mode` — de verdeling die de gebruiker al
zelf instelt — via `PerspectiveContext.mySharePct`, en wordt toegepast met exact
dezelfde canonieke fractie-functie als budgetten en cashflow gebruiken
(`shareFractionFor`, `lib/budget-perspective.ts`). Er komt dus **geen begrip bij**;
er verdwijnt er een inconsistentie.

Concreet in `lib/unlinked-cash.ts`:

- `unlinkedCashTotal(rows, share)` is DE optelling; het `share`-argument is
  **verplicht**, zodat een consument het aandeel niet stilzwijgend kan vergeten.
  De handgerolde `reduce`-lussen in de dashboard-, horizon-, lever- en
  core-loader zijn vervallen (consume, don't recompute).
- `unlinkedCashFractionFor` voegt aan `shareFractionFor` één regel toe die al in
  `cashflow-data-loader` stond: in de partner-blik tellen eigen-persoonlijke
  rekeningen niet mee.
- `resolveUnlinkedCashShare` heeft een **fast path**: zit er geen gedeelde rij in
  de set, dan gaat er geen extra query naar de database. Dat is vandaag het pad
  van elke gebruiker en blijft het pad van elke solo-gebruiker.
- **Fail-closed**: is er wél een gedeelde rij maar faalt de huishoud-context, dan
  geldt 50% — liever de helft te weinig dan het saldo van de partner erbovenop.
- De snapshot-cron draait service-role (`auth.uid()` is NULL, RLS scoopt niets)
  en krijgt scope én aandeel uit `loadHouseholdSharesByUser`, dat `computeSharePct`
  gebruikt inclusief de income-budgetten voor `income_ratio` — zodat de opgeslagen
  snapshot niet drift met het dashboard van diezelfde gebruiker.

Dit heft meteen een aantoonbare, al bestáánde drift op: `cashflow-data-loader`
woog bankrekeningsaldi al met `mySharePct`, `unlinked-cash` niet. Dezelfde tabel,
twee loaders, twee bedragen. Een test spiegelt de cashflow-formule letterlijk en
valt om zodra de twee weer uit elkaar lopen.

## Gevolgen

- **Geen migratie, geen backfill, geen RLS-wijziging.** De SELECT-policy op
  `bank_accounts` is `(auth.uid() = user_id) OR (ownership = 'shared' AND
  household_id IS NOT NULL AND household_id = user_household_id())` — gemeten
  tegen `pg_policies`, 11-08-2026 — en die was al correct; het defect zat in de
  aggregatielaag. `bank_accounts` draagt geen `net_worth_inclusion_pct` en krijgt
  die ook niet; `ownership` bestaat al als `text NOT NULL DEFAULT 'personal'`
  (gemeten tegen `information_schema.columns`, 11-08-2026), dus er hoefde ook
  geen kolom bij om te kunnen wegen.
- **Geen gebruikerscommunicatie nodig**, mits dit landt vóór het eerste tweede
  huishoudlid: er zijn nul huishoudens, nul huishoudleden en nul gedeelde
  bankrekeningen (read-only gemeten op productie, 11-08-2026). Daarna zou de
  correctie een zichtbare daling van het getoonde netto vermogen zijn.
- **De correctie werkt alleen vooruit.** Alle 187 `net_worth_snapshots` zijn per
  definitie van solo-gebruikers (er is geen enkel `household_members`-record), dus
  geen enkele historische rij bevat de fout. Er valt niets te herschrijven — dat
  is een feit, geen compromis.
- **Per-rekening consistent**: de cash-lijst in de Kern-bundel draagt hetzelfde
  aandeel, zodat de vermogenssamenstelling optelt tot het headline-totaal.

## Wat hierna nog open staat

**De gedeelde BEZITTING telt nog steeds bij beide partners voor 100%** — dezelfde
fout, andere tabel, veroorzaakt door de default-100 van de handmatige schuif. De
wortelfix daarvoor is een expliciet eigenaarschapsmodel: een gedeelde rij hoort
bij het HUISHOUDEN (één rij, één eigenaar via `household_id`), de verdeling wordt
op één plek uit `split_mode` afgeleid, en `net_worth_inclusion_pct` behoudt zijn
eigen betekenis (gedeeltelijk eigendom buiten de app).

Dat raakt `assets`, `debts`, `bank_accounts`, `budgets`, `transactions`, hun RLS,
de partner-RPC en elke loader. **Vandaag is die migratie leeg** — nul huishoudens,
nul gedeelde rijen. Dat venster sluit zodra iemand een huishoud-uitnodiging
accepteert: een gebruikersactie, geen release, dus er komt geen automatisch
waarschuwingsmoment. Het is daarmee de feitelijke deadline, geregistreerd als
aandachtspunt `gedeelde-bezitting-ongewogen`.

Twee kleinere restpunten uit hetzelfde onderzoek, bewust buiten deze slice:
`user_household_id()` doet `LIMIT 1` zonder `ORDER BY` (vandaag theoretisch,
determinisme-eis zodra bovenstaande wortelfix landt), en
`household_partner_items` kent geen bankrekening-categorie — partner-persóónlijke
rekeningen ontbreken in het huishoudbeeld, het spiegelbeeld van deze kaart.
