---
name: legal-risk-assessment
description: Gebruik bij een juridisch randgeval waar geen bestaande poort of procedure een antwoord op geeft — een nieuwe claimcategorie, een escalatie waarin een gebruiker een verkeerd bedrag zag, een incident dat een datalek kán zijn, een verzoek dat verder gaat dan de standaardroute. Weegt kans maal gevolg, benoemt de terugvaloptie, en bepaalt of het zelf af te handelen is of naar een jurist moet.
---

# Legal-risk-assessment — risico wegen vóór het misgaat

**Eerste regel — de uitkomst is een bedrijfsbesluit, geen spec.** De weging landt als aantekening in **Notion** (bij het onderwerp waar hij over gaat: juridische toets, incident of AVG-register), niet als comment in code en niet als losse conclusie in een chat. Een risico dat nergens staat, is niet gewogen.

## Wanneer deze skill, en wanneer een andere

Deze skill is voor het **randgeval**. Bestaat er een procedure, dan gaat het daarheen:

| Situatie | Route |
|---|---|
| Publieke tekst, prompt-DNA of nieuwe claim vóór publicatie | `compliance-check` (de poort) |
| Vermoeden dat gegevens bij de verkeerde persoon terechtkwamen | `datalek-72u` (de 72-uursklok start meteen) |
| Inzage-, export-, verwijder- of correctieverzoek | `avg-verzoek` (de 30-dagenklok) |
| Storing zonder gegevensgevolg | `incidentprotocol` |
| **Geen van deze past, of ze spreken elkaar tegen** | **hier** |

## De weging

1. **Beschrijf het geval feitelijk.** Wat is er gebeurd of wat gaan we doen — zonder oordeel, zonder geruststelling.
2. **Kans × gevolg.** Hoe waarschijnlijk is het dat dit misgaat, en wat is dan de schade? Weeg alle drie: gebruiker (verlies, verkeerde beslissing op ons cijfer), toezichthouder (AFM bij de Wft-grens, AP bij persoonsgegevens), en vertrouwen.
3. **Benoem de terugvaloptie.** Wat doen we als het tóch misgaat, en hoe snel is dat terug te draaien? Onomkeerbaar weegt zwaarder dan onwenselijk.
4. **Kies:** doen · doen mét maatregel (welke, door wie, wanneer) · niet doen · jurist erbij.
5. **Leg vast in Notion**, mét de datum en de gekozen optie. Is het een besluit dat vaker terugkomt, meld het terug voor `60-besluiten.md`.

## De grens — hierboven gaat het naar een jurist

Niet zelf afwegen, maar voorleggen bij: een **nieuwe claimcategorie** die niet op de claimlijst staat, een **dreigend geschil** of aansprakelijkstelling, een **toezichthouder die contact opneemt**, en alles wat richting vergunningsplichtig advies beweegt. Bij aanhoudende twijfel wint hier hetzelfde principe als in de poort: **nee is het goedkope antwoord, ja is het dure.**

## Verwijzing

`org_plan/20-skills.md` §legal-risk-assessment; rol De Grenswachter (`org_plan/10-rollen.md`). Verwant: `compliance-check`, `juridische-brief` (het formaat waarin je de keuze voorlegt), `datalek-72u`, `incidentprotocol`, `avg-verzoek`.
