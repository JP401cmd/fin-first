---
id: 0097-grenzenpot-meerdere-regels-en-fijnere-periodes
title: 'Grenzenpot: meerdere regels per pot, EN tussen de dimensies, en dag/week-periodes op één regel-aggregaat'
status: aanvaard
date: 2026-08-10
elements: [as-budget, fn-budgetteren]
---

# 0097 — Grenzenpot: meerdere regels en fijnere periodes

## Context

Een grenzenpot was tot 09-08-2026 precies één regel, plat opgeslagen in de
pot-rij: óf één `budget_id`, óf één `counterparty_key`, afgedwongen door de CHECK
`spend_limits_rule_shape` (ADR 0089, uitgebreid in ADR 0092). De eigenaar vroeg om
drie dingen tegelijk:

1. **meerdere regels per pot**, elk met **meerdere budgetten en/of tegenpartijen**;
2. een expliciete **combinatie-semantiek** — vastgelegd op 10-08-2026: binnen een
   dimensie OF, tussen budget en tegenpartij EN, tussen regels een unie tegen één
   grensbedrag, en géén instelbare en/of-schakelaar ("dat is niet nodig");
3. **dag- en weekgrenzen** naast de bestaande maand/kwartaal/jaar.

Bij het uitwerken bleken (1) en (3) op dezelfde muur te lopen, en dat is de kern
van dit besluit.

## Het probleem dat niet zichtbaar was

De fase-1-bronnen zijn twee aggregaten: `tx_month_aggregate` (sommen per budget ×
maand) en `tx_counterparty_month_aggregate` (sommen per genormaliseerde
tegenpartij × maand). Daar zijn twee dingen principieel niet uit te halen:

- **"budget X ÉN tegenpartij Y"** — de doorsnede van twee sommen is geen som. Je
  kunt niet uit "€300 op Boodschappen" en "€120 bij Gorillas" afleiden hoeveel
  daarvan bij Gorillas óp Boodschappen stond.
- **een dag- of weekbedrag** — beide aggregaten groeperen per kalendermaand. Dit
  is geen afrondingskwestie maar ontbrekende informatie.

Beide wensen vragen dus dezelfde ingreep: de regel moet op **transactieniveau**
worden geëvalueerd, in SQL, in één aggregaat dat niet op de PostgREST
`max_rows`-cap kan afkappen.

## Besluit

### 1. De regels krijgen een eigen tabel

`spend_limit_rules` (migratie `20260810120000`), met `budget_ids uuid[]`,
`include_child_budgets`, `counterparty_keys text[]` + `counterparty_labels text[]`
en `sort_order`. Own-row RLS, vier policies, gespiegeld aan `spend_limits`.

**Arrays en geen koppeltabellen**: de regel wordt altijd in zijn geheel gelezen
(de loader haalt alle regels van alle potten) en altijd in zijn geheel geschreven
(het formulier stuurt de complete configuratie terug). Er bestaat geen enkele
query die "welke regels raken budget X" vraagt. Twee koppeltabellen zouden drie
joins en twee extra policiesets kosten voor nul leesvragen.

**Bewust geen foreign key op de budget-ids.** Een `uuid[]` kan er geen dragen, en
dat is hier winst: een vreemd id kan niets lekken (het aggregaat is SECURITY
INVOKER en scant alleen transacties die de RLS de aanroeper tóch al toont), de
API toetst eigenaarschap vóór het schrijven, en de oude
`budget_id REFERENCES budgets(id) ON DELETE CASCADE` liet een grenzenpot STIL
VERDWIJNEN zodra iemand een budget opruimde. Nu blijft de pot bestaan en valt
alleen die verwijzing weg — het oppervlak zegt dat eerlijk.

### 2. Eén nieuw aggregaat: `spend_limit_rule_aggregate`

Neemt alle regels van alle potten in één call (`p_rules` met een pot-index `p` en
een regel-index `i`), plus een korrel: `day`, `week` (ISO, maandag) of `month`.
Levert één rij per (regel × bucket × transactietype × budget) en kan dus niet op
`max_rows` afkappen — dezelfde eis die sinds
`20260719131916_perf_tx_month_aggregates` voor elk telpad in deze repo geldt.

