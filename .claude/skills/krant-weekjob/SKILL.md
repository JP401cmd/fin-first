---
name: krant-weekjob
description: Gebruik om de wekelijkse Krant-cron (/api/krant/cron — schaduweditie per lezer + de weekmeting op /beheer/nieuws) vanuit een Claude-sessie te draaien, zonder CRON_SECRET en zonder Vercel. Nodig als de maandagrun ontbrak of op het tijdbudget afbrak, of om een week opnieuw te meten nadat er ná de meting nog geduid is. Onderdeel van /krant-ochtend.
---

# Krant-weekjob — de weekcron vanuit een sessie

**Eerste regel — dit is de échte route, geen tweede implementatie, en hij schrijft naar productie pas na een expliciet ja van de eigenaar.** `scripts/krant/ochtend.ts weekjob` importeert `GET` uit `app/api/krant/cron/route.ts` en roept hem lokaal aan met de service-sleutel uit `.env.local`. Er zit geen AI in de weekjob.

## Wanneer

`npx tsx scripts/krant/ochtend.ts status --env <pad>/.env.local` zegt het in de regel `TE DOEN`:
- `weekjob`: er is voor de huidige ISO-week (Amsterdam) nog geen geslaagde run, of hij brak af op het tijdbudget;
- `weekjob-hermeten`: er werd ná de laatste weekmeting nog in de gemeten week geduid (door een inhaalslag of de cron), of de laatste meting eindigde in `error`. De meting op /beheer/nieuws is dan verouderd.

Op maandag vóór ~09:00 (Amsterdam) meldt `status` nog geen `weekjob`: dan is de Vercel-run nog niet te laat.

Geen van beide? Dan niets doen. Normaal draait Vercel hem op maandag om 06:00 UTC.

## Stappen

1. **Status (alleen lezen)**: zie hierboven.
2. **Akkoord**: noem de eigenaar wat de run doet. Hij maakt ontbrekende schaduwedities voor deze week (bestaande worden overgeslagen, idempotent per week) en schrijft een nieuwe weekmeting-rij. Binnen `/krant-ochtend` hoort dit bij het ene gebundelde akkoord.
3. **Draaien**, vanuit een schone checkout van origin/master:
   ```
   npx tsx scripts/krant/ochtend.ts weekjob --env <pad>/.env.local --ja
   ```
   Je ziet `HTTP 200` en de summary. Die bevat alleen tellingen: gebruikers, edities, leeg, overgeslagen en fouten.
4. **Nameten**: draai `status` opnieuw. De weekjob staat op `gedaan`, en "ná de meting geduid" staat op 0.

## Grenzen

- Weigert tenzij `lib/krant`, `app/api/krant/cron`, `lib/briefing`, `lib/news-ingest.ts` en `scripts/krant` schoon zijn, HEAD gelijk is aan origin/master en de Supabase-URL naar het productieproject wijst.
- De route logt bij een mislukte gebruiker diens UUID en de ruwe fout. Herhaal die niet in het rapport; noem alleen het aantal.
- De route bewaakt zelf zijn tijdbudget (240 s). Brak hij af (`tijdBudgetOp`), draai hem dan nog eens: de rest wordt afgemaakt.
- De tijdlijn-cron van 1C (`/api/krant/tijdlijn/cron`) is nog niet opgenomen. Neem hem op als 1C op master staat.
