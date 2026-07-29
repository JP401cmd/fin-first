---
id: 0067-vrijheidscheck-uitkomst-deelbaar-zonder-bedragen
title: 'De Vrijheidscheck-uitkomst wordt deelbaar — uitsluitend vrijheidstijd, nooit bedragen of invoer'
status: aanvaard
date: 2026-07-29
elements: [as-vrijheidscheck, sp-vrijheidscheck, b-bezoeker]
---

# 0067 — Deelbare uitkomst zonder bedragen

Org-besluit 08 (`trifinity-org/org_plan/60-besluiten.md`). Ontwerpbesluit vooraf,
zodat de bouw (nog niet gestart) binnen deze grens blijft.

## Context

De sterkste organische motor van een rekentool is dat mensen hun uitkomst delen.
Maar delen is iets publiceren over iemands geld — een privacy-ontwerpvraag, geen
marketingtruc. Zonder deelbaar resultaat hangt al het bereik op vindbaarheid en
betaalde kanalen (werkstroom 09).

## Besluit

De uitkomst van de Vrijheidscheck wordt **deelbaar in vrijheidstijd, en alléén in
vrijheidstijd**: "X jaar en Y maanden vrijheid". In het gedeelde beeld (afbeelding,
link-preview, tekst) staan **nooit** bedragen, percentages, of ingevoerde gegevens
(inkomen, vermogen, geboortejaar). Dat past één-op-één bij het kernprincipe *geld is
opgeslagen tijd*.

## Gevolgen

- **Harde grens voor de implementatie:** de deelfunctie krijgt uitsluitend de
  berekende vrijheidstijd als input — geen toegang tot de invoer of tussenstanden.
  Een gedeelde URL mag geen herleidbare parameters bevatten (geen inkomen in de
  querystring).
- De gedeelde pagina/afbeelding is publieke tekst en gaat dus langs
  `compliance-check` vóór livegang.
- Bouw is nog niet gepland; dit ADR is de grens waarbinnen de latere
  `new-feature`-pijplijn moet blijven. De werkqueue-kaart verwijst hiernaar.
