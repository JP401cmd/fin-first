---
id: 0103-grondslag-van-inkomen-en-uitgaven-is-een-expliciete-keuze
title: 'De grondslag van inkomen en uitgaven is een expliciete keuze, met budgetten als standaard'
status: aanvaard
date: 2026-08-11
elements: [as-budget, as-planning, as-belasting, fn-budgetteren, t-supabase]
---

"Geschat jaarinkomen" en "Geschatte uitgaven" op `/overzicht/cashflow` kenden tot
nu toe twee grondslagen: de transactiesom, of een handmatig bedrag dat de
gebruiker zelf invulde (`profiles.income_source` / `expenses_source` =
`'auto' | 'manual'`). Wie zijn inkomen niet in transacties terugziet — een ZZP'er
met wisselende uitkeringen, iemand met een tweede rekening buiten de app,
iemand met een belastingteruggaaf die in geen enkele maand representatief is —
had maar één uitweg: een bedrag met de hand invullen. Dat bedrag bevriest. Het
beweegt niet mee als het leven verandert, en niets in de app herinnert de
gebruiker eraan dat het er nog staat.

De gebruiker heeft ondertussen wél een levend model van zijn inkomen en uitgaven
in de app staan: zijn **budgetten**. Die zijn per definitie de bedoeling — wat
hoort binnen te komen, wat hoort eruit te gaan — en de gebruiker onderhoudt ze
al. Dit besluit maakt die budgetten tot een volwaardige, en waar aanwezig de
standaard, grondslag.

## Het besluit

**De grondslag is een expliciete keuze uit drie, per kant (inkomen en uitgaven)
onafhankelijk te zetten:**

| waarde | betekenis |
| --- | --- |
| `budget` | de som van de geselecteerde budgetten van dat type |
| `transaction` | de gemeten transactiesom (12-maands geëxtrapoleerd voor inkomen, 6-maands gemiddelde voor uitgaven) |
| `manual` | een door de gebruiker ingevuld bedrag |
| `auto` | *geen keuze gemaakt* — de app kiest: budgetten indien aanwezig, anders transacties, anders de profielschatting |

`auto` is geen vierde optie in de interface. Het is de waarde die een rij draagt
zolang de gebruiker de instelling nooit heeft aangeraakt. Zodra hij in het
detailvenster iets kiest, verlaat de rij `auto` en komt er nooit meer in terug.
Daarmee is `auto` een *resolutiestrategie* en zijn de andere drie
*grondslag-uitspraken*; ze kunnen niet met elkaar botsen omdat `auto` nooit een
uitkomst is. De resolver geeft altijd één van de drie concrete grondslagen terug.

**Precedentievolgorde**, van hoog naar laag:

1. `manual` wint altijd. Een door de gebruiker ingevuld bedrag wordt door niets
   overruled — dat blijft ongewijzigd ten opzichte van vandaag.
2. `budget` wint over `transaction` wanneer de gebruiker dat zo heeft gezet, en
   bij `auto` wanneer er bruikbare budgetten van dat type zijn.
3. `transaction` wanneer de gebruiker dat expliciet kiest, of bij `auto` zonder
   budgetten.
4. De profielschatting (`net_monthly_income` / `estimated_monthly_expenses`) als
   laatste terugval wanneer de gekozen grondslag geen bruikbaar getal oplevert.

### Waarom `transaction` een eigen waarde krijgt en niet in `auto` opgaat

Zonder een expliciete `transaction` kan iemand die budgetten heeft maar bewust op
de gemeten werkelijkheid wil sturen, dat nergens vastleggen. De enige uitweg zou
`manual` zijn: een bevroren getal in plaats van een levende grondslag. Dat is
strikt slechter dan wat hij vandaag heeft. De vierde waarde bestaat dus niet voor
de symmetrie van het keuzevenster, maar om te voorkomen dat de app mensen naar de
handmatige override duwt.

