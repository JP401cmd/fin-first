---
id: 0128-partner-review-vlag-volgt-de-zichtbaarheid-van-de-boeking
title: Een "te bespreken"-vlag op een boeking volgt de zichtbaarheid van die boeking, en herhaalt de regel niet
status: aanvaard
date: 2026-09-03
elements: [as-huishouden, as-transacties, do-huishouden, do-transactie]
---

Partners kunnen een gedeelde boeking markeren als "te bespreken" (tabel `transaction_flags`, fase 1 van de partner-samenwerkingslaag). De vlag krijgt géén eigen zichtbaarheidsregel: elke RLS-policy op `transaction_flags` vraagt via een SECURITY INVOKER-helper of de aanroeper de onderliggende boeking zélf mag zien, en erft daarmee de SELECT-policy op `transactions` — inclusief `bank_accounts.partner_visibility` (ADR 0118). Markeren kan bovendien alleen op een gedeelde boeking op een rekening die op `full` staat. Vlaggen en notities blijven buiten de AI-context.

## Context

Het huishouden-fundament (drie perspectieven, `ownership` op acht tabellen, per-rekening zichtbaarheid) bestond al. De resterende Monarch-pariteit-gap was smal: partner-review-tagging op transacties, regel-automatisering van eigenaarschap en een gezamenlijk maandrapport. De eigenaar koos (03-09-2026) om klein te beginnen met fase 1 en legde vier keuzes vast: volgorde 1→2→3 (K1), een regel wint van de rekening maar de zichtbaarheid van de rekening wint altijd (K2), vlaggen buiten de AI-context (K3), en vlaggen hard gekoppeld aan `partner_visibility` (K4).

Het grootste risico dat de analyse benoemde: een vlag als **zijkanaal** dat het bestaan, het bedrag of de omschrijving van een verborgen boeking alsnog lekt. Een tweede exemplaar van de zichtbaarheidsregel in de policies van de vlag zou vandaag kloppen en morgen drift zijn — precies de faalklasse die ADR 0004 en ADR 0118 afwijzen.

## Besluit

1. **Zichtbaarheid wordt geërfd, niet herhaald.** `public.transaction_flag_transaction_visible(transaction_id)` is SECURITY INVOKER en doet niets anders dan `exists (select 1 from transactions where id = …)` onder de RLS van de aanroeper. De SELECT- en UPDATE-policies van `transaction_flags` eisen dat én `household_id = user_household_id()`. Wordt een rekening later van `full` naar `balance` gezet, dan verdwijnt de vlag voor de partner op hetzelfde moment als de boeking — op lees-tijd, zonder backfill.
2. **Schrijven is strenger dan lezen.** De INSERT-policy eist via `public.transaction_flaggable(transaction_id, household_id)` dat de boeking gedeeld is, in het eigen huishouden ligt én op een rekening met `partner_visibility = 'full'` staat. Een "te bespreken" die de ander nooit ziet is geen samenwerking.
3. **Eén vlag per boeking.** Afronden en heropenen zijn statuswissels op dezelfde rij (`unique (transaction_id)`); `resolved_by`/`resolved_at` worden door een trigger gestempeld, de sleutels (boeking, huishouden, melder, id, created_at) zijn onveranderlijk. Beide partners mogen de status omzetten; de **notitie** mag alleen de melder wijzigen (ze staat onder zijn naam — attributie, afgedwongen in de trigger). Heropenen zonder nieuwe notitie laat de oude staan. Alleen de melder mag zijn vlag intrekken (DELETE).
4. **Buiten de AI-context.** Notities kunnen PII bevatten en gaan niet naar briefing, chat of context-builders. Heroverwegen in een latere fase, niet stil.
5. **Datapad conform ADR 0058.** Lezen via de server-loader (`lib/household/transaction-flags.ts`) op de bestaande `PerspectiveContext`; muteren via `/api/transaction-flags` met zod + error-envelope (ADR 0044). Geen service-role. De loader degradeert bij een DB-fout (bv. code vóór migratie) naar `null` — de sectie verdwijnt, de transactiepagina blijft staan.

## Gevolgen

- Positief: nul duplicatie van de zichtbaarheidsregel; de leak-check voor de vlag is dezelfde als die voor de boeking. Een verse database (`db reset`) krijgt het volledige model uit de keten.
- Kosten: de helpers zijn correlated subqueries per rij; bij het verwachte aantal vlaggen per huishouden (tientallen, niet duizenden) is dat verwaarloosbaar. Verifieer met EXPLAIN bij de release.
- Bewuste rest: de melder blijft zijn eigen vlag zien op een boeking die hij zelf later voor de partner verbergt — dat is zijn eigen data, geen lek. De lijst toont niet wáárom een vlag voor de ander onzichtbaar is.
- Fase 2 (`ownership_rules`) en fase 3 (household-maandrapport) bouwen hierop voort en krijgen elk een eigen ADR; K2 (regel wint, zichtbaarheid wint altijd) is daarvoor al vastgelegd.
