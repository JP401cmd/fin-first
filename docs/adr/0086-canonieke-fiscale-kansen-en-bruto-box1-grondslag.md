---
id: 0086-canonieke-fiscale-kansen-en-bruto-box1-grondslag
title: 'Fiscale kansen komen uit één producent (lib/tax-optimizer), en resolveBox1GrossIncome is de canonieke bruto-Box 1-grondslag'
status: aanvaard
date: 2026-08-05
elements: [as-belasting]
---

TriFinity toonde fiscale besparingskansen op drie oppervlakken — de
belasting-hub, de fiscale optimizer en de aandachtspunten — met **twee
onafhankelijke producenten** en **vier afleidingen van hetzelfde bruto
Box 1-inkomen**. Besluit: `lib/tax-optimizer` wordt de enige producent van
fiscale kansen, `buildTaxOverview` gaat terug naar waar het voor bedoeld is
(de belastingdrúk), en `resolveBox1GrossIncome` is de canonieke bruto-waarde.
`box1JaarruimteStatus` blijft bestaan, maar expliciet gedegradeerd tot
status-heuristiek voor de sidebar-dot.

## Context

De optimizer werd in aug 2026 herbouwd naar "vergelijking eerst" en kreeg
daarbij het **netto effect** als eerste-klas grootheid: `netEffect = savings −
returnCostEur` (belastingbesparing minus verwacht misgelopen rendement). Die
stap was nodig omdat een scenario dat € 47 belasting bespaart maar honderden
euro's rendement kost, geen kans is — de oude weergave presenteerde 'm wél als
"je grootste kans nu".

Die correctie zat echter alleen in de optimizer. De hub bouwde zijn eigen,
armere kansenlijst via `buildTaxOverview` (alleen `savings`, geen netto-besef),
en de aandachtspunten-loader deed dat nog eens dunnetjes over. Dezelfde
verschuiving kon dus op de hub blijven staan als "tot € 47 besparing".

Bij de inventarisatie bleek verder:

- De `tegenbewijs`- en `dgaLeningExcess`-takken in `lib/tax-overview.ts` waren
  **dode code**: geen enkele runtime-consument voedde ze (alleen een unit-test).
  De aandachtspunten-loader voedde zelfs `partnerAllocatie` niet.
- Het bruto Box 1-inkomen werd op **vier** plekken afgeleid:
  `box1JaarruimteStatus` (netto/(1−marginaal), factor A hard op 0),
  `resolveBox1GrossIncome` (handmatige override + schijfinversie),
  `estimateGrossYearly` (fixed-point, voor Fin) en een handgekopieerde formule
  in de aandachtspunten-loader.
- Op de hub ontstond daardoor een zichtbare tegenspraak: de Box 1-kaart haalde
  zijn **status** uit de factor-A-loze helper en zijn **tekst** uit
  `computeJaarruimte` mét factor A. Dezelfde kaart kon "Ruimte benut" tonen
  naast een oranje aandachts-dot.
- Wie zijn bruto inkomen op `/overzicht/belasting/box1` handmatig corrigeerde,
  zag die correctie op de hub niet terug — de hub rekende door op de
  heuristiek.

## Besluit

**1. Eén producent van fiscale kansen.** `lib/tax-optimizer/opportunities.ts`
levert `Opportunity[]` (de volledige, doorgerekende vorm voor de
optimizer-vergelijking) en projecteert die met `toTaxOpportunities()` naar de
compacte `TaxOpportunity[]` voor hub en aandachtspunten. `buildTaxOverview`
produceert geen kansen meer; het blijft de druk-aggregator (totaal, verdeling,
effectieve druk, marginaal tarief, vrijheidsdagen). Eén server-loader
(`lib/tax-opportunities-loader.ts`) voedt alle drie de oppervlakken.

**2. Toelatingsregel `netEffect > 0`.** Een kans verschijnt alleen op een
savings-oppervlak wanneer ze per saldo iets oplevert — dezelfde eis die
`pickTopChoice` al hanteert. De compacte vorm draagt de grondslag in de
veldnaam: `savings` is bruto, `netEffect`/`netFreedomDays` zijn netto, en de
oppervlakken tonen en sorteren op netto.

**3. `resolveBox1GrossIncome` is canoniek.** De hub-KPI, het jaarruimtebedrag,
de besparing én de kaartstatus consumeren die bron, net als de box1-subpagina
en de optimizer. `box1JaarruimteStatus` blijft uitsluitend de sidebar-dot
voeden: sync, geen DB-read, want hij hangt in het shell-pad van élke route.
Hij kreeg wel een optionele `factorA`-parameter, zodat de dot het
werkgeverspensioen niet langer negeert.

## Gevolgen

- **Zichtbaar voor gebruikers:** het jaarruimtebedrag op de hub wijzigt voor wie
  een handmatige bruto-override heeft (dat is de fix); kansen met een
  niet-positief netto effect verdwijnen van hub en aandachtspunten; de
  partner-verdeelkans verschijnt niet meer in de partner-weergave (die zette
  een huishoud-besparing naast een persoonlijke heffing).
- **Bekend restverschil:** bij `income_source = 'auto'` rekent de canonieke bron
  met een 12-maands-extrapolatie waar de dot-heuristiek de huidige maand × 12
  neemt. Rond de grens `jaarruimte = 0` kan de dot dus van de kaart verschillen.
  Bewust geaccepteerd: de canonieke bron in het shell-pad hangen trekt de zware
  core-loader mee voor een driestandenlampje.
- **Nog open:** `estimateGrossYearly` (Fin, cloud + lokaal) en de
  inversiemethode in `box1JaarruimteStatus` staan nog los van de canon. Vastgelegd
  als aandachtspunt `bruto-box1-grondslag-meervoudig`; dat punt verdwijnt zodra
  die twee zijn samengevoegd.
- **Niet in dit besluit:** een doorgerekende tegenbewijs-kans (er is geen
  opgeslagen "werkelijk rendement" — dat bestaat alleen als lokale
  component-state), en de DGA-leengrens en de groene-beleggingen-/peildatum-tips
  (savings = 0 per constructie; die horen in een aandachtspunten-strip, die
  eerst een Box 2-server-loader nodig heeft).

## Alternatieven

- **`buildTaxOverview` uitbreiden met netto-besef.** Verworpen: dan zou de
  druk-aggregator de rendements- en vrijheidsdimensie van de optimizer moeten
  namaken — een derde pad in plaats van één minder.
- **De divergentie laten bestaan en alleen documenteren.** Verworpen: een
  gebruiker die zijn bruto corrigeert en dat niet terugziet, leest een
  onwaarheid; dat is geen modelleringsnuance.
- **Ook de sidebar-dot op de canonieke bron zetten.** Verworpen om de
  performance-reden hierboven; wel vastgelegd als restverschil.
