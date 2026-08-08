---
id: 0092-grenzenpot-fase-2-5
title: 'Grenzenpot fase 2–5: kalenderperiodes uit maandaggregaten, één prestatieweergave, widget als projectie'
status: aanvaard
date: 2026-08-08
elements: [as-budget, fn-budgetteren]
---

# 0092 — Grenzenpot fase 2–5

## Context

ADR 0089 leverde fase 1: één grenzenpot per budget of tegenpartij, per
kalendermaand, beheerd vanaf de transactiepagina, on-the-fly berekend. Vier
fases bouwen daarop voort: een prestatieweergave met grafiek/heatmap/uitsplitsing
(fase 2), een dashboard-widget (fase 3), tegenpartij-restwerk en een
match-preview (fase 4), en kwartaal/jaar-periodes plus de alias-toggle en
in-app-meldingen (fase 5).

Het architecturale uitgangspunt vooraf, en het bleef overeind: **er komen vier
nieuwe oppervlakken bij (pane, widget, melding, preview) en precies nul nieuwe
sommen.** Alles consumeert hetzelfde `SpendLimitReport`, op één plek
uitgebreid in `lib/spend-limits/engine.ts`.

## Besluit 1 — Geen `show_as_widget`-kolom; de loader injecteert elke actieve pot

Een `spend_limit:<id>`-widgetpref wordt door de loader geïnjecteerd voor elke
**actieve, niet-gearchiveerde** pot (`enabled: true`, `size: 'quarter'`,
order-offset `lowestOrder − 300`) — spiegel van hoe `budget_fav:` werkt voor
favoriete budgetten. Een aparte zichtbaarheidskolom zou een tweede waarheid
naast `widget_prefs` zijn: het aanmaken van een pot ís al de expliciete
intentieverklaring, er is niets om nog eens uit te kiezen. Stale-drop van de
pref gebeurt alleen bij archiveren, niet bij pauzeren, zodat een bewuste
"widget uit"-keuze een pauze/hervat-cyclus overleeft.

## Besluit 2 — Naderings-drempel is een vaste motor-constante, geen kolom

`SPEND_LIMIT_NEAR_LIMIT_PCT = 0.8` in `lib/spend-limits/engine.ts`, en
`isNearLimit` (`status === 'within' ∧ limitAmount > 0 ∧ periodMatchedAmount ≥
0.8 × limitAmount`) is een afgeleid veld op de outcome. Instelbaar maken is een
tweede knop op een functionaliteit waarvan het punt is dat er één norm bestaat:
de eigen grens. De drempel wordt **nergens buiten de motor** herhaald — pane,
widget en melding lezen uitsluitend `isNearLimit`.

## Besluit 3 — Kwartaal/jaar: chunking in de loader, géén granulariteits-RPC

Kalenderkwartaal en -jaar zijn exacte unies van kalendermaanden en de
aggregaatvelden zijn sommen — dus samen te stellen uit de bestaande
maand-rijen. De check-constraint liet `'quarter'`/`'year'` al toe: **geen
migratie nodig.**

De echte valkuil is `max_rows = 1000`, dat ook voor RPC-responses geldt: een
jaarpot kijkt tot 48 maanden terug. Drie maatregelen samen: een vensterlengte
per periodesoort (`SPEND_LIMIT_WINDOW_BY_PERIOD = { month: 13, quarter: 9,
year: 4 }`), chunking van het unie-venster over alle potten in stukken van ten
hoogste 12 maanden (calls = `ceil(maanden/12)`, niet per pot), en een
truncatie-kanarie (`aggregateTruncationSuspected`) die een cijfer als onbetrouwbaar
markeert in plaats van stil een te laag getal te tonen.

De bereik-match zelf was de stille breker: de fase-1-code matchte op exacte
sleutel-gelijkheid (`row.month !== slice.periodKey`), wat bij kwartaal/jaar
altijd nul telt — elke periode "binnen de grens", zonder foutmelding. Vervangen
door een geëxporteerd predikaat `sliceContainsMonth` (containment op
maandgrenzen), de enige plek waar "hoort deze maand bij deze periode" wordt
beslist.

**Verworpen:** een granulariteits-RPC met `p_granularity`-buckets. Voor
kwartaal/jaar levert die nul correctheidswinst (maandsommen zijn additief) en
kost een migratie plus een tweede bucket-waarheid. Voor dag/week zou hij wel
nodig zijn — en dag/week zijn expliciet buiten scope.

## Besluit 4 — Trend canoniek in de motor

`SpendLimitReport.trend` (nieuw): een voortschrijdend gemiddelde over de
laatste 3 afgesloten periodes (`SPEND_LIMIT_TREND_WINDOW`), vergeleken met de 3
daarvóór, richting `improving | stable | worsening | unknown` met een
5%-drempel. De richting-semantiek is **omgekeerd** t.o.v. een gewone
uitgaven-trend: minder uitgeven = `improving`. Alle bedragvelden dragen
`MatchedAmount` in de naam (ADR 0073) om vermenging met de *effective*
`monthlyExpenses` uit te sluiten. Randgevallen (< 3 resp. < 6 afgesloten
periodes, `prior = 0`) leveren `null`, nooit `NaN` of `Infinity%`. Nergens
buiten de motor herrekend.

