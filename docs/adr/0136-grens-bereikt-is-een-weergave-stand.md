---
id: 0136-grens-bereikt-is-een-weergave-stand
title: 'Grenzenpot: "grens bereikt" is een vierde WEERGAVE-stand, geen nieuwe rekenregel'
status: aanvaard
date: 2026-09-07
elements: [as-budget, fn-budgetteren]
---

Een grenzenpot die precies op zijn grens staat, is rekenkundig binnen die grens
en heeft tegelijk geen ruimte meer. De motor zei het eerste, elk oppervlak zei
alleen dat, en de tekst beloofde daardoor ruimte die er niet was. De motor blijft
ongemoeid — exact op de grens telt nog steeds als binnen — en de WEERGAVE krijgt
een vierde stand (`reached`) tussen `near` en `exceeded`.

## Context

Een gebruiker meldde het zo: *"Top dat ik een melding krijg, maar in de melding
en in de pot staat dat er nog ruimte is, maar exact het bedrag is uitgegeven. Dus
niet eroverheen maar er is geen ruimte."* De melding zei in één adem:

> **Brandstof: bijna aan je grens**
> Je schaamtepot nadert vandaag de grens die je jezelf stelde. **Er is nog
> ruimte, maar niet veel.**
> **€ 0 ruimte** · € 5 van € 5

Beide helften komen uit dezelfde bron. `computePeriodOutcome`
(`lib/spend-limits/engine.ts`) bepaalt de stand met `periodMatchedAmount >
limitAmount ? 'exceeded' : 'within'`; op de grens is dat `within`, met
`periodHeadroom` nul en `isNearLimit` waar (5 ≥ 0,8 × 5). De meldingenlaag las
`isNearLimit` en koos de near-tekst, terwijl de renderer het bijbehorende
`headroom`-bedrag als "€ 0 ruimte" toonde.

De melder heeft gelijk over de *tekst*, niet noodzakelijk over de *stand*: er is
niets overschreden. Het probleem is dat de app maar drie standen kende, en de
toestand "op de grens" in de verkeerde ervan viel.

## Besluit