De combinatie-semantiek staat letterlijk in de JOIN: budgetten leeg = geen
beperking, gevuld = `budget_id = ANY(...)` (OF); sleutels leeg = geen beperking,
gevuld = minstens één sleutel als deeltekst in de genormaliseerde tegenpartijnaam
(OF); allebei gevuld = allebei gelden (EN).

### 3. De ontdubbeling zit in de SQL, niet in de loader

Raken twee regels van dezelfde pot dezelfde transactie ("budget Boodschappen" én
"tegenpartij Gorillas"), dan zou optellen over de regels die uitgave **dubbel**
tellen: een stil te hoge overschrijding. `DISTINCT ON (pot, transactie)
ORDER BY regelindex` rekent elke transactie daarom binnen zijn pot toe aan precies
één regel — die met de laagste `sort_order`, dus de regel die de gebruiker als
eerste heeft opgeschreven.

Gevolgen, bewust zo:

- de som over de regels van een pot **is** de ontdubbelde pot-som;
- de per-regel-uitsplitsing leest als "wat ving deze regel als eerste" — een
  welgedefinieerde toerekening in plaats van een dubbeltelling;
- over **potten** heen wordt niet ontdubbeld: een uitgave mag in twee potten
  meetellen, dat blijft een keuze en geen fout (ADR 0089 / D38).

De potindex hoort daarom in de invoer. Zonder die groepering zou de ontdubbeling
over potten heen lopen en zou een gedeelde transactie uit de tweede pot
verdwijnen.

### 4. Bucketdatum in plaats van maandsleutel

`SpendLimitAggregateRow.month: 'YYYY-MM'` is `bucketStart: 'YYYY-MM-DD'` geworden,
en `sliceContainsMonth` heeft een algemenere broer gekregen:
`sliceContainsBucket(slice, bucketStart)` = één kale ISO-datumvergelijking, voor
alle vijf de periodesoorten dezelfde.

Dat werkt exact omdat `SPEND_LIMIT_GRAIN_BY_PERIOD` per soort een korrel kiest die
binnen de periodegrenzen valt (dag→dag, week→week, maand/kwartaal/jaar→maand). Een
bucket kan daardoor **nooit** over een periodegrens heen liggen. Die map is de
plek waar dat gegarandeerd wordt; wie daar een korrel grover maakt dan de periode,
breekt de optelling stil.

`sliceContainsMonth` blijft bestaan als dunne omzetting voor de oppervlakken die
nog met `tx_month_aggregate` werken.

### 5. `rule_type`, `budget_id` en `counterparty_key` worden legacy

Ze worden niet meer geschreven en niet meer gelezen; het soort pot wordt afgeleid
uit de regels (`deriveSpendLimitRuleType`), met een derde waarde **`mixed`** voor
een pot die beide dimensies combineert. `mixed` is bewust een eigen waarde en geen
"budget met een uitzondering": een oppervlak dat een budget-uitsplitsing toont,
hoort bij een gemengde pot iets anders te zeggen.

De kolommen worden **niet gedropt**. Een `DROP COLUMN` is onomkeerbaar en zou
tijdens een rollende deploy oude servercode breken; hun constraints zijn gelost en
een `COMMENT` markeert ze als afgedankt.

### 6. Schrijven via één transactie, sleutels serverzijdig

`spend_limit_replace_rules(p_limit_id, p_rules)` doet delete + insert in één
transactie. Elke PostgREST-call is zijn eigen transactie; een route die eerst
verwijdert en dan invoegt, laat bij een mislukte tweede stap een pot **zonder
regels** achter — die telt stil nul en ziet er in de UI uit als "je geeft niets
uit".

De client stuurt uitsluitend **labels**; de genormaliseerde sleutel wordt in SQL
afgeleid met dezelfde functie die het aggregaat gebruikt. Er bestaat daarmee geen
route waarlangs een sleutel van zijn eigen label kan afwijken.

## Afwegingen die geld hebben gekost

**De per-budget-uitsplitsing is smaller geworden.** Het aggregaat vult de
budget-kolom alleen op maandkorrel voor regels zonder tegenpartij-dimensie. Bij
dag-korrel zou (31 dagen × budgetten × transactietypes) tegen de rijcap lopen, en
bij een gemengde regel zegt "welk budget" niets over waaróm een transactie
meetelt. Compensatie: een **per-regel-uitsplitsing** die bij élke regelvorm en
élke periodesoort klopt, en waarvan de som per constructie gelijk is aan het
periodebedrag. Waar de budget-uitsplitsing wél bestaat, is ze bovendien
goedkoper dan vroeger — ze is nu vooraf gefilterd op de budgetten van de regel.

