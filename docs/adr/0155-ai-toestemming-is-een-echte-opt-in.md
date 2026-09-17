---
id: 0155-ai-toestemming-is-een-echte-opt-in
title: 'AI-toestemming is een echte opt-in: gelogd, omkeerbaar, vóór het eerste cloud-contact'
status: aanvaard
date: 2026-09-17
elements: [t-aigateway, as-coach, sp-registreren]
---

# 0155 — AI-toestemming is een echte opt-in

Cloud-AI (Fin, briefing, nieuws, categorisatie, aanbevelingen, rapport-inleiding,
documentimport) draait uitsluitend na een **expliciete, gelogde en omkeerbare
keuze** van de gebruiker. Nieuwe accounts starten met `profiles.ai_enabled =
false`; de keuze is een eigen stap in de onboarding ("Fin en je gegevens", vóór
de eerste vraag), bestaande accounts krijgen dezelfde keuze éénmalig als
blokkerende overlay bij het eerstvolgende bezoek.

> **Bijgesteld door ADR 0157 (17 sep 2026).** Het keuzemoment is niet langer een
> onboardingstap maar de popup bij het eerste AI-gebruik; de blokkerende overlay
> geldt alleen nog voor accounts die de `ai`-add-on al hebben. De grondslag, het
> bewijs (`consent_events`) en de handhaving (`ai_enabled`) blijven ongewijzigd. Elke keuze — ook een latere
omkering op Mijn → Privacy — schrijft één rij in de append-only tabel
`consent_events` en stempelt `profiles.ai_consent_at` + `ai_consent_version`.
De handhaving is de bestaande server-side kill-switch (`lib/ai/privacy-gate.ts`),
die `ai_enabled` op elke AI-route leest.

## Context

- `/privacy` §3 zegt sinds versie 2.x: *"Toestemming (AVG art. 6 lid 1 sub a) —
  de AI-functies … opt-in en op elk moment uit te schakelen."* De code deed het
  omgekeerde: `ai_enabled` stond sinds migratie `20260307000002` standaard op
  `true`, 27 van 27 profielen stonden aan, er was geen keuzemoment en geen bewijs.
  Een schakelaar die standaard aanstaat is geen toestemming (art. 4 lid 11 en
  art. 7 lid 1 AVG; HvJ *Planet49*, C-673/17).
- ADR 0035 — waar het beta-plan (`org_plan/70-livegang.md`), de
  `onboarding-nl`-skill en het Verwerkersregister naar verwijzen als "het
  AI-privacyconsent" — regelt alleen sanitize-in/mask-out en de pensioen-PDF; en
  ook díe "consent" was een automatisch meegestuurd token met een `console.log`
  als bewijs.
- Het beta-plan noemt een AI-privacyconsent ná het welkom als voorwaarde voor
  golf 1. Zolang verklaring en gedrag elkaar tegenspraken kon de allowlist niet
  verantwoord open (kaart UR3-16).
- Sinds V-002 staat álle cloud-AI achter de AI-add-on (`checkTierGate('ai')`).
  Dat opende een tweede grondslag (uitvoering overeenkomst, art. 6 lid 1 sub b)
  voor wie het AI-abonnement afneemt — mits AI als geïsoleerd product wordt
  verkocht. Die route vraagt echter een herschreven §3 (Grenswachter) en botst
  met het bestaande lokale AI-pad, dat de noodzakelijkheidsclaim voor de
  cloudvariant ondergraaft.

## Besluit

1. **Toestemming is de grondslag** voor het cloudpad (optie A uit de juridische
   aantekening op kaart UR3-16). Dit is de enige optie waarbij verklaring,
   beta-plan, register en code hetzelfde zeggen én de juridische pagina's niet
   hoeven te wijzigen: §3 wordt hiermee wáár.
2. **Eén keuzemoment, drie hosts, één bron.** De feiten (wat gaat mee, wat wordt
   gemaskeerd, de lokale variant, omkeerbaarheid, wat vervalt) staan in
   `lib/ai/privacy-facts.ts` en worden door de onboarding-stap, de overlay én
   `/mijn/privacy` letterlijk gerenderd. Toestemming is toestemming voor wat
   dáár staat; `AI_CONSENT_VERSION` gaat omhoog bij een wezenlijke wijziging.
3. **Geen voorselectie, twee gelijkwaardige knoppen, "Verder" pas na een keuze.**
   Beide keuzes dragen keuze · effect · waarom. Wie nee zegt houdt overzicht,
   budget, toekomst, belasting, doelen en de rondleiding; Fin, briefing, nieuws,
   AI-analyses en de PDF-documentimport vervallen (de XML-/JSON-route blijft).
4. **Bewijs is append-only en eigen-rij.** `consent_events` heeft eigen-rij
   INSERT en SELECT, geen UPDATE/DELETE voor gebruikers, geen superadmin-pad;
   cascade bij accountverwijdering. Bij een data-reset blijft het bewijs staan
   (de keuze geldt voor het account, niet voor de cijfers).
