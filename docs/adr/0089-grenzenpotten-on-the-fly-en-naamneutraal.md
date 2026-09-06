---
id: 0089-grenzenpotten-on-the-fly-en-naamneutraal
title: 'Grenzenpotten: naamneutraal `spend_limits`, on-the-fly berekend, en één letterlijk spiegelbare tegenpartij-normalisatie'
status: aanvaard
date: 2026-08-08
elements: [as-budget, fn-budgetteren]
---

# 0089 — Grenzenpotten: `spend_limits`, on-the-fly, letterlijke tegenpartij-match

## Context

Een "Grenzenpot" maakt zichtbaar hoeveel iemand uitgeeft **boven** een zelfgekozen
grens, zonder dat daar een spaardoel aan hangt: bijvoorbeeld maximaal €50 per
maand aan tankstations, en alles daarboven is de overschrijding. Het is
uitdrukkelijk geen budget dat "op" kan en geen pot die gevuld moet worden — de
enige norm is de eigen uitgavengrens.

Fase 1 levert: één of meer grenzenpotten per gebruiker, op **budget** of op
**tegenpartij**, per **kalendermaand**, beheerd vanaf
`/overzicht/budget/transacties`, met de lopende (voorlopige) periode, de laatste
afgesloten periode en vier reeks-getallen.

Vier besluiten moesten vóór de bouw vastliggen.

## Besluit 1 — De interne identifier is `spend_limits`, niet `pot*`

"Pot" is in deze codebase al bezet door een compleet ander concept:
`profiles.pot_rules` (+ `lib/pot-rules.ts`, `app/api/pot-rules`) beschrijft de
onttrekkings- en verdeelvolgorde over vermogensgroepen op `/toekomst`. Een tabel
`pots` daarnaast is verwarrend voor zowel de lezer als voor `grep`.

Intern heet daarom alles `spend_limit(s)`: tabel, kolommen, RPC's, routes,
types, bestanden. **"Grenzenpot" is uitsluitend een weergavenaam** en leeft in
precies één bestand (`lib/spend-limits/copy.ts`). Dat is niet alleen netjes: de
kaart eist dat de optionele alias "Schaamtepot" aan- en uitgezet kan worden
*zonder wijziging van data, regels, berekeningen of historische periodes*. Met
één copy-map is dat in fase 5 een wijziging in één bestand.

## Besluit 2 — De uitkomst wordt on-the-fly herrekend, niet gematerialiseerd

Er is bewust **geen** `spend_limit_periods`-tabel. Elke weergave herrekent de
periode-uitkomst uit de aggregaat-RPC's.

De doorslag gaf niet performance maar de idempotentie-eis van de functionaliteit
zelf. Refunds, chargebacks, correcties, dubbele boekingen, retroactieve
herberekening en regelwijzigingen moeten allemaal tot de juiste uitkomst leiden.
Bij on-the-fly is dat een **eigenschap van het ontwerp** — er is maar één
waarheid, de transacties. Bij gematerialiseerde rijen wordt het een
herberekenpad met een cron, een backfill, een herstelknop en twee waarheden die
kunnen driften.

Aanvaarde keerzijde: er is geen versionering van de regel (`effective_from`).
Een gewijzigde grens of regel werkt dus **met terugwerkende kracht** en kan een
lopende reeks breken of herstellen. De bewerk-sheet zegt dat expliciet. Blijkt
uit gebruik dat mensen hier over vallen, dan is versionering een latere fase —
er is nu geen bewijs dat die complexiteit terugverdiend wordt.

Mocht een cache ooit nodig blijken, dan hoort die te worden gebouwd als **cache
met een herbereken-knop**, nooit als bron.

## Besluit 3 — Tegenpartij-matching is een letterlijk spiegelbare normalised-contains

De eigenaar heeft tegenpartij expliciet aan fase 1 toegevoegd. Twee dingen
maakten dat lastiger dan budget:

1. Er is **geen** genormaliseerde tegenpartij-kolom. `transactions.counterparty_name`
   is vrije tekst uit de bank.
2. De repo bevat **drie** tegenpartij-normalisaties met twee verschillende
   contracten (`lib/parsers/counterparty-normalize.ts`, `lib/recurring-detection.ts`,
   `lib/recurring-data.ts`).

