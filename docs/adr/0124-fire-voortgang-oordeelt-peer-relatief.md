---
id: 0124-fire-voortgang-oordeelt-peer-relatief
title: 'De FIRE-voortgang-pijler oordeelt peer-relatief: koers t.o.v. de FIRE-nastrevers-lat, niet de kale vulling'
status: aanvaard
date: 2026-08-31
elements: [as-planning, as-vermogen, do-huishouden]
---

# 0124 — De FIRE-voortgang-pijler oordeelt peer-relatief

## Context

De deelscore **FIRE-voortgang** (pijler Vrijheid, gewicht 0.18) van de
gezondheidsscore was leeftijdsblind: `score = clamp(freedomPct, 0, 100)`. Dat
getal beantwoordt "hoe vol is de pot", niet "ligt deze persoon op koers". Een
30-jarige met 8% vulling die op schema ligt om op z'n 57e vrij te zijn las
"zwak" (score 8); een 55-jarige met 40% vulling en een onhaalbare FIRE las
"redelijk". Precies andersom dan de werkelijkheid van vermogensopbouw, die
samengesteld en dus sterk leeftijdsafhankelijk is.

## Besluit (eigenaar-akkoord 31 aug 2026, voorstel met rekenvoorbeelden)

De pijler oordeelt voortaan **peer-relatief** langs twee signalen tegen de
**FIRE-nastrevers-lat** — een gecureerde, normatieve peer-FIRE-leeftijd per
leeftijdscohort (`lib/benchmark/fire-peer-lat.ts`, op de bestaande
`AGE_BANDS`-as): tot 35 → 55 · 35–45 → 58 · 45–55 → 62 · 55+ → 65.

- **Signaal A — koers (60%):** haalt de kernel-projectie de lat?
  `A = clamp(70 + 6·(peerFireAge − fireAgeFractional), 0, 100)` — precies op de
  lat = 70, vijf jaar eerder = 100, vijf jaar later = 40.
- **Signaal B — voortgang-op-leeftijd (40%):** ligt `freedomPct` op de
  samengestelde opbouwcurve die bij de lat hoort?
  `verwachtPct(lft) = 100·((1+r)^(lft−25) − 1)/((1+r)^(peer−25) − 1)` met
  `r = DEFAULT_RETURN`; `B = clamp(round(75·freedomPct/verwachtPct), 0, 100)` —
  precies op de curve = 75.

Randen: `freedomPct ≥ 100` → 100. FIRE onhaalbaar of geen kernel-run
(`fireAgeFractional = null`) → alleen B. Geen leeftijd bekend → de oude
leeftijdsblinde score als terugval.

Rekenvoorbeelden (vastgelegd in `lib/financial-health.test.ts`): 40 jr · 67% ·
FIRE 46,6 → **100** (was 67); 30 jr · 8% · FIRE 57 → **74** (was 8); 50 jr ·
20% · FIRE onhaalbaar → **38** (was 20).

## Gevolgen

- `HealthScoreInput` draagt `currentAge` en `fireAgeFractional`; beide zijn
  **verplichte scalars** in `buildHealthScoreInput`, zodat geen aanroeper de
  peer-score stil kan vergeten. Op het canonieke /overzicht-pad wordt de
  kernel-koers — net als `freedomPct` — compile-afgedwongen geïnjecteerd door
  `lib/horizon-data-loader.ts` (zelfde bron als het bundel-veld
  `fireAgeFractional`); `Omit<…, 'freedomPct' | 'fireAgeFractional'>` bewaakt dat.
- De drie snapshot-routes voeden de koers uit hun eigen scalar-FIRE-projectie
  (dezelfde die `fire_age` op de rij schrijft). **Grondslag-breuk in
  `net_worth_snapshots.resilience_score`, bewust zonder backfill** — zelfde
  precedent als de budgetdiscipline-breuk van 30 aug 2026; de trendlijn kan op
  de naad een eenmalige knik tonen.
- De referentie-peer van /check (`lib/benchmark/reference-peer.ts`) wordt langs
  dezelfde maat gelegd (krijgt `midAge` + zijn eigen projectie-FIRE-leeftijd
  mee), zodat de benchmark appels met appels vergelijkt.
- De lat is bewust een **ándere grootheid** dan de CBS-mediaan-referentie-peer:
  de lat is normatief ("leeftijdsgenoten die vroeg willen stoppen"), de
  CBS-peer beschrijvend. Zodra er voldoende opt-in TriFinity-cohortdata is, kan
  de tabel door echte peers worden gevoed zonder dat de formule wijzigt.
- Wft-/merkstem-kader: de copy presenteert de lat als **eigen richtlijn**
  ("onze vrijheidslat voor jouw leeftijd"), nooit als gemeten statistiek over
  echte leeftijdsgenoten — de lat ís gecureerd, geen meting, en de pijler-tip
  reist mee in de wekelijkse briefing-mail. Inzicht, geen advies.
- `fireAgeFractional = null` betekent op elk pad "geen haalbare FIRE-leeftijd
  bekend"; paden zonder kernel-run leveren daarom hun beste beschikbare koers:
  /core en de dashboard-bundel de meest recente `net_worth_snapshots.fire_age`,
  de snapshot-routes hun eigen scalar-FIRE-projectie. Zo divergeren /core en
  /overzicht niet (review C1).
- **Bewuste beperkingen** (vastgelegd, geen vergissingen):
  - De what-if-recompute op /toekomst (horizon-client, scenarios-modal) her-simt
    de FIRE-leeftijd niet; daar beweegt alleen het voortgang-signaal (B) mee met
    het scenario — de koers (A) blijft de server-baseline, of de modal valt
    terug op leeftijdsblind.
  - In partner-/huishoudperspectief hoort `currentAge` bij de **kijker**, de
    financiën bij het perspectief — zelfde patroon als `yearsInRetirement`.
  - `rawValue` blijft de vulling (`67%`); de koers-duiding staat in de tip.
