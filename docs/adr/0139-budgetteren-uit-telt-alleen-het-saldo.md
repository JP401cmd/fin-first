---
id: 0139-budgetteren-uit-telt-alleen-het-saldo
title: 'Budgetteren uit: alleen het saldo telt, de boekingen vallen buiten de cijfers'
status: aanvaard
date: 2026-09-12
elements: [as-budget, as-transacties, as-planning, fn-budgetteren, t-supabase]
---

Zet een gebruiker "budgetteren" uit op een rekening, dan telt vanaf nu alleen
nog het **saldo** van die rekening mee (als cash-bezitting, mét rendement). De
**boekingen** van die rekening vallen buiten élk cijfer dat uit
`public.tx_month_aggregate` komt: de budgetsom, het transactie-jaarinkomen, de
spaarquote, het dagtarief, de FIRE-uitgaven en de snapshots. De filter zit in
het aggregaat zelf, en wordt daar toegepast door een definer-bepaalde set af te
**trekken** — niet door te joinen op `bank_accounts`, want die tabel is smaller
zichtbaar dan `transactions` en een join zou daar stil bedragen laten verdwijnen.

## Context

`public.tx_month_aggregate` is de enige bron van elk maandcijfer dat uit
transacties komt (`lib/budget-realized.ts`, `lib/savings-source.ts`,
`lib/expense-rate.ts`, `app/api/snapshots/cron/route.ts`). De functie filterde
uitsluitend op datum en scope — nooit op de budget-status van de rekening waar
de boeking op staat. Wie budgetteren uitzette op een rekening, zag die boekingen
dus gewoon terug in zijn budgetsom, spaarquote, dagtarief en FIRE-uitgaven,
terwijl het saldo van diezelfde rekening al als cash-bezitting in het vermogen
zat. Dubbel geteld in twee richtingen tegelijk: de rekening leverde
vermogensgroei én consumptie, en de gebruiker had juist gezegd dat hij die
boekingen niet in zijn budget wilde.

"Budgetteren uit" leeft op twee plekken die gesynchroniseerd horen te zijn:
`assets.has_budget_tracking` (de canonieke gate die de gebruiker aanvinkt en die
`syncBudgetingActive` leest) en `bank_accounts.is_active` (de companion-spiegel
die `syncBankAccountCompanion` zet, en waarop `/core/cash` en de import al
filteren).

De complicatie zit in de zichtbaarheid. `tx_month_aggregate` is SECURITY
INVOKER, dus een join op `bank_accounts` valt onder de RLS van de aanroeper — en
de SELECT-policy daar is smaller dan die op `transactions` (beide gemeten tegen
`pg_policies`, 12-09-2026). Er bestaan rijen die je wél als transactie mag zien
terwijl je de rekening niet mag zien: een eigen boeking naar de persoonlijke
rekening van de partner, of een gedeelde boeking waarvan de rekeninghouder het
huishouden inmiddels verlaten heeft. Bij een join zou zo'n rij stil uit de
huishoudcijfers vallen — een bedragverschuiving zonder financiële gebeurtenis.

## Besluit

**1. De regel.** Een boeking valt buiten het aggregaat zodra haar rekening
"budgetteren uit" heeft, en dat is waar zodra één van twee vlaggen dat zegt:
`bank_accounts.is_active = false`, of een gekoppeld cash-bezit met
`has_budget_tracking`/`is_active` niet waar. Een rekening **zonder** gekoppeld
bezit valt terug op `is_active` en telt dus mee zolang hij actief is — op
productie hangen daar 7.975 van de 24.606 boekingen aan (gemeten 12-09-2026).

De keuze voor "één vlag volstaat" is bewust. De vlaggen kunnen alleen uiteenlopen
door een half geslaagde schrijfactie (de gedocumenteerde faalvorm: de
setup-route vergat de sync ooit), en dan heeft de gebruiker érgens "uit" gezegd.
De omgekeerde keuze — pas uitsluiten als beide uit staan — zou een desync laten
uitpakken als "telt toch mee", precies het defect dat dit besluit repareert.

