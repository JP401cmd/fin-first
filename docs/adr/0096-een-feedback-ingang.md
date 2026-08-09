---
id: 0096-een-feedback-ingang
title: Melden gaat uitsluitend via het gesprek met Fin; /mijn/feedback wordt een verwijzing
status: aanvaard
date: 2026-08-09
elements: [as-coach, do-melding, t-notion]
---

TriFinity heeft twee volledig gescheiden feedback-systemen: het oude formulier op `/mijn/feedback` (tabel `feedback`, eigen admin-inbox) en de meldmodus in de chat (tabel `user_reports`, doorstroom naar de Notion-werkqueue). Het oude pad is al uit de navigatie verdwenen en staat niet op de architectuurplaat, maar levert nog wél een tweede inbox op voor het team. Voorstel: de meldmodus wordt de enige invoerweg; `/mijn/feedback` wordt een verwijspagina en `POST /api/feedback` sluit voor nieuwe inzendingen.

## Context

Uit de verkenning (`docs/verkenning-een-feedback-ingang.md`), geverifieerd in de code:

- **Oud** — `/mijn/feedback` → `POST /api/feedback` → tabel `feedback`. Vier categorieën (bug/idee/vraag/overig), **geen zod-validatie** (rauwe `req.json()`), **geen rem**, geen screenshot, geen doorstroom naar de werkqueue. Gelezen in `/beheer/feedback` via `/api/admin/feedback`.
- **Nieuw** — chat-megafoon → `POST /api/user-reports` → tabel `user_reports`. Drie typen (bug/vraag/aanbeveling), zod met Nederlandse foutmeldingen, 5 meldingen per rollend uur via de race-vrije RPC `reserve_user_report_slot`, screenshot in een privé-bucket, Supabase-first met best-effort Notion-push en een dagelijkse retry-cron.
- `/mijn/feedback` staat **niet** in de navigatie (alleen `EXTRA_ROUTE_TITLES` + een ⌘K-item) — UAT WF-MIJN-28 noemt 'm letterlijk "verweesd in de nav". Hij komt ook **nergens** voor in `lib/architecture/archimate-model.ts`, terwijl de meldmodus daar wél als `as-coach`/`do-melding`/`t-notion` staat en in de HLD als "Iets melden vanuit je gesprek met Fin".
- De gescheiden *tabellen* zijn een bewuste keuze — het tabelcommentaar bij `user_reports` zegt: *"Bewust een eigen tabel naast public.feedback — andere levenscyclus (verlaat het systeem) en eigen syncstate."* Dat rechtvaardigt twee tabellen, niet twee invoerschermen.
- De echte kosten liggen bij het team: **twee inboxen** (`/beheer/feedback` én de Notion-werkqueue), waardoor een melding kan binnenkomen in de bak waar niet gekeken wordt.

## Besluit

**Aanvaard (JP, 9 augustus 2026):** de meldmodus in het gesprek met Fin wordt de enige route om iets te melden.

1. `/mijn/feedback` blijft als route bestaan, maar wordt een korte verwijspagina met één primaire actie die de chat in meldmodus opent. Formulier en categoriekiezer eruit.
2. `POST /api/feedback` sluit voor nieuwe inzendingen met **`410 Gone`** in de gedeelde error-vorm (`lib/api/respond.ts`) en een Nederlandse tekst die naar de meldmodus wijst. Bewust geen 404 — dat zou als defect lezen.
3. Het ⌘K-item "Feedback" (`lib/command-palette/navigation-index.ts`) opent de meldmodus in plaats van de route.
4. **Categorie-afbeelding:** `bug` → bug, `vraag` → vraag, `idee` → aanbeveling. **`overig` krijgt geen opvolger** — een meldingstype dat niets zegt is voor triage waardeloos; wie niet kan kiezen, kiest "vraag".
5. **Buiten scope:** de tabel `feedback` blijft staan, `/beheer/feedback` en `/api/admin/feedback` blijven ongewijzigd als historisch archief. Opruimen kan pas als die inbox leeg is — en raakt dan ook `lib/user-data-tables.ts` (AVG-export; `feedback` heeft géén eigen-rij DELETE-policy).

## Gevolgen

- **Winst:** één invoerweg voor de gebruiker, en elke nieuwe melding komt met validatie, rem, optioneel screenshot en automatische doorstroom naar de werkqueue binnen. De tweede inbox loopt vanzelf leeg in plaats van te blijven groeien.
- **Verlies:** de categorie "overig" verdwijnt (bewust, zie besluit 4). De meldmodus vraagt bij bug/vraag om een scherm — dat is een extra veld ten opzichte van het oude formulier, maar het is precies wat triage bruikbaar maakt.
- **Omkeerbaar:** er wordt geen data verwijderd en geen tabel gedropt; alleen de invoerweg sluit. Terugdraaien is het herstellen van één route + één handler.
- **UAT:** WF-MIJN-28 herschrijven (formulier → verwijzing), het BEHEER-criterium voor de feedback-inbox markeren als historisch archief; de meldmodus-criteria onder WILL blijven leidend en ongewijzigd.

## Uitgevoerd

Geïmplementeerd op 9 augustus 2026:

- `app/api/feedback/route.ts` — `POST` antwoordt met **410 Gone** via de nieuwe `gone()`-helper in `lib/api/respond.ts` (platte envelope, `code: 'gone'`). De handler leest en schrijft niets meer: geen `req.json()`, geen DB-aanroep en bewust ook géén eigen auth-check — een gesloten endpoint hoort geen datapad meer te hebben dat beschermd moet worden. Nuance uit de security-poort bij de release: ingelogd zie je de 410, uitgelogd geeft de proxy (`lib/supabase/proxy.ts`, protected prefix `/api/`) eerst een 401. Beide zonder datapad; `/api/feedback` hoort daarom niet in `publicPaths`.
- `app/(app)/mijn/feedback/page.tsx` — verwijspagina in de editorial-aanhef, met één primaire actie ("Open het meldvenster") en de drie meldtypen als uitleg. Formulier, `CATEGORIES` en de `fetch` naar `/api/feedback` zijn weg.
- `components/app/chat/chat-provider.tsx` + `chat-panel.tsx` — nieuwe `openMelding()` op de chat-context. De meldmodus blijft state van `ChatPanel` (het gesprek moet blijven staan tijdens het melden), dus dit is een intent-vlag die het paneel oppikt en direct wist.
- `lib/command-palette/navigation-index.ts` — het ⌘K-item heet nu "Melden" met sublabel "Melden gaat via je gesprek met Fin". **Afwijking van besluit 3:** het item blijft een route-ingang naar de verwijspagina in plaats van een directe actie. De ⌘K-pagina-index is een route-index; er een actie van maken vraagt een extra veld op `ActionRunContext` in `command-palette.tsx`. Dat is een losse opruimstap, niet dit besluit waard — de gebruiker landt nu op de verwijspagina en is één tik van het meldvenster.
- `lib/beheer-sections.ts` + `app/(app)/beheer/feedback/page.tsx` — de inbox heet "Feedback (archief)" en zegt zelf dat nieuwe meldingen elders binnenkomen. Gedrag, route en `/api/admin/feedback` ongewijzigd.
- **Niet gedaan (bewust):** geen migratie, tabel `feedback` blijft, AVG-export (`lib/user-data-tables.ts`) ongewijzigd.
