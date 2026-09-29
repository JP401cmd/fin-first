-- Krant 1E: de Krant met AI als LAAG op de tijdlijn zonder AI (ADR 0190).
-- Eigenaarsbesluiten 29-09-2026 (K1–K9, kaart 1E):
--   K1  De Krant met AI is dezelfde tijdlijnverversing met krant_edities.met_ai
--       = true. krant_variant = 'ai' betekent voortaan "tijdlijn + AI-laag";
--       de AI-keuze wist de tijdlijn niet meer.
--   K7  De oude AI-edities (news_editions + de lopende caches in app_settings
--       onder news_cache:*) worden omgezet naar krant_edities (bron 'tijdlijn',
--       met_ai = true) met items vorm 'ai-oud', ZONDER de oude modeltekst
--       (personalImpact; security-run R2). De oude tabel en sleutels BLIJVEN.
--   K8  krant_editie_items.ai_tekst + ai_toegevoegd, vorm-CHECK += 'ai', 'ai-oud'. De
--       matcher-`tekst` blijft altijd staan als terugval per bericht.
--
-- ── Lineage ───────────────────────────────────────────────────────────────────
-- Bouwt op 20261004120000_krant_tijdlijn_beta (bron 'tijdlijn', vorm 'raakt',
-- krant_editie_items.tijdlijn, de partiële unieke index lezer + artikel). Die
-- migratie staat sinds 29-09-2026 in productie; deze komt erna (volgorde op
-- tijdstempel). Raakt verder alleen
-- public.news_editions en public.app_settings (alleen LEZEN).
--
-- ── Wat er verandert ──────────────────────────────────────────────────────────
-- krant_editie_items.vorm        CHECK += 'ai' (een door het model toegevoegd
--                                bericht, K3 — altijd met AI-tekst) en 'ai-oud'
--                                (een omgezet bericht uit de oude AI-Krant, K7 —
--                                nooit met AI-tekst, nooit met artikel).
-- krant_editie_items.ai_tekst    De toelichting van het model onder de regel
--                                voor jou (≤ 3 zinnen, alleen euro's, gegrond).
--                                NULL = geen AI-tekst (de matcherregel staat).
-- krant_editie_items.ai_toegevoegd  true = het MODEL koos dit bericht uit de
--                                kandidaten (hoogstens 3 per verversing). Zo'n
--                                bericht heeft wél een article_id en valt dus
--                                onder de partiële unieke index lezer + artikel.
-- krant_edities.ai_uitkomst      Wat de AI-laag bij deze verversing deed:
--                                'met-ai' (≥ 1 AI-tekst bleef staan, of een schoon
--                                leeg antwoord: niets toe te voegen) ·
--                                'teruggevallen' (model aangeroepen, niets bleef
--                                staan: fout, schema of guards) · 'quotum'
--                                (weeklimiet, geen call) · 'geweigerd' (een poort
--                                weigerde, geen call) · 'leeg' (niets om toe te
--                                lichten, geen call) · NULL (geen AI-laag: de
--                                lezer koos zonder AI, of een omgezette editie).
--                                Het quotum (K5, 5 per lezer per 7 dagen) telt
--                                'met-ai' + 'teruggevallen' — elke modelcall, ook
--                                een mislukte — én ai_token_usage (feature
--                                krant_ai), want krant_edities heeft een eigen-rij
--                                DELETE-policy (security-run Y1). met_ai =
--                                (ai_uitkomst = 'met-ai').
-- krant_edities.oud_ref          Herkomst van een OMGEZETTE editie:
--                                'ai-oud:<user_id>:<md5 van de artikelen>'. Uniek
--                                (partieel): een tweede run maakt geen dubbelen,
--                                ook niet als een cache later alsnog in
--                                news_editions is gearchiveerd (zelfde inhoud,
--                                zelfde hash).
--
-- ── Toegangsmodel ─────────────────────────────────────────────────────────────
-- Ongewijzigd: eigen-rij SELECT/DELETE voor authenticated, schrijven alleen
-- service-role. De tabelbrede `revoke insert, update … from authenticated` van
-- 20260922120000 dekt de nieuwe kolommen al (geen kolomgrant = geen recht); de
-- expliciete revoke hieronder maakt dat leesbaar in de bron en is een no-op als
-- het recht er al niet was. Een lezer kan dus nooit zelf een AI-tekst of
-- "door AI toegevoegd" op een eigen bericht zetten. anon: niets.
--
-- ── AVG ───────────────────────────────────────────────────────────────────────
-- Geen nieuwe tabel: beide tabellen staan al in lib/user-data-tables.ts (wis +
-- zelfexport) en cascaden bij accountverwijdering. De omgezette edities vallen
-- onder de bewaartermijn van de tijdlijn (120 dagen, ruimAlleTijdlijnenOp) —
-- daarom zet deze migratie alleen edities van de afgelopen 120 dagen om: een
-- oudere zou de eerstvolgende cronrun toch weer verdwijnen. De oude rijen in
-- news_editions en app_settings blijven staan (K7); hun opruiming is een eigen,
-- latere migratie.
--
-- ── Uitrolvolgorde ────────────────────────────────────────────────────────────
-- In ÉÉN transactie (begin … commit via execute_sql, met de expliciete
-- versie-INSERT ('20261008120000','krant_ai_laag') in
-- supabase_migrations.schema_migrations), ná 20261004120000 en VÓÓR de code:
-- de leesloader selecteert ai_tekst/ai_toegevoegd/ai_uitkomst. Het DO-blok
-- hieronder is fail-closed: vindt het een cache zonder geldige JSON (de waarde
-- is TEKST in productie en wordt als tekst gevalideerd), een onbekende
-- sleutelvorm, een editie zonder lijst of een item dat geen object is, dan stopt het met een
-- EXCEPTION en rolt de hele transactie terug — liever geen omzetting dan een
-- halve. Daarna scripts/verify-krant-ai-laag-rls.sql draaien.
--
-- ── Terugweg ──────────────────────────────────────────────────────────────────
-- Vooruit corrigeren. Een correctiemigratie (1) verwijdert de omgezette edities
-- (`delete from krant_edities where oud_ref is not null`, items cascaden), (2)
-- zet ai_uitkomst/ai_tekst op NULL en ai_toegevoegd op false, (3) verwijdert de
-- items met vorm 'ai' en 'ai-oud' en zet daarna de vorm-CHECK terug, (4) dropt de kolommen,
-- CHECKs en indexen. Pas nadat de code die ze schrijft is teruggedraaid.
-- Signaal dat het misging: job_runs 'krant-tijdlijn' met aiTerugvalLaag ≈
-- aiLezers run na run (de laag valt steeds helemaal terug), of een NOTICE-telling
-- van de omzetting die niet klopt met `select count(*) from news_editions`.

-- ── krant_editie_items: vorm 'ai' + de AI-kolommen ───────────────────────────

alter table public.krant_editie_items drop constraint if exists krant_editie_items_vorm_check;
alter table public.krant_editie_items
  add constraint krant_editie_items_vorm_check check (vorm in ('direct', 'gevoeligheid', 'relevant', 'raakt', 'ai', 'ai-oud'));

alter table public.krant_editie_items
  add column if not exists ai_tekst text,
  add column if not exists ai_toegevoegd boolean not null default false;

-- Een AI-tekst is kort (≤ 3 zinnen, ≤ 480 tekens in code); 2000 is de ruime
-- databasegrens die één rij klein houdt.
alter table public.krant_editie_items drop constraint if exists krant_editie_items_ai_tekst_lengte_check;
alter table public.krant_editie_items
  add constraint krant_editie_items_ai_tekst_lengte_check check (ai_tekst is null or char_length(ai_tekst) <= 2000);

-- "Door AI toegevoegd" zonder AI-tekst bestaat niet (de server laat zo'n
-- bericht vallen als zijn tekst de guards niet haalt).
alter table public.krant_editie_items drop constraint if exists krant_editie_items_ai_toegevoegd_check;
alter table public.krant_editie_items
  add constraint krant_editie_items_ai_toegevoegd_check check (not ai_toegevoegd or ai_tekst is not null);

-- Vorm 'ai' (een door de laag toegevoegd bericht) heeft altijd een getoetste
-- AI-tekst. Vorm 'ai-oud' (een omgezet bericht uit de oude AI-Krant, K7) heeft
-- NOOIT een AI-tekst en geen artikel: de oude personalImpact is nooit door
-- toetsAiTekst gegaan (de oude prompt eiste vrijheidstijd en eigen bedragen) en
-- wordt dus niet overgenomen; het bericht als geheel draagt in de UI het label
-- "Uit de eerdere Krant met AI" (security-run R2, 29-09).
alter table public.krant_editie_items drop constraint if exists krant_editie_items_ai_vorm_check;
alter table public.krant_editie_items
  add constraint krant_editie_items_ai_vorm_check check (
    (vorm <> 'ai' or ai_tekst is not null)
    and (vorm <> 'ai-oud' or (ai_tekst is null and article_id is null and not ai_toegevoegd))
  );

-- Vorm 'ai'/'ai-oud' en een AI-tekst bestaan alleen in de tijdlijn, nooit in de schaduw.
alter table public.krant_editie_items drop constraint if exists krant_editie_items_ai_alleen_tijdlijn_check;
alter table public.krant_editie_items
  add constraint krant_editie_items_ai_alleen_tijdlijn_check check (tijdlijn or (vorm not in ('ai', 'ai-oud') and ai_tekst is null and not ai_toegevoegd));

comment on column public.krant_editie_items.ai_tekst is
  'Krant 1E (ADR 0190): de toelichting van het model onder de regel voor jou, altijd door toetsAiTekst gegaan. NULL = geen AI-tekst; de matcherregel (tekst) blijft altijd de terugval. Vorm ai (toegevoegd) heeft hem altijd; vorm ai-oud (omgezet uit de oude AI-Krant) nooit. Alleen service-role schrijft.';
comment on column public.krant_editie_items.vorm is
  'direct | gevoeligheid | relevant | raakt (matcher) · ai (door de AI-laag toegevoegd, Krant 1E) · ai-oud (omgezet uit de oude AI-Krant, K7: kop en samenvatting door het oude model, zonder AI-tekst).';
comment on column public.krant_editie_items.ai_toegevoegd is
  'Krant 1E (ADR 0190): true = het model koos dit bericht uit de kandidaten die de matcher niet koos (hoogstens 3 per verversing). Alleen service-role schrijft.';

revoke insert (ai_tekst, ai_toegevoegd), update (ai_tekst, ai_toegevoegd) on table public.krant_editie_items from authenticated;
revoke all on table public.krant_editie_items from anon;

-- ── krant_edities: uitkomst van de laag + herkomst van omgezette edities ─────

alter table public.krant_edities
  add column if not exists ai_uitkomst text,
  add column if not exists oud_ref text;

alter table public.krant_edities drop constraint if exists krant_edities_ai_uitkomst_check;
alter table public.krant_edities
  add constraint krant_edities_ai_uitkomst_check
  check (ai_uitkomst is null or ai_uitkomst in ('met-ai', 'teruggevallen', 'quotum', 'geweigerd', 'leeg'));

alter table public.krant_edities drop constraint if exists krant_edities_met_ai_consistent_check;
alter table public.krant_edities
  add constraint krant_edities_met_ai_consistent_check check (ai_uitkomst is null or met_ai = (ai_uitkomst = 'met-ai'));

alter table public.krant_edities drop constraint if exists krant_edities_ai_alleen_tijdlijn_check;
alter table public.krant_edities
  add constraint krant_edities_ai_alleen_tijdlijn_check check (bron = 'tijdlijn' or (ai_uitkomst is null and oud_ref is null));

alter table public.krant_edities drop constraint if exists krant_edities_oud_ref_check;
alter table public.krant_edities
  add constraint krant_edities_oud_ref_check check (oud_ref is null or (met_ai and oud_ref ~ '^ai-oud:[0-9a-f-]{36}:[0-9a-f]{32}$'));

create unique index if not exists krant_edities_oud_ref_key
  on public.krant_edities (oud_ref)
  where oud_ref is not null;

-- Het quotum (K5) telt per lezer de aanroepen van de laatste 7 dagen.
create index if not exists idx_krant_edities_ai_quotum
  on public.krant_edities (user_id, created_at desc)
  where ai_uitkomst in ('met-ai', 'teruggevallen');

comment on column public.krant_edities.ai_uitkomst is
  'Krant 1E (ADR 0190): met-ai (bruikbaar antwoord, ook een schoon leeg) | teruggevallen | quotum | geweigerd | leeg | NULL (geen AI-laag). Het quotum telt met-ai + teruggevallen, naast ai_token_usage. met_ai = (ai_uitkomst = ''met-ai'').';
comment on column public.krant_edities.oud_ref is
  'Krant 1E (ADR 0190, K7): herkomst van een omgezette editie uit de oude AI-Krant — ai-oud:<user_id>:<md5 van de artikelen>. Uniek: de omzetting is herhaalbaar.';

revoke insert (ai_uitkomst, oud_ref), update (ai_uitkomst, oud_ref) on table public.krant_edities from authenticated;
revoke all on table public.krant_edities from anon;

-- ── K7: de oude AI-edities omzetten (herhaalbaar, fail-closed) ───────────────
-- Twee bronnen: news_editions (het archief) en app_settings news_cache:<uid>
-- (de lopende editie). LET OP: app_settings.value is in productie TEXT (live
-- gemeten 29-09: `jsonb_typeof(text)` bestaat niet, 42883). Daarom wordt de
-- waarde hier uitsluitend als tekst gelezen (`s.value::text` — werkt ook als
-- een omgeving de kolom als jsonb heeft) en pas na `pg_input_is_valid` naar
-- jsonb gecast. Een dubbel gecodeerde waarde (een JSON-string met de editie
-- erin) wordt op de AL GEPARSTE waarde nog één keer uitgepakt.
--
-- Per bron-editie één krant_edities-rij + één item per NewsItem, in de
-- oorspronkelijke volgorde. Alleen edities met ≥ 1 bericht, van een bestaand
-- account, van de afgelopen 120 dagen. De hash over de artikelen maakt een
-- tweede run een no-op.
--
-- WAT ER VAN EEN OUD BERICHT MEEGAAT (security-run R2, 29-09): kop, rubriek,
-- bron, link, datum en samenvatting — als momentopname, vorm 'ai-oud'. De oude
-- `personalImpact` gaat NIET mee, nergens: de oude prompt eiste vrijheidstijd
-- en eigen rekenwerk en die tekst is nooit door toetsAiTekst gegaan. Omdat ook
-- kop en samenvatting door het oude model zijn geschreven, draagt het hele
-- bericht in de UI het label "Uit de eerdere Krant met AI".
--
-- DATUM: nooit in de toekomst. Een cache kan door de lezer zelf geschreven
-- zijn (app_settings, eigen sleutel), dus `generatedAt` is onbetrouwbaar:
-- least(generatedAt, now()); ontbreekt of is hij ongeldig, dan
-- least(app_settings.updated_at, now()); ontbreekt ook die, dan wordt de cache
-- overgeslagen.

do $$
declare
  ongeldig integer;
  r record;
  ref text;
  e_id uuid;
  n_items integer;
  n_geschreven integer;
  n_edities integer := 0;
  n_berichten integer := 0;
  n_overgeslagen integer := 0;
begin
  -- 1. Sleutelvorm: news_cache:<uuid>. Een andere vorm is onbekend terrein.
  select count(*) into ongeldig
    from public.app_settings s
   where s.key like 'news_cache:%'
     and s.key !~ '^news_cache:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if ongeldig > 0 then
    raise exception 'krant_ai_laag: % news_cache-sleutel(s) met een onbekende vorm — eerst beoordelen', ongeldig;
  end if;

  -- 2a. De waarde als TEKST: moet geldige JSON zijn.
  select count(*) into ongeldig
    from public.app_settings s
   where s.key like 'news_cache:%'
     and (s.value is null or not pg_input_is_valid(s.value::text, 'jsonb'));
  if ongeldig > 0 then
    raise exception 'krant_ai_laag: % news_cache-rij(en) zonder geldige JSON — eerst opschonen', ongeldig;
  end if;

  -- 2b. Na stap 2a is de cast veilig. Geparst: een object, of een JSON-string
  -- (dubbel gecodeerd) waarvan de inhoud zelf geldige JSON is.
  select count(*) into ongeldig
    from (
      select s.value::text::jsonb as p
        from public.app_settings s
       where s.key like 'news_cache:%'
    ) c
   where not (
     jsonb_typeof(c.p) = 'object'
     or (jsonb_typeof(c.p) = 'string' and pg_input_is_valid(c.p #>> '{}', 'jsonb'))
   );
  if ongeldig > 0 then
    raise exception 'krant_ai_laag: % news_cache-rij(en) die geen editie bevatten — eerst beoordelen', ongeldig;
  end if;

  -- 3. Een editie heeft een lijst berichten. Na stap 2b is elke cast veilig.
  select count(*) into ongeldig
    from (
      select case jsonb_typeof(s.value::text::jsonb)
               when 'string' then (s.value::text::jsonb #>> '{}')::jsonb
               else s.value::text::jsonb
             end as v
        from public.app_settings s
       where s.key like 'news_cache:%'
    ) c
   where jsonb_typeof(c.v -> 'items') is distinct from 'array';
  select ongeldig + count(*) into ongeldig
    from public.news_editions e
   where jsonb_typeof(e.articles) <> 'array';
  if ongeldig > 0 then
    raise exception 'krant_ai_laag: % oude editie(s) zonder lijst berichten — eerst beoordelen', ongeldig;
  end if;

  for r in
    with caches as (
      select substr(s.key, 12)::uuid as user_id,
             case jsonb_typeof(s.value::text::jsonb)
               when 'string' then (s.value::text::jsonb #>> '{}')::jsonb
               else s.value::text::jsonb
             end as v,
             s.updated_at as bijgewerkt
        from public.app_settings s
       where s.key like 'news_cache:%'
    ),
    bronnen as (
      select c.user_id,
             c.v -> 'items' as items,
             least(
               coalesce(
                 case
                   when jsonb_typeof(c.v -> 'generatedAt') = 'string' and pg_input_is_valid(c.v ->> 'generatedAt', 'timestamptz')
                     then (c.v ->> 'generatedAt')::timestamptz
                 end,
                 c.bijgewerkt
               ),
               now()
             ) as gemaakt
        from caches c
      union all
      select e.user_id, e.articles as items, least(e.created_at, now()) as gemaakt
        from public.news_editions e
    )
    select b.user_id, b.items, b.gemaakt
      from bronnen b
     where b.gemaakt is not null
       and exists (select 1 from auth.users u where u.id = b.user_id)
       and b.gemaakt >= now() - interval '120 days'
       and jsonb_array_length(b.items) > 0
     order by b.user_id, b.gemaakt
  loop
    n_items := jsonb_array_length(r.items);
    if exists (select 1 from jsonb_array_elements(r.items) x(a) where jsonb_typeof(x.a) <> 'object') then
      raise exception 'krant_ai_laag: een oude editie van % bevat een bericht dat geen object is', r.user_id;
    end if;
    if n_items > 32767 then
      raise exception 'krant_ai_laag: een oude editie van % heeft % berichten (smallint)', r.user_id, n_items;
    end if;

    ref := 'ai-oud:' || r.user_id::text || ':' || md5(r.items::text);
    if exists (select 1 from public.krant_edities k where k.oud_ref = ref) then
      n_overgeslagen := n_overgeslagen + 1;
      continue;
    end if;

    insert into public.krant_edities (
      user_id, week_key, bron, met_ai, ai_uitkomst, oud_ref,
      matcher_versie, sjabloon_versie, profiel_versie, profiel_type, profiel_snapshot,
      leeg, lege_tekst, item_count, algemeen, created_at
    ) values (
      r.user_id,
      to_char(r.gemaakt at time zone 'Europe/Amsterdam', 'IYYY"-W"IW'),
      'tijdlijn', true, null, ref,
      0, 0, 0, 'ai-oud', '{}'::jsonb,
      false, null, n_items, '{}'::jsonb, r.gemaakt
    )
    returning id into e_id;

    insert into public.krant_editie_items (
      editie_id, user_id, article_id, tijdlijn, positie, vorm, score, mechanisme,
      sjabloon_id, variant, slots, tekst, ai_tekst, ai_toegevoegd, impact, deadline,
      wat_mist, waarom, snapshot, created_at
    )
    select
      e_id,
      r.user_id,
      null,
      true,
      (x.nr - 1)::smallint,
      'ai-oud',
      case
        when jsonb_typeof(x.a -> 'impactScore') = 'number'
          then least(5, greatest(1, round((x.a ->> 'impactScore')::numeric)))::smallint
        else 1::smallint
      end,
      null,
      'ai-oud',
      0,
      '{}'::jsonb,
      '',
      null,
      false,
      null,
      null,
      '{}'::text[],
      array['ai:oude-krant']::text[],
      jsonb_build_object(
        'titel', x.a ->> 'headline',
        'rubriek', x.a ->> 'category',
        'bron', x.a ->> 'sourceName',
        'url', x.a ->> 'sourceUrl',
        'gepubliceerd', x.a ->> 'date',
        -- De oude samenvatting is door het model geschreven, met het profiel van
        -- de lezer in context. Draagt ze een bedrag of spreekt ze de lezer aan,
        -- dan vervalt ze: zo'n tekst is nooit getoetst (security-hertoets 29-09).
        'samenvatting', case
          when (x.a ->> 'summary') ~* '(€|\m(je|jouw|jij|uw)\M)' then null
          else nullif(x.a ->> 'summary', '')
        end
      ),
      r.gemaakt
    from jsonb_array_elements(r.items) with ordinality as x(a, nr);

    get diagnostics n_geschreven = row_count;
    if n_geschreven <> n_items then
      raise exception 'krant_ai_laag: % van % berichten omgezet voor editie % — afgebroken', n_geschreven, n_items, ref;
    end if;

    n_edities := n_edities + 1;
    n_berichten := n_berichten + n_items;
  end loop;

  raise notice 'krant_ai_laag: % oude AI-edities omgezet (% berichten), % al eerder omgezet', n_edities, n_berichten, n_overgeslagen;
end $$;
