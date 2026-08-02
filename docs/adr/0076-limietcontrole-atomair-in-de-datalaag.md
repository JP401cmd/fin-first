---
id: 0076-limietcontrole-atomair-in-de-datalaag
title: 'Een limiet die tegen een externe partij beschermt, wordt atomair in de datalaag afgedwongen — niet met lezen-controleren-schrijven in een route'
status: aanvaard
date: 2026-08-02
elements: [t-supabase, t-bankconnect]
---

# 0076 — Limietcontrole atomair in de datalaag

Zusje van ADR 0075 ("een invariant over een kolomwaarde hoort in de datalaag").
Daar ging het over *wélke waarde* mag; hier over *wanneer* een controle geldig
is. Aanleiding: restrisico SC-26 uit `specs/bank-connect-doelrekening/scenarios.md`.

## Context

De bankkoppeling remt zichzelf af op **10 synchronisaties per dag per
rekening**. Die rem stond tot 2 augustus 2026 in applicatiecode, in drie losse
stappen:

1. `SELECT daily_requests` op `bank_connection_accounts`;
2. `if (daily_requests >= 10) → 429`;
3. `UPDATE set daily_requests = <gelezen waarde> + 1`.

Tussen stap 1 en stap 3 past een volledig tweede verzoek. Twee gelijktijdige
syncs — twee tabbladen, een dubbelklik, een herhaling na een timeout — lezen
dezelfde stand, concluderen allebei dat er ruimte is, en overschrijven elkaars
ophoging. Netto: twee syncs, teller +1. De limiet was geen limiet maar een
suggestie.

Wat dat duur maakt is niet onze eigen rem maar wat erachter zit. De
bank-eigen verzoeklimiet is veel strenger en straft veel harder: Rabobank
antwoordde `provider_request_limit_exceeded` (429) al na een handvol
historische ophaalvragen en blokkeert de rekening dan voor langere tijd. Sinds
de eerste ophaal in blokken werkt kost **één** sync tot vijf provider-verzoeken
(ADR 0072). Elke sync die stil langs de teller glipt is dus geen verzoek te
veel, maar vijf — en onze teller is precies de bescherming die dat moet
voorkomen.

Bijvangst bij het dichten: de dagsleutel werd berekend met
`new Date().toISOString()`, dus in **UTC**. Voor een Nederlandse gebruiker
rolde de teller daardoor niet om middernacht maar om 02:00 (zomertijd) of 01:00
(wintertijd).

## Besluit

**Een limiet die ons tegen een externe partij beschermt, wordt afgedwongen in
één ondeelbare database-operatie — controle en ophoging in hetzelfde statement,
nooit als lezen-controleren-schrijven in applicatiecode.**

De vorm hier: een `security definer`-RPC `public.reserve_bank_sync_slot()` met
één `UPDATE … WHERE (… or daily_requests < limiet) … RETURNING`
(`supabase/migrations/20260802140500_bank_sync_atomic_daily_limit_rpc.sql`).
Postgres neemt een rijvergrendeling; een tweede sessie wacht op de commit van
de eerste en her-evalueert daarna (READ COMMITTED/EvalPlanQual) zowel de
`where`-voorwaarde als de `set`-expressie tegen de nieuwe rijversie. Omdat de
limiet ín die `where` staat, ziet de tweede sessie de opgehoogde stand en werkt
0 rijen bij. Er bestaat geen moment tussen "gelezen" en "geschreven".

Drie regels die daarbij horen:

- **De limiet is geen parameter van de RPC.** Zou hij dat zijn, dan kan iedere
  ingelogde gebruiker de functie rechtstreeks via PostgREST aanroepen met
  `p_limit = 999999`. Een rem die ons tegen de bank beschermt hoort niet in
  handen van de aanroeper. De waarde komt wél terug (`slot_limit`), zodat route
  en UI hem tonen zonder hem te herhalen.
- **De dagrolgrens wordt in de database bepaald, in `Europe/Amsterdam`.** Niet
  in de route: die draait op een lambda waarvan de tijdzone niet vaststaat, en
  UTC geeft een Nederlandse gebruiker een omslag om 01:00/02:00. Oppervlakken
  die de teller alleen *tonen* (de rekeningkaart) vergelijken met dezelfde
  tijdzone, zodat ze niet vroeger vrijgeven dan de server toestaat.
- **Reserveren gebeurt vóór het eerste verzoek aan de provider**, inclusief het
  token-ververs-pad. Prijs: een sync die daarna alsnog stukloopt kost tóch een
  tik. Dat is bewust — een mislukte poging die gratis is maakt herhalen gratis,
  terwijl de verzoeken bij de bank wél zijn binnengekomen.

## Alternatieven

- **`select … for update` gevolgd door een `update` in dezelfde transactie** —
  correct, maar niet beschikbaar: de Supabase-JS-client heeft geen
  transactiegrens over meerdere PostgREST-aanroepen. Een RPC ís die transactie.
- **Een advisory lock rond de route** — verworpen: dat is een tweede
  vergrendelingsmechanisme naast de rij die we tóch al schrijven, met een eigen
  faalmodus (lock lekt bij een timeout) en zonder de dagrol te regelen.
- **De controle in de route laten en op de bank-429 vertrouwen** — verworpen:
  dat is precies de straf die de rem hoort te voorkomen, en de rekening ligt er
  daarna langere tijd uit.
- **`daily_requests` naar een `check`-constraint** — kan niet: een constraint
  kent de dagsleutel-rol niet en zou een geweigerde sync een
  constraint-violation maken in plaats van een nette 429.

## Gevolgen

- `app/api/bank-connect/sync/route.ts` schrijft `daily_requests` en
  `rate_limit_reset_date` niet meer; die kolommen zijn exclusief van de RPC.
  Vastgelegd in de kolom-comments en bewaakt door de routetests.
- De limietwaarde (10) staat nu in de database. Wie hem wil wijzigen doet dat
  in een nieuwe migratie, niet in TypeScript; de 429-tekst interpoleert
  `slot_limit` en blijft daardoor vanzelf kloppen.
- **Uitrol-randgeval, eenmalig:** bestaande rijen dragen nog een UTC-dagsleutel.
  Tussen 00:00 en 02:00 Nederlandse tijd verschilt die één dag van de nieuwe
  sleutel, waardoor de teller daar één keer vroeg terugvalt naar 0. Dat is de
  coulante kant; onterecht blokkeren kan niet gebeuren.
- **Het niveau van de teller is expliciet geverifieerd** en hoort dat bij elke
  volgende limiet ook te zijn: de teller staat per gekoppelde bankrekening
  (`bank_connection_accounts`), niet per gebruiker of per toestemming, en twee
  unieke indexen uit `20260729234928` houden dat niveau op zijn plek.
- Dezelfde read-then-write staat nog in de **weeklimiet van de rekenmachine**
  (`lib/calculator/rate-limit.ts` + `ai_calculator_usage`). Die rem beschermt
  tegen AI-kosten, niet tegen een externe blokkade, dus de urgentie is lager —
  maar hij valt onder hetzelfde besluit en hoort bij de eerstvolgende
  aanraking op dezelfde vorm te komen.