De som moet in de database gemaakt worden (zie besluit 4), de **uitleg** in de
UI. Beide moeten dus dezelfde normalisatie gebruiken. `normalizeCounterparty()`
uit `lib/parsers/counterparty-normalize.ts` — die PSP-prefixen, kassanummers en
rechtsvormen strip — is waardevol voor fuzzy categorisatie, maar is niet in SQL
na te bouwen zonder een tweede waarheid te introduceren. Dat is precies de drift
die een uitgavengrens onbetrouwbaar maakt: een bedrag dat niet strookt met de
getoonde reden.

Gekozen regel, bewust minimaal en letterlijk spiegelbaar:

> strip alles buiten `[0-9A-Za-z]` → hoofdletters; een transactie telt mee als de
> genormaliseerde tegenpartij de sleutel als **deeltekst** bevat.

Geïmplementeerd als een paar: `public.spend_limit_counterparty_key(text)` in SQL
en `spendLimitCounterpartyKey()` in TypeScript. De SQL-kant draait onder
`COLLATE "C"`, omdat een collatie-bewuste bracket-range `A-Za-z` níet
gegarandeerd puur-ASCII is — in een locale die `aAbBcC…` sorteert kan `é` binnen
de range vallen en blijven staan waar het JS-regexje 'm wél strip. Onder de
C-collatie zijn ranges pure codepoint-ranges en is de functie eerlijk `IMMUTABLE`.

Het SQL-predicaat gebruikt `position(key in …) > 0` en géén `LIKE '%'||key||'%'`:
bij `LIKE` zijn `%` en `_` in de sleutel wildcards, waardoor de database méér
zou matchen dan de TS-uitleg (`String.includes`) laat zien — hetzelfde scherm,
twee waarheden. `position()` is de letterlijke spiegel van `.includes()` en
daarmee wildcard-immuun. Daarnaast draagt `counterparty_key` een
CHECK-constraint op `^[0-9A-Z]+$`, omdat own-row RLS een gebruiker toestaat die
kolom via PostgREST zelf te schrijven.

**De beperking wordt niet weggepoetst.** Een contains-match op vrije tekst is
ruim: de sleutel `SHELL` vangt ook `SHELLFISH BAR`, en het weglaten van
scheidingstekens kan over woordgrenzen heen matchen. Daarom geeft de
aggregaat-RPC per periode terug **wélke tegenpartij-namen daadwerkelijk
meetelden**, en toont de UI die. De gebruiker kan de match zien in plaats van
hem te moeten geloven; het formulier zegt bovendien in gewone taal hoe de match
werkt.

De eerdere kaart-eis "onderwerp/categorie" als **derde** regeltype vervalt: er is
geen canonieke categorie- of merchant-category-kolom — de categorie *is*
`transactions.budget_id`. Drie regeltypen zijn er dus twee.

## Besluit 4 — Beide bronnen zijn aggregaat-RPC's, nooit een rij-lus

PostgREST kapt elk antwoord af op `max_rows` (=1000), óók bij een hogere
`.limit()`. Een grenzenpot die de transactierijen zelf zou optellen, zou voor
tx-rijke gebruikers **stil een te lage overschrijding** tonen — een
correctheidsbug, geen performancekwestie. Die fout-klasse is in deze repo al
twee keer opgetreden (migratie `20260719131916_perf_tx_month_aggregates.sql`; de
spaarquote-canon van 29-07-2026, waar dezelfde truncatie 82% versus 5% opleverde).

Budget-regels lezen daarom het bestaande `tx_month_aggregate`. Voor
tegenpartij-regels bestond nog niets, dus deze migratie voegt
`tx_counterparty_month_aggregate(p_from, p_to, p_keys[], p_own_only)` toe —
één rij per (sleutel, maand, `transaction_type`), plus de gematchte namen. De
keuzelijst in het formulier draait op `tx_counterparty_suggestions`, om dezelfde
reden. Beide zijn `SECURITY INVOKER`, dus de RLS van `transactions` geldt
onverkort en de service-role komt er niet aan te pas.

**Geen nieuwe index**, en dat is een afweging en geen omissie: de match is een
normalised-contains, waar een btree niet op werkt, en de scan wordt al begrensd
door het datumvenster plus de bestaande `transactions(user_id, date DESC)`. Een
trigram-index zou een extensie-afhankelijkheid toevoegen voor een handvol potten
per gebruiker.

## Overige vastgelegde keuzes

