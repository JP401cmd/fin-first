---
id: 0134-een-aandachtsvrager-tegelijk
title: 'Eén aandachtsvrager tegelijk'
status: aanvaard
date: 2026-09-05
elements: [as-coach, sp-inzicht, app-comp]
---

# 0134 — Eén aandachtsvrager tegelijk

## Context

Een nieuwe gebruiker kreeg in zijn eerste minuut op `/overzicht` vier dingen
tegelijk: de rondleiding (die vanzelf start), de eenmalige uitleg bij de
euro-weergave, de maand-check-in-banner en Fins eerste tip. Uit het
UX-onderzoek van 5 september 2026: Sanne kreeg er drie over elkaar heen; Henk
zag zijn gezondheidsscore afgedekt door de banner én de rondleidingskaart; bij
Bas stond de euro-uitleg op **alle 55 desktoproutes** open, dekte daar het
Overzicht-submenu in de zijbalk af, en verdween niet nadat hij de knop had
gebruikt.

De app hád al precies één pauze-regel — de unie in `FinHome`: zwijg bij een
open overlay, een open chat, een immersieve route of een lopende rondleiding.
Die regel was alleen **lokaal aan dat ene component**. De coachmark en de
check-in-banner hadden elk hun eigen zichtbaarheidslogica en wisten van niets.

## Besluit

**1. Er is één gedeeld aandachtsregister.** `lib/attention-signal.ts` houdt bij
welke uitleglaag op dit moment de aandacht claimt (`rondleiding`,
`fin-melding`). Mechaniek gelijk aan `lib/overlay-signal.ts`: module-teller +
CustomEvent + `useSyncExternalStore`. De rondleiding claimt via het bestaande
`setRondleidingActive` (API ongewijzigd), Fin claimt zolang zijn meldkaart
zichtbaar is.

Bewust een register met **namen** en niet een unie-hook: een hook lost het op
voor de lagen die vandaag bestaan, een register ook voor de vierde laag die er
over een half jaar bijkomt. Die claimt een naam en doet automatisch mee.

**2. De unie zelf woont in één hook.** `lib/hooks/use-attention-quiet.ts`
combineert scroll-lock, overlay-signaal, open chat, immersieve route en het
register. `FinHome` consumeert 'm met `self: 'fin-melding'` (gedrag identiek aan
vóór dit besluit); nieuwe lagen lezen dezelfde hook in plaats van hun eigen
variant te bedenken.

**3. Wie alleen leest, staat onderaan.** De euro-coachmark claimt niets — hij
zwijgt zolang een ander spreekt. Zou hij wél claimen, dan hield een popover die
tot de eerste routewissel blijft staan Fin een hele pagina lang stil. De
rangorde is dus: rondleiding > Fin-melding > coachmark. Er is geen expliciete
prioriteitentabel; de volgorde ontstaat uit de timing die de lagen al hebben.

**4. Een uitleg hoort bij één moment.** De euro-coachmark sluit voortaan óók
wanneer de gebruiker de knop zelf gebruikt (de uitleg is dan begrepen) en bij de
**eerste routewissel ná het verschijnen**. Niet ná het aanvragen: wie 'm nooit
gezien heeft omdat de rondleiding liep, verliest zijn uitleg niet door één keer
weg te navigeren. Hij wordt bovendien alleen nog aangevraagd op ≥ 1024 px, waar
zijn host (de zijbalk) daadwerkelijk zichtbaar is.

**5. Een melding hoort bij één pagina.** Navigeert de gebruiker terwijl Fins
melding openstaat, dan sluit die melding (reden `auto`) in plaats van mee te
hoppen naar de volgende route. Voor een gidsbubbel betekent dat, net als bij de
bestaande auto-dismiss, alleen de dagstempel — de stap blijft open in de gids.

**6. In-flow banners gaten op TIJD, nooit op data.** De check-in-banner
verschijnt pas als het account bestond vóór de 1e van de huidige maand
(`profiles.created_at`, al geladen — geen extra query). Een gate als "pas als er
transacties zijn" zou functionaliteit verbergen op grond van iemands financiële
situatie, en dat sluit ADR 0001 uit. Is de aanmaakdatum onbekend, dan luidt het
antwoord "niet tonen" — onbekend wordt nooit stil "oud genoeg" (ADR 0131).

**7. Een uitgang benoemt zichzelf.** De tips-laag op `/toekomst` verbergt de
nav-pill volgens de overlay-conventie; dat blijft. Wat ontbrak was een vindbare
uitgang: de ✕ draagt nu het zichtbare label "Sluit tips".

## Gevolgen

- Nieuwe uitleglagen sluiten aan met twee regels: `claimAttention(<naam>)` in een
  effect, en `useAttentionQuiet()` lezen. Wie dat vergeet, herhaalt precies deze
  bevinding.
- In-flow blokken (de status-duiding boven de begroeting, de
  "gegevens verouderd"-melding) doen bewust **niet** mee in het register: ze
  verschuiven geen spotlight en dekken niets af. Hun rust komt van de
  tijd-/minimaliseer-regels, niet van de stilte-unie.
- De check-in-banner is nu volledig seed-gedreven; zijn client-fetch naar
  `/api/monthly-checkin` op mount is vervallen (de route blijft voor de flow
  zelf). De accountleeftijd is server-kennis en kan client-side niet worden
  afgeleid.
- Bewust NIET gedaan: de rustpauze na een gesloten melding verbreden van
  route-tips naar élke niet-gidslaag. Dat zou het H17-besluit omkeren terwijl de
  gemelde klacht al volledig door punt 5 wordt verholpen.
