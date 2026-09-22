---
id: 0173-de-schaduweditie-van-de-krant-eigen-tabellen-profielafleiding-weekcron
title: 'De schaduweditie van de Krant: eigen tabellen, profielafleiding uit eigen data, weekcron'
status: aanvaard
date: 2026-09-22
elements: [as-nieuws, do-krant, t-supabase, t-platform]
---

De matcher van ADR 0172 gaat draaien zonder dat een lezer iets ziet: een weekcron (maandag
06:00 UTC, `/api/krant/cron`) leidt per gebruiker met de module nieuws een nieuwsprofiel af
uit zijn eigen data (B8; expliciete `.eq('user_id', …)` op elke tabel, banden in plaats van
bedragen, fiscaal partnerschap nooit gegokt), draait de matcher en schrijft de editie met
bron 'schaduw' in drie eigen tabellen — `nieuwsprofiel`, `krant_edities`,
`krant_editie_items` — die alleen de service-role kan schrijven en alleen de eigenaar kan
lezen. `news_editions` en haar vijf lezers blijven onaangeraakt tot 1C (keuze 8). De
K1-meting (lege edities per profieltype, overlap met de LLM-editie op testaccounts) landt
als tellingen in `job_runs`; beheer ziet gebruik, geen inhoud (ADR 0146). Een
teruggetrokken duiding (B4) rekent de geldende edities van de lopende week opnieuw.

# 0173 — De schaduweditie van de Krant

## Context

