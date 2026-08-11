-- Opruimen van de dode roadmap-backend — DEEL 2 van 2 (DATA).
-- Deel 1 (20260811020000) dropt de tabel. Dit bestand raakt alléén data, geen schema.
--
-- WAT HIER WEG GAAT
--   één rij uit public.app_settings met key = 'roadmap_overlays' (878 tekens tekst).
--
-- DIT IS DE ENIGE STAP IN DEZE OPRUIMING DIE ECHT DATA VERWIJDERT.
-- De tabel uit deel 1 had nul rijen; deze sleutel heeft wél inhoud. Daarom staat de
-- volledige waarde hieronder LETTERLIJK in dit bestand: daarmee is de verwijdering
-- triviaal terug te draaien en verdwijnt er niets uit de geschiedenis.
--
-- WAAROM 'M TOCH WEG KAN — gemeten READ-ONLY tegen de live database, 11-08-2026:
--   * De sleutel is voor het laatst geschreven op 19-03-2026 (updated_at), bijna vijf
--     maanden geleden. Alle acht overlay-entries dragen een updated_at van 19-03-2026.
--   * De enige lezer/schrijver was app/api/roadmap/route.ts, dat in dezelfde wijziging
--     als deze migratie is verwijderd. Repo-brede grep op 'roadmap_overlays' gaf buiten
--     die route nul treffers.
--   * Sterker nog: die code kón deze sleutel al niet meer bereiken. De route las eerst
--     roadmap_features en deed `if (!tableError && tableData) return ...`. Met een lege
--     tabel is tableData een lege array — truthy — dus de route gaf altijd [] terug en
--     viel NOOIT door naar de app_settings-fallback. Sinds de tabel bestaat (maart 2026)
--     was deze sleutel dus onbereikbare code.
--   * De inhoud is bovendien verweesd: de entries verwijzen naar feature_nr 1..8 van een
--     genummerde roadmap-lijst die in juni 2026 met de pagina is verwijderd. Zonder die
--     lijst betekenen de nummers niets meer.
--
-- DE VOLLEDIGE WAARDE, VOOR HERSTEL (md5 d27c291f8636c867c571e6a7dd23179f, 878 tekens).
-- Terugzetten = onderstaande insert in een NIEUWE migratie draaien:
--
--   insert into public.app_settings (key, value)
--   values ('roadmap_overlays', $roadmap$[{"feature_nr":1,"fase":"a","status":"backlog","opmerkingen":null,"updated_at":"2026-03-19T13:03:31.130Z"},{"feature_nr":2,"fase":"a","status":"in_ontwikkeling","opmerkingen":"nu gevraagd","updated_at":"2026-03-19T14:34:55.978Z"},{"feature_nr":5,"fase":"a","status":"afgerond","opmerkingen":null,"updated_at":"2026-03-19T14:44:52.764Z"},{"feature_nr":6,"fase":"a","status":"afgerond","opmerkingen":null,"updated_at":"2026-03-19T14:44:51.349Z"},{"feature_nr":8,"fase":"a","status":"afgerond","opmerkingen":null,"updated_at":"2026-03-19T14:44:45.184Z"},{"feature_nr":7,"fase":"a","status":"afgerond","opmerkingen":null,"updated_at":"2026-03-19T14:44:48.372Z"},{"feature_nr":3,"fase":"a","status":"in_ontwikkeling","opmerkingen":null,"updated_at":"2026-03-19T14:45:17.259Z"},{"feature_nr":8,"fase":"b","status":"backlog","opmerkingen":null,"updated_at":"2026-03-19T15:31:13.805Z"}]$roadmap$)
--   on conflict (key) do update set value = excluded.value;

-- ── Slot op de deur ───────────────────────────────────────────────────────────────
--
-- Tussen het schrijven van deze migratie en het toepassen ervan zit de release-stap.
-- Wijkt de inhoud dan af van wat hierboven is vastgelegd, dan is er in de tussentijd
-- gescheven — en dan klopt de dood-claim niet meer. Liever luid falen dan data weggooien
-- die niet in dit bestand bewaard is.
do $$
declare
  huidige_md5 text;
begin
  select md5(value) into huidige_md5
  from public.app_settings where key = 'roadmap_overlays';

  if huidige_md5 is null then
    raise notice 'app_settings-sleutel roadmap_overlays bestaat hier niet (meer) — niets te doen.';
    return;
  end if;

  if huidige_md5 <> 'd27c291f8636c867c571e6a7dd23179f' then
    raise exception
      'Verwijdering afgebroken: de inhoud van roadmap_overlays is gewijzigd sinds de meting van 11-08-2026 '
      '(md5 % i.p.v. d27c291f8636c867c571e6a7dd23179f). Er is dus alsnog een schrijver, en de waarde die in deze '
      'migratie bewaard is dekt de huidige inhoud niet meer. Onderzoek dat eerst.', huidige_md5;
  end if;

  raise notice 'roadmap_overlays ongewijzigd sinds 11-08-2026 — verwijderen is veilig, waarde staat in dit bestand.';
end;
$$;

-- ── De verwijdering ───────────────────────────────────────────────────────────────
--
-- Idempotent: opnieuw draaien raakt 0 rijen. Precies één rij verwacht (key is de
-- primaire sleutel van app_settings), dus geen risico op een te brede delete.
delete from public.app_settings where key = 'roadmap_overlays';

-- ── De terugweg ───────────────────────────────────────────────────────────────────
--
-- Zie de insert in het commentaarblok hierboven; de waarde is volledig bewaard, dus
-- herstel is één nieuwe migratie zonder informatieverlies.
--
-- WAARAAN ZIE JE DAT HET MISGING: niets in de app leest deze sleutel nog, dus er is geen
-- functioneel signaal te verwachten. Zou er onverhoopt tóch een lezer opduiken, dan geeft
-- die een lege lijst terug (de oude route deed dat bij een ontbrekende sleutel ook al) —
-- geen fout, geen crash.
