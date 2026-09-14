/**
 * Acceptatiecriteria — domein Rekentools (WF-REKEN-01..11, 21..24 /
 * UAT-REKEN-01..11, 21..24).
 *
 * Spiegelt exact de aanpak van `budget.ts`/`start.ts`/`will.ts`/`cash.ts`/
 * `ovz.ts`/`nav.ts`/`rapp.ts`. Bron: `docs/uat/uat-plan.md` Deel 1
 * (workflow-definities WF-REKEN-01..24) + Deel 2 §"UAT-scenario's —
 * Rekentools" (UAT-REKEN-01..11, 21..24).
 *
 * VERVALLEN (14 sep 2026, ADR 0144 "De Wat-Als-pagina gaat op in de
 * tijdas"): de standalone Wat-Als-pagina (`/toekomst/whatif`), bewaarde
 * wat-als-scenario's + de spooklijn-overlay-picker en de what-if-AI-
 * suggestiepad zijn verwijderd. Daarmee vervallen WF-REKEN-12 (Wat-Als
 * bereiken/dream gate), WF-REKEN-13 (preset kiezen), WF-REKEN-14 (sliders
 * en marktbias), WF-REKEN-15 (levensgebeurtenissen in het scenario),
 * WF-REKEN-16 (beslishulp), WF-REKEN-18 (Monte Carlo/onzekerheidsband op de
 * Wat-Als-pagina), WF-REKEN-19 (met Fin over het scenario chatten) en
 * WF-REKEN-20 (acties uit het scenario) — geen van deze acht heeft nog een
 * criterium hieronder. WF-REKEN-17 (bewaarde wat-als-scenario's) had al geen
 * eigen UAT-REKEN-scenario en verviel eerder samen met UAT-TOEK-09 (zie
 * `toek.ts`). Het INLINE-slider-gedrag op de tijdas ("Verken je aannames",
 * /toekomst?whatif=open) blijft ongewijzigd en zit als vanouds in
 * WF-TOEK-10/UAT-TOEK-10 (`toek.ts`). `/toekomst/whatif` en `/horizon/whatif`
 * hebben nu elk maar ÉÉN, ONVOORWAARDELIJKE redirect-regel naar
 * /toekomst?whatif=open (geen ?via=dreamgate-vertakking meer in next.config.ts)
 * — maar de regel zelf is niet "kaal": Next geeft een meegegeven `?via=
 * dreamgate` gewoon door (de bestemming draagt zelf geen `?`), dus die landt
 * eerst als `/toekomst?whatif=open&via=dreamgate`. Een losse client-side
 * opschoonstap (restpuntenronde, zie WF-NAV-16) haalt `via` daarna uit de URL.
 * Zie WF-NAV-16 (`nav.ts`).
 *
 * De overige 15 WF-REKEN-nummers (01..11, 21..24) hebben elk een eigen
 * criterium hieronder.
 *
 * ZONE-SPECIFIEKE NUANCE (kaart-instructie): de losse rekentools (inflatie &
 * koopkracht, samengestelde interest, uitgaven na pensioen) zijn wiskundig
 * EXACT — die criteria zijn 'exact' met de uitgeschreven formule + het
 * onafhankelijk narekende getal, geverifieerd met Node.js tegen de échte
 * productiefunctie (zie rekenreeks in `reken-checks.ts`).
 *
 * AL-GEDOCUMENTEERDE BUGS: geen bekend vanuit deze zone bij aanvang van deze
 * sessie (in tegenstelling tot RAPP). Eén al-genoemd randgeval uit het plan
 * zelf wordt narratief meegenomen: de prefab-formule-whitelist kent GEEN
 * `log`-functie (WF-REKEN-01/02, `evaluate.ts#WHITELIST_FNS`).
 *
 * GRONDSLAG-REGEL (CLAUDE.md): rekenhulpen zijn losgekoppeld van de FIRE-
 * projectie (WF-REKEN-01) totdat een uitkomst expliciet als levensgebeurtenis
 * wordt geëxporteerd (WF-REKEN-03) — dat is een bewuste architectuurkeuze,
 * geen "consume don't recompute"-schending: de rekenhulp-evaluator
 * (`lib/calculator/evaluate.ts`) is een apart, gebruikersgestuurd sandbox-
 * domein, geen kopie van een kernmetriek.
 */

