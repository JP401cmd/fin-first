---
id: 0068-leads-bewust-niet-opvolgen-tot-f1
title: 'Vrijheidscheck-leads worden bewust níet opgevolgd tot F1 — verdamping is een keuze, geen lek'
status: aanvaard
date: 2026-07-29
elements: [do-lead, as-vrijheidscheck, b-bezoeker]
---

# 0068 — Leads bewust niet opvolgen tot F1

Org-besluit 09 (`trifinity-org/org_plan/60-besluiten.md`), het blokkerende
grondslag-besluit van werkstroom 10.

## Context

`/check` schrijft leads naar `lead_intakes` met een TTL van 90 dagen (ADR 0022).
Een opvolgmail is géén transactionele mail, dus Resend (uitsluitend transactioneel)
mag er niet voor worden gebruikt, en er ís geen andere grondslag of kanaal. Zonder
besluit verdampte elke lead stilzwijgend — een lek in plaats van een keuze.

## Besluit

Tot **F1** (signup-allowlist gaat open, ADR 0047) worden Vrijheidscheck-leads
**bewust niet opgevolgd**. Er wordt geen opt-in-checkbox gebouwd, geen
mailingplatform toegevoegd en geen verwerker geregistreerd. De 90-dagen-verdamping
uit ADR 0022 is daarmee gewild gedrag: dataminimalisatie als feature.

Bij F1 wordt dit besluit herzien; opt-in bij `/check` is dan de eerst te overwegen
route (grondslag = toestemming).

## Gevolgen

- Werkstroom 10 (lead-opvolging) blijft bewust stil; de skill `lead-opvolging`
  blijft een voorstel tot F1.
- `lead_intakes` behoudt zijn enige functie: de Vrijheidscheck zelf laten rekenen
  en de geaggregeerde herkomststatistiek — geen individuele benadering.
- Nieuwe SEO-pagina's mogen naar `/check` verwijzen; ze wekken geen
  opvolg-verwachting ("we nemen contact op" mag nergens staan zolang dit ADR geldt).
- Herzieningsmoment is expliciet: F1. De werkqueue-kaart met target F1 bewaakt dat.
