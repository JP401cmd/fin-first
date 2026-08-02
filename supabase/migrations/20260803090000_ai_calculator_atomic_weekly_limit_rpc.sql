-- Atomaire weekteller voor de AI-rekenhulp (tweede vindplaats van ADR 0076).
--
-- ── Het gebrek ────────────────────────────────────────────────────────────────
-- `lib/calculator/rate-limit.ts` bewaakte de weeklimiet van 10 generaties + 5
-- verfijningen per gebruiker met drie losse stappen in applicatiecode:
--
--   1. SELECT  ai_calculator_usage  → `generations, refinements`
--   2. if (teller >= limiet) → 429
--   3. UPSERT  set <teller> = <gelezen waarde> + 1
--
-- Dezelfde TOCTOU als bij de bank-synchronisatie (ADR 0076,
-- 20260802140500_bank_sync_atomic_daily_limit_rpc.sql). Twee gelijktijdige
-- generaties — twee tabbladen, een dubbelklik, een herhaling na een timeout —
-- lezen in stap 1 dezelfde stand, concluderen in stap 2 allebei dat er ruimte
-- is, en schrijven in stap 3 allebei `n + 1`. De tweede UPSERT overschrijft de
-- eerste met dezelfde waarde: twee LLM-generaties, teller +1. Erger nog dan bij
-- de bank, want de UPSERT stuurde een volledig gereconstrueerde rij mee — óók
-- de teller die dit verzoek niet ophoogde. Twee gelijktijdige verzoeken van
-- verschillende soort (één generatie, één verfijning) draaiden elkaars ophoging
-- dus letterlijk terug.
--
-- De oude module-docstring beweerde het tegenovergestelde ("Increment via
-- UPSERT-met-+1 zodat we geen race hoeven te beheren"). Dat klopte niet: de +1
-- werd in TypeScript berekend, niet door de database.
--
-- ── Waarom dit minder duur is dan de bankvariant — en toch fout ───────────────
-- Deze rem beschermt tegen AI-kosten, niet tegen een externe blokkade. Een
-- doorgeglipte generatie kost één LLM-aanroep; bij de bank kostte ze tot vijf
-- provider-verzoeken én het risico dat de rekening voor langere tijd op slot
-- ging. De urgentie is dus lager, de vorm van de fout identiek — en ADR 0076
-- benoemde deze vindplaats expliciet als "bij de eerstvolgende aanraking op
-- dezelfde vorm brengen".
--
-- ── De oplossing: één statement, geen venster ─────────────────────────────────
-- Lezen, controleren en ophogen gebeuren nu in ÉÉN
-- `INSERT … ON CONFLICT DO UPDATE … WHERE … RETURNING`. Twee gevallen:
--
--   · Rij bestaat nog niet (eerste verbruik van de week) → de INSERT-tak
--     slaagt en zet de juiste teller op 1. Twee gelijktijdige eerste verzoeken
--     kunnen niet allebei invoegen: de tweede blokkeert op de unieke index van
--     de primaire sleutel en valt daarna alsnog in de DO UPDATE-tak.
--   · Rij bestaat wél → Postgres neemt een rijvergrendeling, de tweede sessie
--     wacht op de commit van de eerste en her-evalueert daarna (READ COMMITTED)
--     zowel de `where` van de DO UPDATE-tak als de `set`-expressie tegen de
--     NIEUWE rijversie. De limiet zit ín die `where`, dus de tweede sessie ziet
--     de opgehoogde stand en werkt 0 rijen bij → geweigerd.
--
-- Er is geen moment tussen "gelezen" en "geschreven" waarin een ander verzoek
-- zich ertussen kan wringen. En omdat de `set` de opgeslagen waarde ophoogt
-- (`u.generations + …`) in plaats van een in de applicatie berekende waarde
-- terug te schrijven, kan een gelijktijdig verzoek van de ándere soort ook
-- niets meer terugdraaien.
--
-- ── "Geweigerd" versus "rij bestond niet" ─────────────────────────────────────
-- Bij de bankvariant kon een 0-rijen-UPDATE drie dingen betekenen en was een
-- tweede query nodig om 404 van 429 te onderscheiden. Hier niet: de INSERT-tak
-- draagt géén `where`, dus zolang de limiet ≥ 1 is slaagt hij altijd wanneer de
-- rij ontbreekt. **0 rijen betekent daarom onvermijdelijk: de rij bestond, en de
-- limiet weigerde.** Die redenering staat of valt met "limiet ≥ 1", dus dat
-- wordt hieronder expliciet afgevangen (`v_limit < 1` → meteen weigeren) in
-- plaats van er stilzwijgend op te vertrouwen.
--
-- De tweede query is er nog wél, met een andere taak dan bij de bank: niet om
-- 404 van 429 te scheiden, maar om de ACTUELE stand op te halen voor de
-- 429-tekst ("je hebt 10 van 10 gebruikt"). Vindt die query onverwacht niets,
-- dan vallen we terug op 0/0 in plaats van te gokken.
--
-- ── Twee tellers, één functie ─────────────────────────────────────────────────
-- `generations` (10/week) en `refinements` (5/week) zijn ONAFHANKELIJK begrensd:
-- ze staan in twee kolommen van dezelfde rij, met twee eigen plafonds, en de
-- route kiest de soort puur op "is er een `refineFrom` meegestuurd". Een op zijn
-- generaties uitgelopen gebruiker mag zijn opgeslagen concept dus nog steeds
-- verfijnen.
--
-- Eén functie met een `p_kind`-parameter, niet twee functies. Motivering: de
-- weeksleutel, de aanroepervalidatie, de INSERT-tak en de rijvergrendeling zijn
-- letterlijk identiek voor beide soorten — twee functies zouden dat allemaal
-- verdubbelen, inclusief de kans dat er straks één van de twee wordt bijgewerkt.
-- `p_kind` is bovendien iets anders dan de limiet: het kiest WELKE teller
-- ophoogt, niet HOE HOOG de rem staat. Een aanroeper die met `p_kind` speelt kan
-- alleen de andere (lagere!) teller van zichzelf ophogen — dat is geen
-- privilege-uitbreiding. Een onbekende waarde wordt geweigerd, niet stil naar
-- een van beide gemapt.
--
-- ── De weekgrens: al goed, en nu op één plek ──────────────────────────────────
-- Bij de bank bleek de dagsleutel in UTC te rollen (`toISOString()`), waardoor
-- de teller voor een Nederlandse gebruiker pas om 01:00/02:00 omsloeg. Hier is
-- dat NIET het geval: `getCurrentWeekStart()` gebruikte
-- `Intl.DateTimeFormat` met een expliciete `timeZone: 'Europe/Amsterdam'` en
-- rolde dus wél correct om op maandag 00:00 Nederlandse tijd. Geverifieerd, niet
-- aangenomen.
--
-- Toch verhuist de berekening naar de database, om de reden die bij de bank pas
-- de tweede was: de sleutel hoort niet af te hangen van de lambda die het
-- verzoek toevallig afhandelt, en lezen (badge) en schrijven (reservering)
-- mogen nooit over "welke week is het" van mening verschillen.
-- `date_trunc('week', …)` is in Postgres ISO — maandag — dus gelijk aan wat de
-- TypeScript-variant deed. Geen eenmalig uitrol-randgeval zoals bij de bank:
-- bestaande rijen dragen al de juiste maandag.
--
-- ── De limieten wonen hier, niet in TypeScript ────────────────────────────────
-- 10 en 5 staan in `public.ai_calculator_week_limits()` en zijn met opzet GEEN
-- parameter van de reserveerfunctie: die staat via PostgREST open voor elke
-- ingelogde gebruiker, en met de limiet als argument kan iedereen de rem zelf
-- ophogen (`p_limit => 999999`). Ze komen wél terug in de uitkomst, zodat route,
-- 429-tekst en verbruiksbadge ze kunnen tonen zonder ze te herhalen — dat is
-- precies waarom `MAX_GENERATIONS_PER_WEEK`/`MAX_REFINEMENTS_PER_WEEK` in
-- TypeScript vervallen: één bron, hier.
--
-- ── Toegangsmodel: `security invoker`, bewust ─────────────────────────────────
-- Afwijking van `reserve_bank_sync_slot`, met reden. Die functie moest een rij
-- op `bank_connection_accounts` gezaghebbend kunnen bijwerken en had daarvoor
-- `security definer` nodig. Hier niet: de bestaande RLS-policy op
-- `ai_calculator_usage` ("Users manage own usage", FOR ALL met
-- `auth.uid() = user_id` in zowel `using` als `with check`) geeft de aanroeper
-- exact de toegang die deze functie nodig heeft — niet meer en niet minder. De
-- atomariteit komt van het ENE statement en de rijvergrendeling, niet van
-- verhoogde rechten. `security invoker` houdt RLS dus als tweede slot overeind
-- in plaats van het opzij te zetten.
--
-- Daar bovenop valideert de functie de aanroeper zelf op `auth.uid()`: zonder
-- sessie weigert ze meteen met een nette fout, in plaats van RLS een lege
-- schrijfactie te laten worden. `p_user_id` bestaat niet als parameter — de
-- gebruiker komt uit de sessie, dus niemand kan andermans teller aanraken (ook
-- niet per ongeluk vanuit onze eigen code).
--
-- `set search_path = ''` op alle drie de functies; alles wordt volledig
-- gekwalificeerd aangeroepen (`auth.uid()` is dat al).
--
-- `revoke … from public` staat er expliciet bij: functies krijgen bij creatie
-- EXECUTE aan PUBLIC en rolspecifiek revoken is dan een no-op (les uit
-- 20260729222421). `service_role` krijgt geen grant — dat pad heeft geen
-- `auth.uid()` en zou hier alleen een exception oogsten; systeemschrijven op
-- deze tabel (seed-persona, AVG-wissen) loopt niet via de rem.
--
-- ── UITROLVOLGORDE: EERST DEZE MIGRATIE, DAARNA DE CODE ───────────────────────
-- Anders dan de projectregel die uit een eerdere fout is geleerd ("geen
-- migratie naar remote zonder dat de bijbehorende code gedeployed is") geldt
-- hier de omgekeerde volgorde, en dat is veilig omdat deze migratie
-- UITSLUITEND ADDITIEF is: ze voegt drie functies toe en raakt geen tabel,
-- kolom, constraint of policy aan. De nu draaiende code leest en schrijft
-- `ai_calculator_usage` rechtstreeks en merkt er dus letterlijk niets van; er
-- is geen schrijfpad dat van betekenis verandert.
--
-- Andersom is niet veilig: de nieuwe code roept `reserve_ai_calculator_slot`
-- aan, dus tussen een code-deploy en deze migratie zou ELKE AI-rekenhulp-
-- generatie een 500 geven (functie bestaat niet) en zou de badge verdwijnen.
--
--   1. Deze migratie toepassen (mag ruim vóór de deploy — oude code draait door)
--   2. Code deployen (route + lib/calculator/rate-limit.ts)
--
-- Terugrollen kan zonder migratie: de vorige code-versie werkt op deze functies
-- af te zien. De functies mogen dan blijven staan; ze doen niets zonder
-- aanroeper.

-- ── 1. De limieten — enige bron ───────────────────────────────────────────────
-- Aparte functie zodat de twee getallen op precies één plek staan en de
-- reserveer- én de leesfunctie er niet uit elkaar kunnen lopen. Wie de rem wil
-- wijzigen doet dat in een NIEUWE migratie (create or replace), niet in
-- TypeScript. `authenticated` mag deze lezen: het onthult alleen de plafonds
-- die de verbruiksbadge toch al toont — lezen is geen zetten.
create or replace function public.ai_calculator_week_limits(
  out generation_limit integer,
  out refinement_limit integer
)
language sql
immutable
set search_path = ''
as $$ select 10, 5 $$;

revoke all on function public.ai_calculator_week_limits() from public, anon, authenticated, service_role;
grant execute on function public.ai_calculator_week_limits() to authenticated;

comment on function public.ai_calculator_week_limits() is
  'De weeklimieten van de AI-rekenhulp: 10 generaties + 5 verfijningen per ISO-week per gebruiker. Enige bron van deze twee getallen — public.reserve_ai_calculator_slot en public.ai_calculator_week_usage lezen ze hier, en TypeScript houdt ze niet meer apart bij. Wijzigen gebeurt in een nieuwe migratie.';

-- ── 2. Reserveren — atomair ───────────────────────────────────────────────────
create or replace function public.reserve_ai_calculator_slot(
  p_kind text
)
returns table (
  slot_allowed     boolean,
  slot_kind        text,
  slot_limit       integer,
  slot_used        integer,
  slot_remaining   integer,
  slot_generations integer,
  slot_refinements integer,
  slot_week_start  date
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  -- Maandag 00:00 in Europe/Amsterdam. date_trunc('week', …) is ISO in
  -- Postgres, dus de week begint op maandag — gelijk aan wat de vervallen
  -- TypeScript-helper deed, maar nu ongevoelig voor de tijdzone van de lambda.
  v_week  date := date_trunc('week', (now() at time zone 'Europe/Amsterdam'))::date;
  v_limit integer;
  v_gen   integer;
  v_ref   integer;
  v_rows  integer;
begin
  if v_user is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  if p_kind is null or p_kind not in ('generation', 'refinement') then
    -- Niet stil naar een van beide mappen: een typefout in de aanroeper hoort
    -- luid te falen, niet de verkeerde teller op te hogen.
    raise exception 'Onbekende verbruikssoort: %', coalesce(p_kind, '<null>')
      using errcode = '22023';
  end if;

  select case when p_kind = 'generation' then l.generation_limit else l.refinement_limit end
    into v_limit
  from public.ai_calculator_week_limits() as l;

  -- Draagt de redenering "0 rijen = geweigerd" hieronder. Bij een limiet van 0
  -- zou de INSERT-tak (die géén where heeft) het eerste verzoek van de week
  -- alsnog doorlaten; dat vangen we hier af in plaats van erop te vertrouwen
  -- dat niemand de limiet ooit op 0 zet.
  if v_limit < 1 then
    return query select false, p_kind, v_limit, 0, 0, 0, 0, v_week;
    return;
  end if;

  -- HET hart van deze migratie. Controle en ophoging in hetzelfde statement.
  -- De weekrol vergt hier geen `case`-truc zoals de dagrol bij de bank: de
  -- weeksleutel zit ÍN de primaire sleutel, dus een nieuwe week is simpelweg
  -- een nieuwe rij die de INSERT-tak aanmaakt.
  insert into public.ai_calculator_usage as u (user_id, week_start, generations, refinements)
  values (
    v_user,
    v_week,
    case when p_kind = 'generation' then 1 else 0 end,
    case when p_kind = 'refinement' then 1 else 0 end
  )
  on conflict (user_id, week_start) do update
     set generations = u.generations + case when p_kind = 'generation' then 1 else 0 end,
         refinements = u.refinements + case when p_kind = 'refinement' then 1 else 0 end
   -- De rem. Wordt door een tweede sessie opnieuw geëvalueerd tegen de rij
   -- zoals die is ná de commit van de eerste — dat is precies het venster dat
   -- de read-then-write openliet.
   where case when p_kind = 'generation' then u.generations else u.refinements end < v_limit
  returning u.generations, u.refinements into v_gen, v_ref;

  get diagnostics v_rows = row_count;

  if v_rows = 1 then
    return query
      select true,
             p_kind,
             v_limit,
             case when p_kind = 'generation' then v_gen else v_ref end,
             greatest(0, v_limit - case when p_kind = 'generation' then v_gen else v_ref end),
             v_gen,
             v_ref,
             v_week;
    return;
  end if;

  -- Nul rijen. Zie de kop: dat kan hier maar één ding betekenen — de rij
  -- bestond en de limiet weigerde. Deze query dient dus niet om dat vast te
  -- stellen, maar om de actuele stand op te halen voor de 429-tekst.
  select u.generations, u.refinements
    into v_gen, v_ref
  from public.ai_calculator_usage as u
  where u.user_id = v_user
    and u.week_start = v_week;

  if not found then
    v_gen := 0;
    v_ref := 0;
  end if;

  return query
    select false,
           p_kind,
           v_limit,
           case when p_kind = 'generation' then v_gen else v_ref end,
           greatest(0, v_limit - case when p_kind = 'generation' then v_gen else v_ref end),
           v_gen,
           v_ref,
           v_week;
end;
$$;

revoke all on function public.reserve_ai_calculator_slot(text) from public, anon, authenticated, service_role;
grant execute on function public.reserve_ai_calculator_slot(text) to authenticated;

comment on function public.reserve_ai_calculator_slot(text) is
  'Reserveert atomair één tik op de weekteller van de AI-rekenhulp (10 generaties + 5 verfijningen per ISO-week per gebruiker, weekstart maandag in Europe/Amsterdam). Vervangt de read-then-write in lib/calculator/rate-limit.ts: controle en ophoging zitten in één INSERT ... ON CONFLICT DO UPDATE ... WHERE ... RETURNING, zodat twee gelijktijdige generaties samen nooit meer dan de limiet doorlaten. p_kind kiest de teller (generation|refinement), nooit de limiet — die staat in public.ai_calculator_week_limits() zodat een directe PostgREST-aanroep hem niet kan oprekken. Gebruiker komt uit auth.uid(), niet uit een parameter; security invoker, dus de own-row RLS-policy blijft van kracht. Geeft (slot_allowed, slot_kind, slot_limit, slot_used, slot_remaining, slot_generations, slot_refinements, slot_week_start) terug.';

-- ── 3. Lezen — dezelfde week, dezelfde limieten ───────────────────────────────
-- Alleen voor de verbruiksbadge (`GET /api/calculators/usage`). Hier zit geen
-- race: het is een pure lezing. De functie bestaat omdat de badge anders zijn
-- eigen antwoord op "welke week is het" en "hoe hoog is de rem" zou moeten
-- verzinnen — precies de twee dingen die na deze migratie in de database wonen.
create or replace function public.ai_calculator_week_usage()
returns table (
  usage_week_start       date,
  usage_generations      integer,
  usage_refinements      integer,
  usage_generation_limit integer,
  usage_refinement_limit integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_week date := date_trunc('week', (now() at time zone 'Europe/Amsterdam'))::date;
begin
  if v_user is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  return query
    select v_week,
           coalesce(u.generations, 0),
           coalesce(u.refinements, 0),
           l.generation_limit,
           l.refinement_limit
    from public.ai_calculator_week_limits() as l
    left join public.ai_calculator_usage as u
      on u.user_id = v_user
     and u.week_start = v_week;
end;
$$;

revoke all on function public.ai_calculator_week_usage() from public, anon, authenticated, service_role;
grant execute on function public.ai_calculator_week_usage() to authenticated;

comment on function public.ai_calculator_week_usage() is
  'Leest het AI-rekenhulp-verbruik van de huidige ISO-week voor de ingelogde gebruiker plus de geldende limieten. Geen rij = 0/0. Bestaat zodat de verbruiksbadge dezelfde weekgrens (maandag, Europe/Amsterdam) en dezelfde plafonds gebruikt als public.reserve_ai_calculator_slot; security invoker, dus de own-row RLS-policy filtert mee bovenop de expliciete auth.uid()-vergelijking.';

comment on column public.ai_calculator_usage.generations is
  'Aantal AI-rekenhulp-generaties in de week die bij week_start hoort (rem: 10). Alleen ophogen via public.reserve_ai_calculator_slot() — die doet controle en ophoging in één statement; de vroegere read-then-write in lib/calculator/rate-limit.ts was een TOCTOU waardoor twee gelijktijdige generaties samen maar +1 telden en een gelijktijdige verfijning de ophoging zelfs kon terugdraaien.';

comment on column public.ai_calculator_usage.refinements is
  'Aantal AI-rekenhulp-verfijningen in de week die bij week_start hoort (rem: 5, onafhankelijk van generations). Alleen ophogen via public.reserve_ai_calculator_slot(); zie de comment op generations.';

comment on column public.ai_calculator_usage.week_start is
  'Maandag van de ISO-week waarvoor de tellers gelden, in Europe/Amsterdam. Sinds deze migratie bepaald door de database (date_trunc(''week'', now() at time zone ''Europe/Amsterdam'')) en niet meer door de Vercel-lambda; de week rolt vanzelf om doordat de sleutel deel is van de primaire sleutel — een nieuwe week is een nieuwe rij.';
