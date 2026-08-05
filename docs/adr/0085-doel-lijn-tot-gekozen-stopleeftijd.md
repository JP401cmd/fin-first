---
id: 0085-doel-lijn-tot-gekozen-stopleeftijd
title: 'De gestippelde doel-lijn op /toekomst loopt door tot de gekozen stopleeftijd, niet tot de gesolvede FIRE'
status: aanvaard
date: 2026-08-05
elements: [as-planning, fn-toekomstplannen]
---

De gestippelde "Jouw doel"/"Jouw wat-als"-lijn op /toekomst eindigde tot nu toe
op de **gesolvede** scenario-FIRE — de vroegst mogelijke vrijheidsleeftijd
onder de gedraaide knoppen. De Vrijheidsas laat de gebruiker echter een eigen
**stopleeftijd** kiezen (marge/risicobereidheid) die niet doorwerkte in de
grafiek: wie alléén de stopleeftijd verschoof, kreeg helemaal geen stippellijn.
Besluit: de stippellijn tekent voortaan het **gekozen-stop-pad** — opbouw tot
de stopleeftijd, onttrekking daarna — met de eindstrategie van het eigen
profiel (niet langer een geforceerde deplete), plus een grondslag-fix in de
"waarschijnlijk vrij tussen X en Y"-band.

## Context

`useHorizonFireSim` draaide al een derde kernel-run (`stopPad`, via
`runForcedStopPath` → `evaluateFireAt`, één run zonder bisectie) zodra
`scenarioStopAge` gezet was, maar die run werd uitsluitend door de
duidingsblokken geconsumeerd (dekkingsradar, levensinkomenstrook) — nooit als
grafieklijn. De feature is daarmee grotendeels een **consumptie-wijziging**:
geen solver-/oracle-aanpassing, geen schema-wijziging (stopAge, stopKoppel,
stopMarge en het `fire_age`-doel worden al gepersisteerd).