### Waarom `auto` niet wordt gemigreerd

Bestaande rijen staan op `auto` omdat hun eigenaar nooit heeft gekozen. Voor die
rijen verschuift de grondslag stil naar budgetten zodra die er zijn. Dat is
opzettelijk: `auto` betekent "kies voor mij", en de nieuwe keuze ís het antwoord.
Een datamigratie die alle `auto`-rijen op `transaction` vastzet zou het
tegenovergestelde doen — ze zou een keuze vastleggen die de gebruiker nooit
maakte, en de standaard voor iedereen bevriezen op de oude situatie.

De prijs is dat een getal kan bewegen zonder dat de gebruiker iets deed. Die prijs
betalen we alleen onder één harde voorwaarde: **de kaart benoemt zijn eigen
grondslag.** Vandaag toont de kaart alleen een "handmatig"-badge; voortaan draagt
elke kaart zichtbaar waar zijn getal vandaan komt ("uit je budgetten", "uit je
transacties", "eigen bedrag"). Een grondslag die kan schuiven en zich niet
bekendmaakt, is een tweede waarheid met vertraging.

## De selectie: een uitsluitlijst, geen insluitlijst

Binnen de budget-grondslag kiest de gebruiker per budget of het meetelt (geen
belastingteruggaaf in het maandinkomen, wél de vakantietoeslag, enzovoort). Die
selectie wordt opgeslagen als de **uitgesloten** budget-id's, niet als de
ingesloten:

- "alles aangevinkt" is dan de lege lijst — de blijvende, kosteloze default, ook
  voor een gebruiker die de selectie nooit opent;
- een later aangemaakt budget telt vanzelf mee, in plaats van stil buiten de
  grondslag te vallen omdat het niet in een insluitlijst stond. Dat laatste is de
  gevaarlijkere fout: een ontbrekend budget verlaagt het inkomen zonder enig
  signaal;
- een id van een verwijderd budget in de lijst is betekenisloos en wordt genegeerd,
  nooit een fout.

Sluit de gebruiker *alle* budgetten van een type uit, dan is de grondslag leeg.
Dat levert géén inkomen of uitgaven van nul op: de resolver behandelt het exact
als "geen budgetten" en valt terug op de transactiegrondslag, met een zichtbare
melding in het detailvenster.

## Opslag: een eigen kolom, geen `feature_preferences`

De selectie krijgt een **exclusieve, additieve jsonb-kolom op `profiles`**
(`cashflow_basis_prefs`), geschreven via de bestaande `PUT /api/parameters` +
`sanitizeCashSettingsInput`, met een defensieve parser als enige schrijfpoort.

`profiles.feature_preferences` — de voor de hand liggende plek — is afgewezen.
`PUT /api/feature-preferences` bouwt de jsonb bij elke aanroep opnieuw op uit
uitsluitend bekende `UNIFIED_FEATURES`-id's en schrijft die als **volledige
overwrite**. Elke sleutel die geen feature-id is, verdwijnt bij de eerstvolgende
voorkeurenwijziging. Een grondslag-selectie daar neerzetten betekent dat het
inkomen van een gebruiker verandert doordat hij ergens anders een functie aan- of
uitzette. Dit volgt het precedent dat
`supabase/migrations/20260710120000_add_toekomst_scenario_prefs.sql` al
vastlegde: een eigen kolom maakt een volledige overwrite veilig, heeft geen
concurrente schrijvers, en erft de bestaande eigen-rij-policy op `profiles`
(`FOR ALL USING (auth.uid() = id)`) zonder nieuw RLS-werk, omdat RLS row-level is.

De selectie is **eigen rij, niet huishoud-gedeeld**. Ze verwijst naar budget-id's
van deze gebruiker; een partner-id heeft er geen betekenis in. Het aandeel waarmee
een *gedeeld* budget meetelt wordt geregeld door de huishoud-deelfractie
(`mySharePct` via `shareFractionFor`), niet door deze lijst.

Die weging moest voor de inkomensgrondslag **nieuw gebouwd** worden en volgde niet
vanzelf uit het bestaande model — een punt dat pas bij de security-toets boven
tafel kwam. De SELECT-policy op `budgets` levert namelijk ook de als `shared`
gemarkeerde budgetten van de partner, en de bestaande som over die rijen
(`computeYearlyMustExpenses`) weegt ze op 100 %. Voor *uitgaven* was dat bestaand
gedrag; voor *inkomen* zou het nieuw zijn geweest, want inkomen kwam tot dan toe
uit transacties en telde daar niet dubbel. Zonder weging zou hetzelfde gedeelde
inkomstenbudget bij beide partners volledig meetellen, en dat via FIRE, spaarquote,
hefboomscores en bruto Box 1 doorwerken. `lib/household/budget-share.ts` past de
fractie daarom toe op kindniveau — waar de post ontstaat — met een fail-closed
terugval van 50 % wanneer de huishoud-context onleesbaar is, en een fast path die
voor gebruikers zonder gedeeld budget geen extra query doet.

Wat hiermee **niet** is opgelost: `computeYearlyMustExpenses` weegt gedeelde
budgetten nog steeds op 100 %. Dat is bewust buiten dit besluit gehouden — het is
een andere metriek (essentiële jaaruitgaven voor het FIRE-doel) en meeveranderen
zou de FIRE-datum van huishoudens verschuiven om een reden die los staat van de
grondslagkeuze. Het staat als aandachtspunt genoteerd.

De bronwaarde en de bijbehorende selectie landen in **één** aanroep. Twee
aanroepen zouden een waarneembare tussentoestand opleveren (grondslag al op
`budget`, selectie nog niet geschreven), en bij een gefaalde tweede aanroep een
blijvend verkeerde grondslag.

## Eén resolver, want er waren er al vijf

De keuze "welk getal is het effectieve inkomen" stond bij het nemen van dit besluit
op **vijf** plaatsen onafhankelijk van elkaar gecodeerd:
`resolveEffectiveIncomeExpenses` (maandbasis), `resolveSavingsSource` (jaarbasis),
de private `cashflowNetYearly` in `lib/box1-income.ts`, de `initIncome`-regel in
`components/overview/cashflow-instellingen-blok.tsx`, en een rauwe maandlus zonder
resolver in `components/app/horizon/strategie-modal.tsx`. Vier daarvan kennen
alleen `manual` versus "berekend"; een derde grondslag valt bij hen stilzwijgend
in de `else`-tak en levert de transactiewaarde op terwijl de rest van de app het
budgetgetal toont.

Een derde bronwaarde toevoegen zonder die vijf tot één te brengen, vermenigvuldigt
de bestaande drift in plaats van hem te dragen. **De grondslagbeslissing woont
voortaan op één plek en geeft `{ waarde, grondslag }` terug**; elk oppervlak
consumeert dat en herhaalt de beslissing niet. De zwaarste consequentie zit in
`lib/box1-income.ts`: dat pad voedt via `grossFromNet` het bruto Box 1-inkomen en
daarmee de jaarruimte en de fiscale kansen. Een afwijkende grondslag daar betekent
een jaarruimte die op een ander inkomen is gerekend dan de gebruiker op zijn
inkomenskaart ziet. Zie ook het "bekende restverschil" in ADR 0086, dat door dit
besluit wordt opgeheven in plaats van vergroot.

## De spaarquote volgt de uitgavengrondslag

De 6-maands spaarquote corrigeert voor spaarbudget-stortingen en schuldaflossing.
Die correctie bestaat omdat de transactiesom een **rúwe** uitgavensom is waarin
spaarstortingen en aflossingen ten onrechte als uitgave zitten (zie de toelichting
bij `resolveSavingsSource`); de correctie telt ze terug.

Een budget-gebaseerde uitgavensom heeft die eigenschap niet: hij wordt opgebouwd
door budgetten van type `expense` te *selecteren*, waardoor `savings`- en
`debt`-budgetten er per constructie buiten vallen. Het geld dat de correctie zou
terugtellen, is er nooit afgehaald. De correctie er alsnog bovenop leggen telt
hetzelfde spaargeld twee keer — precies de fout die op het handmatige pad een
ingevoerde 30% tot 37,2% opblies.

**Dat `savings`- en `debt`-budgetten buiten de uitgavengrondslag vallen, is
daarmee geen filterkeuze maar een dragende invariant.** Zou de grondslag ooit
"alle budgetten" gaan betekenen, dan wordt de correctie weer noodzakelijk en
klopt dit besluit niet meer.

De rekenregel wordt daarom uniform: de spaarquote is
`(effectief inkomen − effectieve uitgaven) / effectief inkomen`, waarbij de
transactiegrondslag zijn *gecorrigeerde* uitgavencijfer aanlevert
(`uitgaven₆ − spaarbudget₆ − aflossing₆`). Voor de dominante combinatie
transactie-inkomen met transactie-uitgaven is die uitkomst rekenkundig identiek
aan `savingsRate6m` van vandaag; voor gemengde combinaties voorkomt ze dat een
verhouding uit de ene grondslag wordt losgelaten op een bedrag uit de andere.

**Er blijft geen uitzondering staan — herzien tijdens de bouw.** Een eerdere versie
van dit besluit spaarde de bestaande combinatie handmatig inkomen met
transactie-uitgaven uit: die hield haar huidige uitkomst (`savingsRate6m`), ook al
is die intern inconsistent — een verhouding gemeten over transactie-inkomen,
vermenigvuldigd met een handmatig inkomen. De redenering was dat repareren de
FIRE-datum van bestaande gebruikers zou verschuiven om een reden die niets met deze
functionaliteit te maken heeft.

Die redenering verviel toen de eigenaar besloot dat geschat inkomen, geschatte
uitgaven en spaarquote **één weergave** worden in plaats van drie losse vensters.
De uitzondering was verdedigbaar zolang de drie apart bewerkt werden en de menging
onzichtbaar bleef; in één venster staan de twee grondslagen naast elkaar op het
scherm en is een spaarquote die stilzwijgend een derde grondslag hanteert niet uit
te leggen. De uniforme regel hierboven geldt daarom zonder uitzondering.

Aanvaarde prijs, expliciet door de eigenaar bevestigd: op de dag van uitrol
verschuiven FIRE-datum en gezondheidsscore van bestaande gebruikers door **twee**
oorzaken tegelijk — de nieuwe standaardgrondslag én de opgeheven menging. Dat maakt
een individuele verschuiving lastiger te herleiden dan bij twee losse uitrollen.
Dat is de prijs van één weergave, en die is bewust betaald.

## De budgetgrondslag is de REALISATIE van de budgetten (correctie 2026-08-11)

**Correctie tijdens de bouw.** Een eerdere versie van dit besluit liet de
budgetgrondslag de *geplande limiet* per budget optellen, en aanvaardde het
restrisico dat daaruit volgt: een budget is een plan, geen realisatie, dus wie
optimistisch begroot krijgt een te hoog inkomen, een te lage uitgave, een te hoge
spaarquote en een te vroege vrijheidsdatum — zonder dat de app dat tegenspreekt.

De eigenaar heeft dat rechtgezet: met "uit je budgetten" bedoelt hij **de
realisatie van de afgelopen twaalf maanden op die budgetten**, niet de ingestelde
limiet. De keuze zelf is dus goed; alleen de bron van het bedrag klopte niet.

**De regel.** Per geselecteerde budgetpost telt het bedrag dat er in het rollende
12-maands venster daadwerkelijk op is geboekt — transfer-gefilterd, positief voor
een inkomstenbudget en absoluut-negatief voor een uitgavenbudget. Is er in dat
venster niets op geboekt, dan telt de geplande limiet: dat is de "indien er
transacties zijn gelogd" uit de correctie, en het houdt een net aangemaakt budget
bruikbaar. De bron per post is zichtbaar (`source: 'realized' | 'planned'`), en de
geplande limiet blijft naast de realisatie beschikbaar.

Een budget dat korter dan het venster bestaat, wordt naar een heel jaar geschaald op
zijn **leeftijd** (`budgets.created_at`), niet op het aantal maanden waarin toevallig
iets geboekt is en ook niet op de spanwijdte van zijn boekingen. De realisatie is een
*meting* over een vast venster, geen run-rate: extrapolatie bestaat uitsluitend om te
compenseren dat een budget nog geen heel jaar bestaat.

Dat onderscheid is niet theoretisch. Ankeren op de spanwijdte van de boekingen gaat
aan de bovenkant mis: een jaarlijkse gemeentebelasting die in de lopende maand wordt
afgeschreven heeft spanwijdte 1, en €800 ÷ 1 × 12 = €9.600 — twaalf keer te hoog, en
maandelijks golvend omdat de spanwijdte met het venster meeschuift. Dat is dezelfde
over-extrapolatiefout die ADR 0050 voor het inkomen opruimde. De spanwijdte blijft
alleen als ondergrens staan, voor boekingen die ouder zijn dan `created_at` (import,
samengevoegd budget).

De aanvaarde keerzijde: een oud budget dat pas sinds kort gebruikt wordt, schaalt niet
op — €200 in twee maanden telt als €200 per jaar. Dat is het juiste antwoord op de
vraag die deze grondslag stelt, en het groeit vanzelf mee terwijl het venster
opschuift; het alternatief zou een volatiel run-rate-cijfer zijn dat bij elke jaarpost
ontspoort.

**Wat dit met het restrisico doet.** Het grootste deel vervalt: de grondslag meet nu
wat er werkelijk gebeurde, dus een optimistisch budget kan de vrijheidsdatum niet
meer vervroegen. Wat er van overblijft is smal maar reëel:

1. **Een budget zónder transacties leunt nog steeds op een plan.** Voor die posten
   geldt de oude waarschuwing onverkort — en juist daar is de gebruiker het minst
   geneigd zijn limiet te herzien.
2. **Twaalf maanden realisatie is geen voorspelling.** Een eenmalige uitschieter of
   een net beëindigde last telt vol mee; de app corrigeert dat niet.
3. **De meting kan onvolledig zijn.** Ontbreken er transacties (niet-gekoppelde
   rekening, contant), dan meet de grondslag te laag zonder dat te weten. Een
   *gedeeltelijk* gefaalde ophaalronde wordt wél opgevangen: als één van de drie
   aggregaat-chunks faalt, valt de hele ronde terug op de planning, zodat er nooit
   een te lage realisatie onder de naam "gemeten" doorgaat.
4. ~~**De snapshot-historie draagt voorlopig twee grondslagen.**~~ **Opgelost op
   12 augustus 2026** — zie hieronder. Alle drie de schrijvers naar
   `net_worth_snapshots` staan nu op de realisatie.

Wat we ook hier níet doen, is plan en meting tot een derde getal mengen. Per post
geldt óf de realisatie óf het plan, en welke van de twee is zichtbaar. Eén
grondslag per post, benoemd, of niets.

### De snapshot-cron staat mee op de realisatie (12 augustus 2026)

Restrisico 4 hierboven is opgeheven met migratie
`20260811180000_tx_month_aggregate_user_scope.sql`. Het probleem was niet dat de
cron de realisatie niet *wilde* meten, maar dat hij het niet *veilig kon*:
`tx_month_aggregate` is `SECURITY INVOKER` en ontleent zijn hele scope aan de RLS
van `transactions`. De cron draait op de service-role — een rol met
`rolbypassrls = true` — waar `auth.uid()` NULL is en die RLS wegvalt. Zonder
afbakening zou de functie daar over de transacties van álle gebruikers
aggregeren, dus viel de cron terug op de geplande limieten.

De RPC krijgt daarom twee optionele parameters, `p_user_id` en `p_household_id`.
**Ze zijn een puur restrictief extra AND-filter, nooit een verruiming.** De
functie blijft `SECURITY INVOKER`; een conjunct kan alleen rijen wegnemen. Voor
een `authenticated` aanroeper geldt de SELECT-policy er dus onverkort bovenop: wie
een vreemd user-id meegeeft, snijdt door een verzameling waar die rijen sowieso
niet in zaten en krijgt 0 rijen en géén fout — hij leert niets, ook niet uit het
verschil tussen "bestaat niet" en "mag niet". Voor `anon` verandert er niets: de
SELECT-policy staat `to authenticated`, dus die rol matcht geen enkele policy en
krijgt 0 rijen ongeacht de parameters. Alleen op het service-role-pad, dat RLS
sowieso al passeerde, *doen* de parameters iets — ze maken een reeds
ongelimiteerd pad begrensbaar.

Een `SECURITY DEFINER`-variant met een eigen autorisatiecheck is bewust afgewezen:
die zou een policy nabootsen die er al is, en daarmee een tweede waarheid
introduceren die kan verlopen. Een restrictief filter op een invoker-functie heeft
die faalvorm per constructie niet.

Twee details die dragend zijn en niet stil mogen veranderen. Ten eerste spiegelt
het filter de policy `View own or shared transactions` volledig — inclusief de
gedeelde huishoud-tak. Alleen op `user_id` afbakenen zou een gedeeld budget waarop
de partner het meeste boekt bij deze gebruiker structureel te laag laten meetellen,
precies de fout die eerder al één keer met de budget-scope van de snapshot-routes
is gemaakt. Ten tweede gebruikt de cron de *ongecachete* ophaal: de
`cache()`-variant keyt op de supabase-client, en de cron deelt één service-client
over alle gebruikers — via de cache zou de tweede gebruiker de realisatie van de
eerste krijgen.

Wat hiermee **niet** verandert: de reeks wordt niet herschreven. Historische rijen
blijven op de grondslag waarop ze zijn gemeten, dus de eenmalige sprong die
hierboven onder "Gevolgen die we vooraf accepteren" staat, blijft staan. Vanaf nu
is de reeks intern consistent.

Voor de vrijheidsfilosofie verschuift het accent daarmee gunstig: de gebruiker ziet
niet langer wat hij van plan wás, maar hoe hij werkelijk leefde — en dat is het
eerlijkere anker voor een vrijheidsdatum.

## Gevolgen die we vooraf accepteren

- **De noodfondsnorm beweegt mee.** Het doel is 3× het netto maandsalaris; een
  budget-gebaseerd inkomen verplaatst dus het noodfondsdoel en daarmee de
  gezondheidsscore, zonder handeling van de gebruiker. Dit is een gevolg, geen
  defect.
- **`retirement_expense_method = 'current_income'` beweegt mee.** Bij die methode
  ís het jaarinkomen de pensioenuitgave, en dus het FIRE-doel. Dit is de grootste
  getalsverschuiving van dit besluit en blijkt niet uit de functiebeschrijving.
- **Snapshots maken een stap.** De reeks wordt niet herschreven — historische
  rijen blijven op de grondslag waarop ze zijn gemeten. Op de dag van de omslag
  toont een grafiek daardoor een sprong die geen financiële gebeurtenis is.
- **De AI-context draagt de grondslag mee.** Zonder dat zou de assistent een
  bedrag noemen dat de gebruiker niet in zijn bankafschrift terugvindt en niet
  kunnen uitleggen waarom.
