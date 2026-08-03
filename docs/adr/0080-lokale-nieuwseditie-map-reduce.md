---
id: 0080-lokale-nieuwseditie-map-reduce
title: Lokale nieuwseditie draait map-reduce, niet één modelcall — server hervalideert
status: aanvaard
date: 2026-08-03
elements: [t-lokale-ai, as-nieuws]
---

De persoonlijke nieuwseditie kan on-device via de lokale AI-runtime worden
samengesteld, maar niet zoals het cloudpad dat doet. In plaats van één
`streamObject`-call over de hele set bronartikelen loopt de generatie
map-reduce: eerst een scoring-pass per artikel, dan een schrijf-pass voor
alleen de overlevers. De browser is daarbij de auteur van de editie; de server
hervalideert wat binnenkomt vóór het opslaan.

## Context

`app/api/news/route.ts` (cloudpad) doet één `streamObject` met `output:'array'`
over het volledige `newsItemSchema`: per bericht 11 velden — waaronder een
`sourceUrl`/`sourceName` die letterlijk uit de aangeleverde bronnen moet komen
— tegen 40 bronartikelen en een financieel profiel. Dat is ~5.800-7.400 tokens
in en ~1.400-1.600 uit: op of over het lokale venster van 8.192 (in + uit
samen) van Gemma 4 E2B. Ter vergelijking: de lokale chat draait op ~490 tokens
DNA plus een compact overzicht — een heel andere orde van grootte.

Eén grote lokale call proberen te knijpen in dat venster levert twee
onaanvaardbare risico's op: afkapping halverwege de editie (JSON-array die
nooit sluit) en een klein model dat URL's foutloos moet overtypen — precies de
hallucinatieklasse die de nummer-/bron-guards elders in de app juist proberen
te voorkomen.

## Besluit

- **Vier ingrepen, in volgorde van winst.** (1) `sourceUrl`, `sourceName`,
  `category`, `date` en `id` komen nooit uit het model — ze worden serverzijdig
  uit de bronrij gezet (`local-news-reconcile.ts`); het model schrijft alleen
  proza plus twee labels. (2) De server levert ~12-15 vooraf gescoorde,
  gededupliceerde bronartikelen (`selectSourceArticles`,
  `dedupeSimilarTitles`) in plaats van 40. (3) Twee passes, één artikel per
  call: pass A scoort (één regel uit), pass B schrijft alleen voor de 0-8
  overlevers (drie regels uit) — elke call blijft ~900-1.100 tokens in /
  ~200 uit, en een afkapping kost één bericht, niet de hele editie. (4) De
  begrenzing op 0-8 berichten wordt in code afgedwongen
  (`selectWinners`/`LOCAL_NEWS_MAX_ITEMS`), niet in de prompt.
- **Cijfer-guardrail, net als bij C2c (ADR 0061) asymmetrisch t.o.v. cloud.**
  `guardPersonalImpact` (`local-news-guard.ts`) verwerpt elk bedrag in de
  persoonlijke impactzin dat niet aantoonbaar uit het bronartikel of het
  gerenderde financiële overzicht komt — vergeleken op genormaliseerde
  numerieke waarde, niet op deelstring-match. Geen grondslag → de impactzin
  vervalt en het bericht degradeert naar `impactType:'relevant'`; het bericht
  zelf blijft staan.
- **Omgekeerde vertrouwensrelatie t.o.v. het cloudpad — de server blijft de
  beslissende laag.** Op het cloudpad genereert de server zelf. Hier is de
  browser de auteur: de client stuurt de samengestelde editie via
  `POST /api/local-news-edition`. `localNewsClientItemSchema` heeft daarom
  bewust géén veld voor `sourceUrl`/`sourceName`/`category`/`date` — een
  client kan ze niet meesturen, ook niet kwaadwillend, want er is geen sleutel
  om ze in te zetten. `reconcileLocalEdition` koppelt elk aangeleverd bericht
  aan zijn bronartikel via het id (geen match → weggegooid — dezelfde
  grondingseis als `filterGroundedItems` op het cloudpad, hier strenger: geen
  URL-match maar een echte bronrij), zet de vier serverside velden, klemt
  `impactScore` en kapt af op `LOCAL_NEWS_MAX_ITEMS`.
