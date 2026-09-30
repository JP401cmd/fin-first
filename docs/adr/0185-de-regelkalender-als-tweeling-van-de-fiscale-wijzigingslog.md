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
- `REGELKALENDER` is leeg tot de eigenaar/Rekenmeester entries vastlegt via de skill `fiscale-wijzigingslog`. (Herzien 30 sep 2026, zie de aanvulling hieronder.)

## Bewust nog niet (vervolg op de kaart)

De adapter naar synthetische matcher-kandidaten, kop-sjablonen in de catalogus (met attest en compliance-check), de aanleiding-koppeling in de matcher en de Berekeningen-catalogus. Die raken bestanden waar de tijdlijnsessie (1C) aan werkt en volgen daarna. Open eigenaarsbesluit: AOW-verschuivingen worden vijf jaar vooruit vastgesteld en vallen nu buiten `JAAR_MAX` (2030).

## Aanvulling (30 sep 2026) — de kalender wordt gevuld

De eigenaar herziet het besluit van 27 sep: de kalender wordt gevuld met het **Belastingplan 2027**, status `voorstel`, uitsluitend met waarden die letterlijk in een officieel stuk op rijksfinancien.nl staan (twijfel = weglaten; geen afleiding, geen nieuwsbron). Gevuld:

- `box1-2027-belastingplan-2027` — memorie van toelichting, Tabel 1 (pdf-blz. 34): tarief schijf 1 36,23%, schijf 2 38,16%, grens schijf 1 € 39.247, algemene heffingskorting max € 3.154, arbeidskorting max € 5.929.
- `box3-2027-belastingplan-2027` — Fiscale sleuteltabel 2027: heffingsvrij vermogen € 60.098.

Bewust leeg: wat gelijk blijft aan 2026 (toptarief, grens schijf 2, box 3-tarief), wat niet in de stukken staat (heffingsvrij vermogen partners, box 3-forfaits, DUO-rente 2027), het eigen risico (raming € 400 in de begroting VWS, maar niet besloten) en de AOW-leeftijd (geen verschuiving in 2027). De canonieke tabellen blijven ongewijzigd; de koppeling aan de matcher en de sjablonen wachten op het attest van de eigenaar.