Tegelijk bleek de grondslag van de verwachtingsband ("waarschijnlijk vrij
tussen X en Y") fout: `laatstFireAge`/`vroegstFireAge` in horizon-client.tsx
voerden `buildScenarioPathsFromSim(rows, …, fireTarget)` met rijen op
`endPortfolio` (netto vermogen **incl. eigen woning**) tegen de drempel
`requiredFirePortfolio` (liquide, **excl. woning**). Bij een woningstrategie
≠ "meerekenen" kruist het incl.-woning-pad de excl.-woning-drempel te vroeg
met precies de overwaarde, waardoor `laatst` bijna altijd naar de verwachte
FIRE-leeftijd clampte en de amber-zone in `stop-marge.ts` dichtklapte op de
minimum-buffer.

## Besluit

**1. Grondslag-fix (eerst, eigen commit).** De verwachtingsband-drempel wordt
`requiredFireNetWorth` (Prognose!I@FIRE, incl. woning — ADR 0034) in plaats
van `requiredFirePortfolio` (J, excl. woning), zodat drempel en rijen dezelfde
grondslag delen. Nieuwe pure helper `components/app/horizon/verwachtingsband.ts`
(`computeVerwachtingsband`, `resolveVerwachtingsbandDoel`) vervangt de twee
identieke `buildScenarioPathsFromSim`-aanroepen in horizon-client.tsx door één
memo die beide randen teruggeeft. Onder "meerekenen" geldt J == I, dus daar is
de fix byte-identiek (begrenst het regressierisico); onder elke andere
strategie schuiven `laatst`/`vroegst` naar achteren — dat is de correctie, geen
regressie. Invariant: `vroegst ≤ verwacht-jaar ≤ laatst` (of `laatst` null).

**2. Het stop-pad erft de eigen eindstrategie (`endStrategy: 'inherit'`).**
`runForcedStopPath` (`lib/horizon/scenario-presets.ts`) forceerde altijd
`fire_end_strategy: 'deplete'` + `fire_end_age: max(…, 90)`. Als grafieklijn is
dat misleidend voor perpetual-/legacy-gebruikers: de lijn zou naast een
stijgende hoofdlijn naar 0 duiken en eerder eindigen. `ForcedStopPathInput`
kreeg een optioneel `endStrategy?: 'deplete' | 'inherit'` (default `'deplete'`
— alle bestaande callers, waaronder de preset-stopkaarten en de AOW-stop-sim,
blijven ongewijzigd). De hook-stopPad
(`lib/hooks/use-horizon-fire-sim.ts#buildStopPadInput`) is de enige caller die
overstapt op `'inherit'`: chart, dekkingsradar en levensinkomenstrook blijven
daardoor één verhaal vertellen over dezelfde ene run (géén vierde kernel-run).

Empirisch (vastgelegd, niet a-priori aangenomen): bij een geforceerde stop zijn
de projectie-*rijen* identiek ongeacht eindstrategie — `inherit` wijzigt
uitsluitend `strategy`, `targetEndPortfolio` en `displayEndAge` op het
resultaat (dus het lijn-eindpunt + de duiding erbij, niet de vorm van de lijn
zelf). Voor de default-gebruiker (deplete, `fire_end_age` ≥ 90) is `inherit`
gedrags-identiek aan `'deplete'`.

**3. De doel-lijn kiest haar bron via een pure helper.** Nieuw
`lib/horizon/doel-lijn-bron.ts#selectDoelLijnBron`: het stop-pad wint wanneer
er een stopleeftijd staat, het stop-pad geland is, we niet in pensioen-modus
zitten, én de stopkeuze betekenisvol is (een actief wat-als-scenario, óf de
verwachte FIRE-leeftijd is onbekend, óf de stopleeftijd ligt ≥ 0,5 jaar van de
verwachting af — anders zou de stippellijn de hoofdlijn vrijwel exact
overlappen). Anders valt de helper terug op de scenario-bron (het gedrag van
vóór dit besluit); zonder beide is er geen tweede lijn. Rijen én FIRE-stip
komen bewust uit **hetzelfde** `result`-object van de gekozen run (niet uit de
losse `scenarioStopAge`-state), zodat een race tijdens het slepen nooit een
stip op een leeftijd tekent die niet bij de getekende lijn hoort.

**4. Bijstelling van het "stopAge telt niet mee"-besluit.** De bestaande
code-comment bij `hasScenario` in horizon-client.tsx ("stopAge telt bewust
NIET mee") blijft gelden voor de **scenario-RUN** — de stopleeftijd verandert
de gesolvede uitkomst niet. Hij geldt niet langer voor de **lijn-weergave**:
een nieuwe afgeleide `hasDoelLijn = selectDoelLijnBron(…) != null` — de pill
leest dus exact dezelfde bron-waarheid als de overlay, inclusief de
ruis-drempel en de pensioen-onderdrukking, zodat er nooit een zichtbare
toggle zonder lijn bestaat — en stuurt
uitsluitend de toggle-pill en de overlay; scenario-run-gate, verwacht/settled,
duiding, laatst/vroegst, verkenSamenvatting, persist-gate, DeltaBadges,
card-border en `Vrijheidsas hasScenario` blijven allemaal op `hasScenario`
(geen brede herinterpretatie van dat besluit — alleen de lijn zelf verandert).

**5. Legenda-copy.** "Jouw doel (stop 63)" wanneer een actief wat-als-scenario
met stopkeuze de bron is; "Jouw stopkeuze (stop 63)" bij een stop-only
wijziging zonder gedraaide knoppen; zonder stopkeuze blijft de bestaande
"(57j)"-vorm op de gesolvede FIRE-leeftijd staan.

## Afgewezen alternatieven

- **Een vierde kernel-run** speciaal voor de grafieklijn, los van de
  bestaande `stopPad`-run. Verworpen: de bestaande run dekt het al (ADR
  hierboven, punt 2); een aparte run zou chart en duidingsblokken (dekkings­
  radar, levensinkomenstrook) uiteen kunnen laten lopen — precies het
  "één verhaal, één run"-principe dat dit besluit juist vastlegt.
- **Een expliciete 57,4-marker op de lijn** (de gesolvede FIRE-leeftijd apart
  aangeven naast het stop-eindpunt). Verworpen voor v1: dat cijfer staat al
  drie keer op de Vrijheidsas zelf; een vierde plek op de grafiek voegt ruis
  toe zonder nieuwe informatie. Mogelijke follow-up.
- **Drempelloos altijd tonen**, ook wanneer de stopleeftijd nagenoeg gelijk is
  aan de verwachting. Verworpen: onder de 0,5-jaar-drempel zou de stippellijn
  de hoofdlijn vrijwel exact overlappen — een tweede lijn die niets vertelt.
- **Een derde label-vorm** naast "Jouw doel"/"Jouw wat-als"/"Jouw stopkeuze"
  (bv. een aparte tekst voor de koppelmodus). Verworpen: koppelmodus schrijft
  altijd óók `scenarioStopAge`, dus die valt al binnen de bestaande
  drieslag — een vierde vorm zou een onderscheid maken dat de data niet draagt.

## Gevolgen

- **Duiding-impact voor perpetual-/legacy-gebruikers.** Met `endStrategy:
  'inherit'` meten de dekkingsradar en de levensinkomenstrook voor deze
  gebruikers voortaan tegen de EIGEN eindstrategie in plaats van tegen een
  geforceerde deplete-op-90. Dat is de bewuste correctie van dit besluit — een
  perpetual-gebruiker zag voorheen een duiding die uitging van een
  vermogens-opeet-scenario dat hij nooit gekozen had.
- De doel-lijn kan bij `stop < verwacht` een eerlijk tekortpad tekenen (de
  rode zone in `stop-marge.ts` spreekt daar al voor zich; geen aparte
  `showDepletionWarning` op de overlay).
- `stopPad` null of nog pending (bv. tijdens slepen) valt zichtbaar terug op
  de scenario-bron — geen stille lege lijn.
- AOW-stop-, partner- en huishoudweergaven blijven de overlay onderdrukken
  (ongewijzigd gedrag); pensioen-modus onderdrukt de stop-bron (ongewijzigd).
- Nieuwe tests: `lib/horizon/doel-lijn-bron.test.ts` (bronselectie),
  uitbreidingen in `lib/horizon/scenario-presets.test.ts` (default ≡
  `'deplete'`, inherit-varianten) en een goldentest die pint dat een
  inherit-run op de gesolvede FIRE-leeftijd zonder overrides identiek is aan
  de hoofdrun. `test/horizon-oracle/*` blijft ongemoeid — de solver zelf is
  niet aangeraakt.