**De rekenkundige grens is onveranderd.** `matched > limit` blijft de enige
overschrijdingsregel; exact op de grens blijft `status: 'within'`. De motor,
`lib/spend-limits/engine.ts`, is bij deze wijziging niet aangeraakt — de twee
tests die deze regel vastleggen (`engine.test.ts`, "EXACT op de grens telt als
binnen", ook in de variant over alle drie de periodesoorten) blijven groen en
zijn daarmee het bewijs.

**Alleen de weergave kent een vierde stand.**
`lib/spend-limits/status-display.ts` — al de enige eigenaar van de stoplicht-
lezing — krijgt:

- `resolveSpendLimitOutcomeState(period)` → `within | reached | exceeded`: de
  lezing die óók over een afgesloten periode iets zegt;
- `resolveSpendLimitDisplayStatus(period)` → daarbovenop `near`, uitsluitend voor
  een lopende periode. `reached` gaat vóór `near`: op de grens staan is geen
  "bijna";
- `SPEND_LIMIT_HEADROOM_EPSILON = 0,005` — een halve cent, dezelfde tolerantie
  als `CENT_EPSILON` in `lib/budget-alerts.ts`. `periodHeadroom` is een
  euro-float; een strikte `=== 0` laat een afrondingsrest van een duizendste cent
  door, waarna het scherm "€ 0 ruimte" toont en de tekst ernaast alsnog ruimte
  belooft. Een halve cent is óók exact de grens waaronder het bedrag naar
  "€ 0,00" afrondt: de stand zegt daarmee hetzelfde als het getal ernaast;
- label "Grens bereikt" / "grens bereikt" in de **warning**-familie
  (`text-warning`, `var(--warning)`, `bg-warning-bg` met een stevigere rand dan
  `near`). Niet groen — er is geen ruimte. Niet rood — er is niets
  overschreden.

**De melding krijgt een eigen tak**, vóór `near`, met `priority` 3: een eindstand
is geen overschrijding en hoort dus niet in de dringend-bak (`priority ≤ 2`) —
hetzelfde onderscheid dat de budget-alert al maakt met "limiet bereikt". De
tekst: *"Je grenzenpot staat deze maand precies op de grens die je jezelf stelde.
Er is niets meer over."* De melding draagt bewust **geen** `headroom` in haar
metadata; die nul was de andere helft van de tegenspraak. Wat blijft staan is
"€ 5 van € 5", en dat klopt.

**Alle weergave-oppervlakken lezen dezelfde bron.** Tegel, kaart,
prestatieweergave, periodegrafiek en heatmap rekenden op twee standen en lieten
"op de grens" op `within` vallen; ze consumeren nu de gedeelde lezing. De
ingeklapte sectie-samenvatting telt de stand apart ("1 op je grens" naast "1
dicht bij je grens"). De vrijheidstijd-regel ("Die ruimte is ≈ …") verdwijnt
vanzelf bij nul euro, en dat is de bedoeling.

## Overwegingen

**Waarom niet bij de bron repareren?** Van `>` naar `>=` in de motor is één teken
en repareert de tekst ook. Maar "exact op de grens telt als binnen" is een
vastgelegd besluit: het staat in de docstring van `computePeriodOutcome`, in de
formule-registry (`lib/architecture/calculations.ts`) en in twee tests. Het
omdraaien zou stil de **betekenis van de historie** veranderen: reeksen zouden
breken, de score dalen en de `exceeded`-telling stijgen voor periodes waarin de
gebruiker precies deed wat hij zich had voorgenomen. Een vaste last die per
constructie exact op zijn grens landt (dezelfde bevinding als H16 bij de
budgetalerts) zou dan elke periode als overschrijding tellen. De klacht ging over
de tekst; de reparatie hoort dus in de tekstlaag.

**Waarom een vierde stand en niet alleen een andere zin?** De tegenspraak stond
op vijf oppervlakken tegelijk, in vijf eigen ternaries. Eén nieuwe zin op de
meldingsplek had de kaart en de tegel laten liegen. De standen-map is sinds fase
5 bewust de enige eigenaar van deze lezing; daar hoort de nieuwe stand thuis.

**Waarom deelt `reached` het warning-token met `near`?** Een vijfde kleur invoeren
voor één stand maakt het stoplicht onleesbaar. Het onderscheid zit in het label
en, waar er een vlak getekend wordt, in de rand. Kleur draagt hier de
*familie* ("let op"), tekst draagt het *verschil*.

**De halve cent boven de grens.** Binnen een halve cent bóven de grens zegt de
motor al `exceeded`, en de weergave volgt de motor. De weergave overrulet het
exceeded-oordeel dus nooit — anders zou er een band ontstaan waarin het scherm
"grens bereikt" zegt terwijl de reeks een overschrijding telt.

## Gevolgen

- `lib/spend-limits/engine.ts`, de reeksen, de score, de trend en de
  `exceeded`-telling: **ongewijzigd**. Ook de UAT-fixtures die de motorregel
  spiegelen (`lib/uat/acceptance/cash-checks.ts`, WF-CASH-61 en WF-CASH-64)
  blijven de motorwaarde gebruiken; er staat nu bij waarom ze de weergave-stand
  níét horen te volgen.
- Nieuwe meldingssoort `reached` in `SpendLimitEventKind`. Live status zonder
  gate, net als `near` en `exceeded`: ze verdwijnt vanzelf zodra er weer ruimte
  is of de periode wisselt. Er wordt niets opgeslagen en niets gemigreerd.
- Een pot die precies op zijn grens staat, wisselt van amber-met-ruimtebelofte
  naar amber-zonder-ruimtebelofte. Voor elke andere stand verandert er niets.
- Openstaand, bewust niet in deze wijziging: `CENT_EPSILON` in
  `lib/budget-alerts.ts` en `SPEND_LIMIT_HEADROOM_EPSILON` zijn hetzelfde getal
  om dezelfde reden. Ze samenvoegen tot één gedeelde constante is een aparte
  opruiming.
- `lib/architecture/calculations.ts` (view *Berekeningen*) beschrijft de
  grenzenpot-motor inclusief de zin "exact op de grens telt als binnen". Die zin
  blijft juist en moet blijven staan; de calc-notitie hoort te vermelden dat de
  weergave sinds dit besluit een vierde stand kent die de motorwaarde niet
  verandert.

## Bestanden

- `lib/spend-limits/status-display.ts` — de vierde stand, de tolerantie, de maps
- `lib/notifications/spend-limit.ts` — de `reached`-tak vóór `near`
- `components/widgets/spend-limit-widget.tsx`,
  `components/overview/transacties/spend-limits-section.tsx`,
  `spend-limit-performance-pane.tsx`, `spend-limit-period-chart.tsx`,
  `spend-limit-heatmap.tsx` — de vijf oppervlakken
- `components/app/notifications/notification-item.tsx` — waarom de
  "€ 0 ruimte"-regel bij deze stand ontbreekt
- `lib/spend-limits/status-display.test.ts` — de stand tegen echte motoruitvoer
