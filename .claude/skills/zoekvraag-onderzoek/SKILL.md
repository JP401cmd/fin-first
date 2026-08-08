---
name: zoekvraag-onderzoek
description: Gebruik vóórdat je besluit waaróver een publieke pagina, een /nieuws-item of een FAQ-antwoord gaat — de onderzoeksstap vóór seo-pagina. Zoekt uit welke vragen Nederlanders werkelijk stellen over vermogen en FIRE, en welke daarvan wij binnen de Wft-grens mogen beantwoorden. Ook te gebruiken als periodieke ronde om het vragenregister bij te werken.
---

# Zoekvraag-onderzoek — welke vragen zijn van ons

**Eerste regel — de tweede filter hoort het méeste weg te strepen.** Streept hij weinig weg, dan heb je hem niet streng genoeg toegepast. Dat is geen verlies: juist doordat er zoveel afvalt, zijn de overgebleven vragen wél van ons.

**Tweede regel — dit is niet de plek waar de Wft-grens gedefinieerd wordt.** De grens en de claimlijst staan in `.claude/skills/compliance-check/SKILL.md`. Hier passen we ze alleen toe op *onderwerpkeuze*. Nooit een tweede grens opschrijven.

## Twee filters over elkaar

**Filter 1 — wordt de vraag gesteld, en wordt hij nu slecht beantwoord?**
Een vraag die niemand stelt is geen kans. Een vraag die al goed beantwoord wordt evenmin: daar voeg je niets toe. Wat je zoekt is de overlap — veel gesteld, slecht bediend.

**Filter 2 — mogen wij hem beantwoorden?**
Toegepast op het onderwerp, niet op de tekst. Het klassieke onderscheid:

- *"Hoeveel heb ik nodig om te kunnen stoppen?"* → **inzicht**. Van ons.
- *"Waar moet ik het inleggen?"* → **advies**. Niet van ons, hoe goed hij ook scoort.

Een vraag die alleen te beantwoorden is met een productkeuze, een rendementsverwachting of een "wat moet ik doen" valt af. Twijfelgeval? Dan is dat precies waarvoor `compliance-check` bestaat — maar gebruik die poort voor de randgevallen, niet voor de hele lijst. Dit is de goedkope eerste filter.

## Waar je kijkt

Echte vragen, geen bedachte zoekwoorden: binnengekomen support-mail en `/contact`, de bestaande FAQ (`components/landing/faq-data.ts`) en wat daar juist níét in staat, Nederlandstalige fora en communities over FIRE en vermogen, en de zoeksuggesties die mensen zelf intypen. Let op de taal die zíj gebruiken — niet de onze.

## De uitkomst — het register

Elke ronde werkt `docs/zoekvragen.md` bij. Per vraag: **de vraag** (in de woorden van de vrager, niet in jargon) · **waarom hij nu slecht beantwoord wordt** (één zin — anders is het geen kans) · **het oordeel** `inzicht` · `advies` · `afgewezen` (+ reden) · **de bestaande pagina** (link, of leeg).

**`advies` en `afgewezen` blijven in het register staan.** Anders onderzoekt iemand over een half jaar dezelfde vraag opnieuw en komt tot dezelfde conclusie. Het register is óók een lijst van wat we bewust niet doen.

## Daarna

Een vraag met oordeel `inzicht` en zonder bestaande pagina is de invoer voor **`seo-pagina`** — die skill regelt de rest: de volgorde, de drie harde grenzen (route naar `/check`, de compliance-poort, geen contact-belofte tot F1) en de sitemap-registratie. Zet de nieuwe pagina daarna terug in de kolom *Bestaande pagina*.

Het register voedt meer dan SEO alleen: `/nieuws`, de FAQ en concurrentie-onderzoek putten uit dezelfde lijst.

## Verwijzing

`org_plan/20-skills.md` §zoekvraag-onderzoek; rollen De Wegwijzer en De Grenswachter (`org_plan/10-rollen.md`), stroom 09. Verwant: `seo-pagina`, `compliance-check`, `merkstem` (de toon van wat je uiteindelijk schrijft), `juridische-brief`.
