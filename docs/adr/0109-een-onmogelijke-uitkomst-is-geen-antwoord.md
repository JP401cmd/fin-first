---
id: 0109-een-onmogelijke-uitkomst-is-geen-antwoord
title: 'Een onmogelijke uitkomst is geen antwoord: de FIRE-solver zegt het, en de weergave vangt het op'
status: aanvaard
date: 2026-08-27
elements: [as-planning, fn-toekomstplannen]
---

Een testpanel opende `/toekomst` met een leeg profiel en las daar, in
kopgetallen, zonder enige waarschuwing: **"VRIJHEIDSLEEFTIJD 100,0 jaar"** en
**"DOELBEDRAG €−11.328.971 benodigd"**. Beide getallen waren netjes berekend.
Geen van beide kon kloppen.

## Wat er speelde

Het Excel-statusblok `P!B93` — waarvan de kernel een letterlijke port is — toetst
in deze volgorde:

```
IF(pensioen ∧ B99 > 0;  "pension_shortfall";
IF(Prognose!J(0) ≥ B36; "reached_now";
IF(B38 < 0;             "unreachable_within_horizon";
                        "reached_at")))
```

Die tweede regel is zinnig zolang **B36 (het doelbedrag) positief is**: "je hebt
al meer dan je nodig hebt". In twee gevallen is hij dat niet.

**Doelbedrag nul.** Bij eindstrategie *deplete*, *pensioen* en een
legacy-nalatenschap van €0 is B36 per definitie 0. `J(0) ≥ 0` is dan triviaal
waar zodra er ook maar één euro liquide staat — de bekende "doel=0-quirk", tot nu
toe gedocumenteerd als onschuldige Excel-eigenaardigheid. Onschuldig is hij
alleen zolang er wél een FIRE-maand gevonden is. Is de gap negatief, dan staat
`B16` op de **horizon-parkeerstand** (leeftijd 100) — en de quirk-regel valt
dáárvóór, dus die parkeerstand wordt gerapporteerd als `reached_now`.

**Doelbedrag negatief.** Bij eindstrategie *perpetual* is
`B36 = Prognose!J@FIRE · (1+i)^(100−FIRE)`. Bij een structureel tekort is J@FIRE
negatief, dus B36 ook. Erger: op fireAge = 100 vállen B36 en B37 samen, dus de
gap is daar exact 0 en de horizon-check kan niet ingrijpen — de bisectie parkeert
op 100 en `J(0) ≥ B36` slaagt met een negatief doel bijna altijd.

Wat de bridge daarna doet, is volkomen redelijk gegeven een verkeerde status:

```ts
const fireReachable = status !== 'unreachable_within_horizon'   // → true
const fireAgeFractional = fireReachable ? solve.fireAge : null  // → 100
```

En `requiredFirePortfolio` (= J@FIRE) is dan precies dat negatieve bedrag.

De scalar-router keek hier al doorheen: die mapte sinds augustus 2026 "een
`reached_now` met gap < 0" naar "Niet haalbaar". Dat was een pleister op één van
de twee consumerpaden — de kernel-tak had hem niet, en niemand kon zien welk pad
je las.

## Het besluit

**Beide lagen, elk voor het hunne.**

De kern zegt het voortaan zelf. Een optionele, **inert-by-default**
`KernelInput.reachedNowVereistBereikbaarDoel` scopt de quirk: `reached_now` mag
niet vallen op `B36 < 0` of `B38 < 0` — dat wordt `unreachable_within_horizon`.
Feitelijk verhuist de bestaande `gap < 0`-tak vóór de reached_now-tak, plus een
ondergrens op het doelbedrag. Een `reached_now` mét een niet-negatieve gap
(iemand die écht al vrij is) verandert niet.

Het pad bepaalt of de vlag aanstaat, precies zoals bij gap V19 en V21's
voorgangers: `input-from-fixture` zet 'm **níet**, dus het parity-pad blijft
byte-identiek aan Excel v5 en er is geen fixture-herijking nodig; de app-adapter
zet 'm **wel**. De divergentie is daarmee zichtbaar, gedocumenteerd en
omkeerbaar — niet ingebakken.

De bridge stopt met het stil doorgeven van een andere grootheid. Viel
`requiredFirePortfolio`/`requiredFireNetWorth` terug op de geprojecteerde
eindstand (leeftijd ~100) omdat er geen FIRE-maand was, dan zegt hij dat nu:
`requiredFireIsEndOfHorizonFallback`. Het bedrag zelf blijft ongemoeid — de
weergave beslist wat ze ermee doet.

De weergave vertrouwt de kern niet blind. `lib/horizon/outcome-guard.ts` is één
predicaat voor "mag dit als feit op het scherm": een leeftijd op of voorbij het
horizonplafond, een doelbedrag ≤ 0, of een bedrag uit de eind-horizon-terugval →
**"We missen gegevens"**, met een zin die zegt wát er ontbreekt. Dat plafond is
bewust een alias van `MAX_AGE` uit de kernel, geen tweede 100 — twee losse
getallen zouden precies de drift geven die deze vangrail moet vangen.

## Waarom niet alleen het één of het ander

Alleen de UI-guard laat de status fout staan; `fireReachable` blijft dan `true`
en elke nieuwe consument erft de fout opnieuw. Alleen de kernel-fix vertrouwt
erop dat de rekenkern nooit meer een onmogelijke waarde teruggeeft — een belofte
die niemand kan waarmaken over een 1200-maands model met vier eindstrategieën.
Het getal is heilig hier: de app mag niet raden, maar mag ook niet doen alsof ze
het weet.

## Gevolgen

Een gebruiker met een structureel tekort-profiel ziet op `/toekomst` en
`/overzicht` geen kopgetal meer maar een gegevensmelding met een route naar het
profiel. Wie een haalbaar plan heeft, merkt niets — geen enkele fixture, golden
of parity-assertie bewoog.

De scalar-router houdt zijn eigen weergaveregel als tweede linie voor invoer
zónder de vlag (het fixture-pad). Zijn testverwachting is bijgewerkt: de status
die hij binnenkrijgt is nu al `unreachable_within_horizon`, de uitkomst voor de
gebruiker is ongewijzigd.

Open, bewust: `fireAge ≥ eindleeftijd` bij *deplete* (structureel ontsparen, gap
exact 0) toont nog steeds een concrete leeftijd. Dat is geen onmogelijke waarde —
het model zegt letterlijk "je portefeuille sluit op nul" — maar of het als
vrijheidsleeftijd gepresenteerd hoort te worden is een apart weergave-besluit dat
hier niet genomen is.

Gap-besluit V21 in `docs/horizon-excel-oracle-plan.md`; punt 6 van het
aandachtspunt `horizon-kernel-bekende-afwijkingen`. Vangnet:
`lib/horizon-kernel/onmogelijke-uitkomst.test.ts` (defect zonder vlag, fix mét
vlag, niet-regressie) en `lib/horizon/outcome-guard.test.ts`.