## Besluit 5 — Prestatieweergave: één pane, nul extra fetches voor de standaardweergave

`SpendLimitPerformancePane` in `<ShellOverlay kind="pane">` (nooit direct
`BottomSheet`, ADR 0039) rendert uit `SpendLimitWithReport`, dat al als prop op
de transactiepagina staat. Alleen de per-naam-uitsplitsing binnen een
tegenpartij-sleutel is on-demand: `GET /api/spend-limits/[id]/breakdown`, op
een nieuwe RPC `tx_counterparty_name_breakdown` (top-N + rest-bucket,
`SECURITY INVOKER`, `search_path=''`, EXECUTE alleen voor `authenticated` —
geen anon, want de functie geeft namen terug, geen sommen). De rest-bucket
wordt in de route berekend (canoniek periodebedrag minus top-N-som), niet in
SQL — anders ontstaat een tweede optelling naast de motor.

Bedragmaskering in de grafiek en de heatmap volgt ADR 0091. Deeplink-contract:
`?limit=<id>[&periode=<periodKey>]` op `/overzicht/cashflow/transacties`.

## Besluit 6 — Widget als projectie, geen tweede berekening

`SpendLimitWidgetData` (`lib/spend-limits/widget-data.ts`) is een compacte,
pure projectie (`toSpendLimitWidgetData`) van het motor-rapport — bewust géén
volledig `SpendLimitReport` in de RSC-payload van elke `/overzicht`-load. Vijf
rendertakken (mini/quarter/half/full/xl); `mini` staat bewust niet in de
sizes-kiezer maar is verplicht als downsize-doel op mobiel. Veertien
registratiepunten in de widget-infrastructuur, twee expliciete
"niet-doen"-punten: geen `budgetingActive`-gate (een tegenpartij-regel werkt
zonder budgetten) en geen reverse-sync bij widget-verwijderen (dat zou de pot
archiveren — een destructieve actie op een gedragsnorm, uitgelokt door een
kruisje op een tegel).

Bijvangst, verplicht in dezelfde wijziging: de `sanitizeSize`-bug
(`app/api/widgets/route.ts`) degradeerde `xl` server-side stil naar `half` voor
elke dynamische widget-id — zonder de fix is `xl` voor de pot-widget
onopslaanbaar. De fix repareert `xl` ook voor bestaande
`budget_fav:`/`holding_fav:`-widgets — bedoelde werking, geen regressie.

## Besluit 7 — Meldingen compute-on-read, geen cron

De spend-limits-RPC's zijn `SECURITY INVOKER` en de loader verbiedt
service-role. Een cron-generator zou de bestaande loader **niet** kunnen
hergebruiken en dus een tweede berekenpad vergen naast de canonieke motor.
Compute-on-read (in het bestaande `computeSlow`-blok van
`GET /api/notifications`, 15 min TTL) is daarmee niet alleen goedkoper, het is
de enige variant die de "één som"-regel intact laat.

Vier events (`lib/notifications/spend-limit.ts`, puur, spiegel van
`bank-signalen.ts`): `near`/`exceeded` als live status over de lopende
periode zonder gate, `recovered`/`streak_milestone` eenmalig over de laatst
afgesloten periode. Elk notificatie-id draagt de periodesleutel — repareert
het budget-alert-precedent waar een ongesleuteld id na één keer lezen voor
altijd gelezen bleef. Dedupe via één `app_settings`-sleutel per gebruiker,
gepruned tot 6 periodesleutels per pot. De voorkeurscheck staat vóór de gate,
zodat een uitgezette melding de gate niet opbrandt.

## Besluit 8 — Match-preview is server-only

`POST /api/spend-limits/preview` leidt de tegenpartij-sleutel server-side af
en telt op met dezelfde `computePeriodOutcome` als de pot zelf — geen tweede
som. Client-side filteren van de geladen suggestielijst is verworpen: dat mist
elke tegenpartij buiten de top-40 en zet een benadering náást de echte som,
precies de drift die ADR 0089 besluit 3 bestrijdt. De preview meldt daarnaast
welke andere potten dezelfde uitgaven kunnen zien (`findOverlappingLimits`,
`lib/spend-limits/overlap.ts`) — een **regel-observatie** (namen, geen bedrag,
geen prioriteit), niet een tweede telling.

## Besluit 9 — Alias Grenzenpot/Schaamtepot: scalar kolom op `profiles`