5. **Eén schrijfroute**: `POST /api/consent/ai` (zod, error-envelope) — eerst het
   event, dan de profielrij. De toggle op `/mijn/privacy` gaat door dezelfde
   route en toont datum + versie van de keuze. De pensioen-PDF-toestemming gaat
   van `console.log` naar dezelfde tabel (`kind = 'pension_pdf'`).
6. **Bron van "is er al gekozen" is de server** (`ai_consent_at IS NULL`), nooit
   localStorage: een hersteld concept mag de stap niet stil overslaan, en wie
   dat toch doet vangt de overlay in de app-shell op.
7. **Bestaande accounts: pragmatisch, met einddatum.** Geen backfill naar
   `false`; AI blijft aan tot de overlay is beantwoord. Het zijn persoonlijk
   uitgenodigde testers; een stille breuk van hun lopende gebruik weegt zwaarder
   dan de paar dagen zonder vastgelegde keuze. Restrisico, eerlijk benoemd: de
   overlay is UI — de server-gate leest `ai_enabled`, niet `ai_consent_at`, dus
   wie de overlay omzeilt (devtools, directe aanroep met sessiecookie) gebruikt
   AI door zonder vastgelegde keuze. Dat is begrensd tot eigen interactief
   gebruik (geen server-side AI zonder bezoek: de mail-cron rendert een bevroren
   snapshot, news-ingest is platform-inhoud). Daarom een tijdvak: **14 dagen na
   uitrol** volgt de correctiemigratie `update public.profiles set ai_enabled =
   false where ai_consent_at is null` — wie dan nog niet koos, staat uit tot hij
   kiest.
9. **Een versiebump herbevraagt.** `AI_CONSENT_VERSION` omhoog = de overlay
   opent opnieuw voor iedereen met een oudere `ai_consent_version` (de layout
   vergelijkt beide). AI blijft in dat venster aan (zelfde afweging als 7);
   de nieuwe keuze overschrijft de stand.
10. **Geseede testaccounts zijn post-onboarding, dus mét keuze.** De persona-seed
   stempelt `ai_enabled = true` + `ai_consent_at` en schrijft een event met
   `source = 'seed'` — anders loopt elke UAT-/regressie-run tegen de vergrendelde
   overlay en 403 `ai_disabled`.
8. **De lokale variant is een nuance van "ja", geen derde keuze.** De
   kill-switch gaat vóór de plaatsingskeuze: "nee" betekent geen AI, ook niet
   on-device.

## Gevolgen

- Migratie `20260917130000_ai_consent_events.sql`: default-kanteling +
  NOT NULL, twee profielkolommen, bewijstabel. Uitrollen **vóór** de code; de
  shell heeft een vangrail (`Object.hasOwn(profile, 'ai_consent_at')`) zodat een
  verkeerde volgorde "nog geen vraag" oplevert en geen app-brede muur.
- Het bewijs zit in de AVG-zelfexport (`EXPORT_OWN_READ_EXTRA_TABLES`,
  `app/api/account/export`) en in `docs/avg-bewaartermijnen.md`.
- `/privacy`, `/voorwaarden`, `/wft`: **geen wijziging** in deze ronde. Twee
  precisies staan geparkeerd tot de ronde waarin de concept-banner eraf gaat
  (via Grenswachter + eigen aantekening): §3 "je geeft die toestemming bij het
  aanmaken van je account en trekt haar in op Mijn → Privacy" en §4 bij
  Anthropic "(alleen met jouw toestemming)".
- Buiten deze repo: het Verwerkersregister (Anthropic-rij: grondslag → ADR
  0155, DPA = Commercial Terms incl. SCC's, DPF-status controleren) en de
  verwijzingen naar "ADR 0035" in `trifinity-org/org_plan/70-livegang.md` en
  `20-skills.md` §onboarding-nl worden 0155.
- Open, bewust niet in dit besluit: AI-ingangen die `DashboardData.aiEnabled`
  consumeren zodat een weigeraar geen knoppen ziet die zich pas ná een klik
  uitleggen (vervolgkaart); partnergegevens in de AI-context onder het
  huishoudperspectief (toestemming van A dekt A's verwerking — weegt mee bij de
  huishoudkaarten); een expliciet akkoord-element vóór de PDF-upload naast de
  bestaande inline-uitleg; AI Act art. 50 (Fin wordt overal als AI gepresenteerd,
  geen extra actie).

## Alternatieven

- **B. Uitvoering overeenkomst (art. 6 lid 1 sub b) voor wie het AI-abonnement
  heeft.** Verdedigbaar voor een geïsoleerd AI-product, maar vraagt een
  herschreven §3/§5 en register (Grenswachter), botst met de marketing-bundel
  "Pro" op `/prijzen` en met het bestaande lokale pad (cloud is dan een
  kwaliteitskeuze, geen noodzaak). Verworpen voor nu; de bestandenlijst blijft
  identiek als de eigenaar later alsnog B kiest — alleen de trigger (voor
  iedereen → bij AI-activering) en de kopij verschuiven.
- **C. Gerechtvaardigd belang met opt-out.** Belangenafweging bij financiële
  gegevens naar een VS-partij staat zwak; verklaring moet om. Verworpen.
- **D. Niets doen.** Laat de verklaring onwaar en de beta-poort dicht. Verworpen.
