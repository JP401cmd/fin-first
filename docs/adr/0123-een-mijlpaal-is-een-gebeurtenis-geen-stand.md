---
id: 0123-een-mijlpaal-is-een-gebeurtenis-geen-stand
title: 'Een mijlpaal is een gelogde gebeurtenis, geen live herberekende stand'
status: aanvaard
date: 2026-08-31
elements: [sp-inzicht, as-coach, as-nieuws, do-doel, t-supabase]
---

# 0123 — Een mijlpaal is een gebeurtenis, geen stand

## Context

De app kende mijlpalen tot nu toe uitsluitend als **live berekening**.
`lib/freedom-milestones.ts` bepaalt bij elk request opnieuw of 25/50/75/100%
vrijheid "bereikt" is; `lib/natural-milestones.ts` projecteert "Schuldenvrij" en
"Eerste miljoen" vooruit. Geen van beide weet wánneer iets gebeurde, en geen van
beide merkt het passeren zelf op. Gevierd werd er op precies twee plekken
(eerste bezitting, doel op 100%), met een once-guard in `localStorage` — dus
per apparaat.

Daarmee mist de app het enige moment dat het gedragsonderzoek als werkzaam
aanwijst: de erkenning op het moment van passeren. Een stand kan niet gevierd
worden, want hij is elke dag opnieuw waar. En een viering die in localStorage
wordt onthouden bestaat op de telefoon niet als hij op de laptop is gezien.

Bijkomend: er is geen cron. `CRON_SECRET` ontbreekt en er draait sinds eind juli
geen enkele geplande taak. Een detectiemotor die op een schema leunt zou dus
vanaf dag één stilstaan.

## Besluit

Een gepasseerde mijlpaal wordt **eenmalig als gebeurtenis vastgelegd** in de
nieuwe tabel `achieved_milestones`, met `achieved_at` en een
`acknowledged_at`-vlag als cross-device once-guard.

1. **Detectie draait in-band bij de /overzicht-load**, in
   `OverzichtSecondaryLoader` — niet op een cron. Het is een pure, idempotente
   log-append via de anon-RLS-client, in dezelfde klasse als de al bestaande
   wekelijkse snapshot-write in dat blok. ADR 0058's regel "muteren via een
   API-route" richt zich op client-geïnitieerde mutaties; de *acknowledge* is
   dat wél en loopt daarom wél via `POST /api/milestones/acknowledge`.

2. **De sleutel is de idempotentie.** `UNIQUE (user_id, milestone_key)` met
   `ON CONFLICT DO NOTHING`. Een drempel die na een dip opnieuw wordt
   gepasseerd botst op de bestaande rij en geeft geen tweede rij en geen tweede
   viering. De log is historie, geen stand — dat is de hele naam van dit besluit.

3. **De motor rekent niet.** Hij toetst uitsluitend canonieke waarden uit de
   bundel: `netWorth`, `freedomPct` (= `computeFreedomProgress`), `totalDebts`
   en `emergencyFund` (= `resolveEmergencyFund`). `evaluateMilestones` is een
   pure functie zonder Supabase. Een eigen som zou per definitie een tweede
   grondslag introduceren voor een getal dat elders al canoniek is.

4. **Vermogensdrempels staan op het volledige, persóónlijke netto vermogen**,
   inclusief eigen woning — niet op `fireEligibleNetWorth`, niet op
   `netWorthExclHome`, en nadrukkelijk ook niet op de RLS-brede bundelsom
   (`dashboardData.netWorth`), waarin gedeelde bezittingen van de partner voor
   100% meetellen. De observatie is `currentNetWorth` uit blok 1 — hetzelfde
   getal als de hero toont. Twee redenen: de FIRE-mijlpalen die de doelgroep
   zelf viert ("de eerste 100k") gaan klassiek over het eigen netto vermogen,
   en de historische datering bij de eerste run komt uit
   `net_worth_snapshots`, dat strikt op eigen rijen wordt weggeschreven
   (`app/api/snapshots/auto` filtert op `user_id`). Zou de live-toets op de
   huishoud-brede som staan en de datering op eigen rijen, dan passeert iemand
   "€100.000" mede op het aandeel van de partner én misdateert elke geseede
   mijlpaal. (Bevinding uit de security ship-gate, 31 aug 2026.)

