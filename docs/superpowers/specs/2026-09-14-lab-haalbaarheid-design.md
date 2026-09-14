# Het lab onder een vaste stopleeftijd — dekking, drie hefbomen en doelen die meebewegen

**Datum:** 2026-09-14
**Status:** ontwerp goedgekeurd door de eigenaar (richting, 14 sep) → klaar voor implementatieplan
**Module:** Toekomst / tijdas (`components/app/horizon/horizon-client.tsx` katern II, `vrijheidsas.tsx`, `whatif-sliders.tsx`, `lib/horizon/lab-uitkomst.ts`, `lib/horizon/anker-copy.ts`, `lib/horizon/toekomst-doel.ts`, `app/api/toekomst-doel/route.ts`, `components/future/doelen-view.tsx`)
**Anker:** ADR 0129 (stop-anker × eind-vorm), ADR 0145 (het lab volgt het anker: dekking als uitkomst), ADR 0085 (doel-lijn tot de stopleeftijd), ADR 0125 (doelen koppelen en syncen)
**Bouwt voort op:** commits `b90314839` en `a6a51c98e` (branch `preview`, 14 sep 2026)

## Aanleiding

De eigenaar testte het lab op 14 sep 2026 onder drie stopkeuzes en zag drie dingen:

1. **Een vaste stopleeftijd voelt als "zo vroeg als het kan".** Sectie 1 van het lab spreekt sinds ADR 0145 in dekking, maar sectie 2 ("de marge") is nog de FIRE-constructie: een stop-slider met "verwacht 55 · vrijheidsdatum gelijk", een marge-band die bij 37 % dekking "houdbaar, maar dun" zegt, en de tegels BASIS-VRIJHEID / VERWACHT VRIJ / VERKEND STOPMOMENT die alle drie de eigen instelling tonen. Onder een vast anker is "verwacht" per definitie het anker; de band en de tegels meten niets. (Geverifieerd met chrome-devtools, testaccount met stop op 55: gedekt én met tekort.)
2. **Salaris en extra inleg zijn hetzelfde.** In `lib/scenario-events.ts` worden `income` en `extra_inleg` allebei een `monthly_income_change`; het effect op de kernel is identiek. De spaarquote-knop is in werkelijkheid al "minder uitgeven": een negatieve `monthly_cost_change`.
3. **"Doorwerken tot" hoort een antwoord te zijn.** Bij een tekort toont het lab één hint ("zo'n €22.695 per maand extra sparen") die niemand haalt, met een knop die op het bereik van de slider klemt (€1.500). De markt (Fidelity, Boldin) geeft bij een tekort de drie hefbomen mét getal: meer inleggen, later stoppen, minder uitgeven.

Plus de vraag: **wat gebeurt er met doelen uit het lab als de eindstrategie zó verandert dat ze niet meer passen?**

Los hiervan is een P0-defect gevonden en gefixt (autosave in de strategie-modal zette elke stopkeuze bij het laden van /toekomst terug op solved; Notion-kaart 3dbf9e8d-568a-8192). Die fix staat buiten dit ontwerp.

## Doel

Onder een vaste stopleeftijd beantwoordt het lab één vraag — **reikt je plan, en wat maakt het haalbaar?** — met dezelfde knoppen als onder "zo vroeg als het kan", maar met dekking als uitkomst, drie hefbomen als antwoord, en doelen die de plankeuze volgen in plaats van erachter blijven hangen. Onder "zo vroeg als het kan" verandert het lab niet van betekenis; alleen de hefboom-indeling (§2) geldt voor beide invalshoeken.

Niet het doel: een nieuwe rekenmotor. Elk getal in dit ontwerp bestaat al in de kernel of de bridge (zie §6).

## Ontwerp

### 1. Sectie 2 wordt onder een vast anker de dekkingsas

De Vrijheidsas heeft twee secties. Sectie 1 ("Waar draai je aan? — je aannames") blijft. Sectie 2 krijgt twee gezichten, gekozen op `isFixedAnchor(plan)`:

| | `solved` (ongewijzigd) | `aow` / `age` (nieuw) |
|---|---|---|
| Kop | Kun je dan stoppen? — de marge | Reikt je plan? — de dekking |
| Instrument | stop-slider met verwacht-streep en marge-band (rood/amber/groen) | **dekkingsbalk** van stopleeftijd tot eindleeftijd, met het punt waar het geld op is; de wat-als-lijn eroverheen als tweede markering |
| Slider | Gewenste stopleeftijd (verkenning, marge t.o.v. de streep) | **Doorwerken tot** (verkenning; beweegt de dekking, niet een vrijheidsdatum) |
| Drie tegels | Basis-vrijheid · Verwacht vrij · Geambieerde vrijheid | **Reikt tot · Plan tot · Gedekt** (basis → wat-als) |
| Zin onder de balk | marge-zin | `dekkingAsNotitie` (bestaat) |
| Knoppen | Maak dit mijn plan · Je plan-keuzes → | Maak dit mijn plan (zet de verkende leeftijd als anker) · Je plan-keuzes → |

De dekkingsbalk is één horizontale schaal van `stop` tot `eind`. Gevuld tot `reikt`-tot van het plan; de wat-als-run zet een tweede markering. Stoplichtkleur op de vulling (tekort = warning-token, gedekt = positive-token), nooit een module-accent. Onder `now` blijft de slider verborgen (bestaand) en toont de balk alleen het plan.

Wat verdwijnt onder een vast anker: de marge-band, de "verwacht"-streep, de koppel-checkbox ("stopkeuze schuift mee met de streep") en de drie FIRE-tegels. Ze zijn daar niet fout gerekend, ze meten een grootheid die de gebruiker niet gekozen heeft.

De hero blijft zoals ADR 0129 hem tekent (VRIJ MOGELIJK VANAF · JOUW STOPMOMENT · REIKT TOT). Het lab herhaalt de hero niet; het laat zien wat de knoppen met REIKT TOT doen.

### 2. Drie hefbomen in plaats van vier knoppen (beide invalshoeken)

De vier knoppen (maandinkomen, werkdagen, spaarquote, extra inleg) worden drie hefbomen, in de taal waarin de markt en de gebruiker denken:

| Hefboom | Eenheid | Onderliggend event (ongewijzigd) | Richting |
|---|---|---|---|
| **Meer opzij** | € per maand | `extra_inleg` (`monthly_income_change`) | omhoog |
| **Minder uitgeven** | € per maand | `savings` (`lifestyle_adjustment`, negatieve `monthly_cost_change`) — de bestaande spaarquote-knop, nu in euro's | omhoog |
| **Later of eerder stoppen** | leeftijd | de stop-slider uit §1 (geforceerd stop-pad) | beide |

