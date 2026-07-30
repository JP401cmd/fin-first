---
id: 0072-omvang-van-de-eerste-ophaal
title: 'Omvang van de eerste ophaal — maximale historie in blokken, bank-eigen limiet kapt af'
status: aanvaard
date: 2026-07-29
elements: [t-bankconnect, do-transactie]
---

# 0072 — Omvang van de eerste ophaal

Fase 1 van `specs/bank-connect-doelrekening/plan.md` (§6), besluiten B8/B9.

## Context

Een nieuwe TrueLayer-koppeling deed tot fase 1 altijd hetzelfde: ophalen zonder
expliciete `from`. TrueLayer valt dan terug op zijn eigen standaard van ~88
dagen. Een meting op een live Rabobank-koppeling liet zien dat dat een fractie
is van wat beschikbaar is: met een expliciete begindatum leverde dezelfde
rekening 355 transacties (88 dgn), 747 (7 mnd), 1.355 (13 mnd) en 3.086 (19
mnd) — waarna de bank zelf een HTTP 429 met
`{"error":"provider_request_limit_exceeded"}` teruggaf. Die limiet staat los
van TrueLayers eigen limiet en los van onze app-rem van 10 synchronisaties per
dag; hij is per bank anders en ongedocumenteerd.

Het koppelmoment is het enige moment waarop de gebruiker sowieso op de sync
wacht. Later alsnog verder terughalen kost extra verzoeken tegen diezelfde
onbekende bank-limiet, voor data die er dan al even niet was.

## Besluit

**B8 — lege doelrekening: maximale historie, in blokken.** Zonder bestaande
transacties op de gekoppelde rekening haalt de eerste sync zo ver mogelijk
terug: blokken van 6 maanden, tot een plafond van 24 maanden, **nieuwste blok
eerst**. Die volgorde is functioneel — kapt de bank-eigen limiet de lus af
(zoals gemeten), dan houdt de gebruiker de meest recente en meest relevante
historie over, niet de oudste. Zes maanden per blok is een compromis: klein
genoeg dat een limiet halverwege niet in één keer een heel jaar meesleurt,
groot genoeg dat een volledige terugblik (24 maanden) binnen een handvol
verzoeken (4) past.

**B9 — doelrekening mét historie: starten bij nieuwste bestaande transactie
−3 dagen, geen blok-lus.** Staat er al iets op de rekening, dan is er niets
terug te halen; elk extra verzoek telt tegen de bank-eigen limiet zonder
nieuwe data op te leveren. De marge van 3 dagen vangt naboekingen met
terugwerkende datum op en ligt bewust boven de ±1-dagstolerantie van de
cross-bron-dedup (fase 2).

**Gaten vóór de bestaande historie worden bewust NIET gevuld.** Dit is het
punt dat een jaar later als een vreemde beperking gelezen kan worden en
weggeoptimaliseerd — vandaar de motivatie hier, niet alleen in code-comments:
een blok-lus die ooit start bij "de oudste ontbrekende dag" in plaats van bij
de nieuwste bestaande transactie zou op een actieve rekening voortdurend
opnieuw tegen de bank-limiet oplopen, voor historie die de gebruiker al lang
niet meer nodig heeft. De aangewezen route voor een gat is een CSV-import op
diezelfde rekening (B7/fase 3) — een eenmalige, gerichte actie van de
gebruiker in plaats van een automatisch heropgestarte blok-lus bij elke sync.

**De bank-eigen verzoeklimiet kapt af, faalt niet.** Loopt de blok-lus tegen
`provider_request_limit_exceeded` (429) aan, dan stopt de route, behoudt wat
al is opgehaald, schrijft dat weg, en logt de sync als `status: 'partial'` in
plaats van als fout. Een afgekapte historie is een resultaat; een weggegooide
ophaal is dataverlies.

**Eigenaarsbesluit 29-07-2026 — de eerste ophaal telt als één
synchronisatie.** Ook al doet de blok-lus tot vier provider-verzoeken, de
app-rem van 10/dag (`bank_connection_accounts.daily_requests`) telt de hele
eerste ophaal als 1. Het is één gebruikershandeling; de rem die er werkelijk
toe doet is de bank-eigen limiet, die hierboven al wordt afgevangen.
Voorwaarde bij dit besluit: het werkelijke aantal HTTP-verzoeken blijft
observeerbaar via de nieuwe, additieve kolom `bank_sync_log.provider_requests`
(migratie `20260729182316_bank_sync_log_provider_requests.sql`, toegepast op
remote) — zonder die kolom zou "één synchronisatie" een gok worden in plaats
van een meetbare keuze.

## Gevolgen

- `lib/truelayer/initial-fetch.ts` (`planInitialFetch`) is de enige plek waar
  de marge (3 dagen), de blokgrootte (6 maanden) en de maximale terugblik (24
  maanden) staan; `app/api/bank-connect/sync/route.ts` consumeert het plan en
  herdefinieert het startpunt niet.
- `lib/truelayer/errors.ts` (`TrueLayerProviderLimitError`,
  `isProviderLimitError`) draagt de providerfoutcode door zodat de sync-route
  kan onderscheiden tussen "onze 429" en "de bank-eigen 429".
- `bank_sync_log.status` kent nu `'partial'` naast `'success'`/`'error'`/
  `'rate_limited'`; een stil weggevallen afkapping was voorheen onzichtbaar.
- Herzieningsmoment: als een toekomstige provider-wissel of bank-limiet-meting
  laat zien dat blokken van 6 maanden of het plafond van 24 maanden niet meer
  passend zijn, wijzigt dat in `initial-fetch.ts` — niet in de route.
