---
id: 0069-callback-haalt-alleen-saldo-op
title: 'De bank-callback haalt nooit transacties op — alleen saldo, en dát maakt een verkeerde koppeling corrigeerbaar'
status: aanvaard
date: 2026-07-30
elements: [t-bankconnect, do-transactie, as-import]
---

# 0069 — De callback haalt alleen saldo op

Fase 5 van `specs/bank-connect-doelrekening/plan.md`, §0 ("harde regel die hierbij
hoort").

## Context

`GET /api/bank-connect/callback` legt de koppeling: hij bepaalt via de
precedentieketen (`external_account_id` → expliciete keuze → `iban_hash` →
aanmaken) wélke TriFinity-`bank_accounts`-rij de bankdata gaat dragen, en haalt
daarna het saldo op. Transacties komen pas met `POST /api/bank-connect/sync`, dat
de gebruiker zelf start.

Die precedentieketen kan bewust anders uitpakken dan de gebruiker in de wizard
aanwees: identiteit (`external_account_id`) wint altijd, want een herautorisatie —
elke 90 dagen — mag een bestaande koppeling niet verhangen. Er is dus een reëel
geval waarin de data ergens anders landt dan gekozen. Daarom is er een
correctiemoment op de success-pagina: per gekoppelde rekening staat er wélke
TriFinity-rekening hem draagt, met een actie om dat te verhuizen
(`POST /api/bank-connect/relink`).

Dat correctiemoment werkt alléén zolang er nog geen transacties zijn geïmporteerd.
Her-attributie van al geïmporteerde transacties staat expliciet buiten scope
(restrisico 5 in het plan): verhangen verplaatst de koppeling, niet de historie.

## Besluit

**De callback importeert nooit transacties.** Hij schrijft de koppeling en het
saldo, en niets meer. Dit is geen "nog niet af" en geen luiheid, maar de
voorwaarde waaronder een verkeerd gelande koppeling gratis te corrigeren is.

De regel staat als comment bij de code (bovenaan
`app/api/bank-connect/callback/route.ts`), niet alleen in dit document: wie de
route leest om er een transactie-ophaal aan toe te voegen, moet de reden zien
zonder eerst de ADR-map te doorzoeken.

## Gevolgen

- Een "handige" optimalisatie die hier transacties gaat ophalen om de eerste sync
  te versnellen, **sloopt het correctiemoment** — dan bestaat er geen venster meer
  waarin verhangen zonder gegevensverlies kan. Wie die stap wil zetten, moet eerst
  her-attributie bouwen (transacties meeverhuizen) of het correctiemoment
  vervangen door een expliciete, blokkerende bevestiging vóór de eerste ophaal.
- De eerste ophaal blijft daarmee een gebruikershandeling, met de voortgangs- en
  afkapmelding uit ADR 0072 (B8/B9, maximale historie in blokken).
- Het correctiemoment verbergt zijn actie zodra er is gesynchroniseerd, met de
  reden erbij. Een uitgelegde grens is beter dan een knop die stil iets halfs doet.
- `POST /api/bank-connect/relink` nult `sync_cursor`: die cursor was een uitspraak
  over de vórige rekening. De sync-route bepaalt het startpunt daarna opnieuw via
  `planInitialFetch`, op de historie van de nieuwe doelrekening.
