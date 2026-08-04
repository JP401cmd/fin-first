---
id: 0082-bankrekening-verwijderen-alleen-op-gebruikersopdracht
title: 'Een bankrekening verdwijnt alleen op expliciete gebruikersopdracht — systeempaden deactiveren, en de transactiehistorie overleeft in een archiefrekening'
status: aanvaard
date: 2026-08-04
elements: [do-transactie, do-bezitting, t-supabase]
---

# 0082 — Bankrekening verwijderen: alleen op gebruikersopdracht

Zusje van ADR 0011 ("ON DELETE SET NULL voor referentie-data, CASCADE voor
levenscyclus-data"). Daar ging het over wat de *database* bij een verwijdering
mag meenemen; hier over wie überhaupt mag verwijderen, en wat er met de
geschiedenis gebeurt die aan de verwijderde rij hing.

## Context

Tot 4 augustus 2026 kon een gebruiker een betaalrekening niet verwijderen. Niet
"omslachtig", maar onmogelijk: `app/api/bank-accounts/[id]/route.ts` had alleen
een `PATCH`, en het ⋮-menu van de rekeningweergave had één item ("Rekening
bewerken"). Drie acties leken erop en waren het geen van drieën — "Ontkoppelen"
zet `bank_connection_accounts.is_active = false`, "Budgetteren uitschakelen"
zet `bank_accounts.is_active = false`, en de prullenbak in de bezitting-pane
zet `assets.is_active = false` terwijl de `bank_accounts`-rij blijft staan.

Dat gat was geen vergeetachtigheid maar een litteken. Er stónd een
`bank_accounts.delete()` in de client, en die botste op de foreign key van
`bank_connection_accounts` (zonder `ON DELETE`-clausule, dus `NO ACTION`). De
delete faalde nadat `assets.has_budget_tracking` al was weggeschreven: een half
toegepaste mutatie zonder foutmelding. De reparatie was de delete eruit halen en
in `lib/bank-account-companion.ts` als invariant vastleggen — *"`bank_accounts`
is de identiteitsrij en wordt nooit verwijderd"*.

Die invariant loste het echte probleem op (een **toggle** hoort niets te
vernietigen) maar formuleerde het te breed, waardoor een legitieme
gebruikerswens onmogelijk werd. Wie twee keer dezelfde rekening had aangemaakt,
of een rekening van een opgeheven bank meesleepte, kon hem nooit meer kwijt.

Het tweede probleem is wat er met de transacties moet gebeuren. Hier zat een
valkuil die deze ADR bijna verkeerd had laten aflopen: het migratiebestand
`20260215000000_create_base_tables.sql` zegt op r.219 en r.266 dat
`transactions.account_id` en `recurring_transactions.account_id` op
`ON DELETE SET NULL` staan. **Op productie staan ze allebei op `ON DELETE
CASCADE`, met een `NOT NULL`-kolom** — gemeten tegen `pg_constraint` op
4 augustus 2026, dezelfde drift-klasse als ADR 0045 beschrijft maar dan op een
foreign key in plaats van een policy.

Dat draait het probleem om. Een kale delete laat de boekingen niet verweesd
achter; hij **vernietigt** ze. En een RI-cascade draait buiten RLS om, dus hij
vernietigt ook wat de verwijderende gebruiker zelf niet mag aanraken.

## Besluit

**1. `bank_accounts` wordt nooit verwijderd door een systeempad.** Alleen een
expliciete gebruikersopdracht via `DELETE /api/bank-accounts/[id]` mag de rij
verwijderen. De oorspronkelijke reden van de invariant blijft daarmee volledig
overeind: `syncBankAccountCompanion` en `setBudgetTracking` blijven
deactiveren, nooit verwijderen. Een toggle vernietigt niets; een opdracht wel.

**2. De verwijdering is atomair en zit in de datalaag.** Koppelrijen vrijgeven,
transacties verplaatsen of wissen, terugkerende regels stopzetten, het cash-bezit
deactiveren en de rij verwijderen gebeuren in één Postgres-functie
(`public.delete_bank_account`), niet in een reeks losse PostgREST-calls.
supabase-js heeft geen transactie-API, en dit is de eerste harde delete van een
identiteitsrij in de app — precies de situatie waarin een half toegepaste
mutatie het litteken uit de context zou herhalen. Zelfde redenering en zelfde
vorm als ADR 0076.

**3. De gebruiker kiest wat er met de transacties gebeurt, en "bewaren" is de
voorgeselecteerde weg.** Historisch correct is dat een rekening kan verdwijnen
terwijl wat je hebt uitgegeven blijft bestaan: de boekingen van maart veranderen
niet doordat je in augustus een rekening opruimt. Wie ze tóch weg wil, kan dat —
maar dan als bewuste tweede keuze, niet als bijwerking.

**4. Bewaarde transacties verhuizen naar één archiefrekening per gebruiker**
(`bank_accounts.is_archive_bucket`), lazy aangemaakt bij de eerste verwijdering
met "bewaren". Niet naar `account_id = NULL`, want dat maakt ze onzichtbaar; niet
naar een groeiende rij spookrekeningen, want dan ruil je één opgeruimde rekening
in voor een permanente. Eén emmer, zonder eigen UI-oppervlak.

**5. Het gekoppelde cash-bezit gaat mee als soft delete.** De rekening in de UI
*ís* dat bezit. Bleef het actief, dan is de rekening "verwijderd" terwijl het
saldo doortelt in netto vermogen, horizon en FIRE — stil verkeerd. Geen hard
delete: zes foreign keys naar `assets` staan op `ON DELETE CASCADE`, waaronder
het complete holdings-grootboek.

## Waarom de archiefrekening niet als vermogen meetelt

Dit is de scherpste rand van het besluit en de reden dat de emmer er is zoals
hij is. Het predicaat `is_active = true AND linked_asset_id IS NULL` betekent
app-breed "losse bankrekening" en het saldo daarvan wordt **bovenop** het
cash-bezit opgeteld — op acht plekken, waaronder `lib/unlinked-cash.ts`,
`lib/core-data-loader.ts`, `lib/assets-data-loader.ts`, de horizon-client, de
what-if-pagina, `app/api/report/balans` en `lib/kpi-context.ts`.

Een naïef aangemaakte archiefrekening valt precies in dat predicaat en zou het
vermogen dus verhogen. De emmer staat daarom permanent op `is_active = false`
met `balance = 0`. Alle acht paden dragen `is_active = true` in hun filter, dus
de uitsluiting is structureel en niet afhankelijk van een extra filter dat
iemand kan vergeten; `balance = 0` is het tweede vangnet voor het geval een
toekomstig pad `is_active` tóch weglaat.

Om dezelfde reden slaat de trigger `fn_auto_link_bank_account_asset` de emmer
over: die maakt bij elke `bank_accounts`-insert zonder `linked_asset_id`
automatisch een zichtbaar cash-bezit aan, en dat is exact wat een archief niet
mag zijn.

`ownership = 'personal'` sluit het rijtje: zo stempelt `stamp_household_id()`
de emmer niet aan het huishouden en ziet een partner hem nooit via de
huishoud-verbrede SELECT-policy.

## Gevolgen

**Invariant 2 blijft onaangetast, en dat is geen woordspel.**
`linked_asset_id` (UNIQUE) wordt nog steeds nooit genuld. Het dubbeltel-gevaar
ontstaat door een rij die *blijft bestaan* met een lege kolom; hier verdwijnt de
hele rij en blijft er niets over om dubbel te tellen. De archiefrekening heeft
weliswaar `linked_asset_id IS NULL`, maar staat permanent inactief.

**Verplaatste transacties verliezen hun `import_hash`.** De unieke index
`transactions_import_hash_per_account_idx` staat op
`(account_id, import_hash, coalesce(bank_seq,''))`, en de hash zelf is berekend
over `datum|bedrag|omschrijving` — dus niet rekening-afhankelijk. Twee
rekeningen die dezelfde boeking dragen (precies het duplicaat-geval dat iemand
wil opruimen) zouden bij het samenvoegen een `23505` geven en de hele
verwijdering laten mislukken. In het archief heeft de hash geen functie meer: de
emmer is nooit importdoel en alle dedup-loaders zijn rekening-gescoped. Prijs:
van archieftransacties is niet meer af te leiden uit welke import ze kwamen.

**Een rekening met rijen van een andere gebruiker wordt geweigerd** (`TF410`).
Die rijen zijn voor de verwijderende gebruiker niet schrijfbaar, dus de
verplaatsing slaat ze over — en dan wist de cascade ze bij het verwijderen van
de rekening. Een eerlijke blokkade is beter dan stil andermans historie
vernietigen.

De uitweg is nadrukkelijk **niet** "zet de rekening eerst op persoonlijk", en
dat advies is uit de foutmelding verwijderd. `ownership` omzetten verplaatst
geen enkele rij; het maakt ze alleen onzichtbaar, en onder een guard die op het
etiket afgaat is dat precies de knop die de cascade vrijgeeft. Een blokkade
waarvan de voor de hand liggende workaround het schadegeval ís, wekt vertrouwen
dat er niet is. De weigering hangt daarom aan het bestaan van vreemde rijen, en
de uitweg is dat de partner ze verplaatst of verwijdert.

Die guard moet bovendien expliciet **buiten de RLS-zichtbaarheid van de
aanroeper** tellen. Dat is niet vanzelfsprekend en het is de tweede valkuil die
deze ADR bijna verkeerd had laten aflopen: `transactions.ownership` heeft
default `'personal'` (en `components/app/transaction-form.tsx` zet het formulier
óók zo), dus een boeking die de partner op de gedeelde rekening zet is voor de
verwijderende gebruiker **onzichtbaar**. Een guard die onder invoker-RLS telt,
telt die rij niet — en laat precies de rij lopen die de cascade vernietigt. Hij
zou dan beschermen wat je toch al kon zien en doorlaten wat je niet kunt zien.

Concreet: `public.count_foreign_rows_on_bank_account(uuid)`, `SECURITY DEFINER`
met lege `search_path`, `EXECUTE` alleen voor `authenticated`. Als eerste
statement toetst hij dat de rekening van de aanroeper is — eigen rij, níét de
huishoud-verbrede SELECT-policy — en gooit anders `TF404`, zodat de functie geen
orakel wordt op andermans rekening-id. Verder geeft hij uitsluitend een getal
terug: geen bedragen, omschrijvingen of id's. Zelfde
afdwing-in-de-DB-functie-argument als ADR 0036: één plek waar het klopt, in
plaats van een conventie die een toekomstige aanroeper kan vergeten.

**Beide tabellen tellen mee, niet alleen `transactions`.**
`recurring_transactions.account_id` draagt dezelfde CASCADE, en er is een reëel
pad waarlangs de partner er een rij op zet: `acceptPattern` in
`components/app/cash-account-view.tsx` doet een `insert` met de `user_id` van de
klikkende gebruiker en zonder `ownership`, dus op de kolomdefault `'personal'`.
Een guard die alleen boekingen telt, laat de terugkerende regels van de partner
ongemerkt vernietigen.

**De foreign keys zijn gecodificeerd zoals ze zijn**, niet zoals de repo dacht.
Zonder die correctie ziet elke test op een verse database (`db reset`,
preview-branch) `SET NULL` terwijl productie `CASCADE` doet — "groen getest"
bewijst dan niets over het gedrag dat gebruikers krijgen.

**De koppelrij wordt vrijgegeven, niet verwijderd.**
`bank_sync_log.connection_account_id` verwijst `not null` en zonder
`ON DELETE`-clausule naar `bank_connection_accounts`, dus een delete daarvan
wordt geblokkeerd zodra er ooit gesynchroniseerd is. De rij houdt
`bank_account_id = null` en `is_active = false`; de leeskant vangt dat al af.

**De toestemming bij de bank blijft staan.** We verbreken de interne koppeling;
`bank_connections` (token, consent) blijft leven en verloopt vanzelf. Dat is
verdedigbaar — één consent kan meerdere rekeningen dekken — maar het betekent
dat "de bankkoppeling wordt verbroken" in de bevestiging over TriFinity gaat,
niet over de bank. Openstaand: bij het verdwijnen van de láátste actieve
koppelrij van een verbinding die verbinding op `revoked` zetten.

**De vermogenslijn krijgt een knik zonder toelichting.**
`balance_snapshots` en `net_worth_snapshots` behouden hun oude waarden, dus
vanaf de verwijderdatum daalt het netto vermogen met het saldo van de rekening
zonder dat er een gebeurtenis bij staat. Openstaand: een annotatie op de
vermogenslijn.

**"Bewaren" herstelt de historie voor de verwijderaar, niet voor zijn partner.**
De guard weigert alleen rijen van een ánder; boekingen die van de verwijderaar
zélf zijn maar `ownership = 'shared'` dragen, komen er dus langs — terecht, want
ze zijn van hem. Ze verhuizen naar zijn persoonlijke archiefemmer, die de
partner nooit ziet. De maandcijfers van de verwijderaar blijven daardoor exact
kloppen, maar de uitgaven- en spaarcijfers van de partner over *afgelopen*
maanden veranderen stil — precies de regressie die het archief voor de
verwijderaar juist voorkomt, één perspectief verderop.

Bewust niet opgelost in deze slice, want elke uitweg is een eigen besluit: de
emmer gedeeld maken zodra hij gedeelde boekingen opneemt (dan lekt een
persoonlijke rekening van de verwijderaar mogelijk het huishouden in), of de
verhuisde rijen op `personal` stempelen (dan bewegen de cijfers van de partner
consistent mee in plaats van scheef, maar verlies je de gedeelde grondslag met
terugwerkende kracht). Wat er níét mag gebeuren is dit stilzwijgend laten: het
staat hier zodat de volgende lezer weet dát het zo werkt.

## Alternatieven

**De rekening in plaats daarvan soft deleten.** Ligt voor de hand — het is wat
bezittingen doen — en het lost het transactieprobleem vanzelf op. Afgewezen
omdat `bank_accounts.is_active = false` al bezet is: dat is de uitdrukking van
"budgetteren staat uit voor deze rekening", geschreven door
`syncBankAccountCompanion`. Zou verwijderen dezelfde vlag gebruiken, dan zijn
"tijdelijk niet budgetteren" en "weg" niet meer te onderscheiden, en zou het
aanzetten van budgetteren een verwijderde rekening laten terugkomen.

**De foreign key zijn werk laten doen.** Nul werk. Afgewezen zodra bleek wat die
foreign key op productie werkelijk is: `CASCADE`. "Niets doen" betekent hier de
volledige boekingshistorie van de rekening wissen, inclusief rijen van de
partner, zonder dat iemand daar toestemming voor heeft gegeven.

**Verwijderen alleen toestaan voor lege rekeningen.** Veilig en simpel, maar het
laat de gebruiker met precies het probleem zitten waarvoor hij kwam — een
rekening vol oude boekingen die hij niet meer wil zien. Het verplaatst de last
naar de gebruiker in plaats van hem weg te nemen.

**Elke `ownership = 'shared'`-rekening weigeren zolang de gebruiker een
huishoudgenoot heeft.** Aantrekkelijk omdat het puur beleid is en géén
`SECURITY DEFINER` nodig heeft — nul nieuwe privileges, niets dat een orakel kan
worden. Afgewezen om twee redenen, waarvan de tweede beslissend is. (1) Het
blokkeert gevallen waar niets aan de hand is: een gedeelde rekening waar de
partner nooit iets op boekte is dan nooit meer op te ruimen. Het meet een etiket,
niet het gevaar. (2) Dat etiket is met één legale klik te wisselen — eigen-rij
UPDATE-policy op `bank_accounts`, en de rijen van de partner blijven gewoon
staan — waarna de guard is omzeild en de cascade vrij baan heeft. De
DEFINER-helper meet het gevaar zelf en is daardoor ongevoelig voor het etiket,
voor de geschiedenis van dat etiket (een rekening die ooit gedeeld wás draagt de
rijen nog steeds) én voor de `ownership`-waarde van de rijen zelf.

## Verwijzingen

- ADR 0011 — FK-semantiek: SET NULL voor referentie-data, CASCADE voor levenscyclus
- ADR 0036 — partner-privacy wordt in de SECURITY DEFINER-functie zelf afgedwongen, niet bij de aanroeper
- ADR 0044 — foutvorm van de route (platte `{ error }`-envelope, nooit een rauwe melding)
- ADR 0045 — drift-hek: elke remote-DDL krijgt een matchende migratie in de repo (hier toegepast op een FK)
- ADR 0058 — muteren via een API-route, niet client-direct
- ADR 0076 — een controle die tegen een externe partij beschermt, hoort atomair in de datalaag
- `lib/bank-account-companion.ts` — de twee invarianten, waarvan de eerste hier is geherformuleerd