**1b. Gearchiveerd is niet hetzelfde als budgetteren-uit.**
`bank_accounts.is_archive_bucket` is **géén** uitsluitingsgrond. "Budgetteren
uit" is een bewuste keuze per rekening — *reken deze niet mee*. Het archief is
opruimen: daar belanden boekingen wanneer iemand een rekening **verwijdert** met
"transacties bewaren", typisch na een overstap van de ene bank naar de andere.

Zou het archief uitgesloten worden, dan verliest die gebruiker in één klap zijn
hele voorgeschiedenis uit dagtarief, spaarquote en FIRE, en zakt `historyMonths`
(ADR 0138) in tot de maanden sinds de overstap — een forse, stille verschuiving
van zes cijfers, veroorzaakt door een handeling die "netjes opruimen" heette.
Bewaarde historie blijft dus meetellen.

**De uitzondering staat vooraan, niet in de OR-keten.** Dat is geen stijlkeuze
maar de kern van de regel: `delete_bank_account` maakt de bucket aan met
`is_active = false` (gemeten tegen `pg_proc`, 12-09-2026 — stap 4 zet `is_active`
false, `ownership` 'personal', `is_archive_bucket` true) en verplaatst de
boekingen er daarna heen (stap 6, `account_id = v_bucket`). `is_archive_bucket`
alleen uit de uitsluitingslijst halen lost dus niets op — de bucket valt dan
alsnog weg via de actief-vlag. De bucket is daarom **nooit** uitgesloten,
ongeacht de andere vlaggen. De bezit-tak raakt hem sowieso niet: de bucket wordt
zonder `linked_asset_id` aangemaakt, en het bezit dat in stap 8 op
`has_budget_tracking = false` gaat hangt aan de *verwijderde* rekening.

**2. De vorm: aftrekken, niet joinen.** Het aggregaat bepaalt eerst de zichtbare
transactierijen (ongewijzigd, onder de RLS van `transactions`), verzamelt daaruit
de voorkomende `account_id`'s, en vraagt aan een SECURITY DEFINER-helper
`public.budget_excluded_account_ids(uuid[])` welke daarvan "budgetteren uit"
hebben. Die ids worden afgetrokken.

De rijverzameling hangt daarmee nog steeds uitsluitend aan de policy op
`transactions`; de budget-status wordt gelezen zonder de zichtbaarheid van de
boeking zelf te veranderen. Kent de helper een id niet, dan blijft de rij staan:
de faalrichting is "telt mee zoals vandaag", nooit "verdwijnt stil".

De helper is definer en niet `auth.uid()`-gedreven (zoals
`partner_hidden_account_ids`), omdat de snapshot-cron op de service-role draait
waar `auth.uid()` NULL is (ADR 0103). Een perimeter uit `auth.uid()` zou daar een
lege set geven en de cron stil op de oude regel laten rekenen — twee grondslagen
in één tijdreeks, precies wat ADR 0103 heeft opgeruimd.

**3. De geaccepteerde rest.** De helper staat als RPC op het REST-oppervlak. Hij
geeft geen enkele transactierij en geen enkel rekening-attribuut terug (geen
naam, saldo, IBAN of eigenaar), alleen een deelverzameling van de uuid's die de
aanroeper zélf meegaf. Wat eruit te leren valt, is voor een rekening-uuid die je
al bezit het feit "hierop staat budgetteren uit" — en dat is niet te
onderscheiden van "dit id bestaat niet", want beide leveren niets op. Uuid's zijn
niet te raden. Dat is de bewust geaccepteerde, begrensde rest; `anon` houdt
execute-recht zodat een uitgelogde render 0 rijen krijgt en geen 42501 (ADR
0048).

## Gevolgen

- **Vandaag verschuift er geen enkel getal.** De wijziging is preventief. Gemeten
  op productie 12-09-2026: 27 rekeningen waarvan **nul** uitgesloten — de enige
  kandidaat was de archief-bucket (0 transacties) en die is nu juist expliciet
  vrijgesteld; 24.606 transacties, 0 zonder rekening. Oude en nieuwe definitie
  leveren over de volledige historie exact dezelfde 3.105 aggregaatrijen
  (`except` in beide richtingen leeg).
