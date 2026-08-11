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

## Stand van de bouw (11 augustus 2026)

**Fase 1 gebouwd** — delen vanaf `/check/rapport`, als momentopname zonder opslag:

- `lib/check/share-freedom.ts` — `selectShareFreedom(report)` is de **enige**
  functie in het deelpad die het volledige rapport ziet en geeft twee gehele
  getallen terug (`{ years, months }`). Alles erna (tekst, beeld, knop, dialoog)
  werkt op dát object; een bedrag komt er niet in omdat het niet wordt
  meegegeven, niet omdat het wordt weggelaten.
- Gedeeld worden: een client-side op canvas getekende kaart (1200×630), een
  tekst met alleen de vrijheidstijd, en de link `<origin>/check` — parameterloos.
  De ontvanger doet de check zelf; er wordt niets opgeslagen en niets
  herbezoekbaar gemaakt (dataminimalisatie). `lead_intakes` blijft ongemoeid.
- De link-preview is die van de generieke `/check`-pagina en draagt dus per
  constructie geen persoonlijk gegeven; `/check/rapport` blijft `noindex`.
- Bewaakt door `lib/check/__tests__/share-freedom.test.ts`: die voert het
  volledige rapport in en eist dat in de complete deel-payload (tekst, klembord,
  link én elke string die op de afbeelding wordt getekend) geen `€`, geen `%` en
  geen andere cijferreeks staat dan de gedeelde jaren en maanden.

**Bewust niet gebouwd (zou buiten deze grens vallen en vraagt een eigen ADR):**
een server-gerenderde OG-afbeelding met de persoonlijke uitkomst, en een
persistente, herbezoekbare uitkomst-URL — beide vragen opslag of een
enumereerbare identifier.
