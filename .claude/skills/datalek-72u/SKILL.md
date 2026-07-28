---
name: datalek-72u
description: Gebruik bij elk vermoeden van een datalek — een signaal dat persoonsgegevens gezien, gewijzigd of meegenomen kunnen zijn door iemand die dat niet mocht. Ingangen; een melding van buiten (support-mail), een incident uit het incidentprotocol, verdachte toegang in logs, of een kwijtgeraakt apparaat. Beoordeelt, damt in en meldt binnen 72 uur bij de AP; legt óók niet-gemelde lekken vast in het meldregister.
---

# Datalek — beoordelen, indammen, melden (72 uur)

**Eerste regel — de klok loopt al.** De meldplicht bij de Autoriteit Persoonsgegevens geldt binnen **72 uur na kennisname**, ongeacht of er een procedure is, het onderzoek af is, of het weekend is. Ligt er een signaal, noteer dan nu datum en tijdstip van kennisname — dat is t=0. Alles hieronder gebeurt binnen die 72 uur.

## De drie vragen, op volgorde

1. **Is er data gezien, gewijzigd of meegenomen die dat niet mocht?** Nee of niet uitsluitbaar? Behandel "niet uitsluitbaar" als **ja** tot het tegendeel vaststaat. Bepaal wélke gegevens: bij TriFinity zijn de gevoeligste `lead_intakes` (geboortedatum, inkomen, vermogen — publiek schrijfpad `/check`) en de financiële gebruikersdata in Supabase.
2. **Om wie gaat het?** Hoeveel betrokkenen, en welke categorieën gegevens? Dit bepaalt de ernst van de melding én of betrokkenen zelf geïnformeerd moeten worden.
3. **Is het gestopt?** Zo nee: **eerst indammen, dan pas verder onderzoeken.** Indam-opties op volgorde van zwaarte: sessie/key intrekken → RLS-policy of route dichtzetten → kill-switch → platform in onderhoudsmodus (`/beheer/platform`).

## De route

1. **Kennisname vastleggen** (tijdstip, signaalbron) — het meldregister-item begint hier.
2. **Beoordelen** met de drie vragen. Twijfel over de juridische weging → `legal-risk-assessment`-blik: risico voor betrokkenen, niet voor het bedrijf, is de maatstaf.
3. **Indammen** (vraag 3). Haast is de meest voorkomende reden dat een fix meer blootlegt dan het probleem — de leak-check geldt ook in de spoedroute.
4. **Melden bij de AP** — via het meldloket datalekken van de AP, binnen 72 uur na t=0. Gebruik het sjabloon hieronder. Een voorlopige melding (met "onderzoek loopt nog") is toegestaan en beter dan een te late volledige melding.
5. **Betrokkenen informeren** wanneer het lek waarschijnlijk een hoog risico voor hen oplevert (bij gelekte financiële gegevens: ga daar vanuit). Eerlijk en concreet: wat is er gebeurd, welke gegevens, wat doen wij, wat kun jij doen. Toon: `draft-response`, geen juridisch schild.
6. **Registreren** — altijd, ook als je ná beoordeling níét meldt (met de reden waarom niet). Een AVG-controle vraagt om dit register, niet om je goede bedoelingen.
7. **Nazorg** — postmortem via het incidentprotocol; structurele fix via de gewone pijplijn.

## AP-meldtekst — sjabloon (vooraf ingevuld klaarzetten)

- **Organisatie:** [BV-naam], verwerkingsverantwoordelijke; contact: Jp, [mail], [telefoon]
- **Wat is er gebeurd:** [aard van het lek — inzage/wijziging/verlies; welk systeem/pad]
- **Ontdekt op:** [t=0, datum + tijd] · **Gestart (vermoedelijk):** [datum]
- **Welke gegevens:** [categorieën — bv. NAW, geboortedatum, inkomens-/vermogensgegevens]
- **Hoeveel betrokkenen:** [aantal of schatting]
- **Genomen maatregelen:** [indamming + herstel]
- **Risico-inschatting voor betrokkenen:** [laag/hoog + waarom]
- **Betrokkenen geïnformeerd:** [ja/nee/gepland + hoe]

## Meldregister-item (ook bij niet melden)

`datum kennisname · signaalbron · wat · welke gegevens · hoeveel betrokkenen · gemeld ja/nee + reden · maatregelen · afgesloten op`

## Verwijzing

Stroom 13 (spoor 2) en stroom 12 in `trifinity-org/org_plan/30-werkstromen.md`. De verwante procedures: `incidentprotocol` (de tien-minuten-triage die hierheen kan vertakken) en `avg-verzoek` (spoor 1, de 30-dagenklok).