`profiles.spend_limit_alias` (`text NOT NULL DEFAULT 'grenzenpot' CHECK IN
('grenzenpot','schaamtepot')`) — uitvoering van ADR 0089 besluit 1, niet een
nieuw architectuurbesluit. `lib/spend-limits/copy.ts` is van een enkele
constante naar een map + pure functie (`spendLimitCopy(alias)`) gepromoveerd,
met een geautomatiseerde scan-test die afdwingt dat de naam nergens anders in
`lib/spend-limits/**`/`app/api/spend-limits/**` voorkomt. De toggle leeft op
`/mijn/uiterlijk` (de weergave-familie), geen tweede control elders.

## Besluit 10 — Grenzenpot-bedragen zijn euro-weergave-exempt

Elk bedrag hier is een gerealiseerd historisch bedrag in de euro's van toen.
De nominaal/reëel-deflator (ADR 0090) hoort uitsluitend op geprojecteerde
toekomstbedragen. Alle nieuwe chart- en widget-componenten dragen een
`// euro-view: exempt`-comment.

## Wat expliciet niet gebouwd is

Dag/week-periodes · regelversionering (`effective_from`) · huishoud-deling met
partnerfractie · e-mail-meldingen · prognose voor de lopende periode · een
granulariteits-RPC · een `show_as_widget`-kolom · reverse-sync bij
widget-verwijderen · een instelbare near-drempel.

## Errata op het bouwproces (W3-CURATIE/W3-REST — gedicht in dezelfde golf)

W3-CURATIE liep parallel aan W3-REST en documenteerde hieronder twee gaten die
inmiddels, in diezelfde golf, door W3-REST zijn gedicht:

- **AC-B3-04 (budget-overlap in de match-preview) — gedicht.**
  `spendLimitPreviewSchema` (`lib/spend-limits/schema.ts`) is een
  `z.discriminatedUnion('ruleType', …)` met een `counterparty`-tak
  (`counterpartyLabel`) én een `budget`-tak (`budgetId` +
  `includeChildBudgets`), beide gedeeld via `PREVIEW_SHARED` (`period` +
  `excludeLimitId` — de pot die je bewerkt sluit zichzelf uit als
  "overlappende" pot). De pure functie `findOverlappingLimits` ondersteunde de
  budget-tak al; ze heeft nu haar voeding.
- **AC-B1-02 (gearchiveerd gekoppeld budget) — gedicht.** `SpendLimitConfig`
  (`lib/spend-limits/types.ts`) draagt `budgetArchived: boolean` (het budget
  bestaat nog, maar wordt niet meer gebruikt) naast `createdAt: string`; een
  gearchiveerd-maar-nog-bestaand budget is daarmee in de pane van een
  verwijderd budget te onderscheiden.

Vastgelegd besluit — het derde W3-REST-punt uit dezelfde golf:

## Besluit 11 — Transfer-parityfilter op de naam-uitsplitsing, plus de resterende staart-verdediging

Migratie `20260808170000_tx_counterparty_name_breakdown_transfer_parity.sql`
sluit `transfer`/`joint_transfer`-rijen uit van
`tx_counterparty_name_breakdown` — letterlijke spiegel van `isRealAggRow()`
(`lib/server-data/tx-aggregates.ts`), zodat de per-naam-uitsplitsing dezelfde
verzameling beschrijft als het canonieke periodebedrag uit
`computePeriodOutcome`. Zonder dit filter kon de som van de top-N bij een pot
die overboekingen matcht hóger uitvallen dan het bedrag waar hij een
uitsplitsing van heet te zijn — de route klemde de rest-bucket dan op 0 en de
uitsplitsing telde zichtbaar niet op. `CREATE OR REPLACE` behoudt de
bestaande ACL (SECURITY INVOKER, `search_path=''`, EXECUTE alleen
`authenticated`, harde `LIMIT` op 50); de REVOKE/GRANT-regels worden
niettemin herhaald voor het geval de functie op een verse database van nul
wordt aangemaakt, waar `ALTER DEFAULT PRIVILEGES` anders stil een
anon-grant zou zetten.

De top-50-cap plus de in de route berekende rest-bucket (canoniek
periodebedrag minus de som van de top-N, niet in SQL) blijven de
staart-verdediging: ze voorkomen dat de PostgREST `max_rows`-cap de
uitsplitsing stil afkapt en dat een tweede optelling naast de motor
ontstaat. Dit is geen open gat maar het vastgelegde ontwerp van Besluit 5.

## Gevolgen

- `lib/spend-limits/engine.ts` blijft de enige rekenbron; `calculations.ts`
  is in dezelfde wijziging bijgewerkt (outputs, formule, constanten, functies,
  bestanden).
- Twee aandachtspunten toegevoegd aan `archimate-concerns.ts`: het
  SQL↔TS-parity-contract (nu met een derde consument) en de anon-grant-drift
  op de fase-1-functies t.o.v. hun migratie-comment.
- Zie ADR 0091 voor de grafiek-maskeringsregel en het amendement in ADR 0089
  voor de bijstelling van de oorspronkelijke fase-1-aannames.
