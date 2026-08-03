---
id: 0078-uitvoerkeuze-per-groep-lokaal-of-cloud
title: De gebruiker kiest per functionaliteitsgroep waar de AI draait
status: aanvaard
date: 2026-08-03
elements: [t-lokale-ai]
---

`profiles.privacy_mode` blijft de hoofdschakelaar, maar krijgt een override per
**uitvoergroep** (`profiles.ai_execution_prefs`). Alle zestien aanroepbare
AI-routes respecteren die keuze server-side; kan iets lokaal niet, dan wordt het
geblokkeerd met uitleg — nooit stilzwijgend alsnog via de cloud gedaan.

## Context

Privé-modus begon als scope A: één boolean die één route afsloot
(ADR 0043, transactiecategorisatie), later gegroeid naar twee (ADR 0055/0056,
chat). Dat was verdedigbaar zolang er twee lokale functies waren.

Inmiddels telt de app achttien AI-functies. Eén boolean kan hun verschillen niet
uitdrukken, terwijl die verschillen reëel zijn: transacties en gesprekken raken
de meest gevoelige gegevens, terwijl de nieuwseditie merkbaar beter is met het
sterke cloudmodel. "Alles of niets" dwingt de gebruiker tot een keuze die niet
bij zijn werkelijke afweging past.

Er waren bovendien twee structurele gaten. De veertien overige routes hadden
géén privé-gate: wie privé-modus aanzette, hield voor die functies gewoon
cloud-AI — zonder dat het scherm dat vertelde. En de statische controle die dat
had moeten opmerken (`hasPrivacyGateBeforeModelCall`) zocht `getModel(` in het
routebestand, terwijl die aanroep bij vijf routes in een lib zit. Voor die vijf
gaf de scan dus een groen licht dat niets bewees.

## Besluit

- **Zeven uitvoergroepen**, gecureerd in `lib/ai/execution-groups.ts`: gesprek,
  transacties, briefing, tips, rapporten, documenten, nieuws. De indeling volgt
  bewust de commerciële AI-lijst uit `lib/feature-registry.ts` — dat is de lijst
  die iemand koopt en al op `/mijn/account` ziet — plus één aparte groep voor
  documentinvoer, die commercieel onder `ai_analyse` valt maar qua
  privacy-afweging wezenlijk anders is.
- **De hoofdschakelaar is de default, de override wint**:
  `mode(groep) = prefs[groep] ?? (privacy_mode ? 'lokaal' : 'cloud')`. Een
  ongeldige waarde in de map wordt genegeerd en valt terug op de
  hoofdschakelaar — bij `privacy_mode = true` betekent onleesbare rommel dus
  'lokaal', de veilige kant op.
- **De server is de beslissende laag.** `assertCloudAllowed()`
  (`lib/ai/privacy-gate.ts`) geeft 403 `privacy_mode_active` vóór de tier-gate,
  de credit-gate en élke dataophaling. De client kiest óók, maar alleen de
  server kan garanderen dat er niets vertrekt.
- **Exhaustiviteit wordt afgedwongen door het type.** `FEATURE_GROUP` is
  compleet over `AiTokenFeature`; een nieuwe feature-string in
  `lib/ai/token-usage.ts` geeft een compile-fout tot hij is ingedeeld. Zonder
  die koppeling zou een nieuwe AI-functie stil buiten de keuze vallen.
- **Kan iets lokaal niet, dan blokkeren we het** — niet stil doorlaten. Dat
  geldt voor een gescande PDF (het lokale model heeft geen vision), voor het
  verfijnen van een rekenhulp (past niet in het contextvenster) en voor het
  publiceren van een rekenhulp (de Wft-poort vraagt een taaloordeel dat een
  2B-model niet betrouwbaar velt). Elke blokkade draagt een concrete melding en
  één klik naar de groepsinstelling.
- **Platform-taken staan buiten de keuze.** De nieuws-ingest draait als cron met
  de service-role, zonder browser en zonder sessie, en leest uitsluitend
  openbare bronnen. Zie ADR 0079.

## Gevolgen

- Migratie `20260803120000_add_profiles_ai_execution_prefs.sql` voegt één jsonb
  toe. Leeg = gedrag-behoudend voor elke bestaande rij; geen backfill.
- `PRIVACY_GATED_ROUTES` groeit van 2 naar 19 bindings (16 gated, 3 platform/
  admin-uitzonderingen met vastgelegde reden) en wordt afgeleid uit de registry
  in plaats van met de hand bijgehouden.
- De statische scan kent nu de route→lib-indirectie (`modelCallIn`) en maskeert
  commentaar en strings vóór de index-vergelijking — anders telde een
  toelichting die een functienaam noemt als de aanroep zelf.
- De belofte is smaller geworden in woorden en breder in feiten: waar het scherm
  eerst "transacties" beloofde en veertien andere functies zweeg, dekt de keuze
  nu alles wat de gebruiker aangaat.
- Prijs: elke nieuwe AI-route vraagt een regel in de registry en een gate. Dat
  is bewust wrijving — het is precies het moment waarop iemand moet nadenken
  over waar die gegevens heen gaan.