import type { AcceptanceCriterion, AcceptanceSet } from './types'

const criteria: AcceptanceCriterion[] = [
  {
    workflow: 'WF-REKEN-01',
    scenarioId: 'UAT-REKEN-01',
    titel: 'Een opgeslagen rekenhulp openen en doorrekenen',
    kriticiteit: 'KERN',
    persona: 'tessa',
    given: 'Persona Tessa Compleet, prefab "Aflossen vs. beleggen" (schuld>0 dus scenario "Aflossen" van toepassing). Invoer: maandbedrag=€500 (getypt), hypotheekrente=4% en jaren=15 (standaardwaarden, geen "uit jouw data"-badge).',
    when: 'De drie scenario-uitkomsten (Aflossen, Beleggen 5%, Beleggen 8%) worden berekend via `fvAnnuity(maandbedrag, rente, jaren)` met maandelijkse compounding, en het winnende scenario wordt bepaald op de hoogste eindwaarde.',
    then: 'Aflossen (4%) = €123.045, Beleggen 5% = €133.644, Beleggen 8% = €173.019 — Beleggen 8% wint (trofee-icoon + conclusiezin). De Wft-disclaimer staat altijd onderaan.',
    assertion: {
      kind: 'exact',
      expected: 'aflossen=123045; beleggen5=133644; beleggen8=173019; winner=beleggen_8',
      source: 'lib/calculator/evaluate.ts#evaluateCalculator (échte productiefunctie) op de échte prefab-definitie `aflossen-vs-beleggen` (lib/calculator/prefab-definitions.ts) — zie reken-checks.ts',
    },
  },
  {
    workflow: 'WF-REKEN-02',
    scenarioId: 'UAT-REKEN-02',
    titel: 'Een nieuwe rekenhulp bouwen met Fin (AI)',
    kriticiteit: 'KERN',
    persona: 'daan',
    given: 'Persona Daan Bakker, actief AI-abonnement (tier-gate \'ai\' — gate-mechaniek zelf → UAT-KRUIS-25), weeklimiet 10 generaties / 5 verfijningen per ISO-week (reset maandag 00:00 Europe/Amsterdam, `lib/calculator/rate-limit.ts`).',
    when: 'De gebruiker beschrijft een vraagstuk, genereert, verfijnt en slaat de rekenhulp op.',
    then: 'Live preview verschijnt, verbruik-badge daalt; opslaan zet de rekenhulp onder "Werkbladen" met `created_by_ai=true`. AI-inhoud zelf is niet-deterministisch — alleen het proces (genereren/verfijnen/opslaan/consistent heropenen) is toetsbaar. Weeklimiet bereikt → 429 bij de 11e poging (mislukte poging telt ook mee); >500 tekens → 400; geen AI-abonnement → 403 in het amber foutblok.',
    assertion: {
      kind: 'ui-only',
      source: 'app/api/ai/build-calculator/route.ts + components/future/rekenhulp-view.tsx (build-modus) — AI-genereerde inhoud is niet statisch toetsbaar, proces wel',
    },
  },
  {
    workflow: 'WF-REKEN-03',
    scenarioId: 'UAT-REKEN-03',
    titel: 'Een rekenhulp-uitkomst omzetten in een levensgebeurtenis',
    kriticiteit: 'KERN',
    persona: 'tessa',
    given: 'Persona Tessa Compleet (42 jaar), de opgeslagen "Aflossen vs. beleggen"-rekenhulp uit WF-REKEN-01 met winnend scenario Beleggen 8% = €173.019.',
    when: 'De gebruiker klikt "Maak hier een levensgebeurtenis van", kiest impact-type "Eenmalig" en bevestigt.',
    then: 'Het sheet is voorgevuld met bedrag=€173.019 (het winnende-scenario-bedrag) en leeftijd=42; na opslaan bevat de nieuwe `life_events`-rij `one_time_cost=173019` en `target_age=42`. Bedrag ≤0 → "Vul een positief bedrag in."; geen winnend scenario → bedrag 0.',
    assertion: {
      kind: 'exact',
      expected: 'one_time_cost=173019; target_age=42; monthly_cost_change=0; monthly_income_change=0',
      source: 'lib/calculator/to-life-event.ts#buildLifeEventDraft (échte productiefunctie) met amount=173019 (WF-REKEN-01-winnaar) — zie reken-checks.ts',
    },
  },
  {
    workflow: 'WF-REKEN-04',
    scenarioId: 'UAT-REKEN-04',
    titel: 'Een eigen rekenhulp publiceren in de bibliotheek',
    kriticiteit: 'KERN',
    persona: 'daan',
    given: 'Persona Daan Bakker, een eigen niet-publieke rekenhulp (bv. uit WF-REKEN-02).',
    when: 'De gebruiker opent de publicatie-sheet, controleert de neutrale voorbeeldwaarden (géén exact eigen bedrag) en bevestigt.',
    then: '`is_public=true`, de kaart toont "Gepubliceerd" + stats (likes/duplicaten=0) onder "Mijn publicaties"; zichtbaar voor alle ingelogde gebruikers op /toekomst/bibliotheek. Serverfout → sheet blijft open; netwerkfout → "Publiceren mislukt".',
    assertion: {
      kind: 'ui-only',
      source: 'components/future/publish-curation-sheet.tsx + lib/calculator/suggest-public-default.ts (privacy-curatie, geen bedrag-berekening)',
    },
  },
  {
    workflow: 'WF-REKEN-05',
    scenarioId: 'UAT-REKEN-05',
    titel: 'Een gepubliceerde rekenhulp uit de bibliotheek halen',
    kriticiteit: 'BELANGRIJK',
    persona: 'daan',
    given: 'De gepubliceerde rekenhulp uit WF-REKEN-04.',
    when: 'De gebruiker kiest "Uit bibliotheek halen".',
    then: '`is_public=false`, kaart verhuist terug naar "Werkbladen"; bestaande duplicaten bij anderen blijven bestaan. Netwerkfout tijdens intrekken → GEEN foutmelding (bewust stil falen) — status verandert zichtbaar niet.',
    assertion: {
      kind: 'ui-only',
      source: 'components/future/rekenhulp-view.tsx#unpublishCalculator (POST /api/calculators/unpublish) — bewust stil-falen-gedrag, geen berekening',
    },
  },
  {
    workflow: 'WF-REKEN-06',
    scenarioId: 'UAT-REKEN-06',
    titel: 'Een rekenhulp verwijderen',
    kriticiteit: 'KERN',
    persona: 'daan',
    given: 'Persona Daan Bakker, minimaal 2 eigen rekenhulpen.',
    when: 'De gebruiker klikt "Verwijderen" (rood) in het "…"-menu.',
    then: 'De kaart verdwijnt ONMIDDELLIJK zonder bevestigingsdialoog (bewust UX-aandachtspunt); calculator-teller op de Toekomst-navkaart daalt met 1; RLS/netwerkfout → stil falen (lijst ververst niet, geen foutmelding); laatste rekenhulp verwijderen → lege-staat-kaart verschijnt weer.',
    assertion: {
      kind: 'ui-only',
      source: 'components/future/rekenhulp-view.tsx#deleteSaved (Supabase delete) — geen bevestigingsdialoog, geen berekening',
    },
  },
  {
    workflow: 'WF-REKEN-07',
    scenarioId: 'UAT-REKEN-07',
    titel: 'De publieke bibliotheek verkennen en filteren',
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given: 'Persona Willem Jansen (geen hypotheek/eigen huis meer).',
    when: 'De gebruiker opent /toekomst/bibliotheek en zet de toggle "Alleen tonen wat ik kan gebruiken" aan.',
    then: 'Tier-koppen Starters/Verdieping/Specialist/"Van de community"; hypotheek-gerelateerde kaarten tonen een amber "mist data"-badge; filter aan → `?filter=usable`, hypotheek-kaarten vallen weg (bookmarkbaar, server-side). Niets matcht → reset-kaart; bibliotheek leeg → uitnodigingskaart.',
    assertion: {
      kind: 'ui-only',
      source: 'lib/calculator/requirements.ts#inferRequirements/checkRequirements — boolean vereisten-logica, geen bedragen',
    },
  },
  {
    workflow: 'WF-REKEN-08',
    scenarioId: 'UAT-REKEN-08',
    titel: 'Een publieke rekenhulp op detail bekijken (read-only preview)',
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given: 'Persona Willem Jansen, een bibliotheekkaart met een ontbrekende vereiste (hypotheek).',
    when: 'De gebruiker opent de detailpagina en speelt met sliders/scenario-tabs in het "Voorbeeld"-blok.',
    then: 'Uitkomsten-tabel en winnaar reageren live (zelfde evaluator als WF-REKEN-01, hier read-only: GEEN Opslaan/levensgebeurtenis-knop); vereisten-checklist met deeplink naar bv. /overzicht/schulden; onbestaand/niet-publiek id → nette 404, ook voor de eigenaar zelf.',
    assertion: {
      kind: 'ui-only',
      source: 'components/future/calculator-runner.tsx (readOnly) — zelfde evaluator als WF-REKEN-01, hier alleen de read-only-restrictie getoetst',
    },
  },
  {
    workflow: 'WF-REKEN-09',
    scenarioId: 'UAT-REKEN-09',
    titel: 'Een bibliotheek-rekenhulp dupliceren naar eigen collectie',
    kriticiteit: 'KERN',
    persona: 'tessa',
    given: 'Persona Tessa Compleet (voldoet aan alle vereisten van de prefab "Aflossen vs. beleggen").',
    when: 'De gebruiker klikt "Dupliceer naar mijn rekenhulpen" en bevestigt.',
    then: 'Groene "Klaar om te gebruiken"-banner (alle vereisten groen); deep-clone in `custom_calculators` (`forked_from` gezet), zichtbaar onder "Vanuit bibliotheek"; `duplicate_count` van het origineel +1. Ontbrekende vereisten (bv. Willem) → oranje banner + "Toch toevoegen", kopie werkt alsnog. Unpublish van het origineel later → kopie blijft bestaan (deep-clone).',
    assertion: {
      kind: 'ui-only',
      source: 'components/future/duplicate-confirm-sheet.tsx (POST /api/calculators/duplicate) — deep-clone van een definitie, geen eigen berekening',
    },
  },
  {
    workflow: 'WF-REKEN-10',
    scenarioId: 'UAT-REKEN-10',
    titel: 'Een publieke rekenhulp liken of unliken',
    kriticiteit: 'OVERIG',
    persona: 'lisa',
    given: 'Persona Lisa de Groot, op een detailpagina in /toekomst/bibliotheek.',
    when: 'De gebruiker klikt het hart-icoon (toggle).',
    then: 'Optimistische UI (hart + teller ±1 direct, korte schaal-animatie); serverweigering → automatische rollback (UI "liegt" nooit); uitgelogd/`canInteract=false` → disabled "Log in om te liken".',
    assertion: {
      kind: 'ui-only',
      source: 'components/future/like-button.tsx (POST /api/calculators/[id]/like, optimistic + rollback)',
    },
  },
  {
    workflow: 'WF-REKEN-11',
    scenarioId: 'UAT-REKEN-11',
    titel: 'Een publieke rekenhulp melden',
    kriticiteit: 'OVERIG',
    persona: 'lisa',
    given: 'Persona Lisa de Groot, op een detailpagina in /toekomst/bibliotheek.',
    when: 'De gebruiker vult een omschrijving in (max 1000 tekens) en verstuurt.',
    then: 'Bedankmelding (~2s), sheet sluit automatisch; lege melding → "Beschrijf kort wat er mis is."; heropenen reset de vorige staat (geen restant-bedanktekst).',
    assertion: {
      kind: 'ui-only',
      source: 'components/future/report-sheet.tsx (POST /api/calculators/[id]/report)',
    },
  },
  {
    workflow: 'WF-REKEN-21',
    scenarioId: 'UAT-REKEN-21',
    titel: 'Inflatie & koopkracht doorrekenen',
    kriticiteit: 'BELANGRIJK',
    persona: 'marijke',
    given: 'Persona Marijke Vermeer (`estimated_monthly_expenses`=€2.800 → daguitgaven = 2.800/30,44 = €91,98). Startbedrag=€20.000, inflatie=3,0%, horizon=30 jaar.',
    when: 'Reële waarde en vrijheidsdagen per jaar worden berekend: `reële waarde(jaar) = startbedrag / (1+inflatie)^jaar`; `vrijheidsdagen(jaar) = reële waarde(jaar) / daguitgaven`.',
    then: 'Jaar 10: €14.882 (25%-mijlpaal getriggerd, verlies 25,6%). Jaar 20: €11.074. Jaar 30: €8.240 (verlies 59%), vrijheidsdagen ≈ 89,58 → "2,9 maanden". 0% inflatie → vlakke lijnen, geen mijlpalen. Startbedrag <€100 klemt naar €100; inflatie >15% klemt naar 15,0%.',
    assertion: {
      kind: 'exact',
      expected: 'y10=14882; y20=11074; y30=8240; y30LossPct=59; y30FreedomMonths=2.9',
      source: 'components/app/horizon/inflation-erosion-chart.tsx#computeInflationErosion (échte productiefunctie) — zie reken-checks.ts',
    },
  },
  {
    workflow: 'WF-REKEN-22',
    scenarioId: 'UAT-REKEN-22',
    titel: 'Samengestelde interest doorrekenen',
    kriticiteit: 'BELANGRIJK',
    persona: 'marijke',
    given: 'Persona Marijke Vermeer, maandinleg €600 (`net_monthly_income` €3.400 − `estimated_monthly_expenses` €2.800) en rendement = haar `expected_return` = 5,0%. LET OP (UR3-26, 7 sep 2026): de losse pagina /toekomst/samengestelde-interest bestaat niet meer — die had nul ingangen en redirect nu naar /toekomst/rekenhulp. Dit criterium toetst dus uitsluitend nog de rekenmotor `computeCompoundInterest`, die ongewijzigd doorleeft en op het scherm terugkomt via de rente-op-rente-kaart op /overzicht/bezittingen. De prefill-afleiding uit het profiel zat in de verwijderde pagina en is géén onderdeel meer van dit criterium.',
    when: 'Maandelijkse samenstelling (rente eerst op bestaand saldo, dan inleg toegevoegd — "ordinary annuity"): `waarde_m = waarde_(m-1) × (1+rendement/12) + maandinleg`, 240 maanden.',
    then: 'Na 20 jaar: totale waarde €246.620, totale inleg €144.000 (exact), rendement-deel €102.620. Referentiepunten: 10 jaar → €93.169 (inleg €72.000); 30 jaar → €499.355 (inleg €216.000). Rendement 0% → eindwaarde = pure inleg; maandinleg €0 → vlak op €0.',
    assertion: {
      kind: 'exact',
      expected: 'y10=93169; y20=246620; y30=499355; y20Deposits=144000; y20Returns=102620',
      source: 'lib/horizon/compound-interest.ts#computeCompoundInterest (échte productiefunctie) — zie reken-checks.ts',
    },
  },
  {
    workflow: 'WF-REKEN-23',
    scenarioId: 'UAT-REKEN-23',
    titel: 'Uitgave na pensioen: methode kiezen (pane)',
    kriticiteit: 'KERN',
    persona: 'marijke',
    given: 'Persona Marijke Vermeer (`net_monthly_income`=€3.400, methode momenteel "Zelf samenstellen" op €2.800/mnd). Essentiële budgetten: "Vaste lasten wonen" €390/mnd + "Dagelijkse uitgaven" €430/mnd + "Vervoer" €130/mnd (geen children).',
    when: 'De drie methodekaarten tonen hun preview-jaarbedrag: "Behoud van inkomen" = `net_monthly_income`×12, "Essentiële budgetten" = `computeYearlyMustExpenses`, "Zelf samenstellen" = het opgeslagen custom-bedrag×12.',
    then: '"Behoud van inkomen" = €40.800/jaar (triviaal exact); "Essentiële budgetten" = minimaal €11.400/jaar (950×12, vóór eventuele extra als-essentieel-gemarkeerde categorieën — bevinding te melden als het preview-bedrag rond €13.800/jaar ligt, want dat zou betekenen dat ook "Sparen & investeren" wordt meegeteld); "Zelf samenstellen" toont €33.600/jaar. Klik op een kaart slaat DIRECT op (geen aparte opslaanknop); sluiten herlaadt de tijdas.',
    assertion: {
      kind: 'exact',
      expected: 'behoudVanInkomen=40800; essentieleBudgetten=11400; zelfSamenstellen=33600',
      source: 'lib/budget-utils.ts#computeYearlyMustExpenses/computeRetirementExpenses (échte productiefuncties) — zie reken-checks.ts',
    },
  },
  {
    workflow: 'WF-REKEN-24',
    scenarioId: 'UAT-REKEN-24',
    titel: 'Uitgave na pensioen "Zelf samenstellen" (aspiraties-vragenlijst)',
    kriticiteit: 'KERN',
    persona: 'marijke',
    given: 'Persona Marijke Vermeer, paneel van WF-REKEN-23, kaart "Zelf samenstellen". Keuzes: reizen "Eén EU-vakantie" (2 wk × €78 p.p., 2 reizigers), auto "Middenklasse" (€7.200), uit eten/cultuur 4×/2× per maand à €60/€45 p.p. (2 personen), hobby\'s "Tuin"(€600)+"Sport"(€1.500), zorg "Comfort"(€2.700, geen top-up), lifestyle "Comfort" (×1,0), buffer uit.',
    when: 'Het jaartotaal wordt opgebouwd uit reis-, auto-, dining-, hobby- en zorgbedragen × lifestyle-multiplier × buffer, afgerond op het dichtstbijzijnde honderdtal.',
    then: 'Reizen €2.184, auto €7.200, uit eten/cultuur €7.920, hobby\'s €2.100, zorg €2.700 → subtotaal €22.104 → totaal €22.100/jaar. Handmatige override (bv. €30.000) wint volledig van het berekende totaal. Verpleegreservering aan → zorg +€3.200/jaar (€5.900); buffer aan → totaal (ná multiplier) +10%.',
    assertion: {
      kind: 'exact',
      expected: 'travel=2184; transport=7200; dining=7920; hobbies=2100; care=2700; base=22104; total=22100',
      source: 'lib/retirement-aspirations.ts#computeAspirationTotal (échte productiefunctie) — zie reken-checks.ts',
    },
  },
]

export const REKEN_ACCEPTANCE: AcceptanceSet = {
  zone: 'REKEN',
  criteria,
}
