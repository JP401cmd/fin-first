---
id: 0152-storage-buckets-volgen-de-wis
title: 'Storage-buckets volgen de AVG-wis: prefix-wis vóór de tabellen, 90 dagen voor schermafbeeldingen, wezen-sweep in de retentie-cron'
status: aanvaard
date: 2026-09-17
elements: [t-supabase, do-melding, app-comp]
---

# 0152 — Storage-buckets volgen de wis

Bestanden die een gebruiker uploadt (schermafbeeldingen bij meldingen,
pensioenoverzichten) worden bij accountverwijdering en reset gewist, als
eerste stap en hard falend. Schermafbeeldingen krijgen daarnaast een
bewaartermijn van 90 dagen; de retentie-cron ruimt verlopen beelden en de
uploads van al verdwenen accounts op. Eén single source
(`lib/user-data-buckets.ts`) met een dekkings-vitest, naar het model van
`lib/user-data-tables.ts` (ADR 0059).

## Context

- **Bevinding (security-gate W-008, 12 sep 2026).** Een gebruiker die zijn
  account verwijderde liet zijn schermafbeeldingen onbeperkt achter in de
  privé-bucket `user-report-screenshots`, onder een map met zijn oude UUID.
  Beelden van financiële schermen — saldi, namen, rekeningnummers. Art. 17
  AVG (recht op vergetelheid) werd daarmee niet waargemaakt.
- **Oorzaak.** `storage.objects` heeft geen foreign key naar `auth.users`. De
  `ON DELETE CASCADE` die bij tabellen het vangnet is (migratie
  `20260721140000`, ADR 0059) bestaat voor buckets niet; wissen moet expliciet,
  en dat was twee keer opgeschreven (`lib/user-data-tables.ts`, migratie
  `20260806104500`) maar nooit gebouwd. Hetzelfde gold voor
  `pension-documents` (pensioen-PDF's, sinds maart 2026).
- **Wat in orde was.** Toegang: privé bucket, owner-prefix-policies in USING én
  WITH CHECK, geen leesbaar kruispad (0 andermans objecten in de leaktest). Het
  ging om bewaren, niet om toegang.
- **Live-meting 17 sep 2026 (read-only):** enkele tientallen objecten onder een handvol
  prefixen, geen wezen, niets ouder dan 90 dagen; een deel van de `user_reports`-rijen
  draagt een pad, en alle paden hebben een object en omgekeerd. `pension-documents` is leeg.

## Besluit

1. **Single source `lib/user-data-buckets.ts`.** Elke bucket die de repo aanmaakt
   valt in precies één partitie: `USER_SCOPED_BUCKETS` (eerste padsegment =
   `user_id`; gewist) of `NON_PERSONAL_BUCKETS` (met reden; `guide-help` is
   beheer-content per helpKey). `lib/user-data-buckets.test.ts` scant migraties
   en code op bucket-id's en wordt rood bij een niet-ingedeelde bucket.
2. **Wis als stap 0 van `deleteAllUserData`, hard falend.** Met een
   service-client wist de functie éérst de prefix `<user-id>/` in elke
   user-scoped bucket (recursief — pensioendocumenten zitten twee niveaus diep).
   Mislukt dat, dan gooit hij vóór de eerste tabel-delete: het account is dan
   nog intact en de gebruiker probeert opnieuw. Dat verschilt bewust van
   `serviceWipeTable` (throw-vrij): daar is de DB-cascade het vangnet, hier is
   er geen. Geldt voor reset én volledige verwijdering — de persoonlijke
   tabellen gaan bij beide weg, het beeld dus ook.
3. **Bewaartermijn schermafbeeldingen: 90 dagen** na upload
   (`USER_REPORT_SCREENSHOT_RETENTION_DAYS`, `lib/retention.ts`). De melding
   zelf (`user_reports`, tekst) houdt geen termijn; het beeld is gevoeliger dan
   de tekst en heeft na de triage geen doel meer — de Notion-push tekent een
   48-uurs signed URL, geen kopie. Zelfde termijn als `lead_intakes` (ADR 0022).
   Bij het wissen wordt éérst `user_reports.screenshot_path` op NULL gezet, dán
   het object verwijderd (een dood pad zou de Notion-sync blijven laten tekenen).
4. **Wezen-sweep in de retentie-cron, over álle user-scoped buckets.** Een
   prefix van een verdwenen account wordt volledig gewist, ongeacht leeftijd —
   óók in `pension-documents` (een UPO-PDF draagt BSN en adres; een upload die
   tijdens de wis nog in-flight was, landt ná stap 0). Bestaanscheck in twee
   stappen, beide fail-closed: `profiles` (cascade vanaf `auth.users`, in
   brokken van 100) en voor wie dáár ontbreekt bevestiging via
   `auth.admin.getUserById` — `profiles` heeft een eigen-rij ALL-policy, dus een
   gebruiker kan zijn profielrij zelf wissen terwijl zijn account bestaat. Alleen
   een expliciet "niet gevonden" maakt een prefix tot wees; elke andere fout
   laat de cron die nacht níets wissen. Niet-UUID-prefixen blijven ongemoeid en
   worden geteld gelogd.
5. **Beheer-routes** (`/api/admin/user-delete` en de reset in
   `/api/admin/test-users`) geven `deleteAllUserData` nu expliciet de
   service-opties mee (`{ service, fullErase: true }` resp. `{ service }`); het
   eerste argument een service-client maken was niet genoeg — de functie kan een
   service-client niet van een sessie-client onderscheiden en sloeg de
   service-stappen over.

## Gevolgen

- Geen migratie: de service-role passeert de storage-RLS; er is geen
  policy-wijziging nodig. `pension-documents` en `user-report-screenshots`
  houden hun bestaande policies.
- `deletionSummary` krijgt `storage:<bucket>`-tellingen; de retentie-`job_runs`
  krijgt `deleted["storage:<bucket>"]` (verlopen) en `storage_wees` per bucket.
- Uitrolvolgorde: een nieuwe entry in `USER_SCOPED_BUCKETS` vereist dat de
  bucket remote al bestaat, anders wordt élke verwijdering en reset een 500
  (stap 0 gooit). Bucket-migratie eerst, entry daarna.
- De bestaande wezen (criterium 4 van de kaart) bleken er op 17 sep niet te
  zijn; de sweep dekt het geval structureel, dus een eenmalige opruimactie is
  vervallen.
- `/privacy` sectie 6 noemt de 90 dagen nog niet. Voorgestelde regel (via de
  Grenswachter-route, niet in deze PR): *"Schermafbeeldingen die je bij een
  melding meestuurt bewaren we 90 dagen; de melding zelf zolang je account
  bestaat."*
- Open, buiten dit besluit: de RPC `reserve_user_report_slot` valideert niet dat
  `p_screenshot_path` met de eigen `auth.uid()` begint (integriteitsnit richting
  de triageur, geen lek — bevestigd in de security-gate: de enige lezer is de
  service-role-signer voor Notion). De overige reset-callers zonder
  service-client (`/api/activate`, de persona-seeds) horen bij de kaart
  "Accountreset laat vragenlijstantwoorden staan".
