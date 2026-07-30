---
id: 0074-importpad-via-server-route
title: 'Importpad voor gekoppelde rekeningen via een server-route — parsen client-side, opslaan + dedup server-side'
status: aanvaard
date: 2026-07-29
elements: [t-bankimport, do-transactie]
---

# 0074 — Importpad via een server-route

Fase 3 van `specs/bank-connect-doelrekening/plan.md` (§6, besluit B7). Nummer
0073 was al vergeven aan een parallelle ADR (`grondslag-in-de-veldnaam`) tegen
de tijd dat dit document werd geschreven; dit is het eerstvolgende vrije
nummer.

## Context

Vóór dit besluit importeerde elke CSV/MT940/OFX-upload client-side: parsen
(`lib/parsers/*`) én opslaan liepen allebei in de browser, met een eigen,
zwakkere soft-dedup-check (`contentKey = date|amount|description.slice(0,100)`,
die `bank_seq` negeert — zie restrisico's) los van de sync-route se
`rowDedupKey` (`import_hash|bank_seq`). Voor een gekoppelde rekening ontstond
daarmee een tweede schrijver naast de bank-sync, met een andere sleutel-
discrepantie: import vergelijkt op `import_hash|bank_seq`, de sync-route
vergelijkt alleen op `import_hash`. Dat is precies de plek waar een cross-bron-duplicaat kon
glippen zonder dat één van beide paden het zag. `lib/architecture/
integrations-model.ts` verwees bovendien al naar `/api/transactions/import`
voor mt940/ofx/csv — een route die nog niet bestond.

## Besluit

**`POST /api/transactions/import` — parsen blijft client-side, opslaan +
dedup gaan server-side, met dezelfde module als de sync-route.** De
bestandsformaten, de kolomherkenning en de voorvertoning veranderen niet:
alleen het schrijfmoment verhuist.

**Verplicht voor gekoppelde rekeningen; losse rekeningen houden voorlopig het
bestaande clientpad.** Dit maakt "één schrijver per gekoppelde rekening" waar
— de bank-sync en een CSV-import op dezelfde rekening schrijven voortaan via
hetzelfde server-side pad en dezelfde dedup-module
(`lib/parsers/cross-source-dedup.ts`, ADR 0070).

**De route vertrouwt de client niet.** Ze zet zelf `user_id`, `account_id`,
`source: 'import'` en `is_income`, en **herberekent `import_hash`** — een
door de client verzonnen hash zou de unieke index kunnen omzeilen en de dedup
van élke volgende import vervuilen. Zod (`parseBody`, ADR 0044) werkt als
whitelist: onbekende velden worden gestript. Eigenaarschap van de
doelrekening wordt server-side gecontroleerd via RLS
(`bank_accounts`/`budgets` SELECT) — geen tweede kopie van de eigendomsregel.

**Laag 1 is niet overrulebaar; laag 2 wél.** De indexsleutel-dedup
(`import_hash|bank_seq`) is geen oordeel maar de databasewerkelijkheid — de
unieke index weigert de rij hoe dan ook. Laag 2 (cross-bron) is overrulebaar
via `allow_cross_source`, omdat de gebruiker bij een import aanwezig is en
FR12 vraagt dat laag-2-treffers **zichtbaar voorgedeselecteerd met reden**
binnenkomen in plaats van stil overgeslagen te worden — zoals bij de sync.

**Verwijst naar ADR 0058 (datapad-conventie)** als de norm die dit invult:
lezen via loader, muteren via API-route — dit was het laatste
client-directe mutatiepad op transacties voor gekoppelde rekeningen.

## Alternatieven

- **Dedup volledig client-side houden, alleen de sleutel gelijktrekken** —
  verworpen: dan blijft er een tweede schrijver naast de bank-sync bestaan
  met een eigen interpretatie van "wat staat er al", en dat is precies hoe
  twee dedup-lagen uit de pas gaan lopen (fase 2's motivatie voor één module,
  twee afnemers).
- **Ook losse rekeningen meteen naar de server-route migreren** — bewust
  uitgesteld: dit plan repareert het gekoppelde-rekening-pad, dat is waar de
  sleutel-discrepantie een reëel dubbeltellingsrisico vormt. Losse rekeningen
  hebben geen tweede schrijver om mee te botsen.

## Gevolgen

- `lib/architecture/integrations-model.ts` klopt sinds deze fase weer: de
  mt940-/ofx-/csv-entries verwijzen naar een route die nu echt bestaat.
- **Eén restrisico, systeemniveau, buiten deze route:** op een
  huishouden-gedeelde rekening (`ownership='shared'`) mogen beide partners
  importeren, maar zowel de dedup-scope als de unieke index zijn op `user_id`
  gesleuteld. Importeren beide partners hetzelfde afschrift, dan ontstaan
  duplicaten die geen van beide lagen vangt. Inherent aan het
  per-gebruiker-model en ouder dan deze fase; deze route maakt het
  gedeelde-rekening-pad alleen expliciet zichtbaar.
- De bestaande fout-positief in de client-soft-check (negeert `bank_seq`)
  wordt door deze route niet geërfd — server-side is `rowDedupKey` de
  sleutel — maar ook niet gerepareerd aan de kant van losse rekeningen; dat
  blijft open (restrisico 6 van het plan).
- `scripts/check-client-data-reads.mjs`: de import-pagina is van de
  grandfather-allowlist áf zodra haar reads via deze route lopen.
