-- Gespreksgeschiedenis van Fin: een gesprek krijgt een IDENTITEIT en wordt
-- bewaard waar de gebruiker het wil — op zijn account, alleen op zijn apparaat,
-- of niet.
--
-- ── DOEL ────────────────────────────────────────────────────────────────────
-- Het gesprek met Fin was tot nu toe vluchtig: bij het sluiten van het venster
-- verdween het. Deze migratie legt de SERVERRUG neer voor de variant "op mijn
-- account" (melding W-004, ADR 0137). De apparaatrug is IndexedDB en raakt deze
-- tabellen per definitie niet.
--
-- Twee tabellen, want een gesprek en een beurt hebben verschillende
-- levenscycli: de titel van een gesprek is hernoembaar, een verstuurd bericht
-- is onveranderlijk.
--
-- ── TOEGANGSMODEL ───────────────────────────────────────────────────────────
-- PERSOONLIJK, NADRUKKELIJK GEEN HUISHOUD-DELING. Anders dan `assets`/`debts`
-- is er hier geen huishoud-verbrede SELECT en er komt er ook geen: een gesprek
-- is de VRAGEN die iemand stelt ("kan ik stoppen met werken", "ik heb een
-- schuld bij mijn ouders"). Die zijn van hem alleen, ook binnen een huishouden.
-- De perspective-loaders (lib/household/**) raken deze tabellen niet.
--
-- `chat_conversations` — vier eigen-rij policies, alle `TO authenticated`:
--   SELECT  — de gesprekkenlijst en het hervatten van één gesprek.
--   INSERT  — POST /api/chat/conversations (lui: pas bij de eerste beurt).
--   UPDATE  — hernoemen. Kolom-gescoopt tot `title`, zie hieronder.
--   DELETE  — de gebruiker mag zijn eigen gesprek weggooien. Anders dan bij
--             `achieved_milestones` (historie die niet vervalst mag worden) is
--             een chat GEEN log maar zijn eigen tekst; hem niet kunnen wissen
--             zou de opslagkeuze hol maken.
--
-- `chat_messages` — TWEE eigen-rij policies: SELECT en DELETE. Geen UPDATE en
--   NADRUKKELIJK OOK GEEN INSERT; `append_chat_turn` is de enige schrijver.
--
--   Waarom geen directe INSERT-policy (herzien in de security-ronde van
--   08-09-2026, en dit is de reden dat het comment hierboven anders luidt dan
--   in de eerste opzet): een policy die alleen `user_id = auth.uid()` toetst
--   controleert de OUDER niet. Een FK-check omzeilt RLS, dus gebruiker A kon
--   een rij schrijven met zijn eigen `user_id` en het `conversation_id` van B.
--   Die rij is in B's transcript onzichtbaar (de SELECT-policy filtert op
--   user_id) maar telt wél mee in B's cap, laat B's eigen oudste beurten
--   snoeien, schuift B's `last_message_at` op en bezet `seq`-nummers waardoor
--   B's echte beurten stil op `ON CONFLICT DO NOTHING` verdampen. Een
--   `EXISTS (… chat_conversations … )` in de WITH CHECK zou dat dichten, maar
--   de policy had überhaupt geen consument: niets in de app schrijft
--   rechtstreeks in deze tabel (ADR 0058 verbiedt client-directe mutaties, en
--   de route roept de RPC aan). De eerste opzet motiveerde het behoud met "er
--   is hier niets te omzeilen" — dat is weerlegd: de cap van 200 en de
--   `truncated`-markering ZIJN een rem, en een directe insert loopt eromheen.
--   Dus weg, plus een `REVOKE INSERT` zodat de poging een 42501 geeft en niet
--   een stille nul.
--
--   Er is óók bewust geen UPDATE-policy: een verstuurde beurt is
--   onveranderlijk. Gevolg in de praktijk is een STILLE nul (RLS filtert alles
--   weg vóór de mutatie), geen 42501 — dezelfde vorm die bij 20260831160000
--   voor DELETE expliciet is overwogen en aanvaard. Een tabel-brede
--   `REVOKE UPDATE` zou alleen de foutvorm veranderen en niets toevoegen; hier
--   opnieuw overwogen en opnieuw niet gedaan, zodat de afweging niet stil is.
--   (Bij INSERT ligt dat anders: daar verandert de REVOKE niet de foutvorm van
--   een bestaand recht maar sluit hij een recht dat niemand nodig heeft.)
--
-- ── WAAROM GEEN SERVICE-ROLE-PAD, EN GEEN BEHEERVENSTER ─────────────────────
-- `chat_messages.content` is de GEVOELIGSTE VRIJE TEKST in de app. Er is dus
-- geen service-role-leespad, geen uitzonderingspolicy en geen /beheer-venster
-- op deze tabellen — een eigenaarsbesluit, niet een omissie. ADR 0006 (beheer
-- leest cross-user via service-role) blijft ongemoeid: hij zegt HOE beheer moet
-- lezen als het mag, niet DAT het overal mag. Wil beheer ooit wél meekijken,
-- dan is dat een nieuw ADR-gesprek mét audit-eis en een regel in /privacy.
-- Het schrijfpad `append_chat_turn` is `security definer` en dus wél
-- rechten-verheven; daarom valideert die functie de aanroeper zelf (zie ⑤).
--
-- DIE BELOFTE WORDT IN DE APPLICATIELAAG AFGEDWONGEN, NIET HIER. Een migratie
-- kan een service-role-lezer niet tegenhouden — de service-role omzeilt RLS per
-- definitie. De plek waar het wél afdwingbaar is, is de tabellenlijst die
-- `/api/admin/user-export` afloopt: `ADMIN_EXPORT_TABLES` in
-- lib/user-data-tables.ts sluit `chat_conversations` en `chat_messages`
-- EXPLICIET uit (constante `ADMIN_EXPORT_UITGESLOTEN`), met een vitest die
-- vastlegt dát ze eruit blijven. Zonder die uitsluiting zou het toevoegen van
-- deze tabellen aan de AVG-wislijst — wat nodig is — stilzwijgend een
-- beheerlees-pad op het volledige transcript openen, omdat die route
-- `SESSION_WIPE_TABLES` mee-spreidt. De zelf-service-export
-- (`EXPORT_SESSION_TABLES`, sessieclient, eigen rijen) dekt art. 15/20 voor de
-- betrokkene al volledig; beheer heeft het pad niet nodig.
--
-- ── DE PRIVACYVLOER: `CHECK (origin = 'cloud')` ─────────────────────────────
-- `origin` ziet eruit als een enum met één waarde. Dat is hij niet — het is een
-- VLOER, en de reden dat hij als kolom bestaat is dat hij als constraint kan
-- bestaan.
--
-- De app belooft bij de lokale AI letterlijk "je vraag en je cijfers verlaten
-- het toestel niet" (lib/architecture/hld-model.ts) en "Er is niets naar onze
-- servers gestuurd" (chat-panel.tsx). ADR 0043 is technisch smaller
-- geformuleerd (de belofte gaat over de INFERENTIE), dus een transcript naar
-- onze eigen Supabase schendt dat ADR strikt genomen niet — maar wél de tekst
-- die de gebruiker las. De tekst wint (ADR 0137).
--
-- Een gesprek dat met de lokale AI is gevoerd gaat daarom NOOIT naar deze
-- tabellen, óók niet wanneer de gebruiker "op mijn account" heeft gekozen. Die
-- vloer is DUBBEL afgedwongen: in `resolveBackend()` (leesbaar, getest) en hier
-- als CHECK. Een coderegressie die een lokaal gesprek alsnog naar de server
-- schrijft krijgt dan een 23514 — een luide fout in plaats van een stil lek.
-- VERRUIMEN VAN DEZE CHECK MAG UITSLUITEND VIA EEN NIEUW ADR.
--
-- ── WAAROM ALLEEN TEKST IN `content` ────────────────────────────────────────
-- We bewaren de samengevoegde tekst-parts, niet de volledige `UIMessage.parts`.
-- Een bewaarde `showVisualization`- of `suggestAction`-kaart bevat de CIJFERS
-- VAN TOEN; die later opnieuw renderen zet een verouderd netto vermogen naast
-- het actuele — precies de drift die "consume, don't recompute" uitbant. Wat er
-- stond onthouden we in `rich_kinds`; het hervatte gesprek toont daar een
-- neutrale regel. Historie is historie, geen tweede dashboard.
--
-- ── KOLOM-GESCOOPT SCHRIJFRECHT (integriteit van de tellers) ────────────────
-- RLS begrenst RIJEN, geen KOLOMMEN. Zonder extra maatregel kan een gebruiker
-- via PostgREST zijn eigen `message_count`, `last_message_at`, `truncated` of
-- `origin` herschrijven — en dan is de vloer hierboven alsnog te omzeilen door
-- een cloud-rij naar 'lokaal' te draaien (of andersom, waarmee de lijst liegt).
--
-- Volgorde-eis, zelfde valkuil als in 20260831160000 en
-- 20260717132003_security_fix_profiles_role_escalation.sql: `anon` en
-- `authenticated` krijgen op nieuwe tabellen in schema public TABEL-BREDE grants
-- via ALTER DEFAULT PRIVILEGES. Een kolom-GRANT is een no-op zolang die
-- tabel-grant er staat, en een tabel-REVOKE haalt óók kolomrechten weg. Dus:
--     1. CREATE TABLE      (default privileges zetten tabel-brede grants)
--     2. REVOKE UPDATE     (haalt de tabel-brede UPDATE weg)
--     3. GRANT UPDATE (title)
-- De SELECT/INSERT/DELETE-grants worden expliciet herhaald: dat verandert niets
-- aan de rechten maar maakt de bedoelde rechtenset zelfdocumenterend in plaats
-- van geërfd. Het meetpunt is geval 10 van scripts/verify-chat-history-rls.sql,
-- dat de werkelijke ACL uit `information_schema`/`has_column_privilege` leest.
--
-- Bij `anon` gaan de SCHRIJFRECHTEN weg en blijft SELECT staan. Die splitsing
-- is de hele kunst. Geen enkele policy is `TO anon`, dus RLS geeft anon nu al
-- een lege set; de tabel-brede INSERT/UPDATE/DELETE uit de default privileges
-- staan er niettemin en die horen weg — één weggevallen policy zou anders
-- meteen een schrijfgat zijn. SELECT moet juist BLIJVEN, want daar hangt het
-- meetpunt aan: de leak-check verwacht van anon een LEGE SET en geen fout
-- (.claude/skills/_shared/pijplijn-conventies.md, "Leak-checks — altijd óók de
-- anon-rol", ADR 0048). Een 42501 daar duidt op een rolset-regressie en niet op
-- betere afscherming; een REVOKE SELECT zou dat signaal wegnemen.
--
-- ── ADDITIEVE KOLOM OP `profiles` — expliciete RLS-dekkingscheck ────────────
-- `chat_history_mode` draagt de opslagkeuze ('account' | 'apparaat' | 'uit').
--   Dekkende policy: "Users can manage own profile" ON public.profiles
--   FOR ALL USING ((select auth.uid()) = id) — row-level, dus de nieuwe kolom
--   valt automatisch onder de bestaande eigen-rij SELECT/UPDATE. Op `profiles`
--   bestaat geen kolom-scoped grant; `authenticated` heeft daar een tabel-brede
--   UPDATE (20260717132003). Er wordt hier dus GEEN nieuw schrijfgat geopend en
--   er ontstaat ook geen kolom die niemand mag schrijven.
--   Bedoeld schrijfpad: own-row read-modify-write via de anon RLS-client
--   (PUT /api/chat/history-settings), NOOIT service-role — spiegel van
--   app/api/appearance.
--   Dat de gebruiker deze kolom ook rechtstreeks via PostgREST kan zetten is
--   ongevaarlijk en bewust: het is zijn eigen voorkeur, en de CHECK begrenst de
--   waardenverzameling. De keuze is GEEN beveiligingsgrens — de vloer is dat
--   (zie `origin`), en die staat los van deze kolom.
--
-- DEFAULT = 'account'. Eigenaarsbesluit (ADR 0137): een geschiedenis die stil
-- verdampt bij een browserwissel is erger dan geen geschiedenis — de gebruiker
-- denkt dan dat het bewaard is en dat is het niet.
--
-- Alles idempotent (IF NOT EXISTS / DROP … IF EXISTS) zodat re-apply een no-op
-- is.

-- ── 1. Tabellen ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Eerste ~60 tekens van de eerste vraag, op woordgrens; hernoembaar. Bewust
  -- GEEN AI-gegenereerde titel: dat kost credits en zou op het lokale pad een
  -- tweede inferentie zijn.
  title           TEXT NOT NULL DEFAULT 'Nieuw gesprek'
    CONSTRAINT chat_conversations_title_len
    CHECK (char_length(title) BETWEEN 1 AND 120),

  -- Welk oppervlak dit gesprek voerde. Vandaag alleen het hoofdgesprek met Fin;
  -- whatif-chat en event-builder-chat zijn taakgebonden panelen die bewust GEEN
  -- geschiedenis krijgen. De CHECK houdt die grens hard tot iemand hem met een
  -- migratie verlegt.
  surface         TEXT NOT NULL DEFAULT 'fin'
    CONSTRAINT chat_conversations_surface_check
    CHECK (surface IN ('fin')),

  -- DE PRIVACYVLOER. Zie het kopcommentaar: dit is geen enum-met-één-waarde
  -- maar een constraint die een lokaal gevoerd gesprek hier ONMOGELIJK maakt in
  -- plaats van onwaarschijnlijk. Verruimen alleen via een nieuw ADR.
  origin          TEXT NOT NULL DEFAULT 'cloud'
    CONSTRAINT chat_conversations_origin_floor
    CHECK (origin = 'cloud'),

  -- Afgeleid, nooit opgehoogd: `append_chat_turn` HERTELT met count(*). Een
  -- teller die je optelt is een tweede waarheid die na één mislukte insert of
  -- één snoei-actie voorgoed van de rijen afwijkt.
  message_count   INTEGER NOT NULL DEFAULT 0,

  -- Het EERSTVOLGENDE vrije volgnummer: max(seq) + 1, of 0 bij een leeg
  -- gesprek. Net als message_count afgeleid en herteld door append_chat_turn,
  -- nooit opgehoogd — en om dezelfde reden niet schrijfbaar voor de client.
  --
  -- WAAROM DIT EEN KOLOM IS EN GEEN SUBQUERY. De client hield eerder een eigen
  -- teller bij die niet meebewoog als een schrijfactie faalde; na een timeout
  -- of een mislukte hydratatie postte hij een `seq` die al bestond, de
  -- `ON CONFLICT … DO NOTHING` gooide de beurt stil weg en niets signaleerde
  -- dat. De server moet het volgnummer dus TERUGGEVEN, en niet alleen vanuit de
  -- RPC: élke route die een gesprek teruggeeft levert hetzelfde veld, anders is
  -- het contract per route verschillend. `message_count` kan die rol NIET
  -- spelen — die is gecapt op 200 terwijl `seq` doorloopt.
  --
  -- Een `max(seq)`-subquery per rij zou de gesprekkenlijst een N+1 geven; een
  -- kolom is één gelezen waarde. Hij kan niet ONDER de waarheid zakken, want
  -- append_chat_turn is de enige schrijver van chat_messages (zie de policies).
  -- Wist de gebruiker losse berichten, dan blijft de kolom hoog — en te hoog is
  -- veilig: het levert een gat in de nummering, nooit een botsing.
  next_seq        INTEGER NOT NULL DEFAULT 0
    CONSTRAINT chat_conversations_next_seq_nonneg
    CHECK (next_seq >= 0),

  -- WAAR: dit gesprek liep tegen de bewaargrens (200 beurten) en de oudste
  -- berichten zijn gesnoeid. De UI toont dan bovenaan één regel uitleg, zodat
  -- een gat in de historie zichtbaar is in plaats van stil.
  truncated       BOOLEAN NOT NULL DEFAULT FALSE,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Sorteersleutel van de gesprekkenlijst (aflopend) en de pagineersleutel.
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,

  -- GEDENORMALISEERD, en dat is de bedoeling: zo toetst de RLS-policy op deze
  -- tabel een eigen kolom in plaats van per rij een subselect op de ouder te
  -- doen. Spiegel van de user_id-op-elke-tabel-conventie in dit schema. De
  -- eigen FK naar auth.users maakt bovendien de generieke AVG-export
  -- (.eq('user_id', …) in app/api/account/export) zonder uitzondering werkend.
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 0-based, oplopend binnen het gesprek. Draagt de IDEMPOTENTIE van het
  -- appenden: een herhaalde appendTurn (retry, dubbel gevuurd effect) botst op
  -- de UNIQUE en wordt een no-op i.p.v. een dubbele beurt.
  seq             INTEGER NOT NULL CONSTRAINT chat_messages_seq_nonneg CHECK (seq >= 0),

  role            TEXT NOT NULL
    CONSTRAINT chat_messages_role_check
    CHECK (role IN ('user', 'assistant')),

  -- UITSLUITEND TEKST, max 32.000 tekens. Zie het kopcommentaar. De RPC kapt
  -- zelf af en markeert dat in rich_kinds; deze CHECK is de vangrail voor een
  -- toekomstig tweede schrijfpad.
  content         TEXT NOT NULL
    CONSTRAINT chat_messages_content_len
    CHECK (char_length(content) <= 32000),

  -- Wat er in dit bericht STOND zonder dat we het bewaren. De containment-CHECK
  -- is een immutable expressie en dus toegestaan; hij houdt de verzameling
  -- gelijk aan `ChatRichKind` in lib/chat/history/types.ts.
  rich_kinds      TEXT[] NOT NULL DEFAULT '{}'
    CONSTRAINT chat_messages_rich_kinds_check
    CHECK (rich_kinds <@ ARRAY['visualisatie', 'actievoorstel', 'aanbeveling', 'afgekapt']::TEXT[]),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chat_messages_seq_uniq UNIQUE (conversation_id, seq)
);

COMMENT ON TABLE public.chat_conversations IS
  'Eén gesprek met Fin, bewaard op het account van de gebruiker. Persoonlijk: eigen-rij RLS, GEEN huishoud-deling en geen beheer-/service-role-leespad (ADR 0137). origin is een PRIVACYVLOER met CHECK (origin = ''cloud''): een gesprek dat met de lokale AI is gevoerd kan hier niet landen, ook niet als de gebruiker ''op mijn account'' koos. message_count/next_seq/last_message_at/truncated worden uitsluitend door public.append_chat_turn gezet; authenticated heeft alleen UPDATE (title).';
COMMENT ON TABLE public.chat_messages IS
  'Eén beurt (vraag of antwoord) binnen een gesprek met Fin. ALLEEN TEKST: toolresultaten (grafiek, actievoorstel, aanbeveling) worden niet bewaard maar in rich_kinds gemarkeerd, omdat een bewaarde kaart bevroren cijfers naast de canonieke zou zetten. Onveranderlijk: er is bewust geen UPDATE-policy. Ook GEEN INSERT-policy en geen INSERT-grant voor authenticated — public.append_chat_turn is de enige schrijver, omdat een eigen-rij INSERT-policy de OUDER niet toetst en een FK-check RLS omzeilt (een rij met eigen user_id in andermans conversation_id vult daar de cap, snoeit diens oudste beurten en bezet diens seq-nummers). user_id is gedenormaliseerd zodat de RLS-policy en de AVG-export geen subselect op de ouder nodig hebben.';
COMMENT ON COLUMN public.chat_conversations.origin IS
  'Waar het gesprek GEVOERD is. Vastgezet op ''cloud'' met een CHECK-constraint: dat is de databasehelft van de dubbel afgedwongen privacyvloer (de andere helft is resolveBackend() in lib/chat/history/resolve.ts). Verruimen mag uitsluitend via een nieuw ADR; ADR 0043/0137.';
COMMENT ON COLUMN public.chat_conversations.message_count IS
  'Aantal bewaarde berichten. AFGELEID: append_chat_turn hertelt met count(*) i.p.v. op te hogen, zodat de teller na een snoei-actie of een ON CONFLICT-no-op niet van de rijen afwijkt. Niet schrijfbaar voor authenticated (kolom-gescoopte GRANT).';
COMMENT ON COLUMN public.chat_conversations.next_seq IS
  'Eerstvolgend vrij volgnummer binnen het gesprek: max(seq) + 1, 0 bij een leeg gesprek. AFGELEID en herteld door append_chat_turn, net als message_count, en om dezelfde reden niet schrijfbaar voor authenticated. Élke API-route die een gesprek teruggeeft levert dit veld (als nextSeq) zodat de client zijn volgnummer nooit zelf hoeft bij te houden — een eigen clientteller loopt na een mislukte schrijfactie uit de pas en laat de volgende beurt stil op ON CONFLICT DO NOTHING verdampen. message_count kan die rol niet vervullen: die is gecapt op 200 terwijl seq doorloopt.';
COMMENT ON COLUMN public.chat_conversations.truncated IS
  'TRUE zodra het gesprek de bewaargrens van 200 berichten passeerde en de oudste beurten zijn gesnoeid. De UI toont dan één regel "Eerdere berichten in dit gesprek zijn niet bewaard" — een gat in de historie hoort zichtbaar te zijn.';
COMMENT ON COLUMN public.chat_messages.seq IS
  '0-based volgnummer binnen het gesprek. Draagt samen met conversation_id de UNIQUE en daarmee de idempotentie van append_chat_turn: een herhaalde beurt is een no-op, geen duplicaat.';
COMMENT ON COLUMN public.chat_messages.rich_kinds IS
  'Wat er in dit bericht stond maar NIET is bewaard: ''visualisatie'' | ''actievoorstel'' | ''aanbeveling'', plus ''afgekapt'' wanneer content op 32.000 tekens is afgekapt. Het hervatte gesprek rendert hier een neutrale regel i.p.v. een herbouwde kaart met verouderde cijfers.';

-- ── 2. Indexen ──────────────────────────────────────────────────────────────

-- Leespad 1: "de gesprekkenlijst van deze gebruiker, nieuwste eerst" — inclusief
-- de pagineerfilter `last_message_at < before`. Dekt tevens de FK-kolom user_id.
CREATE INDEX IF NOT EXISTS chat_conversations_user_recent_idx
  ON public.chat_conversations USING btree (user_id, last_message_at DESC);

-- Leespad 2: "alle beurten van dit gesprek op volgorde" — de hydratatie bij het
-- hervatten, en de snoei-query van de RPC (oudste eerst). De UNIQUE-constraint
-- levert deze index al; hij staat hier NIET nogmaals als losse index.
-- Wat de UNIQUE níét dekt is de FK-kolom `user_id` op chat_messages: die wordt
-- per gebruiker gescand door de AVG-export en de wipe.
CREATE INDEX IF NOT EXISTS chat_messages_user_idx
  ON public.chat_messages USING btree (user_id);

-- ── 3. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_conversations own select" ON public.chat_conversations;
CREATE POLICY "chat_conversations own select" ON public.chat_conversations
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "chat_conversations own insert" ON public.chat_conversations;
CREATE POLICY "chat_conversations own insert" ON public.chat_conversations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- USING én WITH CHECK: zonder WITH CHECK zou een UPDATE de rij naar een ANDERE
-- user_id kunnen schrijven (USING toetst alleen de oude rij). De kolom-gescoopte
-- grant blokkeert dat vandaag al — user_id is niet schrijfbaar — maar de policy
-- mag daar niet van afhangen: een latere, ruimere GRANT zou het gat stil
-- heropenen.
DROP POLICY IF EXISTS "chat_conversations own update" ON public.chat_conversations;
CREATE POLICY "chat_conversations own update" ON public.chat_conversations
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "chat_conversations own delete" ON public.chat_conversations;
CREATE POLICY "chat_conversations own delete" ON public.chat_conversations
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "chat_messages own select" ON public.chat_messages;
CREATE POLICY "chat_messages own select" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- GEEN INSERT-POLICY. `append_chat_turn` is de enige schrijver; zie het
-- kopcommentaar voor de volledige afweging. Kort: een policy die alleen
-- `user_id = auth.uid()` toetst controleert de OUDER niet, en een FK-check
-- omzeilt RLS — daarmee kon A een rij in B's gesprek schuiven die B niet ziet
-- maar die wél B's cap vult, B's oudste beurten laat snoeien en B's seq-nummers
-- bezet. De policy had bovendien geen enkele consument.
--
-- De DROP blijft staan zodat een re-apply óók een eerder aangemaakte,
-- inmiddels verworpen policy opruimt in plaats van hem stil te laten staan.
DROP POLICY IF EXISTS "chat_messages own insert" ON public.chat_messages;

-- Geen UPDATE-policy: een verstuurde beurt is onveranderlijk (zie kopcommentaar).
DROP POLICY IF EXISTS "chat_messages own delete" ON public.chat_messages;
CREATE POLICY "chat_messages own delete" ON public.chat_messages
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ── 4. Kolom-gescoopt schrijfrecht ──────────────────────────────────────────
-- Volgorde is dwingend, zie kopcommentaar. Alle statements zijn idempotent.

REVOKE UPDATE ON TABLE public.chat_conversations FROM authenticated;

-- Expliciet herhaald: verandert niets (default privileges gaven deze al) maar
-- legt de bedoelde rechtenset vast in plaats van hem te erven.
GRANT SELECT, INSERT, DELETE ON TABLE public.chat_conversations TO authenticated;

-- Het ENIGE UPDATE-recht dat een ingelogde gebruiker heeft: hernoemen.
-- message_count, next_seq, last_message_at, truncated, origin en surface zijn
-- daarmee na het aanmaken niet meer door de client te herschrijven.
GRANT UPDATE (title) ON TABLE public.chat_conversations TO authenticated;

-- chat_messages: LEZEN en WISSEN, niet schrijven. De INSERT wordt hier
-- weggehaald (de default privileges gaven hem tabel-breed) zodat een directe
-- insert een luide 42501 geeft in plaats van een stille nul via de ontbrekende
-- policy. Schrijven kan uitsluitend via append_chat_turn; DELETE blijft, want
-- zonder wisrecht is de opslagkeuze hol en zou deleteAllUserData (sessieclient,
-- SESSION_WIPE_TABLES) stil niets doen.
REVOKE INSERT ON TABLE public.chat_messages FROM authenticated;
GRANT SELECT, DELETE ON TABLE public.chat_messages TO authenticated;

-- ── 4b. anon: lezen mag (en moet), schrijven niet ───────────────────────────
-- RLS sluit anon al volledig af — geen enkele policy is `TO anon`, dus elke
-- poging eindigt op 0 rijen. De tabel-brede grants uit ALTER DEFAULT PRIVILEGES
-- staan er niettemin, en een recht dat niemand hoort te gebruiken hoort er niet
-- te zijn: één weggevallen policy zou anders meteen een schrijfgat zijn.
--
-- SELECT BLIJFT BEWUST STAAN. Dat is geen slordigheid maar het meetpunt: de
-- leak-check verwacht van anon een LEGE SET en geen fout (geval 3). Zonder de
-- SELECT-grant zou daar een 42501 uitkomen, en dan meet de test de grant en
-- niet meer de policy — precies het signaal dat we willen houden
-- (.claude/skills/_shared/pijplijn-conventies.md, ADR 0048).
REVOKE INSERT, UPDATE, DELETE ON TABLE public.chat_conversations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.chat_messages FROM anon;

-- ── 5. RPC: één beurt appenden, atomair ─────────────────────────────────────
-- Waarom een RPC en niet drie losse client-schrijfacties: het appenden is
-- SAMENGESTELD (insert + hertellen + last_message_at + eventueel snoeien). Met
-- drie calls zit er een gat tussen de stappen waarin de teller een tweede
-- waarheid wordt, en zou de client bovendien kolommen moeten kunnen schrijven
-- die hij juist niet mag (zie ④).
--
-- Zij is ook de ENIGE schrijver van `chat_messages`: die tabel heeft geen
-- INSERT-policy en `authenticated` geen INSERT-grant (zie ③ en ④).
--
-- `security definer`, want de functie schrijft `message_count`/`next_seq`
-- /`last_message_at`/`truncated` — precies de kolommen waarop de aanroeper geen
-- recht heeft. Dat
-- betekent dat RLS opzij gaat, dus de functie valideert de aanroeper ZELF, en
-- dat is het EERSTE dat ze doet:
--   * `auth.uid()` is null → weigeren (42501). Geen sessie, geen schrijfrecht.
--   * het gesprek moet van de aanroeper zijn → anders weigeren (42501), niet
--     "0 rijen". Cross-user schrijven is een fout, geen lege uitkomst.
--   * `user_id` op de berichten komt uit `auth.uid()` en is GEEN parameter:
--     niemand kan op andermans naam een beurt bijschrijven, ook niet vanuit
--     onze eigen code.
--   * TELLEN EN SNOEIEN FILTEREN ÓÓK OP `user_id`. Dat lijkt overbodig — de
--     eigenaarscheck hierboven bewees al dat het gesprek van de aanroeper is —
--     maar het is de vangnet-helft van dezelfde vondst als bij de
--     INSERT-policy: zou er ooit langs welke weg dan ook een rij van een ander
--     in dit gesprek staan, dan telt die anders mee in de cap en laat hij de
--     EIGEN oudste beurten wegsnoeien. Een `security definer`-functie die
--     ongefilterd telt, telt rechten-verheven.
-- `set search_path = ''` (leeg, niet `public`): élke verwijzing in deze functie
-- is al volledig gekwalificeerd, dus een leeg pad kost niets en maakt de functie
-- onafhankelijk van die zorgvuldigheid — een later toegevoegde onqualifieerde
-- naam faalt dan luid in plaats van stil naar een andere tabel te wijzen.
--
-- De CAP (200 berichten) woont hier en niet in TypeScript, om dezelfde reden als
-- bij reserve_user_report_slot: een limiet die als parameter binnenkomt is geen
-- limiet. Snoeien is bewust een DELETE van de oudste beurten plus
-- `truncated = TRUE` — de gebruiker ziet dán één regel dat er iets ontbreekt.
-- Een gesprek in zijn geheel weggooien doet de motor nooit: dat is destructief
-- en er is geen limiet op het AANTAL gesprekken.

CREATE OR REPLACE FUNCTION public.append_chat_turn(
  p_conversation UUID,
  p_messages     JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Bewaargrens per gesprek. Zie de kop: geen parameter.
  v_cap      CONSTANT INTEGER := 200;
  v_max_len  CONSTANT INTEGER := 32000;
  -- Speling op `createdAt`: een client met een licht voorlopende klok mag zijn
  -- eigen tijdstip houden, verder vooruit wordt geklemd. Zie de klem in ②.
  v_skew     CONSTANT INTERVAL := INTERVAL '1 minute';
  v_user     UUID := auth.uid();
  v_owner    UUID;
  v_count    INTEGER;
  v_over     INTEGER;
  v_next     INTEGER;
  v_row      public.chat_conversations%ROWTYPE;
BEGIN
  -- ① EIGENAARSCHECK — het eerste statement, en niet toevallig. Een
  --    `security definer`-functie die pas na haar eerste query controleert wie
  --    er belt, heeft die query al rechten-verheven uitgevoerd.
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Niet ingelogd' USING ERRCODE = '42501';
  END IF;

  SELECT c.user_id INTO v_owner
    FROM public.chat_conversations c
   WHERE c.id = p_conversation;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Gesprek bestaat niet' USING ERRCODE = 'P0002';
  END IF;

  IF v_owner <> v_user THEN
    -- Bewust dezelfde foutcode als "geen recht", en bewust NIET een stille nul:
    -- een cross-user append is een fout in de aanroeper, geen lege uitkomst.
    RAISE EXCEPTION 'Geen toegang tot dit gesprek' USING ERRCODE = '42501';
  END IF;

  IF p_messages IS NULL OR jsonb_typeof(p_messages) <> 'array' THEN
    RAISE EXCEPTION 'p_messages moet een JSON-array zijn' USING ERRCODE = '22023';
  END IF;

  -- ② INSERT — idempotent op (conversation_id, seq). Een herhaalde beurt (retry,
  --    dubbel gevuurd effect) botst op de UNIQUE en verdwijnt stil; hij
  --    OVERSCHRIJFT nooit, want dat zou een bewaard bericht muteerbaar maken via
  --    de achterdeur.
  --    `user_id` komt uit de sessie, niet uit de payload. `content` wordt hier
  --    afgekapt en dat wordt in rich_kinds gemarkeerd — stil inkorten zou een
  --    onzichtbaar gat in het transcript slaan.
  INSERT INTO public.chat_messages (conversation_id, user_id, seq, role, content, rich_kinds, created_at)
  SELECT
    p_conversation,
    v_user,
    (m->>'seq')::INTEGER,
    m->>'role',
    left(coalesce(m->>'content', ''), v_max_len),
    CASE
      WHEN char_length(coalesce(m->>'content', '')) > v_max_len
        THEN (
          SELECT array_agg(DISTINCT k)
            FROM unnest(
              coalesce(
                ARRAY(SELECT jsonb_array_elements_text(coalesce(m->'richKinds', '[]'::jsonb))),
                ARRAY[]::TEXT[]
              ) || ARRAY['afgekapt']
            ) AS k
        )
      ELSE coalesce(
        ARRAY(SELECT jsonb_array_elements_text(coalesce(m->'richKinds', '[]'::jsonb))),
        ARRAY[]::TEXT[]
      )
    END,
    -- `createdAt` KOMT VAN DE CLIENT EN WORDT GEKLEMD. `'infinity'` is een
    -- geldig TIMESTAMPTZ-literal; ongeklemd landt hij via de `greatest()`
    -- hieronder in `last_message_at` en dan staat het gesprek voorgoed bovenaan
    -- én weigert de keyset-pagineerder zijn eigen cursor — en de gebruiker kan
    -- dat niet herstellen, want `last_message_at` valt buiten zijn kolom-GRANT.
    -- De route weigert een niet-ISO-tijdstip al met een 400 (zod
    -- `z.iso.datetime`); deze klem is de databasehelft, want de RPC is ook
    -- rechtstreeks via PostgREST aanroepbaar.
    least(now() + v_skew, coalesce((m->>'createdAt')::TIMESTAMPTZ, now()))
  FROM jsonb_array_elements(p_messages) AS m
  ON CONFLICT (conversation_id, seq) DO NOTHING;

  -- ③ SNOEIEN boven de cap. Oudste eerst; `truncated` blijft daarna voorgoed
  --    TRUE, ook als het gesprek later weer onder de cap zou zakken — er ONTBRAK
  --    iets, en dat feit vervalt niet.
  --    Zowel het tellen als het snoeien filtert óók op `user_id`. Zie de kop:
  --    ongefilterd tellen in een `security definer`-functie is rechten-verheven
  --    tellen, en een rij van een ander zou dan de EIGEN oudste beurten laten
  --    wegsnoeien.
  SELECT count(*) INTO v_count
    FROM public.chat_messages msg
   WHERE msg.conversation_id = p_conversation
     AND msg.user_id = v_user;

  v_over := v_count - v_cap;
  IF v_over > 0 THEN
    DELETE FROM public.chat_messages msg
     WHERE msg.id IN (
       SELECT oud.id
         FROM public.chat_messages oud
        WHERE oud.conversation_id = p_conversation
          AND oud.user_id = v_user
        ORDER BY oud.seq ASC
        LIMIT v_over
     );
    v_count := v_cap;
  END IF;

  -- Het eerstvolgende vrije volgnummer, om dezelfde reden herteld als
  -- message_count. `-1 + 1 = 0` bij een leeg gesprek. Het snoeien hierboven
  -- haalt de OUDSTE weg en raakt max(seq) dus niet.
  SELECT coalesce(max(msg.seq), -1) + 1 INTO v_next
    FROM public.chat_messages msg
   WHERE msg.conversation_id = p_conversation
     AND msg.user_id = v_user;

  -- ④ TELLERS — HERTELD, niet opgehoogd. Zie de kolomcommentaar bij
  --    message_count en next_seq. Dat `next_seq` in de teruggegeven rij zit is
  --    het contract met de client: hij houdt geen eigen volgnummer bij, want
  --    zo'n teller beweegt niet mee als een schrijfactie faalt en laat de
  --    volgende beurt stil op ON CONFLICT DO NOTHING verdampen.
  --    `last_message_at` is de sorteersleutel van de lijst en
  --    schuift dus mee met de laatste beurt; `greatest` zodat een client die een
  --    oudere `createdAt` meestuurt de sortering niet terugdraait.
  UPDATE public.chat_conversations c
     SET message_count   = v_count,
         next_seq        = v_next,
         truncated       = c.truncated OR (v_over > 0),
         last_message_at = greatest(
           c.last_message_at,
           coalesce((SELECT max(msg.created_at) FROM public.chat_messages msg
                      WHERE msg.conversation_id = p_conversation
                        AND msg.user_id = v_user), now())
         )
   WHERE c.id = p_conversation
     AND c.user_id = v_user
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

-- Functies krijgen bij creatie EXECUTE aan PUBLIC; rolspecifiek revoken is dan
-- een no-op (les uit 20260729222421). Dus eerst alles weg, dan één grant.
-- `anon` krijgt niets — appenden vereist een sessie. `service_role` krijgt
-- niets: dat pad heeft geen `auth.uid()` en zou hier alleen de eigenaarscheck
-- oogsten; er is bovendien bewust geen systeem-/beheerschrijfpad op deze tabel.
REVOKE ALL ON FUNCTION public.append_chat_turn(UUID, JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.append_chat_turn(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.append_chat_turn(UUID, JSONB) IS
  'Voegt één beurt (vraag + antwoord) atomair toe aan een gesprek met Fin en geeft de bijgewerkte chat_conversations-rij als jsonb terug, inclusief next_seq (= max(seq) + 1) waarmee de client zijn volgende volgnummer krijgt i.p.v. het zelf bij te houden. ENIGE SCHRIJVER van chat_messages: die tabel heeft geen INSERT-policy en authenticated geen INSERT-grant. security definer omdat message_count/next_seq/last_message_at/truncated voor authenticated niet schrijfbaar zijn (kolom-gescoopte GRANT (title)); daarom is de auth.uid()-eigenaarscheck het EERSTE statement en komt user_id uit de sessie, niet uit de payload. Tellen en snoeien filteren óók op user_id, zodat een vreemde rij nooit de eigen oudste beurten kan laten wegsnoeien. Idempotent via ON CONFLICT (conversation_id, seq) DO NOTHING — een herhaalde beurt is een no-op en overschrijft nooit. Hertelt message_count met count(*) i.p.v. op te hogen, klemt createdAt op now() + 1 minuut (''infinity'' zou last_message_at onherstelbaar vooruit zetten), kapt content op 32.000 tekens af met de markering ''afgekapt'' in rich_kinds, en snoeit boven 200 berichten de oudste weg met truncated = TRUE. De cap is bewust geen parameter. Zie ADR 0137.';

-- ── 6. Additieve kolom op profiles: de opslagkeuze ──────────────────────────
-- Zie de RLS-dekkingscheck in het kopcommentaar. Puur additief.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS chat_history_mode TEXT NOT NULL DEFAULT 'account';

-- Losse, idempotente CHECK: `ADD COLUMN IF NOT EXISTS` kan de constraint bij een
-- re-apply niet meebrengen, en een inline CHECK zou bij de tweede run stil
-- ontbreken.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_chat_history_mode_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_chat_history_mode_check
  CHECK (chat_history_mode IN ('account', 'apparaat', 'uit'));

COMMENT ON COLUMN public.profiles.chat_history_mode IS
  'Waar de gebruiker zijn gesprekken met Fin wil bewaren: ''account'' (Supabase, chat_conversations/chat_messages), ''apparaat'' (IndexedDB in deze browser) of ''uit'' (niet bewaren). Default ''account'' — een geschiedenis die stil verdampt bij een browserwissel is erger dan geen geschiedenis (ADR 0137). Eigen-rij: gelezen/geschreven via de own-row anon RLS-client (GET/PUT /api/chat/history-settings), nooit service-role; gedekt door de bestaande profiles-policy USING ((select auth.uid()) = id). GEEN beveiligingsgrens: de privacyvloer voor lokaal gevoerde gesprekken is de CHECK (origin = ''cloud'') op chat_conversations en staat los van deze keuze — ''account'' kiezen brengt een lokaal gesprek NOOIT naar de server.';