- **Maandinkomen vervalt als knop.** Een salarisverhoging is rekenkundig dezelfde hefboom als extra inleg; twee knoppen voor één effect verwarren. Bestaande `salary`-parameter-doelen (vier in de database) blijven bestaan en syncen zoals nu; het lab maakt er geen nieuwe meer aan (`DOEL_PARAMETERS` verliest `salaris`; de pref-parser blijft `sliders.income` tolerant lezen en negeert 'm).
- **Werkdagen** blijft, maar als secundaire knop onder "Minder werken" (ingeklapt), omdat parttime een levenskeuze is met een andere betekenis dan geld. Onder een vast anker is hij zinvol als tegenhefboom ("kan ik met vier dagen tóch op 58 stoppen?").
- **Rendement per groep** (marktbias) blijft een aanname, geen hefboom; ongewijzigd.
- De spaarquote-slider toont onder de motorkap nog steeds procentpunten in het event; alleen de weergave wordt euro's per maand (`baselineIncome × pp/100`, dezelfde som als `buildSliderEvent('savings')`). Het `savings_rate`-parameter-doel blijft daarmee gewoon een spaarquote-doel.

### 3. Bij een tekort: de drie hefbomen als antwoorden

Onder `aow`/`age` met `tekort` (dekking < 100 %) vervangt een antwoordenblok het huidige "Wat hoort daarbij?":

> **Wat maakt het haalbaar?**
> · Doorwerken tot **61** dekt je plan → *Reken hiermee*
> · Zo'n **€ 2.100** per maand extra opzij dekt je plan → *Reken hiermee*
> · Zo'n **€ 2.100** per maand minder uitgeven dekt je plan → *Reken hiermee*
> Indicatie, geen advies — een rekenuitkomst bij je huidige aannames.

- "Doorwerken tot X" = de opgeloste vrijheidsleeftijd zonder anker (de tweede run, `solveWithoutAnchor`, D7). Dat getal is precies "de vroegste leeftijd waarop het plan wél reikt". Nu toont de hero daar "—" (zie §7, bijvangst 1); het antwoordenblok toont de regel alleen als er een leeftijd is.
- "€X extra opzij" en "€X minder uitgeven" = `maandHint` (P!B96) — één bedrag, twee hefbomen, want beide zijn dezelfde maandelijkse stroom. Ligt het bedrag boven het slider-bereik, dan zegt de regel dat eerlijk ("meer dan de knop toelaat") en klemt de knop niet stil.
- Elke regel is één klik: hij zet de betreffende hefboom als verkenning (`buildSliderEvent` / `setScenarioStopAge`), nooit als plan. "Maak dit mijn doel" werkt daarna zoals in ADR 0145.
- Alle zinnen zijn beschrijvend ("dekt je plan"), geen instructie; ze gaan langs `merkstem`/`compliance-check`. De bestaande sluitregel blijft.
- **Fase 2 (apart, raakt de kernel):** een vierde antwoord "minder uitgeven ná je stop" vraagt een hint op de pensioen-uitgave (`retirement_expense_*`), die de solver nu niet levert. Buiten deze spec, wel op de kaart.

### 4. Doelen die de plankeuze volgen

Vandaag: doelen uit het lab blijven als rijen staan; bij het lezen krijgen ze een n.v.t.-reden zodra ze niet passen (`fire_age` onder vast anker, `plan_coverage` onder solved, vrijheidsgetal onder vast anker), en pas "Doel bijwerken" of "Doel loslaten" ruimt ze op. Drie verbeteringen:

1. **Naam en subregel van "Plan gedekt" live uit het plan.** Nu draagt de rij `metadata.eindleeftijd`/`stopAnker`/`stopLeeftijd` van het moment van vastleggen; zet je de eindleeftijd van 90 naar 95, dan meet de kaart de nieuwe dekking maar heet nog "tot 90 jaar". De kaart leest voortaan het huidige plan (`FIRE_PLAN_COLUMNS` zitten al in de loader-bundel); de metadata blijft als historie.
2. **Eén melding bij een planwijziging die een lab-doel raakt.** Verandert het anker (solved ↔ vast) of de eindvorm zó dat een lab-doel n.v.t. wordt, dan toont de doelenpagina bovenaan één regel: *"Je plan is veranderd. {n} doel(en) uit het lab passen er niet meer bij."* met twee acties: **Bijwerken** (opent het lab met het doel als vertrekpunt) en **Loslaten** (bestaande `loslaten`-actie). Geen automatische verwijdering — een plan terugdraaien moet het doel terugbrengen.
3. **Knop-doelen blijven geldig in beide invalshoeken.** Spaarquote- en rendementsdoelen zijn middelen, geen uitkomsten; ze krijgen nooit een n.v.t.-reden. Dit is al zo en wordt in de UAT vastgelegd.

### 5. Kopij (nieuw, via merkstem → compliance-check)

| plek | zin |
|---|---|
| sectie-2-kop (vast) | Reikt je plan? — de dekking |
| slider-label (vast) | Doorwerken tot |
| tegels (vast) | Reikt tot · Plan tot · Gedekt |
| hefbomen | Meer opzij · Minder uitgeven · Later of eerder stoppen · Minder werken |
| antwoordenblok-kop | Wat maakt het haalbaar? |
| antwoord 1 | Doorwerken tot {X} dekt je plan. |
| antwoord 2 | Zo'n €{hint} per maand extra opzij dekt je plan. |
| antwoord 3 | Zo'n €{hint} per maand minder uitgeven dekt je plan. |
| boven bereik | Dat is meer dan de knop toelaat — de knop zet het hoogste bedrag. |
| knop | Reken hiermee |
| doelen-melding | Je plan is veranderd. {n} doel(en) uit het lab passen er niet meer bij. |
| doelen-acties | Bijwerken · Loslaten |

De vervallen zinnen ("Wat hoort daarbij?", "Reken met € X extra inleg", de marge-tegels onder een vast anker) verdwijnen alleen in de vaste-anker-tak; onder solved blijven ze.

### 6. Data en rekenwerk — niets nieuws in de motor

| behoefte | bron (bestaat) |
|---|---|
| dekking basis / wat-als / verkend | `resolveLabUitkomst` → `computeRunwayCoveragePct` (ADR 0145) |
| reikt-tot per run | `ankerReachFromSim` |
| "doorwerken tot X" | `solveWithoutAnchor` (tweede run, D7) — via de bestaande worker-batch |
| "€X extra / minder" | `maandHint` (stop-pad ▸ kernel P!B96) |
| verkende stopleeftijd | `runForcedStopPath` (ADR 0085) |
| plan voor naam/subregel | `FIRE_PLAN_COLUMNS` in de goals-loaders |

Geen migratie: `goals.goal_type` heeft geen CHECK; `DOEL_PARAMETERS` krimpt (salaris) zonder schemawijziging. De pref-parser (`parseScenarioBaseFields`) blijft `sliders.income` accepteren en negeren.

### 7. Bijvangst die vóór of naast dit ontwerp hoort

1. **VRIJ MOGELIJK VANAF toont "—"** onder een vast anker terwijl solved voor hetzelfde profiel 42 (resp. 65) vindt. De tweede run levert `null` zonder consolefout. Zonder die run heeft antwoord 1 uit §3 geen getal → eerst oplossen (bug-fix, eigen kaart).
2. **De marge-band spreekt de dekking tegen** ("houdbaar, maar dun" bij 37 %). Verdwijnt met §1.
3. **De stop-slider-hint en de plan-hint verschillen** in "< 1 dag"-gedrag (restpunt uit de nazorgkaart); §3 vervangt beide door het antwoordenblok.

## Buiten scope

- Een hint op de pensioen-uitgave ("minder uitgeven ná je stop") — fase 2, kernel.
- De hero-drieslag zelf (ADR 0129) en de dekkingsradar (ADR 0087/0145).
- Presets ("Wat als ik…") terug in het lab.
- Het besluit of "gedekt" het nalatenschapsbedrag meeweegt (open sinds 14 sep).

## Verificatie

- Solved: byte-identiek in gedrag behalve de hefboom-indeling (§2): tests op `whatif-sliders`, `vrijheidsas`, `horizon-client.*` bron-grendels.
- Vast anker: `lab-uitkomst.test.ts` (bestaand) + nieuwe tests voor het antwoordenblok (drie regels, boven-bereik-variant, klik zet verkenning en nooit het plan), de dekkingsbalk (schaal stop→eind, twee markeringen), en de doelen-melding (n telt alleen n.v.t.-lab-doelen; Loslaten roept de bestaande route).
- UAT: WF-TOEK-49 uitbreiden (dekkingsas, antwoordenblok), nieuw criterium voor de doelen-melding; page-info `/toekomst` en `/toekomst/doelen`.
- Handmatig (chrome-devtools) per toestand: solved · age-gedekt · age-tekort · aow · now, plus anker-wissel met een bestaand lab-doel.
- Curatie: `calculations.ts` (lab-uitkomst: antwoordenblok-bronnen), `hld-model.ts`, ADR-aanvulling op 0145 (§1–§4 als D8–D11), `arch:diagram`.
