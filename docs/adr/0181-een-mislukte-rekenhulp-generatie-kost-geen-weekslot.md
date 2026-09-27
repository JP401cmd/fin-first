---
id: 0181-een-mislukte-rekenhulp-generatie-kost-geen-weekslot
title: 'Een mislukte rekenhulp-generatie kost geen weekslot — lezen vooraf, reserveren ná succes'
status: aanvaard
date: 2026-09-27
elements: [t-supabase, t-aigateway]
---

# 0181 — Een mislukte rekenhulp-generatie kost geen weekslot

Addendum op ADR 0076 voor de weeklimiet van de AI-rekenhulp (10 generaties +
5 verfijningen per ISO-week). De reservering blijft atomair in de datalaag
(`reserve_ai_calculator_slot`), maar verhuist in de route van vóór naar ná de
LLM-aanroep. Vooraf leest de route alleen de stand.

## Context

`POST /api/ai/build-calculator` reserveerde het weekslot vóór `buildCalculator`.
De route documenteerde dat als bewuste keuze: een mislukte generatie telde mee,
"anders kan een gebruiker met een slechte prompt eindeloos retryen". In de
praktijk (kaart UR3-17 · R6, triage 7 sep 2026) betaalde de gebruiker daardoor
voor fouten die niet de zijne waren — een afgekapte modeloutput, een
contentfilter, een schema-mismatch — terwijl hij per week maar tien pogingen
heeft. Eigenaarsbesluit 9 (7 sep 2026): een mislukte generatie telt **niet**
mee; het quotum wordt pas verbruikt na een geslaagde generatie.

Daarnaast stuurde het 422-pad de generatiefout door zonder serverlog-tag en
schreef de route zijn foutvorm met de hand (`{ ok: false, error }`), naast de
platte envelope van ADR 0044.

## Besluit

1. **Lezen vooraf, reserveren ná succes.** De route leest eerst de weekstand
   via `getUsage` (`ai_calculator_week_usage`, een pure lezing met dezelfde
   weekgrens en plafonds als de reservering). Zit de gebruiker al aan de limiet
   van de gevraagde soort, dan is het een 429 zónder LLM-aanroep. Daarna volgt
   `buildCalculator`; pas bij `ok: true` reserveert `checkAndIncrement` atomair
   een tik. Bij `ok: false` gebeurt er niets met de teller.
2. **De reservering blijft de enige harde rem.** Tussen lezen en reserveren
   past een tweede verzoek van dezelfde gebruiker (twee generaties op 9 van
   10). De database weigert dan de tweede reservering en de route neemt die
   uitkomst onveranderd over: 429, de gegenereerde definitie wordt niet
   uitgeleverd. Dat kost in dat zeldzame geval één LLM-aanroep aan onze kant;
   de limiet zelf blijft door de route niet op te rekken (ADR 0076 ongewijzigd).
3. **Fail-closed aan beide kanten.** Kan de stand niet gelezen worden, of kan
   ná de generatie niet gereserveerd worden, dan is het een 500 via
   `serverError` — nooit een 429 die liegt, nooit een 200 die de rem gratis
   omzeilbaar maakt voor wie de database weet te laten hikken.
4. **Envelope en log.** Alle foutantwoorden gebruiken de platte
   `{ error, code? }`-vorm uit `lib/api/respond.ts`; het 422-pad logt met de
   tag `[build-calculator:POST]` zodat ook generatiefouten zonder exception
   (bv. onbekende formule-namen na een retry) server-side zichtbaar zijn. De
   gebruikerstekst zelf komt ongewijzigd uit `buildCalculator`, dat sinds
   V-002 al geen provider- of configdetails meer naar de client laat.

## Gevolgen

- Een gebruiker kan met een prompt die structureel faalt méér dan tien
  LLM-aanroepen per week veroorzaken. Dat is de bewuste prijs van het besluit.
  De bovengrens is het maand-creditbudget: de route had bij het schrijven van
  dit besluit géén creditgate (de security-gate van 0.92.12 vond dat), dus die
  is er in dezelfde release bij gekomen — `checkCreditBudget(…, 'report')`
  vóór de aanroep en `recordAiUsage` ná élke poging, ook een mislukte. Die
  gate leest eerst en boekt daarna, dus een parallelle burst begrenst hij net
  zo zwak als op de andere AI-routes. Wordt dit
  misbruikt, dan is een aparte pogingen-teller de volgende stap — niet het
  terugdraaien van dit besluit.
- Geen migratie: beide RPC's bestonden al (`20260803090000`). Een variant met
  "reserveren vooraf, teruggeven bij falen" is bewust niet gekozen: die vraagt
  een nieuwe release-RPC en daarmee een route die tot de migratie is toegepast
  op productie stukloopt.
- `components/future/rekenhulp-view.tsx` leest `data.ok` alleen als vlag voor
  het succespad (`{ ok: true, definition }`); de platte foutvorm valt daar in
  dezelfde tak als voorheen en `code` stuurt zoals eerder de upsell-affordance.
- UAT-criterium WF-REKEN-02 is aangepast: de 11e *geslaagde* generatie geeft
  429.