- **Eigenaarschap = gebruiker** (own-row RLS, vier policies). Een grenzenpot is
  een persoonlijke gedragsnorm; het gedeelde equivalent (het huishoudbudget)
  bestaat al. Gedeeld eigenaarschap zou een extra UPDATE-policy plus een
  owner-immutable-trigger vergen (zie `20260611000000_household_budget_shared_write`)
  en wordt hier niet terugverdiend. Wát de pot telt is géén RLS-vraag: de
  bestaande SELECT-policy op `transactions` geeft eigen plus gedeelde
  huishoudrijen, en dat is precies de grondslag die fase 1 gebruikt —
  ongeschaald, dezelfde rijen die het overzicht telt.
- **Kalenderperiodes, geen rollende vensters.** Een reeks over "afgesloten
  periodes" is alleen betekenisvol bij kalenderperiodes; een rollend venster
  sluit nooit af.
- **Elke pot telt onafhankelijk.** Een grenzenpot is geen budget dat op kan, dus
  twee potten die dezelfde uitgave zien zijn twee losse observaties, geen
  boekhoudfout. Prioriteit/exclusieve toewijzing is pas nodig zodra potten ooit
  optellen tot één totaal.
- **De tijdzone-eis vervalt.** `transactions.date` is een Postgres `date` — er is
  geen tijdstempel om te interpreteren, dus een tijdzone-instelling kan per
  definitie geen enkel getal veranderen. Er komt dus ook geen kolom voor.
- **Het schema draagt geen doel- of minimumbedrag.** Dat een grenzenpot geen
  spaardoel is, hoort zichtbaar te zijn in het schema en niet alleen in de UI.
- **Exact op de grens telt als binnen**, en een maand zonder transacties telt als
  binnen (je hebt dan immers niets uitgegeven). Beide liggen vast in een test,
  niet in een comment.

## Gevolgen

- Nieuwe tabel `public.spend_limits` (own-row RLS) en twee nieuwe RPC's.
- Nieuwe rekenmotor `lib/spend-limits/engine.ts` — puur, geregistreerd in
  `lib/architecture/calculations.ts`. Alle huidige en toekomstige oppervlakken
  (sectie, later prestatieweergave en widget) consumeren hetzelfde
  `SpendLimitReport`; er wordt nergens een tweede som gemaakt.
- Er ontstaat een **parity-verplichting** tussen `spend_limit_counterparty_key`
  (SQL) en `spendLimitCounterpartyKey` (TS). Wie één van beide aanraakt, raakt
  ze allebei; beide bestanden dragen die waarschuwing.
- Bewust nog niet gebouwd: prestatiegrafiek en heatmap (inclusief het besluit
  hoe de Y-as zich gedraagt onder privacy-maskering), widget in vijf formaten,
  meldingen, de alias-toggle, kwartaal- en jaarperiode, en het
  huishoud-perspectief met partnerfractie.

## Amendement — fase 2–5, 8 augustus 2026

Status blijft `aanvaard`; dit amendement wijzigt geen eerder genomen besluit,
het rondt de toen uitgestelde punten af en corrigeert twee aannames die bij de
bouw van fase 2–5 onwaar bleken.

- **Het uitgestelde Y-as-besluit is genomen** → zie ADR 0091
  ("Grafieken onder bedragmaskering: geometrie blijft, bedragen verdwijnen,
  verhoudingen mogen"). Dat besluit is bewust app-breed genomen, niet als
  grenzenpot-detail, omdat dezelfde vraag bij elke volgende grafiek terugkomt.
- **Kwartaal/jaar bleken géén migratie nodig te hebben** — de check-constraint
  op `spend_limits.period` liet `'quarter'`/`'year'` al toe — maar wél
  vensterbegrenzing én chunking wegens `max_rows = 1000` (een jaarpot kijkt tot
  48 maanden terug). Zie ADR 0092 besluit 3.
- **De claim "copy.ts is de enige plek met het woord Grenzenpot" was onwaar.**
  `lib/spend-limits/schema.ts` en `app/api/spend-limits/[id]/route.ts` droegen
  de naam letterlijk in gebruikerszichtbare tekst. Beide zijn naam-neutraal
  gemaakt en de claim is nu door een geautomatiseerde scan-test
  (`lib/spend-limits/copy.test.ts`) afgedwongen in plaats van een
  comment-belofte te blijven.
- **De alias is een kolom op `profiles` geworden**
  (`profiles.spend_limit_alias`, scalar, niet een JSONB-subkey), conform het
  besluit "geen `display_alias` op de pot zelf" hierboven — dit is uitvoering
  van besluit 1, geen nieuw besluit.
- Volledige uitwerking van fase 2–5 (prestatieweergave, widget, meldingen,
  match-preview, kwartaal/jaar, alias): zie ADR 0092.
