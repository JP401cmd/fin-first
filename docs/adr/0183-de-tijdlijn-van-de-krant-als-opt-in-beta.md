---
id: 0183-de-tijdlijn-van-de-krant-als-opt-in-beta
title: 'De tijdlijn van de Krant als opt-in bèta: verversingen in de bestaande edities, een eigen dagcron en een kolomgrant op de keuze'
status: voorgesteld
date: 2026-09-28
elements: [as-nieuws, do-krant, t-supabase, t-platform]
---

De Krant zonder AI wordt een persoonlijke tijdlijn in plaats van een weekeditie (B31–B33, 27
sep) en komt als opt-in bèta naast de AI-Krant, die de standaard blijft (B38, 28 sep). Dit
besluit legt fase 1 vast: schema en motor, nog zonder scherm. Het bouwt op ADR 0172 (matcher,
sjablonen met attest) en ADR 0173 (schaduweditie in eigen tabellen, weekcron).

## Besluiten

1. **Een verversing is een rij in `krant_edities` met `bron = 'tijdlijn'`**, en haar berichten
   zijn `krant_editie_items`. Geen nieuwe tabel: één archief (B32, en straks de oude AI-edities
   met het kenmerk 'met AI', B9), één AVG-registratie, één leesvorm. `week_key` is de week van
   de verversing en daarmee de archiefgroepering; `snapshot` + `tekst` zijn de momentopname
   (B31, U12). Ook een verversing zonder nieuwe berichten is een rij (`leeg`): dat geeft
   "laatst vernieuwd" en de K1-meting "hoe vaak voegt een verversing niets toe".
2. **Een artikel staat hoogstens één keer in iemands tijdlijn, op DB-niveau**: een
   partiële unieke index `(user_id, article_id) WHERE tijdlijn AND article_id IS NOT NULL` op
   `krant_editie_items`, met de gedenormaliseerde kolom `tijdlijn`. Een gewone unieke index kan
   niet: de schaduwweekrun en de herberekening na terugtrekken maken bewust dubbelen. Racen de
   knop en de cron, dan faalt de tweede items-insert en haalt de bestaande compensatie in
   `schrijfEditie` die verversing weg — geen RPC nodig. In de run is "gezien" de eigen
   tijdlijn, niet `news_read` (de leesstatus van de AI-Krant).
3. **De matcher krijgt een modus** (`'editie'` | `'tijdlijn'`, MATCHER_VERSIE 4). In de
   editiemodus is de selectie gelijk aan v3 — gemeten: op de vijf golden-persona's zijn
   artikelen, scores, vormen en volgorde byte-gelijk, alleen de teksten volgen catalogus v2.
   Eén bewuste uitzondering: een som van € 0 (of 0 maanden) rendert nooit meer als bedrag en
   valt terug op de vorm zonder bedrag (`impact:nul`); haalt zo'n artikel met bonussen de
   drempel, dan verschuift zijn rang van `direct` naar `relevant` (eindreview L1).
   In de tijdlijnmodus: (a) een bericht zonder bedrag haalt de tijdlijn met score 2
   (SCORE_DREMPEL_RAAKT), alleen bij een **bevestigde** grond — een doelgroepregel die 'ja' gaf
   of een thema dat raakt — en nooit bij een onbevestigde doelgroep; (b) zo'n bericht heeft
   de vorm `'raakt'` ("Over jouw situatie", B37), opgebouwd uit de reden van de raakt-regel die
   'ja' gaf, het onderwerp en een slot naar de grond — zonder grond is het geen bericht, en
   alleen voor duidingen van de soort besloten, voorstel of achtergrond: nooit markt, cijfers,
   verwachtingen of een beursbeweging (een koers aan jouw beleggingen koppelen is de Wft-grens,
   eindreview H1). Bij een voorstel nooit "geldt ook voor jou" maar het neutrale slot; (c)
   `algemeen.achtergrond` draagt hoogstens drie kwalitatieve artikelen zonder regel voor jou.
   Hoogstens EDITIE_MAX nieuwe berichten per verversing.
4. **Catalogus v2 draagt alle lezerstekst**, ook de fragmenten die in v1 in de renderer en de
   matcher stonden (banden, bereiken, veldnamen, het partnerfragment), met de aanpassingen uit
   de compliance-check van 28 sep. Een bronscan bewaakt dat renderer en matcher geen lezerstekst
   meer dragen. Het attest krijgt een eigen veld `herbevestiging` dat alleen de eigenaar zet
   (`--herbevestig`) en dat bij elk gewijzigd woord vervalt; `tijdlijn-beta.gate.test.ts` maakt
   `TIJDLIJN_BETA_OPEN = true` onmogelijk zonder geldige herbevestiging (B38, voorwaarde 2).
