---
id: 0185-de-regelkalender-als-tweeling-van-de-fiscale-wijzigingslog
title: 'De regelkalender is de machineleesbare tweeling van de fiscale wijzigingslog'
status: voorgesteld
date: 2026-09-29
elements: [as-nieuws]
---

# 0185 — De regelkalender is de machineleesbare tweeling van de fiscale wijzigingslog

## Context

Na een week meten had geen enkele geduide Krant-duiding een rekenend mechanisme. Tarieven, grenzen en percentages staan zelden in een nieuwsbericht; ze staan in wetteksten, pdf's en sleuteltabellen. Besluit B34 (27 sep): rekenende berichten komen uit een gecureerde kalender van regelwijzigingen; het nieuws blijft de aanleiding en de link. Eigenaarsbesluit: alleen fase 1, geen migratie, en een agent vult geen 2027-getallen in.

## Besluit

- `lib/regelkalender.ts` draagt de kalender: per entry mechanisme (een van de vijf rekenende directe mechanismen uit `lib/krant/mechanismen.ts`), jaar, ingangsdatum, status (`voorstel` · `aangenomen` · `verwerkt`, het vocabulaire van `docs/fiscale-wijzigingslog.md`), de params in het **bestaande** params-schema van dat mechanisme, en de bron (uitgever, url, kamerstuk). Geen oude waarde (die is altijd de canonieke waarde van jaar − 1) en nul vrije lezerstekst.
- **Geen tweede kopie van tarieven, als test.** `bezwarenCanon` (puur) toetst: `verwerkt` ⇒ gelijk aan de canonieke tabel (via `DREMPELS`, `DUO_RENTE_PCT` per stelsel, `ZORG_EIGEN_RISICO`); `voorstel`/`aangenomen` ⇒ de tabel kent dat jaar nog niet; een gevulde param gelijk aan jaar − 1 is geen wijziging. `lib/regelkalender.test.ts` eist daarnaast dat elke entry met url of kamerstuk in de wijzigingslog staat.
- `REGELKALENDER` is leeg tot de eigenaar/Rekenmeester entries vastlegt via de skill `fiscale-wijzigingslog`.

## Bewust nog niet (vervolg op de kaart)

De adapter naar synthetische matcher-kandidaten, kop-sjablonen in de catalogus (met attest en compliance-check), de aanleiding-koppeling in de matcher en de Berekeningen-catalogus. Die raken bestanden waar de tijdlijnsessie (1C) aan werkt en volgen daarna. Open eigenaarsbesluit: AOW-verschuivingen worden vijf jaar vooruit vastgesteld en vallen nu buiten `JAAR_MAX` (2030).
