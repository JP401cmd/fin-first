---
id: 0130-de-welkomstgids-woont-bij-fin-en-de-rondleiding-op-overzicht
title: 'De welkomstgids woont bij Fin; het welkom is een rondleiding op /overzicht'
status: aanvaard
date: 2026-09-05
elements: [as-coach, sp-registreren, sp-inzicht, app-comp]
---

# 0130 — De welkomstgids woont bij Fin; het welkom is een rondleiding op /overzicht

## Context

Na de onboarding landde een nieuwe gebruiker hard op `/toekomst`, kreeg daar een
full-page welkomstmodal (`ToekomstWelcome`) die tekstueel naar "het stappenplan
op je Overzicht" verwees, en daarna drie tips-ballonnen rond de vervaagde
grafiek. Op `/overzicht` stond de welkomstgids (5 schermen × 4 stappen) als
banner direct onder de begroeting — de positie die ADR 0026 (aanvulling 28 aug
2026) nog had vastgelegd.

De eigenaar stelde op 5 sep 2026 vast dat dit niet intuïtief is: de actielijst
is "te veel in your face", en de landing gebeurt op een scherm dat niet het
hoofdscherm is. De verkenning vond daarbij vier structurele oorzaken:

- **Twee stemmen zeiden hetzelfde.** Zes van de tien data-gap-tips in
  `lib/coach-suggestions.ts` (bank, bezittingen, schulden, budget,
  gebeurtenissen, FIRE-parameters) vroegen hetzelfde als een gidsstap. De
  gebruiker kreeg de vraag dus twee keer, op twee plekken, met twee
  afvinkmechanismen.
- **De coach-dismiss stond in localStorage** en werd óók weggeschreven als
  de melding nooit zichtbaar was geweest (overlay open, immersieve route).
  Een tip kon zo "gezien" heten zonder ooit gezien te zijn — en op een tweede
  toestel kwam alles terug.
- **Het welkom stond op de verkeerde pagina.** `/toekomst` is één van de vijf
  primaire routes; het homescherm is `home_screen` (default `/overzicht`,
  ADR-lijn van het kiesbare homescherm).
- **Er was geen eerste-waarde-moment.** De welkomstkaart noemde een getal,
  maar legde niet uit waar het vandaan kwam of wat je ermee kunt.

## Besluit

**1. De welkomstgids heeft één thuis: Fin.** De gidsweergave is een vierde
icoon in de chat-header (`ListChecks`, vóór de megafoon) dat het paneel in
`mode: 'gids'` zet — naar analogie van de meldmodus, en net als die **buiten
alle AI-gates**: een gebruiker zonder AI-abonnement moet zijn eerste stappen
kunnen zien. De banner en het geminimaliseerde punt op `/overzicht` zijn weg.
Server-state (`profiles.module_guide_state['welcome:guide']`), API en
`/beheer/welkom` blijven ongewijzigd; `minimized` verliest zijn UI-betekenis
en wordt genegeerd. De APP-2-zin (de enige plek waar de app over de
weergavekeuze praat, ADR 0026 fase 1) verhuist mee naar de gidsweergave —
de regel blijft, de gids is alleen verhuisd. Dit superseert **besluit 1 t/m 3
van de ADR 0026-aanvulling van 28 aug 2026**.

**2. Eén stem: de gids-laag vervangt de data-gap-laag zolang de gids actief
is.** `lib/coach-suggestions.ts` krijgt een laag `guide` tussen `deferred` en
`data_gap`. Is de gids actief, dan spreekt Fin uitsluitend via de eerste open
gidsstap **die op de huidige route thuishoort** (exacte pathname-match op de
stap-href; bezoekstappen en `/toekomst` uitgesloten), hooguit **één keer per
dag**. Is de gids afgesloten ("Ik ben klaar met de gids"), dan valt de coach
terug op het oude gedrag inclusief de gap-regels zonder gidsequivalent
(holdings, ISIN). Geen badge op de bubbel of het icoon (ADR 0095: geen
concurrerende tellers op één knop); alleen "Welkomstgids · N open" in de
subtitel van de gidsweergave.

**3. Coach-state is server-side.** Weggeklikte tips, de laatste dismiss en
het dagstempel van de gids-bubbel staan in
`profiles.module_guide_state['coach:state']`, geschreven via
`PUT /api/coach-state` (own-row read-modify-write, anon-RLS, server zet de
tijdstempels). Geen kolom, geen migratie: dezelfde jsonb die `welcome:guide`
en `coachmark:*` al dragen. De hook selecteert en stempelt **niets zolang hij
niet renderbaar is** (`paused` = overlay open ∨ immersieve route ∨ rondleiding
actief). Bestaande localStorage-keys worden bij de eerste mount eenmalig
geïmporteerd en gewist.

**4. Landing = homescherm; het startsignaal is een servervlag.** De onboarding
en de Vrijheidscheck-activatie navigeren hard naar `/dashboard`; de proxy
vertaalt dat naar `homeHrefFor(home_screen)`. In dezelfde update als
`onboarding_completed = true` komt `module_guide_state['rondleiding:pending']`.
Bewust géén query-parameter als eerste-start-signaal: die overleeft geen
reload mid-tour en lekt via bladwijzers. Een herstart vanaf een andere route
gebruikt wél `?rondleiding=start` (eenmalig gelezen, direct gestript).