5. **De eerste run viert niets.** `profiles.milestones_seeded_at` markeert dat
   de motor ooit voor deze gebruiker gedraaid heeft. Is die leeg, dan worden
   álle op dat moment al gepasseerde drempels stil gelogd
   (`acknowledged_at = now()`, `source = 'seed'`), historisch gedateerd waar
   `net_worth_snapshots` dat toelaat. Bewust een eigen kolom en niet de
   afleiding "de log is leeg": een verse gebruiker met nul gepasseerde drempels
   zou anders in seed-modus blijven hangen en zijn eerste échte €10.000 stil
   inslikken.

   Gratis gevolg: "schuldenvrij geworden" vuurt nooit voor iemand die nooit
   schuld had — die krijgt de sleutel bij de seed-run stil toebedeeld.

6. **De verse mijlpaal wordt ná de weeksnapshot in de briefing geïnjecteerd**,
   met id-prefix `milestone:fresh:`, **positioneel vooraan** (niet via de
   rang-ladder: de injectie gebeurt ná `mergeRankedEntries`, dus een rang-regel
   voor deze prefix zou dode code zijn), gedurende 48 uur. De entry wordt
   nooit in de snapshot teruggeschreven; na 48 uur verdwijnt hij — de blijvende
   `milestone:`-entries van de engine zelf (doel behaald, score-trend) dragen
   los daarvan hun gewone rang 75. De injectie moet ná de snapshot gebeuren
   omdat `getOrCreateWeeklySnapshot` de briefing per ISO-week bevriest — een
   mijlpaal van dinsdag zou anders pas de week erop zichtbaar worden.

7. **Een behaald doel wordt gelogd maar niet door de motor gevierd.** Het
   doelen-scherm viert het al in context, op het moment zelf. Twee vieringen
   voor één gebeurtenis is precies de devaluatie die het onderzoek als
   contraproductief aanwijst. De rij komt er wél, stil, zodat de latere
   "Bereikt"-tijdlijn compleet is.

8. **Eigenaarschap is persoonlijk.** Own-row RLS op `auth.uid() = user_id`,
   geen huishoud-deling, geen service-role. Het UPDATE-recht is
   kolom-gescoopt (`GRANT UPDATE (acknowledged_at)`): RLS begrenst rijen maar
   geen kolommen, en zonder die grant kan een gebruiker via de anon-client zijn
   eigen `achieved_at` herschrijven — waarmee de log als historie waardeloos
   wordt.

## Alternatieven

- **Cron-gedreven detectie.** Verworpen: er draait geen cron, en een dagelijkse
  batch zou de viering losknippen van het moment waarop de gebruiker kijkt.
- **Detectie in blok 1 van /overzicht.** Verworpen: blok 1 is bewust licht en
  paint zonder `loadDashboardData`; de canonieke waarden staan daar niet.
- **Mijlpaal-emissie op het mutatiepad (bij het afronden van een doel).**
  Verworpen voor v1: het doelen-scherm muteert `goals` rechtstreeks vanuit de
  browser-client (ADR 0058-schuld die buiten deze snede valt), dus er ís geen
  server-moment om aan te haken.
- **Once-guard in localStorage laten.** Verworpen: dat is precies het gebrek dat
  deze feature moet oplossen — een viering op de laptop zou zich op de telefoon
  herhalen.

## Gevolgen

- Twee pure data-writes per /overzicht-request in het eigen perspectief in
  plaats van één. Beide idempotent, geen cookie-/sessie-effect; de doc-comment
  in `overzicht-secondary-loader.tsx` wordt op die werkelijke invariant
  geherformuleerd.
- Een gebruiker die uitsluitend in huishoud- of partnerweergave kijkt, krijgt
  geen detectie. Bewust: personal-canonieke waarden verkrijgen in die weergave
  zou een tweede horizon-load kosten. Vastgelegd als aandachtspunt.
- Een schuld die door de gebruiker wórdt verwijderd in plaats van afgelost
  telt als "schuldenvrij". Geaccepteerd: de log legt vast wat de app waarnam.
- Wft: een mijlpaal is een feitelijke constatering over reeds bestaande eigen
  cijfers, nooit een aanbeveling. De vieringsteksten dragen geen handelingsadvies.
