-- Drop briefing_history — onderdeel van het verwijderde AI-DAIshboard-
-- briefingsysteem ("Systeem B").
--
-- Deze tabel sloeg de door /api/briefing/compose gegenereerde AI-kaarten op en
-- werd uitsluitend gelezen/geschreven door /api/briefing/history + de
-- DAIshboard-component (components/dashboard/daishboard.tsx). Die hele keten is
-- verwijderd omdat het systeem nergens meer bereikbaar was: de enige mount van
-- DraggableWidgetGrid gaf de briefing-toggle niet door en /dashboard is een
-- redirect. Zie docs/briefing-analyse.md voor de volledige analyse.
--
-- De levende wekelijkse overzicht-briefing ("Systeem A") gebruikt deze tabel
-- NIET — die werkt via profiles.briefing_snapshot (jsonb per ISO-week) en
-- /api/briefing/refresh. Het verwijderen van briefing_history raakt dat systeem
-- dus niet.

drop table if exists public.briefing_history cascade;
