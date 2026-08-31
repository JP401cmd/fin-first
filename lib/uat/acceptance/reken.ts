/**
 * Acceptatiecriteria — domein Rekentools & wat-als (WF-REKEN-01..24 /
 * UAT-REKEN-01..16, 18..24).
 *
 * Spiegelt exact de aanpak van `budget.ts`/`start.ts`/`will.ts`/`cash.ts`/
 * `ovz.ts`/`nav.ts`/`rapp.ts`. Bron: `docs/uat/uat-plan.md` Deel 1
 * (workflow-definities WF-REKEN-01..24) + Deel 2 §"UAT-scenario's —
 * Rekentools & wat-als" (UAT-REKEN-01..16, 18..24).
 *
 * WF-REKEN-17 (bewaarde wat-als-scenario's: opslaan/laden/pinnen/verwijderen)
 * heeft GEEN eigen UAT-REKEN-scenario — het plan wijst expliciet door naar
 * UAT-TOEK-09 (spooklijn-overlay-gedrag zit daar al diepgaand getoetst). De
 * overige 23 WF-REKEN-nummers hebben elk een eigen criterium hieronder.
 *
 * ZONE-SPECIFIEKE NUANCE (kaart-instructie): de losse rekentools (inflatie &
 * koopkracht, samengestelde interest, uitgaven na pensioen) zijn wiskundig
 * EXACT — die criteria zijn 'exact' met de uitgeschreven formule + het
 * onafhankelijk narekende getal, geverifieerd met Node.js tegen de échte
 * productiefunctie (zie rekenreeks in `reken-checks.ts`). De horizon-kernel-
 * afhankelijke wat-als-scenario's (WF-REKEN-12 t/m 20) zijn grotendeels
 * 'direction' (richting/orde-grootte, oracle-referentie = /beheer/horizon-
 * kernel) — met twee uitzonderingen die ZELF geen kernel-run nodig hebben:
 * WF-REKEN-16 (saldo-gewogen schuldrente, `weightedDebtRate`, op een schone
 * synthetische fixture — spiegelt OVZ's aanpak: een hand-narekenbaar eigen
 * voorbeeld i.p.v. Tessa's ongespecificeerde 12-schuldenmix) en WF-REKEN-20
 * (impact-badge = de sliderwijziging zelf, "géén aparte motor" — het plan
 * noemt dit expliciet exact narekenbaar).
 *
 * AL-GEDOCUMENTEERDE BUGS: geen bekend vanuit deze zone bij aanvang van deze
 * sessie (in tegenstelling tot RAPP). Twee al-genoemde randgevallen uit het
 * plan zelf worden narratief meegenomen: de prefab-formule-whitelist kent
 * GEEN `log`-functie (WF-REKEN-01/02, `evaluate.ts#WHITELIST_FNS`). Het tweede
 * randgeval — "de onzekerheidsband (WF-REKEN-18) draait op een losstaande
 * legacy `runMonteCarlo`, niet op de horizon-kernel" — is OPGELOST op
 * 2026-08-08: de band is sindsdien de kernel-marktcheck
 * (`computeWhatifMarktcheck`). Sinds 2026-08-09 tekent hij p25–p75 i.p.v.
 * p10–p90 en bepaalt p75 de Y-as; zie het criterium hieronder.
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
    workflow: 'WF-REKEN-12',
    scenarioId: 'UAT-REKEN-12',
    titel: 'De Wat-Als bereiken: deeplink, inline sliders en dream gate',
    kriticiteit: 'BELANGRIJK',
    persona: 'tessa',
    given: 'Persona Tessa Compleet. Het inline-slider-gedrag zelf op de tijdas is diepgetest in UAT-TOEK-10 — hier alleen de drie ingangen en de dream-transitie.',
    when: 'De gebruiker navigeert naar /toekomst/whatif (direct of via /horizon/whatif-legacy) en klikt "Scenario\'s vergelijken →".',
    then: 'Redirect naar /toekomst?whatif=open (gescrold naar "Verken je aannames", URL opgeschoond); dream-transitie opent /toekomst/whatif?via=dreamgate. Eenvoudig-weergave verbergt beide routes uit de nav (SIMPLE_HIDDEN_NAV_HREFS) maar de deeplink werkt. Geen basisgegevens → lege staat met CTA naar /overzicht/bezittingen.',
    assertion: {
      kind: 'ui-only',
      source: 'next.config.ts#redirects (routing-laag-guard op /toekomst/whatif, `missing: via=dreamgate`) + components/app/horizon/horizon-client.tsx (?whatif=open-scroll) + lib/horizon/deeplink-cleanup.ts (URL-opschoning blijft op dezelfde route) — routing/interactie, geen eigen berekening',
    },
  },
  {
    workflow: 'WF-REKEN-13',
    scenarioId: 'UAT-REKEN-13',
    titel: 'Een wat-als-preset kiezen en het effect aflezen',
    kriticiteit: 'KERN',
    persona: 'tessa',
    given: 'Persona Tessa Compleet, volledige Wat-Als-pagina. Preset "Salarisverhoging" (+10% inkomen).',
    when: 'De gebruiker activeert de preset en leest de KPI-strip (vrijheidsleeftijd, doelbedrag, jaarlijks sparen, verschil).',
    then: 'Vrijheidsleeftijd (scenario) < baseline met groene delta; jaarlijks sparen stijgt (richting: positief effect van +10% inkomen); doelbedrag blijft ~gelijk. Onbereikbaar scenario → waarschuwing; delta < drempel (±0,1jr/±€100) → "–". Oracle-referentie: /beheer/horizon-kernel (tab Verificatie).',
    assertion: {
      kind: 'direction',
      source: 'lib/horizon-kernel/whatif-router.ts#computeWhatifProjection (kernel-only) — richting/orde-grootte-toets, exacte cijfers alleen via de oracle-UI',
    },
  },
  {
    workflow: 'WF-REKEN-14',
    scenarioId: 'UAT-REKEN-14',
    titel: 'Het scenario verfijnen met sliders en marktbias',
    kriticiteit: 'KERN',
    persona: 'tessa',
    given: 'Persona Tessa Compleet, volledige Wat-Als-pagina (netto maandinkomen €7.600, `expected_return` 7%).',
    when: 'De gebruiker verschuift spaarquote/marktbias-sliders.',
    then: 'Hogere spaarquote/marktbias → lagere FIRE-leeftijd (richting); gemengde per-categorie marktbias → master-slider toont "gemengd" (staat op 0); spaarquote 0% + marktbias −5pp → FIRE-onbereikbaar-waarschuwing; slider terug op baseline → delta-badge en scenario-event verdwijnen.',
    assertion: {
      kind: 'direction',
      source: 'components/app/horizon/whatif-sliders.tsx + lib/horizon-kernel/whatif-router.ts#computeWhatifProjection — richting-toets, cel-voor-cel oracle op /beheer/horizon-kernel bij twijfel',
    },
  },
  {
    workflow: 'WF-REKEN-15',
    scenarioId: 'UAT-REKEN-15',
    titel: 'Levensgebeurtenissen in het scenario beheren en hun impact zien',
    kriticiteit: 'KERN',
    persona: 'tessa',
    given: 'Persona Tessa Compleet, 5 echte levensgebeurtenissen (o.a. "Verbouwing eigen woning" eenmalig €45.000 op leeftijd 50).',
    when: 'De gebruiker zet een gebeurtenis tijdelijk uit (oog-icoon) of voegt een hypothetische toe (bv. "Wereldreis" €15.000 op leeftijd 45).',
    then: 'Projectie verschuift in de verwachte richting (uitzetten van een kostenpost → vroegere/hogere uitkomst); uitzetten is NIET gepersisteerd (herladen zet hem weer aan); duur-loos event → aanname 240 maanden (20 jaar); verwijderen uit het scenario laat de echte `life_events`-rij ongemoeid.',
    assertion: {
      kind: 'direction',
      source: 'components/app/horizon/whatif-events.tsx#computeImpact (twee volledige kernel-runs, mét/zonder event) — richting/delta-toets, geen los narekenbaar cijfer buiten de kernel',
    },
  },
  {
    workflow: 'WF-REKEN-16',
    scenarioId: 'UAT-REKEN-16',
    titel: 'Beslishulp: wat doe je met €X per maand extra?',
    kriticiteit: 'KERN',
    persona: 'tessa',
    given: 'Synthetische, hand-narekenbare schuldenset (2 schulden: €100.000 @ 4% + €50.000 @ 2%) — Tessa\'s échte 12-schuldenmix is niet exact gespecificeerd in het plan (alleen een orde-grootte-band "3,2–3,3%"), dus wordt de échte functie hier op een schone eigen fixture getoetst i.p.v. op ongespecificeerde persona-cijfers (spiegelt OVZ WF-OVZ-01).',
    when: 'De saldo-gewogen schuldrente wordt berekend.',
    then: 'Gewogen rente = (100.000×4% + 50.000×2%) / 150.000 = 3,33%. Op de échte Tessa-mix (2 hypotheken €410k @ 3,1–3,6%, plus 10 kleinere leningen tot 14%) hoort dit rond 3,2–3,3% te liggen — omdat Tessa\'s `expected_return` (7%) hierboven ligt, wint de kaart Beleggen de vroegste FIRE-leeftijd. Geen actieve schuld (bv. Marijke) → de Aflossen-kaart is verborgen. €0 extra → alle drie kaarten identiek aan de baseline.',
    assertion: {
      kind: 'exact',
      expected: 'weightedDebtRate=3.33',
      source: 'components/app/horizon/whatif-beslishulp.model.ts#weightedDebtRate (échte productiefunctie) op een schone synthetische fixture — zie reken-checks.ts',
    },
  },
  {
    workflow: 'WF-REKEN-18',
    scenarioId: 'UAT-REKEN-18',
    titel: 'Onzekerheid (Monte Carlo) en grafiekweergaven verkennen',
    kriticiteit: 'BELANGRIJK',
    persona: 'tessa',
    given: 'Persona Tessa Compleet, volledige Wat-Als-pagina. Scope: uitsluitend het Wat-Als-oppervlak (tijdas-variant = UAT-TOEK-08).',
    when: 'De gebruiker zet "Onzekerheid" aan in Pad-modus en wisselt naar Opbouw.',
    then: 'p25–p75-band rond de deterministische lijn, breder op langere termijn. GETEKEND is sinds 2026-08-09 alléén de middelste helft (p25–p75, met p50 als lijn) en de Y-as schaalt daar ook op; p10–p90 bestaat nog in de data (tooltip, invariant) maar wordt niet meer getekend — die rand drukte de plan-lijn tot ~9% van de ashoogte plat. De pil-titel noemt daarom p25–p75. De band draait sinds 2026-08-08 op de MARKTCHECK (horizon-kernel): tot 200 VOLLEDIGE kernel-projecties op exact dezelfde what-if-context als de hoofdlijn (incl. rendement-slider), dus de band volgt óók de onttrekkingsfase i.p.v. de opbouw door te zetten. Grondslag = netto vermogen (Prognose!I), gelijk aan de hoofdlijn. SINDS ADR 0117 (29-08-2026, allocatie snede 1) wordt élke ruisterm (gedeelde marktschok + idiosyncratische ruis) bovendien geschaald met de markt-risicofactor van de pot (laag/obligaties ≈0,3×, middel/gespreid 1×, hoog/individuele aandelen-crypto ≈1,4×) i.p.v. de vroegere binaire "investeringspot ja/nee" — een premieregeling-pensioenpot beweegt daardoor voor het eerst mee, en een obligatiepot beweegt minder hard dan voorheen. Zonder risk_profile-invoer is de factor `investering ? 1 : 0` (ongewijzigd gedrag). De wrapper draagt sindsdien ook `bandLiquide` (Prognose!J-spiegel) voor het oppervlak dat zijn hoofdlijn op J tekent (Uitsluiten, WF-TOEK-36/37) — dat oppervlak toont dus NOOIT een I-band om een J-lijn. Draait in de web worker; de band verschijnt met enkele seconden vertraging. "Onzekerheid"-knop verdwijnt in Opbouw-modus. Mobiel (<768px) → "Inkomen & Uitgaven" standaard dicht.',
    assertion: {
      kind: 'direction',
      source: 'lib/horizon-kernel/whatif-router.ts#computeWhatifMarktcheck → lib/horizon-kernel/wrappers/mc.ts#runMonteCarlo (band + bandLiquide) → lib/horizon-kernel/wrappers/risico.ts#potRisicoFactor (ADR 0117) — statistische sanity-check (band niet triviaal smal/breed) plus de invariant "hoofdlijn binnen p10–p90"; de Y-as-keuze (mcMax op p75) is gepind in lib/horizon/sim-chart-geometry.test.ts',
    },
  },
  {
    workflow: 'WF-REKEN-19',
    scenarioId: 'UAT-REKEN-19',
    titel: 'Met Fin over je scenario chatten en suggesties overnemen',
    kriticiteit: 'BELANGRIJK',
    persona: 'tessa',
    given: 'Persona Tessa Compleet, volledige Wat-Als-pagina met een actief scenario.',
    when: 'De gebruiker chat met Fin over het scenario en klikt een voorgestelde levensgebeurtenis-kaart aan.',
    then: 'AI-antwoordinhoud is niet-deterministisch (alleen het toevoeg-mechanisme is deterministisch testbaar); toegevoegde gebeurtenis wordt daadwerkelijk in het scenario opgenomen (projectie past zich meetbaar aan, richting-toets, zie WF-REKEN-15). Netwerkonderbreking bij laden → skeleton blijft staan (geen crash).',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/horizon/whatif-chat.tsx (useChat + suggest_life_event-tool) — AI-inhoud niet statisch toetsbaar, alleen het toevoeg-mechanisme',
    },
  },
  {
    workflow: 'WF-REKEN-20',
    scenarioId: 'UAT-REKEN-20',
    titel: 'Concrete acties uit je scenario halen',
    kriticiteit: 'OVERIG',
    persona: 'tessa',
    given: 'Persona Tessa Compleet, volledige Wat-Als-pagina, scenario = baseline (geen wijzigingen) — actieblok leeg/afwezig. Vervolgens wijzigt de gebruiker de inkomen-slider met exact +€500/mnd.',
    when: 'De impact-badge van de verschenen actiekaart wordt getoond.',
    then: 'Impactbedragen zijn de slider-delta\'s zelf (géén aparte motor) — de badge toont letterlijk "+€500/mnd", cijfermatig gelijk aan de getypte sliderwijziging.',
    assertion: {
      kind: 'exact',
      // Intl.NumberFormat('nl-NL', {style:'currency'}) plaatst een non-breaking
      // space (U+00A0) tussen € en het bedrag — zie reken-checks.ts.
      expected: '+€ 500/mnd',
      source: 'components/app/horizon/whatif-actions.tsx (impact: `+${formatMaskedCurrency(monthlyDelta, masked)}/mnd`) — formatMaskedCurrency is een échte productiefunctie (lib/format.ts) — zie reken-checks.ts',
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
    given: 'Persona Marijke Vermeer. Prefill maandinleg: `net_monthly_income`(€3.400) − `estimated_monthly_expenses`(€2.800) = €600 (asset-`monthly_contribution`-som=€0, overschrijft niet); prefill rendement = haar `expected_return` = 5,0%.',
    when: 'Maandelijkse samenstelling (rente eerst op bestaand saldo, dan inleg toegevoegd — "ordinary annuity"): `waarde_m = waarde_(m-1) × (1+rendement/12) + maandinleg`, 240 maanden.',
    then: 'Na 20 jaar: totale waarde €246.620, totale inleg €144.000 (exact), rendement-deel €102.620. Referentiepunten: 10 jaar → €93.169 (inleg €72.000); 30 jaar → €499.355 (inleg €216.000). Rendement 0% → eindwaarde = pure inleg; maandinleg €0 → vlak op €0.',
    assertion: {
      kind: 'exact',
      expected: 'y10=93169; y20=246620; y30=499355; y20Deposits=144000; y20Returns=102620',
      source: 'components/app/horizon/compound-interest-chart.tsx#computeCompoundInterest (échte productiefunctie) — zie reken-checks.ts',
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
