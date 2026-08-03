---
id: 0079-nieuws-ingest-blijft-cloud-by-design
title: De nieuws-ingest blijft cloud, en is bewust geen gebruikerskeuze
status: aanvaard
date: 2026-08-03
elements: [t-lokale-ai]
---

De dagelijkse nieuws-ingest (`nieuws_ingest`) krijgt géén privé-gate en géén
schakelaar op `/mijn/privacy`. Hij staat in de registry als `scope: 'platform'`
met een vastgelegde reden, en wordt op het scherm als één uitleg-regel benoemd.

## Context

Bij het uitrollen van de per-groep uitvoerkeuze (ADR 0078) kregen alle
AI-functies een gate. De nieuws-ingest is de enige die er niet in past, en het
is de moeite waard om vast te leggen waaróm — anders wordt het later opnieuw
uitgezocht, of erger: alsnog "voor de consistentie" ingebouwd.

Drie feiten, elk op zichzelf al doorslaggevend:

1. **Er is geen browser.** De ingest draait als Vercel-cron (`0 5 * * *`) met de
   service-role-client, zonder gebruikerssessie. De lokale runtime bestaat
   uitsluitend in de browser: `@litert-lm/core` leunt op `caches`,
   `navigator.storage`, `Blob` en WebGPU, en de WASM wordt vanaf de eigen origin
   (`/litert-wasm`) aan een browser geserveerd. "Lokaal draaien" zou hier
   letterlijk betekenen: de cron afschaffen en afhankelijk worden van een
   beheerder die met een geschikte GPU achter een openstaand tabblad zit.
2. **Er is geen privacywinst.** De prompt bevat uitsluitend publieke RSS- en
   paginatekst — geen profiel, geen transacties, geen enkel gegeven van een
   gebruiker. Dat is ook precies waarom `lib/news-enrich.ts` op de
   sanitize-allowlist staat (ADR 0035). Een gate zou een gerustheid suggereren
   waar niets te beschermen valt.
3. **De uitkomst is gedeeld, niet persoonlijk.** De ingest schrijft naar de
   globale tabel `news_articles` voor álle gebruikers, met dedupe op `source_url`
   en een cap. Ingest vanaf één gebruikersapparaat zou dat toestel de gedeelde
   corpus laten publiceren — egress in de andere richting.

Daarbij komt de schaal: 26 webbronnen × ~2.000 prefill-tokens plus de
categorisatie van tientallen RSS-artikelen is vele minuten tot tientallen
minuten aaneengesloten GPU-werk per run. Onverenigbaar met een onbemande
dagelijkse taak.

## Besluit

- **`nieuws_ingest` krijgt scope `'platform'`** in `lib/ai/execution-groups.ts`,
  met `gated: false` en een expliciete `ongatedReden`. De uitzondering staat
  daarmee in dezelfde registry als de regel, en een test dwingt af dat elke
  ongegate binding een reden draagt.
- **Geen schakelaar op het privacy-scherm.** Per gebruiker "blokkeren" wat hun
  gegevens niet raakt is schijnveiligheid. In plaats daarvan staat er onder de
  groep Nieuws één uitleg-regel: het verzamelen van bronnen gebeurt centraal en
  verwerkt alleen openbare bronnen.
- **De persoonlijke nieuws*editie* is wél een keuze.** Die weegt bronartikelen
  tegen het financiële profiel van de gebruiker en valt onder de groep 'nieuws',
  met gate en al. De scheidslijn loopt dus precies waar hij hoort: bij de
  gegevens van de gebruiker.

## Gevolgen

- De handmatige beheerdersvariant (`app/api/admin/news-ingest/route.ts`) volgt
  dezelfde redenering en blijft ongegate; hij is beveiligd met `isSuperAdmin`.
- Wil iemand dit ooit tóch lokaal, dan is er precies één verdedigbare vorm: een
  client-side *her*categorisatie van reeds geïngeste artikelen voor één
  gebruiker, weggeschreven in diens eigen ruimte — nooit terug naar de gedeelde
  tabel. Dat is een andere functie dan de ingest en verdient een eigen besluit.
- Blijft staan als bekend gat, los van dit besluit: de cron kent alleen
  `CRON_SECRET` en logt tokenverbruik met `user_id null`. Dat is een
  governance-punt, geen privacy-punt, en verandert niet door lokalisering.