- **Transacties in het archief blijven de 12-maands vensters voeden.** Ze tellen
  mee in de budgetsom, het transactie-jaarinkomen, de spaarquote, het dagtarief,
  de FIRE-uitgaven én in `historyMonths` — een bankoverstap verkort de
  meetgeschiedenis dus niet. Dat is de bedoeling: de boekingen zijn echt
  gebeurd; alleen de rekening waar ze op stonden bestaat niet meer.
- **Zodra iemand budgetteren uitzet, bewegen zes cijfers tegelijk**: budgetsom,
  transactie-jaarinkomen, spaarquote, dagtarief (en dus élke vrijheidstijd),
  FIRE-uitgaven en de nachtelijke snapshot. Dat is de bedoeling — ze staan
  allemaal op dezelfde bron — maar het is wél een zichtbare sprong in de
  tijdreeks op het moment van omzetten, zonder financiële gebeurtenis. Een
  historische snapshot wordt niet herrekend.
- **Het besluit geldt beide kanten op**: ook de inkomsten van zo'n rekening
  vallen weg. Alleen het saldo telt.
- **De nep-database spiegelt de regel** (`test/helpers/fake-supabase.ts`,
  `isBudgetExcludedAccount`), zodat de mock op dit punt niet stiller is dan
  productie. Ontbrekende velden krijgen daar de DB-default — let op
  `has_budget_tracking`, die defaultt op **false**.
- **`transactions.account_id` is NOT NULL** (gemeten 12-09-2026); de
  `account_id is null`-tak in de SQL is defensief en vandaag onbereikbaar.
- **Een JS-tel-lus over transactierijen omzeilt deze regel.** De bestaande norm
  "consume, don't recompute" krijgt er dus een reden bij: wie zelf over
  `transactions` telt, telt de uitgezette rekeningen weer mee. Dat is vandaag
  geen theorie: `lib/core-data-loader.ts` (huidige maand, vorige maand,
  6-maands sparkline), `lib/budgets-data-loader.ts` (/overzicht/budget) en de
  AI-contextbouwers lezen rauw en honoreren de keuze dus níét. Bewust niet in
  dezelfde snede gerepareerd — het zijn andere vensters met een eigen
  regressie-oppervlak (ADR 0073) — maar vastgelegd als aandachtspunt
  `budgetteren-uit-geldt-alleen-op-het-maandaggregaat`.

## De terugweg

Migraties zijn append-only; corrigeren gaat vooruit. Blijkt de regel verkeerd,
dan herstelt één correctiemigratie hem: `create or replace` van
`public.tx_month_aggregate` met exact het lichaam van migratie
`20260811180000_tx_month_aggregate_user_scope.sql` (signatuur en returns-clausule
zijn ongewijzigd gebleven, dus dat is een zuivere terugzetting), gevolgd door
`drop function if exists public.budget_excluded_account_ids(uuid[])` in een
**tweede, latere** migratie — pas nadat de terugzetting zich bewezen heeft.

Waaraan je ziet dat het misging:

1. **Een bedrag dat daalt zonder dat iemand iets uitzette.** De scherpste meting
   is de aggregaat-diff zoals hierboven: draai de oude en de nieuwe definitie
   naast elkaar over de volledige historie en vergelijk met `except` in beide
   richtingen. Nul rijen verschil zolang niemand budgetteren uitzet.
2. **`cardinality(public.budget_excluded_account_ids(array(select id from public.bank_accounts)))`
   groter dan het aantal rekeningen waarvan de gebruiker zégt dat budgetteren
   uit staat.** Dat wijst op een vlag die per ongeluk uit staat (bv. een
   `has_budget_tracking` die op false bleef) in plaats van op een fout in de
   regel.
3. **Een sprong in `net_worth_snapshots.savings_rate`/`fire_age` op de dag na de
   uitrol**, bij een gebruiker die niets heeft aangeraakt. Dat zou betekenen dat
   de cron en het sessie-pad de regel verschillend toepassen — het risico dat de
   rol-onafhankelijke helper juist uitsluit.