ADR 0171 legde de duiding van artikelen vast, ADR 0172 de pure matcher en de sjablonen.
Beide draaiden tot nu toe nergens: de K1-poort ("per profieltype bekend hoe vaak een
editie leeg blijft", "naast de LLM-editie gelegd, geen fout getal") vraagt een editie die
wekelijks écht wordt gebouwd, opgeslagen en gemeten — zonder dat een lezer er iets van
merkt. De eigenaar koos op 21 sep 2026 voor eigen tabellen in plaats van het uitbreiden van
`news_editions` (dat het LLM-archief is, met een verversingsquotum dat er rijen op telt en
een `hero_headline NOT NULL` die een lege editie verbiedt).

Twee eigenschappen van dit pad maakten de afleiding het gevoeligste stuk: de cron draait
op een service-role-client (RLS scoopt niets), en de SELECT-policy op `assets` is
huishoud-gedeeld (ook een sessie-client krijgt partnerrijen). Zonder een eigen scope per
tabel zou het spaargeld van de partner de band van de lezer verschuiven.

## Besluit

1. **Drie eigen tabellen** (migratie `20260922120000_krant_nieuwsprofiel_en_schaduwedities`):
   - `nieuwsprofiel` — één rij per gebruiker, de dertien velden als kolommen met een CHECK
     op de bandsleutels van `profiel-velden.ts`, `herkomst` per veld (`zelf` | `afgeleid`),
     `afgeleid_at`. Eigen-rij SELECT/INSERT/UPDATE/DELETE (het profielscherm van 2x en de
     wis); geen huishouddeling.
   - `krant_edities` — per lezer en ISO-week (Amsterdam): `bron` schaduw | live, `met_ai`,
     de versies (matcher, sjabloon, profiel), `profiel_type` (zonder id), een
     `profiel_snapshot`, `leeg`, het algemene katern en `vervangen_door` (B4). Eigen-rij
     SELECT en DELETE; **geen** INSERT/UPDATE-policy — alleen de service-role schrijft, een
     lezer kan nooit zelf een editie fabriceren of `bron` op live zetten.
   - `krant_editie_items` — de regels, met `article_id → news_articles on delete set null`
     en een `snapshot` van kop, bron, url en samenvatting zodat het archief leesbaar blijft
     nadat de ingest het artikel na 120 dagen opruimt. `user_id` gedenormaliseerd voor RLS
     en de herberekening. Zelfde policies als de edities.
   - Anon heeft op geen van de drie een grant (leak-check: 42501 is daar het verwachte
     resultaat). Geen superadmin-policy; de drie tabellen zijn inhoud en staan niet op
     `VRIJ_LEESBAAR`.
2. **Profielafleiding uit eigen data** (`lib/krant/profiel-afleiding.ts`), puur gescheiden van
   de IO. Elke lezing draagt `.eq('user_id', userId)` (op `profiles` en `nieuwsprofiel` de
   eigen sleutel) en een expliciete kolomlijst — geen `select('*')` op `assets`. Bewaakt door
   een gedragstest met een partnerrij én een bron-scan over de per-gebruiker-loaders. Regels:
   geboortejaar uit `date_of_birth`; `solo` → alleen, `samen`/`gezin` → partner met fiscaal
   partnerschap **onbekend** (keuze 10); `number_of_children = 0` → geen, anders onbekend
   (geen leeftijd); werk alleen `pensioen` als de AOW-leeftijd (tabelrijen, `lookupAowAge`)
   is bereikt; inkomen uit het **transactie-jaarinkomen op de historiebasis** (ADR 0138:
   `fetchRealizedBudgetAmounts` → `transactionAnnualIncome` — het maandaggregaat zonder
   `max_rows`-kap, transfer-gefilterd (ADR 0169), "budgetteren uit" gerespecteerd (ADR
   0139), gedeeld door `historyMonths`) met scope `{ userId, householdId: null }` = de
   **eigen** rijen, daarna de precedentie van `resolveEffectiveIncomeExpenses` (manual wint;
   `unknown` → onbekend). De huishoud-gedeelde budgetgrondslag wordt bewust niet
   geraadpleegd (B1: eigen inkomen); de Krant-band kan daardoor afwijken van
   `monthlyIncome` op het dashboard voor wie een inkomstenbudget als grondslag heeft.
   Wonen uit `eigen_huis` + hypotheekschuld (huursoort en inwonend niet afleidbaar);
   restschuld als band, rentevast uit de einddatum van de grootste hypotheek, halfopen
   ([0, 12) tot-1-jaar, [12, 60) 2-5-jaar, [60, ∞) boven-5-jaar; het vocabulaire kent geen
   1–2-jaarband, 12–23 maanden landt in 2-5-jaar) — een verlopen einddatum is stale data en
   blijft onbekend, "variabel" wordt nooit gegokt; spaargeld en beleggingen via
   `classifyAsset` over de eigen bezittingen plus de losse bankrekeningen
   (`selectUnlinkedBankAccountsForUser` + `unlinkedCashTotal`, dezelfde optelling als de
   snapshots-cron), vorm uit het assettype (een ETF is een fonds); studieschuld als band,
   consumptief krediet als vlag; pensioenopbouw uit de geregistreerde pensioenpotten.
   **Nooit uit afwezigheid**: spaargeld/beleggingen alleen bij ten minste één Box 3-bezit of
   losse bankrekening (alleen een huis vastgelegd geeft géén spaargeldband); "geen schulden"
   alleen als er bezittingen, schulden of rekeningen zijn vastgelegd; lijfrente alleen 'ja'
   (nooit 'nee' omdat er geen lijfrente tussen de potten staat); "geen kinderen" alleen bij
   `solo`/`samen` met 0 (bij `gezin` is 0 de DB-default van een overgeslagen veld). Woonplan
   en rubrieken raakt de afleiding nooit (B8); een `zelf`-veld wordt nooit overschreven en
   wordt per veld gevalideerd (één ongeldige kolom sleept een geldige `zelf`-waarde niet
   mee); afgeleide velden worden elke run herleid, nooit opgehoogd.
3. **Eén keten per lezer** (`lib/krant/editie-run.ts`): afleiding → lezerscontext
   (`news_read`-ids, op het lokale pad het artikel-id; gedempte rubrieken via
   `demotedCategories` op de eigen `news_feedback`) → `matchEditie` → schrijven. Alles wat de
   uitkomst beïnvloedt gaat als argument mee (now, AOW-rijen, de kandidaten van de run), zodat
   de herberekening dezelfde kandidaten minus één artikel kan draaien. De loader
   (`editie-loader.ts`) selecteert alleen `geduid` in het venster of met een toekomstige
   deadline en verwerpt een duiding die het gesloten schema niet haalt; het leescontract
   zelf blijft de pure toets in de matcher.
4. **Weekcron** `/api/krant/cron`, maandag 06:00 UTC (na ingest + duiding van 05:00),
   CRON_SECRET fail-closed zonder `job_runs`-write vóór de auth, `maxDuration` 300 met een
   eigen tijdbudget van 240 s en drie gelijktijdige gebruikers. Idempotent per ISO-week (een
   geldende schaduweditie → overgeslagen): breekt een run op het tijdbudget af, dan maakt
   een tweede aanroep (handmatige `GET` met het secret; er is geen automatische retry) de
   rest af zonder dubbele edities. De check is applicatieniveau (check-then-act, geen
   unique index — die zou botsen met de volgorde van de herberekening); twee gelijktijdige
   aanroepen kunnen dezelfde gebruiker twee geldende edities geven. Aanvaard risico voor
   een schaduw die niemand leest; 1C beslist opnieuw. Doelgroep in K1: alle profielen met
   `onboarding_completed` en de module nieuws (`resolveActiveModules`, null = alle
   modules) — smaller zou de meting per profieltype niet dragen. Cap: 26 weken
   schaduwedities per gebruiker, opgeruimd door de cron zelf (de retentie-cron kent deze
   tabel bewust niet). De route staat in `CRON_PUBLIC_PATHS` (`lib/supabase/proxy.ts`).
5. **Meting zonder inhoud**: `job_runs.summary` draagt per run de aantallen (gebruikers,
   edities, leeg, overgeslagen, fouten) en de verdeling over `profielType`
   (leeftijdsklasse × wonen × partner, zonder id). Die verdeling is voor **echte
   gebruikers k=5-onderdrukt** met het huis-algoritme `onderdrukVerdeling` (ADR 0153:
   primair én aanvullend, tegen de publieke totalen `edities`/`leeg`) — een cel van één
   67-plusser met een koophuis zou met de accountlijst ernaast aan één persoon hangen en
   verraden dat hij een huis bezit (`lib/krant/meting.ts`). Voor de **testaccounts**
   (`is_demo_user`, de vijf fictieve persona's) is de verdeling ongedrukt: dat zijn precies
   de vijf profieltypes waarop de K1-poort "lege edities per profieltype" is gedefinieerd,
   plus hun overlap met de LLM-editie uit `news_cache:<uid>` op genormaliseerde bron-url
   (beide / alleen matcher / alleen model). Geen tekst, geen profiel, geen gebruikers-id.
6. **Herberekening na terugtrekken** (B4, `editie-herberekening.ts`): via
   `krant_editie_items.article_id` → de geldende edities van de lopende week → per gebruiker
   een **verse run** zonder dat artikel (het profiel opnieuw afgeleid, de kandidaten van
   dát moment — `profiel_snapshot` is de audit van de oude editie, geen invoer) → nieuwe
   editie, `vervangen_door` op de oude. Oudere weken blijven staan als momentopname; de
   tellingen in `job_runs` van de oorspronkelijke run worden niet gecorrigeerd. Dit is een
   contract-in-wacht: de aanroeper (`POST /api/admin/news-duiding/terugtrekken`, kaart 1A
   fase 2) bestaat nog niet.
7. **AVG**: de drie tabellen staan in `SESSION_WIPE_TABLES`/`ALL_USER_SCOPED_TABLES`
   (wis én zelfexport) en in batch 1b van `deleteAllUserData`; FK-cascade op `auth.users`.

## Gevolgen

- **Wat de release nodig heeft**: de migratie toepassen (met versieregistratie) en live
  verifiëren (drie tabellen, policies, anon 42501); de cron staat in `vercel.json` en in het
  beheerders-runbook (change-request). Zonder de migratie logt de cron een error-run en
  schrijft niets.
- **Niemand ziet de editie.** Er is geen lezer, geen route en geen UI voor `krant_edities`;
  fase 3 (het meting-paneel op `/beheer/nieuws`, de testsectie op `/nieuws` — keuze 12)
  volgt op kaart 1A fase 2 en op de meting. De vijf lezers van `news_editions` en het
  lokale pad (B10) zijn niet aangeraakt.
- **De hand-afgeleide persona-profielen** in `editie.fixture.ts` blijven de referentie voor de
  golden edities; de echte afleiding wijkt daar bewust van af waar de data het niet draagt
  (werk, woonplan, huursoort en lijfrente blijven onbekend; een ETF telt als fonds; Tessa's
  spaargeld omvat ook haar bankrekeningen). De meting op de testaccounts loopt op de echte
  afleiding.
- **Live te verifiëren bij de release-smoke** (geen test dekt het): het PostgREST-`or`-filter
  van de kandidatenselectie (`kandidatenVensterFilter`, gequote timestamp + JSON-pad) —
  vergelijk `job_runs.summary.kandidaten` van de eerste run met een handmatige telling van
  `news_articles` met `duiding_status = 'geduid'` in het venster.
- **Twee editiepaden naast elkaar tot 1C** (concern `krant-twee-editiepaden-tot-1c`): het
  LLM-archief in `news_editions` en de schaduw in `krant_edities` delen niets behalve de
  artikelen. 1C verhuist de oude AI-edities naar `krant_edities` met `met_ai = true` (B9)
  en zet de lezers om.
- **Open in de meting**: de leesstatus van het cloudpad draagt model-id's zonder koppeling
  naar het artikel, dus "gezien" telt daar in K1 niet; op het lokale pad wél.
