---
name: juridische-brief
description: Gebruik wanneer een juridisch punt beslisbaar op papier moet — de verplichte wijzigingsaantekening bij /privacy, /voorwaarden of /wft, of elke keuze die de eigenaar moet maken zonder zelf jurist te worden. Levert één pagina met de vraag, de opties en het gevolg per optie, plus een aanbeveling.
---

# Juridische-brief — één pagina, beslisbaar

**Eerste regel — één pagina, en elke optie eindigt in een gevolg.** Een stuk zonder gevolg per optie is geen beslisstuk maar een samenvatting: de lezer kan er niets mee kiezen. Past het niet op één pagina, dan is de vraag nog niet scherp genoeg — knip 'm op in twee brieven.

*De naam is bewust `juridische-brief` en niet `brief`: het Nederlandse "brief" en het Engelse "brief" (= samenvatting) betekenen bijna het tegenovergestelde. Dit is het Nederlandse beslisstuk.*

## Wanneer verplicht

Bij elke wijziging aan `/privacy`, `/voorwaarden` of `/wft`. Die pagina's gaan **nooit** via `kleine-aanpassing` — hoe klein de tekstwijziging ook is — maar via de Grenswachter-route, mét deze aantekening. Die regel staat in `CLAUDE.md` (skill-routing, uitzondering juridische pagina's) en in de poort van `kleine-aanpassing` zelf. Verder: bij elke keuze die uit `legal-risk-assessment` komt en waar de eigenaar over moet beslissen.

## Het formaat

1. **De vraag** — één zin, beslisbaar geformuleerd. Niet "hoe zit het met X", wél "wijzigen we X naar Y, ja of nee".
2. **Wat er nu staat** — de feitelijke huidige tekst of situatie, letterlijk geciteerd waar het op de formulering aankomt.
3. **Waarom het wijzigt** — de aanleiding: nieuwe functionaliteit, nieuwe verwerker, gewijzigde wet, een geconstateerde onjuistheid.
4. **De opties, elk met zijn gevolg** — minstens twee, en niets-doen is er altijd één. Gevolg = wat de gebruiker merkt, wat het risico is, en wat het onomkeerbaar maakt of niet.
5. **Aanbeveling** — welke optie, en in één zin waarom.
6. **Wat er daarna moet gebeuren** — wie beslist, wat er verandert, en of gebruikers geïnformeerd moeten worden.

## Regels voor de tekst

- **Schrijf voor de eigenaar, niet voor een jurist.** Geen wetsartikel zonder uitleg in gewone taal erachter.
- **Noem de bron.** Verwijst de brief naar een claim, een ADR of een verwerker, zet de vindplaats erbij — een brief die je over een jaar niet kunt narekenen is waardeloos.
- **Geen verborgen aanname.** Weet je iets niet zeker, zet het als open punt in de brief in plaats van het glad te strijken.
- **Toon volgt de merkstem** (`merkstem`), ook hier: Nederlands, je/jij, kort en concreet.

## Waar hij landt

Als aantekening in **Notion** bij de betreffende toets of het besluit, en — als de brief een wijziging aan een juridische pagina begeleidt — als samenvatting in de PR die de tekst wijzigt. Eén pagina, twee vindplaatsen, geen derde kopie.

## Verwijzing

`org_plan/20-skills.md` §brief (daar nog onder de oude naam); rol De Grenswachter (`org_plan/10-rollen.md`). Verwant: `compliance-check`, `legal-risk-assessment`, `kleine-aanpassing` (de uitzonderingsroute), `avg-verzoek`, `merkstem`.