**5. Het welkom is een rondleiding op /overzicht, met Fin als verteller.**
`ToekomstWelcome` is verwijderd; de tips-ballonnen op `/toekomst` blijven
(ze leggen dié grafiek uit). De rondleiding start automatisch alleen bij
`pending && !seen`, dus uitsluitend voor nieuwe accounts; bestaande accounts
starten hem zelf via de gidsweergave in Fin of de pagina-`i`. Status via de
bestaande coachmark-route (`overzicht-rondleiding`, met `outcome`
`voltooid` · `overgeslagen` · `onderbroken`). Belevingsregels:

- **Waarde vóór de vraag om tijd**: het welkom toont eerst een eigen getal
  (netto vermogen als vrijheidstijd), daarna pas "twee minuten".
- **Negen stappen desktop, acht mobiel, drie hoofdstukken** (je vier
  hefbomen · je stand · je gereedschap). Op mobiel is de nav-pill één element
  en dus één stap. Elke stap ≤ ~35 woorden: cijfer · oordeel · wat kun je hier.
- **Fin spreekt** (ik-vorm, `FinDots`-avatar, visuele taal van zijn
  meldkaart); de tour eindigt bij Fins eigen knop en draagt over aan de
  actielijst ("Begin met je eerste stap" opent de gids).
- **Overslaan is altijd één tik.** Het uitgelichte element blijft interactief;
  wegklikken naar een tegel beëindigt de tour als `onderbroken`.

**6. De spotlight claimt géén overlay-signaal.** De rondleiding rendert een
eigen scrim van vier panelen met een gat, in een portal op `z-[70]`, zonder
`acquireOverlay()` en zonder scroll-lock. Reden: het overlay-signaal verbergt
precies de nav-pill en de Fin-knop die de laatste stappen willen uitlichten.
Fin pauzeert daarom op een eigen rondleidingsignaal (`lib/rondleiding/signal.ts`),
niet op het overlay-signaal. Dit is een gemotiveerde uitzondering op de
ShellOverlay-driewegregel (ADR 0039); de allowlist-entry in
`scripts/check-overlay-standard.mjs` draagt die motivering. `data-tour`-
attributen zijn het target-contract tussen pagina, shell en tour; een
bron-test bewaakt dat elke selector bestaat.

## Gevolgen

- **Verwijderd**: `WelcomeGuideBanner`, `WelcomeGuideDot`, `ToekomstWelcome`,
  de dode routes `/api/welcome` en `/api/guide-progress`, de feature-visit-slug
  `horizon_welcome_shown`. Eén query minder op `/toekomst`.
- **Nieuw**: `/api/coach-state`, `lib/coach-state.ts`, `lib/rondleiding/*`,
  `components/app/chat/gids/*`, `components/overview/rondleiding/*`.
- **Geen migratie, geen RLS-wijziging.** Alle nieuwe per-gebruiker-state
  loopt over bestaande own-row jsonb-paden.
- **Egress**: actieve gids-gebruikers betalen de gids-seed nu per harde
  shell-render (~4 kleine queries) in plaats van per `/overzicht`-bezoek;
  afgesloten gids kost nul. De seed is zo oud als de laatste harde render;
  de gidsweergave ververst bij openen.
- **Bewuste beperkingen**: de `deferred`-laag blijft boven de gids
  (`deferred_assets` dupliceert `s1-bezittingen`); de rondleiding zegt "je"
  over perspectief-correcte cijfers en leunt bij een herstart in
  huishoud-/partnerperspectief op de bestaande `PerspectiveContextLabel`;
  een reload mid-tour start hem opnieuw (status wordt pas na afloop
  geschreven — dat is de definitie van "eenmalig"); de zes schrijvers op
  `module_guide_state` (coach-state, coachmark, welcome-guide, module-guide,
  save-own-data, check/activate) doen elk een niet-atomaire
  read-modify-write — overlappen twee schrijfacties (bv. het einde van de
  rondleiding en de eerste gids-bubbel), dan kan één sleutel verloren gaan.
  Gevolg is eigen-rij-state, geen lek; de structurele oplossing is één
  own-row merge-RPC (`module_guide_state || jsonb_build_object(key, value)`)
  en staat als nazorg. Bij een leesfout vóór de merge laten save-own-data en
  check/activate de kolom bewust ongemoeid (geen merge op een lege basis).
- **Afgevallen alternatieven**: badge op bubbel/icoon; prefix-routematching
  via `GUIDE_VISIT_ROUTES` (zou op `/overzicht` en `/toekomst` overal vuren);
  query-param als eerste-start-signaal; hergebruik van `hasSeenWelcome` voor
  de rondleiding; een tour-library (geen dependency, eigen designtaal).
- **Compliance-toets (5 sep 2026, `compliance-check`)**: de negen
  rondleidingskaarten en hun lege varianten in `lib/rondleiding/steps.ts` zijn
  **goedgekeurd** — elke kaart is een som op eigen data plus uitleg van wat
  het scherm doet; geen productaanbeveling, geen instructie om in te leggen of
  af te lossen, geen rendementsbelofte. De belastingkaart draagt in alle
  varianten "een indicatie, geen advies"; de grafiekkaart noemt de band als
  marge, niet als voorspelling. Vastgelegd hier omdat de Notion-database
  *Juridische toetsen* nog niet bestaat (eigenaarskaart van 5 aug 2026).
- **Verwant**: ADR 0026 (aanvulling 28 aug 2026 deels vervangen), ADR 0039
  (overlay-standaard, gemotiveerde uitzondering), ADR 0095 (geen extra
  tellers), ADR 0122 (server-side i.p.v. localStorage — dezelfde lijn).