De prijs: die extra rij-dimensie haalt bij twaalf maanden per call de cap. Zulke
calls worden daarom in stukken van **4** maanden geknipt in plaats van 12
(`AGGREGATE_CHUNK_MONTHS_WITH_BUDGET_SPLIT`). Meer calls, maar ze draaien
parallel — en een stil te laag getal is duurder dan een extra RPC.

**De naam-uitsplitsing is beperkt tot een zuivere tegenpartij-pot.**
`tx_counterparty_name_breakdown` kent alleen de tegenpartij-dimensie. Bij een
gemengde regel zou hij namen en bedragen tonen die in de pot helemaal niet
meetellen — een uitsplitsing die grόter is dan het geheel waar ze bij hoort. De
route weigert die gevallen expliciet in plaats van een misleidend antwoord te
geven. Bij meerdere sleutels draait hij één call per sleutel en ontdubbelt op
naam; dat is exact (dezelfde naam draagt in elke call dezelfde sommen), maar de
uitkomst is de unie van de top-N per sleutel en niet één globale top-N. De
restpost blijft canoniek berekend, dus het bedrag klopt hoe dan ook.

**De preview vertrekt per regel.** Eén preview onderaan het formulier is bij
meerdere regels niet meer te plaatsen ("wat raakt dit?" — welke van de drie?).
Elke regel heeft nu zijn eigen debounced preview; bij drie regels zijn dat drie
goedkope, read-only vluchten bij het openen van het formulier.

**Typen voegt niets meer toe.** Het tegenpartij-veld is invoer geworden in plaats
van waarde: de regel draagt een lijst, dus pas bij bevestigen (Enter, de +-knop of
een keuze uit de suggestielijst) verhuist de tekst naar de regel. Ontdubbeling
gaat op de genormaliseerde sleutel, niet op de letterlijke tekst — "Shell" en
"s.h.e.l.l." matchen exact dezelfde transacties en horen niet twee keer te staan.

## Gevolgen

- Dag en week zijn óók in de **eenvoudige** weergave kiesbaar (dag/week/maand);
  kwartaal en jaar blijven diepte voor Volledig. Vóór deze wijziging toonde de
  periodekiezer in Eenvoudig één enkele, onveranderlijke tab — een keuze die geen
  keuze was.
- De vensterlengtes: 31 dagen, 14 weken, 13 maanden, 9 kwartalen, 4 jaren
  (steeds inclusief de lopende). 30 dagen en 13 weken beslaan ruwweg een maand en
  een kwartaal aan werkelijke tijd — vergelijkbaar met wat de andere soorten aan
  geschiedenis tonen, terwijl 365 dagbolletjes op een verlooplijn onleesbaar
  zouden zijn.
- Nieuwe periodesleutels zijn een **contract** (deeplink, notificatie-id,
  breakdown-route): `2026-08-10` en `2026-W33` komen naast `2026-08`, `2026-Q3` en
  `2026`. De weeksleutel draagt het ISO-jaar, niet het kalenderjaar van de maandag
  — de week van 29 december 2025 is ISO-week 1 van 2026.
- De nep-RPC in `lib/spend-limits/loader.test.ts` bevat de combinatie-semantiek en
  de ontdubbeling na, en is daarmee een **hand-geborgd parity-paar** met de
  migratie. Wie de ene aanraakt, raakt de andere aan. Een stub die vaste rijen
  teruggeeft zou de ontdubbeling — de kern van "meerdere regels" — helemaal niet
  kunnen bewaken.

## Bewust niet gedaan

- **Een en/of-schakelaar.** Expliciet afgewezen door de eigenaar. De taal in de UI
  zegt daarom nergens "en/of": dat leest als een keuze die de gebruiker nog moet
  maken, terwijl het model die keuze niet kent.
- **Regels herordenen in de UI.** De volgorde is betekenisdragend (ze bepaalt
  welke regel een gedeelde transactie vangt), maar slepen zit er nog niet in;
  verwijderen en opnieuw toevoegen is voorlopig de weg.
- **Huishoud-perspectief met partnerfractie** en **regelversionering**
  (`effective_from`) — beide stonden al op de lijst en blijven daar.
