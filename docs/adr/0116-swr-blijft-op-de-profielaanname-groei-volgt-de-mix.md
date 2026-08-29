---
id: 0116-swr-blijft-op-de-profielaanname-groei-volgt-de-mix
title: De SWR blijft op de profielaanname, de groei volgt de mix — twee grondslagen, bewust en benoemd
status: aanvaard
date: 2026-08-29
elements: [as-planning, as-vermogen, sp-plannen, app-comp]
---

Het FIRE-**doelbedrag** blijft afgeleid van één profielgetal (`resolveFireParams().grossReturn` → `computeEffectiveSwr`), terwijl de **groei** van het vermogen per bezitting loopt (`assets.expected_return` → `tables/bez.ts`). Die twee grondslagen bestaan al naast elkaar; dit ADR legt vast dat dat een KEUZE is, wat de keuze rechtvaardigt, en wanneer hij herzien moet worden. Voorwaarde vooraf bij de portefeuille-allocatiemodellering (roadmap I): de eigenaar vroeg dit besluit expliciet vóór de bouw.

## Context

### Twee getallen die allebei "rendement" heten

`resolveFireParamsWithAssumptions` levert één `grossReturn` met de precedentie
profiel → jaarlaag `fire_assumptions` → `DEFAULT_RETURN`, en daaruit
`effectiveSwr = grossReturn − BOX3_DRAG − inflationRate` (`computeEffectiveSwr`, de
enige SWR-formule in de app).

Die `grossReturn` is **niet** het rendement waarmee de horizon-kernel de potten laat
groeien. `buildAssetPotten` geeft elke bezitting haar eigen `rendement`
(`asset.expected_return / 100`) en `tables/bez.ts` past dat per maand toe. Dus:

| Grootheid | Grondslag | Waar |
|---|---|---|
| FIRE-**doelbedrag** (jaaruitgaven ÷ SWR) | één profielgetal `grossReturn` | `lib/fire-params.ts` |
| **Groei** van het vermogen in de tijd | per bezitting `expected_return` | `lib/horizon-kernel/adapter/potten.ts` → `tables/bez.ts` |
| **Onzekerheid** rond die groei | per bezitting, sinds ADR 0117 | `wrappers/risico.ts` |

Vandaag valt dat nauwelijks op, omdat de meeste gebruikers hun bezittingen op de
subtype-defaults laten staan die dicht bij `DEFAULT_RETURN` liggen. Zodra de mix het
portefeuillerendement gaat bepalen (snede 2 van dezelfde kaart:
`asset_class_assumptions` → gewogen `expected_return`) wordt het scherp zichtbaar:
bij een obligatie-zware mix daalt de geprojecteerde groei wél, maar het doelbedrag
niet — de FIRE-datum schuift dan naar achteren zónder dat de drempel meebeweegt.

### De drie opties die voorlagen

1. **SWR voeden met het afgeleide portefeuillerendement.** Eén grondslag: het
   doelbedrag beweegt mee met de mix.
2. **SWR bewust op de profielaanname houden.** Twee grondslagen, expliciet benoemd.
3. **Twee SWR's naast elkaar** (een "doel-SWR" en een "mix-SWR"). Direct afgewezen:
   dat is een tweede formule voor hetzelfde begrip en botst frontaal met
   consume-don't-recompute.

## Besluit

**Optie 2.** `computeEffectiveSwr` blijft de enige SWR-formule en blijft gevoed door
`resolveFireParams().grossReturn` — de expliciete gebruikerskeuze, anders de jaarlaag
`fire_assumptions.expected_return`, anders `DEFAULT_RETURN`. Het afgeleide
portefeuillerendement uit de mix voedt de SWR **niet**.

Drie redenen:

1. **De SWR is een onttrekkingsREGEL, geen rendementsvoorspelling.** "Hoeveel mag ik
   er per jaar uithalen zonder dat het op raakt" is een langetermijn-veiligheidsmarge
   over de hele resterende levensduur — inclusief de mix die iemand ná zijn
   stopmoment aanhoudt, die per definitie niet de mix van vandaag is. Hem koppelen
   aan de mix van vandaag maakt de drempel gevoelig voor een tijdelijke stand.

2. **Anders wordt het doel zelfversterkend.** Voedt de mix de SWR, dan verlaagt een
   defensievere portefeuille de SWR, wat het doelbedrag VERHOOGT, wat de FIRE-datum
   dubbel naar achteren duwt: één keer via de tragere groei en één keer via de hogere
   drempel. Dat dubbeltelt hetzelfde signaal en overdrijft de uitkomst.

3. **De gebruiker kan het zelf zetten.** `profiles.expected_return` is een expliciet
   veld; wie een defensieve mix aanhoudt kan zijn rendementsaanname verlagen en ziet
   de SWR meebewegen. De keuze blijft bij de gebruiker in plaats van stil door een
   allocatie-afleiding te worden overgenomen.

**Wat hier NIET besloten wordt:** dat de splitsing voor altijd goed is. Dit is een
bewuste, benoemde grondslag-splitsing met een herzieningsvoorwaarde (zie Gevolgen).

## Gevolgen

- **Snede 2 mag de SWR niet aanraken.** De gewogen-mix-helper
  (`lib/portfolio-expected-return.ts`, nog te bouwen) voedt uitsluitend
  `AssetPot.rendement`. Een tweede SWR-som is verboden; `computeEffectiveSwr` blijft
  de enige home.
- **De splitsing moet zichtbaar zijn waar hij telt.** De Berekeningen-view
  (`lib/architecture/calculations.ts`, entries `fire-params` en `horizon-kernel`)
  benoemt expliciet dat doelbedrag en groei op verschillende grondslagen staan. Een
  gebruiker die zich afvraagt waarom zijn FIRE-doel niet meebeweegt met zijn
  mixwijziging moet dat antwoord kunnen vinden.
- **Herzieningsvoorwaarde.** Wordt de afwijking tussen `grossReturn` en het gewogen
  portefeuillerendement structureel groot (richtpunt: meer dan ~2 procentpunt voor
  een substantieel deel van de gebruikers, meetbaar zodra snede 2 draait), dan is dit
  besluit toe aan een herziening — dan liegt óf de drempel óf de curve. De maat
  daarvoor hoort bij snede 2 te worden ingebouwd, niet eerder.
- **ADR 0117 raakt dit niet.** Die snede verandert alleen de ONZEKERHEID rond het
  rendement (band/Monte-Carlo/rendement-marge), nooit het verwachte rendement zelf en
  nooit de SWR. De twee grondslagen blijven dus staan zoals ze stonden.
