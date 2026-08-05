---
id: 0087-dekkingsradar-doelscenario
title: 'De Dekkingsradar is doelscenario-consistent: vier assen, stop-pad-grondslag overal, en n.v.t. krijgt betekenis'
status: aanvaard
date: 2026-08-05
elements: [as-planning, fn-toekomstplannen, as-vermogen]
---

De Dekkingsradar op /toekomst rekende sinds ADR 0085 op het gekozen-stop-pad,
maar drie assen mengden stiekem grootheden uit de basis-run en de labeling zei
er niets over. Bij een extreme marge (stop 75, verwacht 57,5) leverde dat
tegenstrijdige duiding op. Besluit (met de producteigenaar uitgevraagd,
2026-08-05): de radar wordt **vierassig** en elke as leest **uitsluitend** de
run die ook de rijen levert; de UI benoemt de grondslag expliciet.

## Besluiten

1. **Marktrisico-as verwijderd** (tijdelijk, tot er een solide bron is). De as
   deelde Monte-Carlo-p10 uit de *basis*-grondslag (zonder stopkeuze en
   draaiknoppen) door `requiredFirePortfolio` — dat is bij een geforceerde stop
   (`evaluateFireAt`) geen doelbedrag maar de stand op het stopmoment
   (Prognose!J@stop), waardoor de ratio zijn betekenis verloor zodra een stop
   gezet was. De bijbehorende lichte MC-run (500 sims) in horizon-client is mee
   verwijderd; de volledige MC-overlay op de grafiek blijft.
2. **Wonen-as leest het verkoopmoment uit dezelfde run als de rijen.**
   `ForcedStopPathResult` en `HorizonScenarioResult` dragen voortaan
   `kernelHousingSale` mee; de radar kiest de sale-bron met dezelfde
   precedentie als de rijen-bron (stop-pad → scenario → hoofd-run). Daarvóór
   kon de radar een noodverkoop ("rond leeftijd 70") uit de basis-run tonen
   terwijl het doelscenario tot 75 doorwerkt en die verkoop niet kent.
3. **Pensioeninkomen meet vanaf max(AOW-leeftijd, stopleeftijd).** Wie in het
   doelscenario vóórbij de AOW doorwerkt, kreeg de werkjaren (accumulation-
   dekking ≥ 100 door het spaarquote-effect) in het post-AOW-gemiddelde gemengd
   — vandaar de sprong 72% → 100% bij het zetten van stop 75.
4. **"N.v.t." krijgt betekenis in plaats van een kaal streepje.** Geen
   brugperiode (stop ≥ AOW) of geen eigen brug-behoefte (Σ totaalNeed ≤ 0,
   bv. partner dekt de brugjaren) betekent inhoudelijk "er valt niets te
   overbruggen" → de as levert 100 mét uitleg. Alleen écht onbepaalbare assen
   blijven `null`, en de UI toont hun `detail`-reden inline onder de rij.
5. **Status volgt het afgeronde percentage.** Een rauwe 99,6 rendeerde als
   badge "100%" in amber; `statusFromPct` krijgt nu het afgeronde getal.
6. **De grondslag staat in beeld.** De radar-subtitle benoemt het scenario
   ("gerekend op je doelscenario: stoppen op X jr" / "gerekend op je verwachte
   pad"), en de scenario-chip verschijnt ook bij een stop-only-keuze met het
   label "Jouw stopkeuze" (drieslag van `doelLijnLabel`). De brug-as is
   bovendien op 0–200 gecapt (presentatie, zoals de eindstrategie-as) en de
   fasebalk onder de levensinkomenstrook laat "Onttrekking" pas op
   max(stop, AOW) beginnen.

## Gevolgen

- `lib/horizon/dekkingsradar.ts` heeft geen `mcResult`-input meer;
  `RadarAsKey` kent geen `'marktrisico'`. Een toekomstige marktrisico-as moet
  op een doelscenario-consistente bron staan (bv. de voorzichtig-variant van de
  verwachtingsband, of een MC-run op de stop-pad-input) — en een benodigd-
  vermogensbegrip dat óók bij een geforceerde stop een doelbedrag is.
- `ForcedStopPathResult.kernelHousingSale` is onderdeel van het contract dat
  door de worker-grens gaat (plain data, structured-clone-veilig); de
  parity-suite dekt beide paden.
- Curatie bijgewerkt: `lib/architecture/calculations.ts#dekkingsradar` en de
  HLD-capability "Zien hoe stevig je plan staat".