5. **De keuze staat op `nieuwsprofiel.krant_variant`** ('ai' | 'tijdlijn' | NULL = standaard),
   zodat hij na de omschakeling de keuze met/zonder AI van 1E wordt (B23) zonder tweede
   migratie. Plus `tijdlijn_gelezen_tot` ("nieuw sinds je laatste bezoek", op elk apparaat; een
   eigen-rij-voorkeur, dus sessie-schrijfbaar). **Kolomgrant:** sessies schrijven de
   profielvelden, `herkomst`, `tijdlijn_gelezen_tot` en (bij UPDATE) `user_id` voor de
   upsertvorm van PostgREST; `krant_variant` en `afgeleid_at` schrijft uitsluitend de
   service-role. Zo kan een lezer de bèta niet via de browser-client openen terwijl hij dicht
   is. `herkomst` en `rubrieken` krijgen een grootte-CHECK. **Het bezwaar staat op
   `profiles.krant_schaduw_bezwaar_at`**, niet op het nieuwsprofiel: dat valt onder de
   sessie-wis en een reset zou het bezwaar stil opheffen (security Y1).
6. **Een eigen dagcron** `/api/krant/tijdlijn/cron` om 06:30 UTC, naast de knop van fase 2
   (U11). Geen staart aan de ingest: dat tijdbudget knelt al. De cron draait alleen voor lezers
   met de variant, de module nieuws en afgeronde onboarding, en zolang de bèta dicht is alleen
   voor superadmins (`inTijdlijnBeta`) — een tweede slot naast de kolomgrant.
7. **Terugtrekken (B4) herberekent de tijdlijn niet**, maar verwijdert het bericht uit elke
   tijdlijn en zet `item_count`/`leeg` van de geraakte verversing gelijk. De herberekening van
   ADR 0173 slaat de tijdlijn over.
8. **Bewaren en uitzetten.** 120 dagen, gelijk aan de artikelen (ADR 0171), gehandhaafd door de
   opruimstap in de run (`ruimTijdlijnOp`). De bèta uit = de tijdlijn direct gewist
   (`wisTijdlijn`, besluit eigenaar 28 sep); het nieuwsprofiel blijft voor de schaduwrun.
9. **Grondslag van de schaduwrun: gerechtvaardigd belang** (besluit eigenaar 28 sep, afwijkend
   van het advies "alleen bèta-lezers"). De weekcron slaat lezers met
   `profiles.krant_schaduw_bezwaar_at` over; die komt uit dezelfde profiles-lezing, dus faalt
   die, dan draait de run niet (fail-closed). De belangenafweging hoort vóór /privacy 2.4 als
   juridische brief vast te liggen, en er is nog geen plek waar een lezer bezwaar maakt.
10. **Terugtrekken tijdens een lopende run.** De kandidaten worden één keer per cronrun
    geladen; vlak vóór het schrijven toetst `alleenNogGeduid` de gekozen artikelen opnieuw
    op `duiding_status = 'geduid'` — berichten, katern én Achtergrond (security Y3). Een
    kopie van een teruggetrokken samenvatting kan nog in `algemeen` van oudere verversingen
    staan; de leesloader van fase 2 filtert die blokken op de actuele duiding_status.
11. **De herbevestiging is een menselijke handeling.** `--herbevestig` weigert zonder TTY en
    vraagt een getypte bevestiging (de eerste 8 tekens van de catalogus-hash); een agent-shell
    heeft geen TTY. `inTijdlijnBeta` neemt geen vlag-argument, en de importeurs van de
    bèta-toets staan op een allowlist in de gate-test (security Y2/G4). Niet waterdicht — wel
    een bewuste overtreding in plaats van een ongeluk.

## Gevolgen

- Migratie `20261004120000_krant_tijdlijn_beta.sql` (CHECKs, kolom + indexen, drie
  nieuwsprofielkolommen, kolomgrant). DDL vóór de code.
- Nieuw: `lib/krant/tijdlijn-run.ts`, `lib/krant/tijdlijn-beta.ts`, de cron, JobKey
  `krant-tijdlijn`, een regel in `vercel.json` en `CRON_PUBLIC_PATHS`.
- Buiten deze fase: het scherm, de routes voor keuze, vernieuwen en archief, en de tak in de
  nieuwsstip (fase 2); /privacy 2.4, de herbevestiging door de eigenaar en de security-run
  vóór de vlag open gaat (fase 3). Het dun maken van /api/news, `ai_nieuws` → `krant` en de
  opruimmigratie blijven achter de K1-poort (B38).
- Open voor de eigenaar: de 5-jaarsregel van de DUO-rente (tekst `direct-studieschuld`) en een
  steekproef van ≥ 20 samenvattingen vóór de eerste bèta-lezer.
