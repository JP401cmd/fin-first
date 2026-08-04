-- `public.delete_bank_account` — een betaalrekening verwijderen, in één
-- ondeelbare stap.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- WAAROM DIT EEN RPC IS EN GEEN REEKS AANROEPEN IN DE ROUTE
-- ══════════════════════════════════════════════════════════════════════════════
-- Dit is de eerste HARDE verwijdering van een identiteitsrij in de app, en de
-- verwijdering bestaat uit zes schrijfacties op vijf tabellen die alleen samen
-- betekenis hebben: koppelrijen vrijgeven, transacties verhuizen of wissen,
-- terugkerende boekingen stoppen, het gekoppelde cash-bezit deactiveren, en pas
-- dan de rij zelf weghalen. supabase-js heeft geen transactie-API — elke
-- PostgREST-aanroep is zijn eigen transactie — dus een route die dit in stappen
-- doet, laat bij elke onderbreking (netwerk, timeout, lambda-kill, een fout
-- halverwege) een halve verwijdering achter. En "half verwijderd" is hier geen
-- schoonheidsfoutje: transacties zonder rekening, een cash-bezit dat blijft
-- meetellen in het netto vermogen, of een terugkerende boeking die een niet
-- meer bestaande rekening blijft voeden.
--
-- Een functie ÍS die transactiegrens. Zelfde argument, zelfde vorm en dezelfde
-- precedenten als
--   * `20260802140500_bank_sync_atomic_daily_limit_rpc.sql`
--   * `20260803090000_ai_calculator_atomic_weekly_limit_rpc.sql`
--   * ADR 0076 ("alternatieven": de supabase-client heeft geen transactiegrens
--     over meerdere PostgREST-aanroepen — een RPC is die transactie).
-- Daar ging het om atomariteit van een LIMIET, hier om atomariteit van een
-- SAMENGESTELDE MUTATIE. De reden dat het in de datalaag hoort is identiek:
-- alles of niets mag niet van de oplettendheid van één aanroeper afhangen.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- TOEGANGSMODEL — `security invoker`, bewust
-- ══════════════════════════════════════════════════════════════════════════════
-- Zelfde keuze en zelfde motivering als `reserve_ai_calculator_slot`, en bewust
-- ANDERS dan `reserve_bank_sync_slot` (die moest een rij gezaghebbend kunnen
-- bijwerken en had daarvoor `security definer` nodig). Hier is dat niet nodig:
-- de eigen-rij-policies op `bank_accounts`, `transactions`,
-- `recurring_transactions`, `bank_connection_accounts` en `assets` geven de
-- aanroeper exact de toegang die deze functie gebruikt — niet meer en niet
-- minder. RLS blijft dus als TWEEDE slot staan bovenop de expliciete
-- `user_id = auth.uid()`-filters die élke query hieronder draagt. Voor een
-- functie die dingen WEGGOOIT is dat het verschil tussen "één fout in een
-- where-clausule" en "één fout in een where-clausule, tegengehouden door RLS".
--
-- `p_user_id` bestaat niet als parameter: de gebruiker komt uit de sessie.
-- Niemand kan andermans rekening verwijderen — ook niet per ongeluk vanuit onze
-- eigen code.
--
-- `set search_path = ''`; alles volledig gekwalificeerd.
--
-- AFHANKELIJKHEID — `recurring_transactions` (opgelost, laat 'm staan)
-- `security invoker` betekent dat stap 7 alleen werkt als er een UPDATE-policy op
-- `recurring_transactions` bestaat. Die bestond LIVE (drift) maar in de
-- migratieketen NIET: `20260719090108` r.364 dropt de FOR ALL-policy en zet er
-- alleen een SELECT voor terug — exact hetzelfde gat als bij `assets` en `debts`.
-- Op een verse database (`db reset`, preview-branch) zou stap 7 daardoor stil
-- 0 rijen raken: de regels blijven actief en blijven de cashflow-prognose voeden
-- voor een rekening die niet meer bestaat. Geen fout, geen signaal.
--
-- `20260804101500_restore_assets_debts_write_policies.sql` dicht dat gat sinds
-- 04-08-2026 voor alle vijf de getroffen tabellen (assets, debts,
-- recurring_transactions, goals, net_worth_snapshots), gegenereerd uit
-- `pg_policies`-introspectie zoals ADR 0045 besluit 1 voorschrijft. Die migratie
-- draait vóór deze en is een harde voorwaarde: haal 'm niet weg zonder stap 7
-- hier te heroverwegen. De bestandsnaam noemt alleen assets/debts omdat de
-- verbreding er later bij kwam; de kop van dat bestand is leidend.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- DE PARTNERRIJEN-GUARD (TF410) — waarom hij een SECURITY DEFINER-helper is
-- ══════════════════════════════════════════════════════════════════════════════
-- Dit is het enige slot tussen "gebruiker verwijdert zijn rekening" en
-- "gegevens van iemand anders zijn weg", en de eerste versie ervan had twee
-- gaten die elkaar versterkten. Ze staan hier uitgeschreven omdat ze allebei
-- contra-intuïtief zijn.
--
-- WAT ER ONDER LIGT. `transactions.account_id` en
-- `recurring_transactions.account_id` staan op productie op `ON DELETE CASCADE`
-- met een `NOT NULL`-kolom — niet op SET NULL, zoals `20260215000000` r.219/266
-- beweren. Gemeten tegen `pg_constraint`, gecodificeerd in
-- `20260804110000_codify_bank_account_cascade_fks.sql`. Een RI-cascade draait
-- BUITEN RLS OM. Stap 9 hieronder vernietigt dus alles wat op dat moment nog
-- naar de rekening wijst, van wie dan ook. De `user_id = v_user`-filters in stap
-- 6 en 7 beschermen de partner NIET: ze zorgen er alleen voor dat deze functie
-- zélf van die rijen afblijft, waarna de cascade ze wist. De guard is niet een
-- nette extra — hij is het verschil tussen een verwijdering en een
-- gegevensvernietiging bij een ander.
--
-- GAT A — `recurring_transactions` telde niet mee. De guard keek alleen naar
-- `public.transactions`. Er is een reëel pad dat de andere tabel raakt:
-- `components/app/cash-account-view.tsx` (`acceptPattern`) doet een `insert` op
-- `recurring_transactions` met `user_id` van de KLIKKENDE gebruiker en
-- `account_id` van de getoonde rekening, zonder `ownership` mee te geven (dus
-- de kolomdefault `'personal'`). Op een gedeelde rekening kan partner B daarmee
-- een terugkerende regel neerzetten op de rekening van A. Verwijdert A daarna
-- de rekening, dan wist de cascade B's regel — zonder melding, aan geen van
-- beide kanten.
--
-- GAT B — de telling liep onder invoker-RLS en was blind voor precies de
-- gevaarlijkste rijen. Dit is de omkering die de eerste versie fataal maakte.
-- De SELECT-policy `View own or shared transactions` toont een rij van de
-- partner alléén bij `ownership = 'shared' AND household_id = user_household_id()`.
-- Maar `transactions.ownership` heeft kolomdefault `'personal'`, en
-- `components/app/transaction-form.tsx` zet het formulier óók op `'personal'`.
-- Een boeking die de partner op de gedeelde rekening zet en persoonlijk laat
-- staan is dus ONZICHTBAAR voor een telling onder invoker-RLS → `count = 0` →
-- TF410 vuurt niet → de cascade vernietigt haar. De guard beschermde wat je
-- toch al ziet en liet lopen wat je niet ziet.
--
-- Een guard die zijn eigen blinde vlek deelt met het gevaar is geen guard. Hij
-- moet daarom BUITEN RLS tellen, en dat kan alleen met `security definer`.
--
-- ── De afweging: DEFINER-helper of botweg gedeelde rekeningen weigeren ───────
-- Het alternatief was aantrekkelijk omdat het géén DEFINER nodig heeft: weiger
-- verwijdering van een `ownership = 'shared'`-rekening zolang de gebruiker een
-- huishouden met een ander lid heeft. Puur beleid, nul nieuwe privileges.
-- Afgewezen, om twee redenen — de tweede is beslissend:
--
--  (1) Het blokkeert gevallen waar niets aan de hand is. Een gedeelde rekening
--      waar de partner nooit iets op heeft geboekt is nooit meer op te ruimen
--      zolang het huishouden bestaat. De maatregel meet niet het gevaar maar
--      een etiket.
--
--  (2) Het etiket is met één legale klik te wisselen, en die klik leidt REGEL-
--      RECHT naar de schade. `ownership` is een gewone kolom op `bank_accounts`
--      met een eigen-rij UPDATE-policy: de eigenaar mag 'm zelf op 'personal'
--      zetten. De rijen van de partner blijven daarbij gewoon staan (niets
--      verplaatst ze mee). De gebruiker die op de blokkade stuit krijgt van de
--      foutmelding zelfs het idee mee — "zet de rekening eerst op persoonlijk" —
--      en heeft daarmee de guard omzeild en de cascade vrijgemaakt. Een
--      beveiliging waarvan de voor de hand liggende workaround exact het
--      schadegeval is, is erger dan geen beveiliging: hij wekt vertrouwen.
--
-- De DEFINER-helper meet het gevaar zelf — bestaan er rijen van een ander op
-- deze rekening, ja of nee — en is daardoor ongevoelig voor het etiket, voor de
-- geschiedenis van dat etiket (een rekening die ooit gedeeld wás en het niet
-- meer is draagt de rijen nog steeds), en voor de `ownership`-waarde van de
-- rijen zelf. Datzelfde argument staat in ADR 0036: de afdwinging hoort in de
-- DB-functie, niet bij de aanroeper, want elke vergeten poort bij een
-- toekomstige afnemer is een lek. Hier is het spiegelbeeldig — daar ging het om
-- niet te véél teruggeven, hier om niet te wéinig zien — maar de reden is
-- dezelfde: één plek waar het klopt, structureel, niet per conventie.
--
-- ── En waarom die helper geen orakel wordt ───────────────────────────────────
-- Een `security definer`-functie die telt in tabellen waar de aanroeper niet in
-- mag kijken, is per definitie een informatiekanaal. `authenticated` heeft er
-- EXECUTE op (dat MOET: deze RPC is `security invoker` en roept 'm aan als de
-- gebruiker), dus hij is ook rechtstreeks via PostgREST aan te roepen. Zonder
-- eigenaarscontrole zou iedereen met een rekening-UUID kunnen uitvragen hoeveel
-- rijen daarop staan.
--
-- Vandaar dat `count_foreign_rows_on_bank_account` als ALLEREERSTE controleert
-- dat de rekening van de aanroeper is, en anders `TF404` gooit — dezelfde code
-- en dezelfde tekst als deze functie, dus ook hier geen existentie-orakel op
-- andermans id's. Wat een rechtmatige eigenaar terugkrijgt is één getal over
-- zijn EIGEN rekening: geen bedragen, geen omschrijvingen, geen tegenpartij,
-- geen id's. Dat is precies wat de foutmelding moet kunnen zeggen en niets
-- meer.
--
-- ── En waarom de guard geen TOCTOU is ────────────────────────────────────────
-- Tellen-dan-verwijderen ziet eruit als een klassiek venster: partner B zet een
-- boeking neer nadat A's guard 0 telde maar voordat A's verwijdering commit.
-- Dat venster is dicht, en niet door iets in deze guard maar door stap 1. De
-- `select … for update` daar houdt een FOR UPDATE-vergrendeling op de
-- `bank_accounts`-rij; B's INSERT moet voor zijn foreign-key-controle een
-- FOR KEY SHARE op diezelfde rij nemen, en die twee conflicteren. B blokkeert
-- dus tot A commit, en vindt daarna de bovenliggende rij niet meer: `23503`.
--
-- Nagemeten op PostgreSQL 18 met twee gelijktijdige verbindingen: B's insert
-- bleef hangen zolang A's transactie open stond, werd na A's commit geweigerd
-- met 23503, en er bleef geen rij van B achter — niet als wees en niet als
-- vernietigde rij. Aangenomen was het niet.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- FOUTCODES — vastgelegd contract met de route
-- ══════════════════════════════════════════════════════════════════════════════
--   TF404 — de rekening bestaat niet, of is niet van de aanroeper
--   TF409 — de doorgegeven rekening ÍS de archief-bucket (die mag niet weg)
--   TF410 — de rekening draagt boekingen of terugkerende regels van iemand
--           anders (bewust NIET "is gedeeld": zie het blok hierboven — het
--           `ownership`-etiket is niet wat we meten)
--
-- AFWIJKING, EXPLICIET: de twee bestaande RPC-migraties gebruiken STANDAARD-
-- SQLSTATEs (`42501` insufficient_privilege, `22023` invalid_parameter_value),
-- geen eigen codes. Deze functie wijkt daarvan af omdat de route drie
-- domeinuitkomsten uit elkaar moet houden die geen standaard-SQLSTATE kent, en
-- omdat de codes een vastgelegd contract zijn waar de route-implementatie tegen
-- aan bouwt. `TF404`/`TF409`/`TF410` zijn geldige door de gebruiker gedefinieerde
-- SQLSTATEs (5 tekens, cijfers + hoofdletters, klasse `TF` is niet door de
-- standaard bezet). De afwijking staat ook in het slice-rapport.
--
-- "Niet ingelogd" houdt WEL de precedent-code `42501` — dat is geen
-- domeinuitkomst maar dezelfde toestand die de twee bestaande RPC's al zo
-- beantwoorden, en de app-brede 401-tekst is 'Niet ingelogd' (ADR 0044).
--
-- TF404 dekt bewust twee gevallen met ÉÉN antwoord ("bestaat niet" én "niet van
-- jou"), zoals de guard-triggers uit `20260729234928` en `20260730210321`: geen
-- existentie-orakel op andermans id's.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- DE VOLGORDE, EN WAAROM ELKE STAP ZO IS
-- ══════════════════════════════════════════════════════════════════════════════
--
-- 1 · RIJ VERGRENDELEN (`for update`). Twee gelijktijdige verwijderingen van
--     dezelfde rekening: de tweede wacht, ziet na de commit van de eerste dat de
--     rij weg is, en krijgt netjes TF404 in plaats van halverwege op een
--     verdwenen rij te struikelen.
--
--     WAT `for update` hier NIET doet, expliciet omdat het contra-intuïtief is:
--     het voegt GEEN eigenaarschapscontrole toe. Nagemeten op PostgreSQL 18
--     (rol-gesimuleerde probe, huishoud-partner op een `ownership='shared'`-rij):
--     een `select … for update` die alleen de huishoud-verbrede SELECT-policy
--     passeert wordt gewoon TOEGESTAAN — de UPDATE-policy wordt er niet bij
--     getoetst. Het eigenaarschap komt hier dus volledig van het expliciete
--     `and ba.user_id = v_user` in de `where`, en van niets anders. Verwijder dat
--     filter niet in de veronderstelling dat RLS of de vergrendeling het overneemt;
--     zonder dat filter zou een partner de gedeelde rekening van de ander kunnen
--     verwijderen. (Geverifieerd dat het mét filter klopt: dezelfde probe geeft
--     TF404 op de rekening van de ander.)
--
-- 3 · PARTNERRIJEN-GUARD (TF410). Het scherpste randgeval van deze functie, en
--     het enige slot dat er staat. Zie het aparte blok hieronder.
--
-- 4 · BUCKET RESOLVEN, VÓÓR ELKE DESTRUCTIEVE STAP. Bewust hier en niet vlak
--     voor de verhuizing: mislukt het aanmaken van het archief, dan is er nog
--     niets weggegooid. (Formeel dekt de transactie dat toch al af — maar een
--     volgorde die ook zónder dat argument klopt is de volgorde die een
--     toekomstige lezer niet verkeerd begrijpt.)
--
-- 5 · KOPPELRIJEN VRIJGEVEN, NIET VERWIJDEREN. `bank_sync_log.connection_account_id`
--     is `not null` en verwijst naar `bank_connection_accounts(id)` ZONDER
--     ON DELETE-clausule (= NO ACTION) — geverifieerd,
--     `20260717120000_sync_remote_baseline.sql:472`. Een delete zou dus hard
--     stuklopen zodra er ooit één keer gesynchroniseerd is, en daarmee de HELE
--     verwijdering laten falen. `bank_account_id = null` + `is_active = false`
--     is bovendien precies de toestand die de rest van de app al netjes leest:
--     `POST /api/bank-connect/sync` weigert een koppeling zonder drager met een
--     409 (`route.ts:116`, geverifieerd) en `lib/bank-link-loader.ts:88-92`
--     filtert met `.not('bank_account_id','is',null)` (geverifieerd). De rij
--     verlaat ook de partiële index
--     `bank_connection_accounts_one_active_per_bank_account`, dus een latere
--     herkoppeling van dezelfde bank aan een andere rekening blijft mogelijk.
--     De guard-trigger op die tabel returned meteen bij `bank_account_id IS NULL`
--     en houdt dit dus niet tegen.
--
-- 6 · TRANSACTIES — en waarom `import_hash = null` GEEN bijzaak is.
--     `transactions_import_hash_per_account_idx` (`20260731054821`) is UNIEK op
--     `(account_id, import_hash, coalesce(bank_seq,''))` WHERE
--     `import_hash IS NOT NULL`. De hash is een SHA-256 over
--     `datum|bedrag|omschrijving` (`lib/parsers/csv.ts:171`,
--     `lib/parsers/mt940.ts:98`) en dus NIET rekening-afhankelijk. Verhuizen we
--     twee rekeningen met dezelfde boeking naar hetzelfde archief — precies het
--     geval waarvoor je een duplicaat-rekening opruimt — dan botsen ze op die
--     index, geeft Postgres een `23505` en faalt de HELE verwijdering. De hash
--     heeft in het archief bovendien geen functie meer, en dat is geverifieerd,
--     niet aangenomen:
--       * de bucket is nooit importdoel — `POST /api/transactions/import` eist
--         `is_active = true` op de rekening (`route.ts:239`), en de bucket is
--         inactief;
--       * alle dedup-loaders zijn rekening-gescoped —
--         `lib/truelayer/existing-hashes.ts` maakt `accountId` verplicht in
--         `ExistingHashScope`.
--     Het weggooien van de hash verliest dus niets dat nog gebruikt wordt, en
--     voorkomt een fout die de gebruiker niet kan aanwijzen (de botsende rij is
--     er een die hij zelf ooit importeerde).
--
--     WAT WE BEWUST NIET DOEN: `ownership`/`household_id` van de verhuisde
--     boekingen aanpassen. Kwamen ze van een gedeelde rekening, dan blijven ze
--     gedeeld en dus zichtbaar voor de partner — ook al is het archief zelf
--     'personal'. Dat is de juiste kant om op te vergissen: die geschiedenis
--     stónd in zijn grootboek, en ze er stil uit laten verdwijnen is een
--     gegevensverlies waar hij niets over te zeggen had. Her-eigenaarschap is
--     huishoud-werk met toestemming, geen bijvangst van een verwijdering.
--
--     Bij `p_keep_transactions = false` verdwijnen de boekingen echt.
--     `transaction_splits.transaction_id` is `ON DELETE CASCADE`
--     (`20260717120000:269`), dus splitsingen gaan mee — gewenst, ze bestaan
--     alleen als onderdeel van hun boeking. `related_transaction_id`
--     (`:302`) en `transactions.linked_transfer_id` (`20260729171125:36`) zijn
--     `ON DELETE SET NULL`: een tegenboeking op een ándere rekening verliest
--     alleen haar verwijzing, niet zichzelf.
--
-- 7 · TERUGKERENDE BOEKINGEN — nooit op de FK vertrouwen.
--     `recurring_transactions.account_id` is `ON DELETE CASCADE` met een
--     `NOT NULL`-kolom (gemeten tegen `pg_constraint` 04-08-2026, gecodificeerd
--     in `20260804110000`; `20260215000000:266` beweerde ten onrechte SET NULL).
--     Deze stap moet er dus zijn om de OMGEKEERDE reden dan hierboven ooit
--     stond: niet om een wees te voorkomen, maar omdat de FK bij "behouden"
--     juist te VÉÉL zou doen — hij zou de regel wissen terwijl de gebruiker
--     koos zijn geschiedenis te bewaren. Bij `p_keep_transactions = true`
--     verhuizen de regels daarom expliciet naar het archief met
--     `is_active = false`, en dat `is_active = false` is geen bijzaak: géén
--     enkele lezer filtert op de rekening, ze filteren alleen op `is_active`
--     (`app/api/cashflow-forecast/route.ts:39`, `lib/cashflow-data-loader.ts:121`,
--     `lib/vaste-lasten-summary.ts:137`, `app/api/detect-recurring/route.ts:51`).
--     Een actieve regel op het archief zou de kasstroomprognose blijven voeden
--     voor een rekening die niet meer bestaat.
--
-- 8 · GEKOPPELD CASH-BEZIT — soft delete, geen harde.
--     In de UI ÍS de rekening dat bezit. Blijft het bezit actief, dan is de
--     rekening "verwijderd" terwijl haar saldo gewoon doortelt in netto
--     vermogen, horizon en FIRE — het ergste soort halve verwijdering, want
--     onzichtbaar. Maar hárd verwijderen mag niet: aan dat id hangen
--     `valuations`, `balance_snapshots`, `debts.linked_asset_id` en
--     `life_events.linked_asset_id`, en zes FK's naar `assets` staan op
--     ON DELETE CASCADE (waaronder de holdings). Een harde delete zou de
--     waarderingshistorie van de gebruiker meesleuren.
--     `has_budget_tracking = false` gaat mee omdat die vlag de as is die
--     `lib/bank-account-companion.ts` bewaakt: hij hoort niet aan te blijven
--     staan voor een companion die er niet meer is.
--
-- 9 · DE RIJ ZELF. Een `23503` (foreign key violation) hier laten we bewust
--     doorlopen naar de aanroeper: dat betekent dat er een verwijzing bestaat
--     waar deze functie geen weet van heeft, en dan hoort de verwijdering te
--     falen in plaats van te raden.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- UITROLVOLGORDE: EERST DEZE MIGRATIE, DAARNA DE CODE
-- ══════════════════════════════════════════════════════════════════════════════
-- Zelfde redenering als `20260803090000`: deze migratie is UITSLUITEND ADDITIEF
-- (twee nieuwe functies, geen tabel/kolom/constraint/policy aangeraakt), dus
-- bestaande code merkt er niets van. Andersom is niet veilig: de nieuwe route
-- roept deze functie aan en zou tussen deploy en migratie een 500 geven.
-- Voorwaarde: `20260804102000` (de kolom `is_archive_bucket`) moet er eerst
-- staan — de functie leest en schrijft die kolom.
--
-- `20260804110000_codify_bank_account_cascade_fks.sql` is GEEN uitrolvoorwaarde
-- voor dit bestand (die migratie raakt geen object dat deze functies bij
-- creatie nodig hebben) maar wel een inhoudelijke: zonder hem gedraagt élke uit
-- de migraties opgebouwde database zich bij stap 9 anders dan productie, en
-- bewijst een groene verwijdertest daar niets. Draai ze in dezelfde uitrol.

-- ══════════════════════════════════════════════════════════════════════════════
-- `public.count_foreign_rows_on_bank_account` — de guard die buiten RLS kijkt
-- ══════════════════════════════════════════════════════════════════════════════
-- Zie het blok "DE PARTNERRIJEN-GUARD" in de kop voor het waarom. Kort:
-- `transactions.account_id` en `recurring_transactions.account_id` staan op
-- `ON DELETE CASCADE`; die cascade draait buiten RLS om en vernietigt dus ook
-- rijen die de verwijderende gebruiker niet mag zien. Een telling ONDER RLS is
-- daarom precies blind voor het geval dat telt (een `ownership='personal'`-rij
-- van de partner op een gedeelde rekening). Deze functie telt buiten RLS.
--
-- DRIE GRENZEN, en ze zitten er alle drie met opzet:
--
--  1. EIGENAARSCONTROLE ALS ALLEREERSTE STATEMENT. `authenticated` heeft
--     EXECUTE (dat moet — `delete_bank_account` is `security invoker` en roept
--     'm aan als de gebruiker), dus de functie is ook rechtstreeks via PostgREST
--     bereikbaar. Zonder deze controle is het een orakel: iedereen met een UUID
--     zou kunnen uitvragen hoeveel rijen op een willekeurige rekening staan.
--     De check leest `public.bank_accounts` met een expliciet
--     `user_id = auth.uid()` — dus EIGEN RIJ, niet de huishoud-verbrede
--     SELECT-policy die hier (als DEFINER) toch niet zou gelden. Een partner
--     krijgt op de gedeelde rekening van de ander dus TF404, niet een getal.
--
--  2. HIJ GEEFT ALLEEN EEN GETAL TERUG. Geen bedragen, geen omschrijvingen,
--     geen tegenpartijen, geen id's, geen `user_id`. De enige informatie die de
--     eigenaar erbij krijgt is "er staat iets van iemand anders op je rekening,
--     zoveel stuks" — precies wat een bruikbare foutmelding nodig heeft.
--     Datzelfde ADR-0036-argument: de gate hoort in de functie, en dan ook zó
--     smal dat een toekomstige aanroeper er niets extra's uit kan trekken.
--
--  3. `security definer` + `set search_path = ''` + volledig gekwalificeerde
--     namen + `revoke all from public, anon` vóór de gerichte grant. Zelfde vorm
--     en zelfde reden als `fn_auto_link_bank_account_asset` (`20260804102000`)
--     en `delete_bank_account` hieronder: `create or replace` behoudt de ACL,
--     maar de eindtoestand wordt hier onafhankelijk van welke drift dan ook
--     gemaakt. `anon` krijgt niets — er is geen `auth.uid()` en dus geen
--     eigenaar om tegen te toetsen.
--
-- BEIDE TABELLEN, en niet alleen `transactions`: `recurring_transactions` draagt
-- dezelfde CASCADE, en er is een reëel pad waarlangs de partner er een rij op
-- zet (`acceptPattern` in `components/app/cash-account-view.tsx`).
--
-- BEWUST GEEN `user_id`-JOIN OP HUISHOUD-LIDMAATSCHAP. "Vreemd" is hier
-- letterlijk `user_id <> auth.uid()`, niet "van een huishoudgenoot". Een rij van
-- een wildvreemde (hoe die er ook zou komen) is minstens zo'n goede reden om te
-- weigeren, en een guard die eerst moet vaststellen of iemand familie is, is een
-- guard met een extra manier om fout te zitten.
create or replace function public.count_foreign_rows_on_bank_account(
  p_account_id uuid
)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_count int;
begin
  if v_user is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  -- Eerst het eigendom, dan pas een getal. Zelfde code en zelfde tekst als
  -- TF404 in `delete_bank_account`: "bestaat niet" en "niet van jou" krijgen
  -- één antwoord, zodat dit geen existentie-orakel op andermans id's wordt.
  if not exists (
    select 1
    from public.bank_accounts as ba
    where ba.id = p_account_id
      and ba.user_id = v_user
  ) then
    raise exception 'Deze rekening bestaat niet of is niet van jou'
      using errcode = 'TF404';
  end if;

  select
    (select count(*)
       from public.transactions as t
      where t.account_id = p_account_id
        and t.user_id <> v_user)
  + (select count(*)
       from public.recurring_transactions as r
      where r.account_id = p_account_id
        and r.user_id <> v_user)
    into v_count;

  return v_count;
end;
$$;

revoke all on function public.count_foreign_rows_on_bank_account(uuid) from public, anon, authenticated, service_role;
grant execute on function public.count_foreign_rows_on_bank_account(uuid) to authenticated;

comment on function public.count_foreign_rows_on_bank_account(uuid) is
  'Telt hoeveel rijen in transactions + recurring_transactions op deze bankrekening van een ANDERE gebruiker zijn (user_id <> auth.uid()). SECURITY DEFINER, en dat is de hele bedoeling: beide FKs staan op ON DELETE CASCADE (20260804110000), een RI-cascade draait buiten RLS om, en een telling ONDER RLS is precies blind voor het gevaarlijkste geval — een ownership=personal-boeking van de partner op een gedeelde rekening is via de SELECT-policy onzichtbaar maar wordt door de cascade wél vernietigd. Weigert met TF404 als de rekening niet van de aanroeper is (eigen rij, niet huishoud-verbreed), zodat de functie geen orakel wordt op andermans rekening-id. Geeft uitsluitend een getal terug — geen bedragen, omschrijvingen of id''s. Enige bedoelde aanroeper: public.delete_bank_account().';

create or replace function public.delete_bank_account(
  p_account_id        uuid,
  p_keep_transactions boolean
)
returns table (
  archive_account_id   uuid,
  moved_transactions   int,
  deleted_transactions int,
  stopped_recurrings   int,
  released_links       int,
  deactivated_asset_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_account record;
  v_bucket  uuid;
  v_asset   uuid;
  v_foreign int;
  v_moved   int  := 0;
  v_deleted int  := 0;
  v_stopped int  := 0;
  v_links   int  := 0;
  v_rows    int;
begin
  if v_user is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  -- Een destructieve keuze mag niet impliciet zijn. `null` is hier geen
  -- "standaard nee" maar een aanroepfout, en die hoort luid te falen in plaats
  -- van stilzwijgend de transacties weg te gooien.
  if p_keep_transactions is null then
    raise exception 'p_keep_transactions moet true of false zijn' using errcode = '22023';
  end if;

  -- ── 1. De rekening, vergrendeld ────────────────────────────────────────────
  select ba.id, ba.name, ba.linked_asset_id, ba.is_archive_bucket, ba.ownership
    into v_account
  from public.bank_accounts as ba
  where ba.id = p_account_id
    and ba.user_id = v_user
  for update;

  if not found then
    raise exception 'Deze rekening bestaat niet of is niet van jou'
      using errcode = 'TF404';
  end if;

  -- ── 2. Het archief verwijdert zichzelf niet ────────────────────────────────
  if v_account.is_archive_bucket then
    raise exception 'De archief-rekening kan niet verwijderd worden'
      using errcode = 'TF409';
  end if;

  -- ── 3. Draagt deze rekening rijen van iemand anders? ───────────────────────
  -- Zie de kop, blok "DE PARTNERRIJEN-GUARD". Deze telling MOET buiten RLS
  -- gebeuren en mag hier dus niet als gewone query staan: deze functie is
  -- `security invoker`, en onder invoker-RLS is een `ownership='personal'`-rij
  -- van de partner onzichtbaar terwijl de CASCADE in stap 9 haar wél
  -- vernietigt. De DEFINER-helper telt beide tabellen en toetst zelf opnieuw
  -- het eigendom van de rekening (overbodig hier — stap 1 deed dat al en houdt
  -- de rij vergrendeld — maar noodzakelijk omdat de helper ook rechtstreeks
  -- aanroepbaar is).
  v_foreign := public.count_foreign_rows_on_bank_account(p_account_id);

  if v_foreign > 0 then
    raise exception 'Deze rekening draagt boekingen of terugkerende regels van iemand anders'
      using errcode = 'TF410';
  end if;

  -- ── 4. Het archief resolven (alleen als de boekingen bewaard blijven) ──────
  if p_keep_transactions then
    select ba.id
      into v_bucket
    from public.bank_accounts as ba
    where ba.user_id = v_user
      and ba.is_archive_bucket
    limit 1;

    if v_bucket is null then
      -- Lezen-dan-schrijven is per definitie een TOCTOU. De partiële unieke
      -- index `bank_accounts_one_archive_per_user_idx` is de grens eronder; dit
      -- blok is de nette landing erop. Twee verwijderingen die tegelijk hun
      -- eerste archief willen: de tweede blokkeert op de index tot de eerste
      -- commit, krijgt dan `unique_violation`, en pakt in de handler de zojuist
      -- aangemaakte bucket op (READ COMMITTED — een nieuw statement ziet de
      -- gecommitte rij). Zonder handler zou de tweede verwijdering falen op iets
      -- waar de gebruiker niets aan kan doen. Er is nog niets destructiefs
      -- gebeurd, dus deze subtransactie kan veilig terugrollen.
      begin
        insert into public.bank_accounts (
          user_id, name, bank_name, account_type, balance,
          is_active, sort_order, ownership, is_archive_bucket
        ) values (
          v_user, 'Archief — verwijderde rekeningen', null, 'other', 0,
          false, 9999, 'personal', true
        )
        returning id into v_bucket;
      exception when unique_violation then
        select ba.id
          into v_bucket
        from public.bank_accounts as ba
        where ba.user_id = v_user
          and ba.is_archive_bucket
        limit 1;
      end;
    end if;

    if v_bucket is null then
      -- Kan alleen als de index-botsing géén eigen bucket blootlegde; dan is er
      -- iets fundamenteel mis en verhuizen we liever niets dan naar niets.
      raise exception 'Archief-rekening kon niet worden aangemaakt'
        using errcode = '55000';
    end if;
  end if;

  -- ── 5. Koppelrijen vrijgeven (nooit verwijderen — zie de kop) ─────────────
  update public.bank_connection_accounts as bca
     set bank_account_id = null,
         is_active       = false,
         updated_at      = now()
   where bca.bank_account_id = p_account_id
     and bca.user_id = v_user;
  get diagnostics v_links = row_count;

  -- ── 6. Transacties ─────────────────────────────────────────────────────────
  if p_keep_transactions then
    -- `import_hash = null` is essentieel, geen opruiming — zie de kop, stap 6.
    update public.transactions as t
       set account_id  = v_bucket,
           import_hash = null
     where t.account_id = p_account_id
       and t.user_id = v_user;
    get diagnostics v_moved = row_count;
  else
    delete from public.transactions as t
     where t.account_id = p_account_id
       and t.user_id = v_user;
    get diagnostics v_deleted = row_count;
  end if;

  -- ── 7. Terugkerende boekingen ──────────────────────────────────────────────
  if p_keep_transactions then
    update public.recurring_transactions as r
       set is_active  = false,
           account_id = v_bucket
     where r.account_id = p_account_id
       and r.user_id = v_user;
    get diagnostics v_stopped = row_count;
  else
    delete from public.recurring_transactions as r
     where r.account_id = p_account_id
       and r.user_id = v_user;
    get diagnostics v_stopped = row_count;
  end if;

  -- ── 8. Gekoppeld cash-bezit deactiveren (soft delete — zie de kop) ────────
  if v_account.linked_asset_id is not null then
    update public.assets as a
       set is_active           = false,
           has_budget_tracking = false
     where a.id = v_account.linked_asset_id
       and a.user_id = v_user;
    get diagnostics v_rows = row_count;
    if v_rows = 1 then
      v_asset := v_account.linked_asset_id;
    end if;
  end if;

  -- ── 9. De rekening zelf ────────────────────────────────────────────────────
  delete from public.bank_accounts as ba
   where ba.id = p_account_id
     and ba.user_id = v_user;

  return query select v_bucket, v_moved, v_deleted, v_stopped, v_links, v_asset;
end;
$$;

-- Functies krijgen bij creatie EXECUTE aan PUBLIC en rolspecifiek revoken is dan
-- een no-op (les uit 20260729222421), vandaar `revoke all … from public` vóór de
-- gerichte grant. `service_role` krijgt geen grant: dat pad heeft geen
-- `auth.uid()` en zou hier alleen een 42501 oogsten. Systeem-/beheerpaden die
-- gegevens van een gebruiker moeten opruimen (AVG-wissen) lopen niet via deze
-- functie.
revoke all on function public.delete_bank_account(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.delete_bank_account(uuid, boolean) to authenticated;

comment on function public.delete_bank_account(uuid, boolean) is
  'Verwijdert één betaalrekening van de ingelogde gebruiker in één ondeelbare transactie: koppelrijen vrijgeven (bank_account_id=null + is_active=false, NOOIT deleten — bank_sync_log verwijst er met not null en zonder ON DELETE naar), transacties verhuizen naar de archief-rekening (met import_hash=null, anders botst een duplicaat op transactions_import_hash_per_account_idx) of verwijderen, terugkerende boekingen naar het archief verhuizen met is_active=false of verwijderen (de FK CASCADE zou ze bij "bewaren" juist wissen, en lezers filteren alleen op is_active), het gekoppelde cash-bezit soft-deleten (is_active=false, has_budget_tracking=false; hard verwijderen zou via zes CASCADE-FKs de waarderingshistorie meesleuren), en pas dan de rij zelf. p_keep_transactions kiest verhuizen of wissen; null is een aanroepfout. Foutcodes: TF404 (bestaat niet of niet van jou), TF409 (dit is de archief-rekening zelf), TF410 (er staan boekingen of terugkerende regels van een ANDERE gebruiker op deze rekening — transactions.account_id en recurring_transactions.account_id zijn ON DELETE CASCADE en die cascade draait buiten RLS om, dus zonder deze weigering zou stap 9 gegevens van de partner vernietigen). De TF410-telling loopt via public.count_foreign_rows_on_bank_account (SECURITY DEFINER): onder invoker-RLS is een ownership=personal-rij van de partner onzichtbaar en zou de guard juist het gevaarlijkste geval missen. security invoker: de eigen-rij-policies blijven als tweede slot naast de expliciete user_id=auth.uid()-filters. Geeft (archive_account_id, moved_transactions, deleted_transactions, stopped_recurrings, released_links, deactivated_asset_id) terug.';