- **Geen privacy-gate-wijziging.** Dit besluit gaat over de vórm van de
  generatie, niet over wie 'm mag kiezen — dat blijft de bestaande
  uitvoergroep 'nieuws' uit ADR 0078; de ingest zelf blijft cloud-only
  (ADR 0079).

## Gevolgen

- Eén editie kost tot ~20 losse lokale generatie-calls (twaalf scoring, tot
  acht schrijven), twee tot vier minuten — vandaar het voortgangssignaal
  (`LocalNewsProgress`) en het per-bericht tussentijds bewaren (`onItem`): een
  gesloten tab mag geen halve editie laten verdampen.
- Dit is de derde functie op de lokale runtime (na categorisatie en chat) en
  verzwaart daarmee het bestaande aandachtspunt over de Early-Preview-status
  van `@litert-lm/core` (zie `fragiele-webgpu-lokaal-ai` in
  `lib/architecture/archimate-concerns.ts`) — maar de map-reduce-vorm beperkt
  de schade van een device-loss tot één artikel in plaats van de hele editie.
- `sanitizeForAI`/`maskPIIInOutput`/token-logging zijn hier net als bij de
  overige lokale paden N.V.T. (ADR 0043 §5): geen externe provider, geen
  egress, geen kosten.

### Bewust aanvaarde neveneffecten

Drie gevolgen zijn tijdens de review vastgesteld en bewust zo gelaten; ze staan
hier zodat ze een besluit zijn en geen bijvangst.

- **De weekteller van het cloudpad is pad-overstijgend.** `checkRefreshLimit`
  telt rijen in `news_editions` van de afgelopen zeven dagen, en elke lokale
  verversing archiveert daar óók een editie. Drie keer lokaal verversen zet de
  cloud-teller dus op nul, terwijl er geen enkel token is verbruikt. Wie daarna
  de groep 'nieuws' terugzet op cloud, krijgt "verversingslimiet bereikt". Dat
  is de verkeerde kant op, maar het scheiden van de tellers vraagt een
  kolom/vlag op `news_editions` — een migratie die buiten deze wijziging valt.
  Vastgelegd als opvolging, niet stilzwijgend geaccepteerd.
- **`markUsedArticles` matcht sinds de verhuizing op genormaliseerde URL's.**
  De functie stond eerder in `app/api/news/route.ts` en vergeleek exact; in
  `lib/news-edition-store.ts` gaan beide zijden door `normalizeUrl`. Dat is
  soepeler (een verschil in trailing slash markeert nu wél) en lijnt de functie
  op `filterGroundedItems`, die al normaliseerde. Het is dus een bewuste
  correctie van een latente inconsistentie — geen onbedoelde delta van de
  verhuizing.
- **De nummer-guard en de score-drempel draaien client-side.** De server is de
  beslissende laag over *herkomst* (bronvelden komen uit de bronrij) en
  *omvang* (clamp, ontdubbeling, 0-8-cap); de cijfercontrole op
  `personalImpact` en de `LOCAL_NEWS_MIN_SCORE`-drempel worden in de browser
  toegepast. Het risico is zelf-toegebracht — het gaat om de eigen editie op het
  eigen scherm — maar de server hérhaalt die twee controles niet, en dat is de
  precieze reikwijdte van "de server blijft de beslissende laag".
- **`potential_impact` verlaat de server.** `/api/local-news-sources` geeft
  TriFinity's eigen AI-impactanalyse per bronartikel aan de browser. Dat is
  nodig (grondslag voor de nummer-guard en input voor de scoring-pass) en bevat
  geen persoonsgegevens, maar het is interne redactionele metadata die tot nu
  toe server-side bleef en nu voor elke gebruiker met het 'ai'-abonnement
  leesbaar is.
