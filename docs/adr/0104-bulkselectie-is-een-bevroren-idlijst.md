---
id: 0104-bulkselectie-is-een-bevroren-idlijst
title: Een bulkselectie op transacties is een bevroren id-lijst, geen criterium
status: aanvaard
date: 2026-08-11
elements: [as-transacties, as-budget, sp-registreren, do-transactie, fn-budgetteren, t-supabase]
---

Het transactie-bulkbewerkscherm (requirements 11 aug 2026, B1–B3) laat een
gebruiker over de **volledige** historie zoeken, tot duizenden transacties
selecteren, ze in één keer hercategoriseren of **hard verwijderen**. De
kernbeslissing is wat "selecteer alle 4.000" technisch betekent. Besluit: de
selectie is een **bevroren, expliciete id-lijst**, één keer server-side
gematerialiseerd uit het criterium; het criterium reist mee als tekst voor de
bevestiging en het regelaanbod, maar mag de verzameling die gemuteerd wordt
nooit bepalen of verbreden. Het criterium versmalt, de id-lijst beslist.

## Context

Twee families zijn mogelijk voor een "selecteer alles wat aan dit filter
voldoet"-actie:

**(a) De client stuurt een expliciete id-lijst.** Kosten: tot ~4.000 UUID's
(~150 KB) over de lijn, en een selectie die tussen tonen en uitvoeren kan
verouderen.

**(b) De client stuurt het criterium; de server voert het opnieuw uit.** Kosten:
het getal dat de gebruiker bevestigde en de verzameling die geraakt wordt zijn
**twee losse uitvoeringen** van hetzelfde filter. Elk verschil daartussen — een
filterbug, een genormaliseerde parameter, een net binnengekomen banksync — is
onzichtbaar tot na de mutatie. Dat is letterlijk het Greenhouse-incident uit ons
externe onderzoek: filterbug × bulkactie = veel te veel geraakte records. Bij een
**onherroepelijke** verwijdering (B1: hard delete, geen prullenbak) is dat geen
theoretisch risico maar een klasse van dataverlies zonder herstelpad.

Twee eigenschappen van onze eigen codebase maken de keuze scherper:

- De RLS op `transactions` is **asymmetrisch**: SELECT is huishoud-verbreed
  (`ownership='shared' AND household_id = user_household_id()`), UPDATE/DELETE
  zijn strikt `auth.uid() = user_id`. Een schrijfronde die door RLS nul rijen
  raakt geeft **geen fout**. Kandidaten tellen in plaats van geschreven rijen
  herleiden verhult dat volledig — de les die
  `lib/own-accounts-reclassify.ts` in een docblock draagt.
- PostgREST kapt elk antwoord stil af op `max_rows` (1000), óók bij een hogere
  `.limit()`. Een niet-pagineerd "alles" is per definitie een halve waarheid.

## Besluit

**1. De selectie wordt één keer gematerialiseerd en daarna bevroren.**
Vóór élke bevestiging roept de client één manifest-endpoint aan dat een
**selectiemanifest** teruggeeft: de id's plus alles wat de bevestiging moet
kunnen stellen (aantal, sommen, hoeveel rijen van een gekoppelde bankrekening
komen, welke gesplitst zijn, welke een tegenboeking hebben). Aantal, bedrag,
waarschuwingen én de te muteren verzameling komen daarmee uit **dezelfde
uitvoering**. De mutatieroutes accepteren uitsluitend id's en voeren nooit een
filter uit.

Dat endpoint heeft twee ingangen, met hetzelfde antwoord: "Selecteer alle N
gevonden transacties" stuurt het **criterium** (server-side uitgevoerd met een
expliciete `.range()`-lus), aangevinkte rijen sturen hun **id-lijst**. Die tweede
ingang is een correctie op de eerste versie van dit besluit, die het manifest
alleen voor "alle N" liet draaien omdat een expliciete selectie "al bevroren" is.
Dat klopt voor de id's, maar niet voor de **afgeleiden** die de bevestiging moet
stellen — en de belangrijkste daarvan, de tegenboeking die standaard
meeverdwijnt (besluit 8), ligt per definitie *buiten* de selectie. Gevolg in de
praktijk: de knop noemde "Verwijder 5 transacties" terwijl de server er 6
verwijderde, zonder type-to-confirm (5 ligt onder de drempel) en zonder
herstelpad. Eén uitvoering, één getal, één verzameling — voor beide soorten
selectie.

**2. Harde bovengrens: 5.000 id's per bulkactie.** Daarboven weigert het
manifest met een 400 (`code: 'selection_too_large'`) en de vraag het filter te
verfijnen. Nooit stil afkappen (R-NF2). De grens zet een bodem onder de
blast radius die geen enkele filterbug kan omzeilen.

**3. Het bevestigde aantal is een server-side poort, geen UI-versiering.**
Elke mutatieroute krijgt `expectedCount` mee en weigert bij ongelijkheid met
`ids.length` (na ontdubbelen). Bij verwijderen boven de drempel (25, gedeelde
constante) is het overgetypte `confirmCount` een **tweede** poort die de server
zelf toetst. Het uiteindelijk gerapporteerde getal komt echter altijd uit
`.select('id')` op de mutatie — nooit uit `expectedCount` (R-NF4).

**4. De zoekterm wordt nooit rauw onderdeel van een filterexpressie.**
Een PostgREST `.or('description.ilike.*x*,counterparty_name.ilike.*x*')` gebruikt
komma's en haakjes als scheidingstekens, en `%`/`_` zijn LIKE-wildcards. Een
gebruiker die `%` typt zou anders alles matchen — dezelfde te-brede-selectie
langs de achterdeur. De term wordt gevalideerd (max. 100 tekens) en geëscapet
vóór hij een patroon wordt. Dit is een blast-radius-control, geen cosmetica.

**5. Eén schrijfprimitive, met eigenaarschap als verplichte parameter.**
Alle bulkschrijfacties van deze functionaliteit lopen door één plek
(`lib/transactions/bulk-mutate.ts`) die `userId` verplicht neemt en `.eq('user_id')`
op **zowel** de leesronde als de schrijfronde zet, batcht op ≤200 id's, en per
batch telt wat terugkwam. Routes bouwen zelf geen query. Een bulkactie kan dus
niet worden geschreven zónder de scoping — dat is de structurele borging van
AC11, niet een discipline per query. Nooit `getServiceClient()` (ADR 0006).

**6. De bulkoverlay toont uitsluitend eigen transacties.** De leesronde zet
expliciet `.eq('user_id')` bovenop RLS, juist omdat RLS hier bewust breder is.
Partnerrijen op een gedeelde rekening kún je niet muteren, dus tonen ze zou een
scherm opleveren dat liegt. Bij een huishouden meldt de overlay dat neutraal —
zonder de partnerdata te tellen of te lezen.

**7. Resultaat per uitzondering, niet per item.** F19/AC14 worden vervuld met
`{ requested, updated|deleted, skipped[{id,reden}], failedIds[] }`. Een
per-item-antwoord voor 4.000 rijen is payload zonder informatiewaarde; wat de
gebruiker moet weten is het verschil en de reden ervan.

**8. Randgevallen.**
- *Gesplitste transacties hercategoriseren:* **uitsluiten en vóóraf melden**.
  Bij een split bepalen de deelregels het budget; stil overschrijven laat
  `transaction_splits`-rijen achter die niet meer optellen tot de toewijzing —
  een tweede waarheid over dezelfde euro. Splits verwijderen zou een
  destructieve neveneffect zijn achter een niet-destructieve actie. Het manifest
  levert `splitIds`, de bevestiging noemt ze, en de server dwingt de skip af met
  `.not('is_split','is',true)` (niet `.eq(false)` — de kolom is nullable).
- *Gesplitste transacties verwijderen:* geen applicatiewerk. De FK
  `transaction_splits.transaction_id → transactions.id` draagt `ON DELETE CASCADE`
  (20260717120000). De bevestiging vermeldt het wel.
- *Gekoppelde overboeking (`linked_transfer_id`):* de FK is self-referentieel met
  `ON DELETE SET NULL`, dus één zijde verwijderen laat een **semantische** wees
  achter: een rij die nog `transaction_type='transfer'` draagt en daardoor via
  `isRealAggRow` in noch inkomsten noch uitgaven meetelt, terwijl zijn
  tegenhanger weg is. Besluit: de tegenboeking gaat standaard mee, zichtbaar
  gemeld, en het genoemde aantal (knoptekst én type-to-confirm) is het **totaal
  inclusief** tegenboekingen. Uitzetten mag, met de waarschuwing erbij.
  Let op: `linked_transfer_id` wordt niet alleen door de handmatige
  overboekingsschermen gezet maar óók automatisch door
  `lib/transfer-matching.ts#linkUnmatchedTransfers` bij elke bankimport. Elke
  gebruiker met twee gekoppelde rekeningen heeft dus zulke paren — dit is de
  regel, geen randgeval, en de UI-tekst noemt beide manieren.

**9. Geen index-migratie nu — met een vooraf vastgelegde trekker.** Er bestaat
vandaag geen enkele trigram/GIN-index en `pg_trgm` wordt nergens aangemaakt; de
`create_spend_limits`-migratie wees een trigram-index expliciet af als
niet-terugverdiende extensie-afhankelijkheid. `idx_transactions_user_date`
(`user_id, date DESC`) begrenst de scan al tot de rijen van één gebruiker, en
een leading-wildcard `ILIKE` over enkele duizenden rijen is goedkoop. Besluit:
geen migratie; de zoekroute logt de duur met een grep-bare tag. **Trekker:**
zodra p95 van de zoekroute > 800 ms of één gebruiker > 50.000 transacties heeft,
landt de migratie — `CREATE EXTENSION pg_trgm` + een GIN-`gin_trgm_ops`-index op
`description` en op `counterparty_name` — geschreven door `supabase-db-specialist`.
Puur additief, geen datawijziging, dus dit is een omkeerbaar besluit dat we
bewust uitstellen in plaats van speculatief nemen.

**10. Het canonieke trio krijgt één bron, de vier bestaande bulkpaden blijven.**
De regel "Eigen rekening ⇒ `transaction_type='transfer'` + `category_source='transfer'`
+ budget; terug naar een gewoon budget ⇒ markering wissen, uitsluitend op de
rijen die nú een verschuiving zijn" wordt een pure helper
(`lib/transactions/transfer-marking.ts`), gebruikt door de nieuwe route én door
`components/app/transaction-form.tsx`, met een paritytest. De **zusterregel** —
waar een *blijvende regel* landt ("Eigen rekening" hoort in `user_own_ibans`,
nooit in `category_corrections`) en welke minimale matchlengte geldt — kreeg
dezelfde behandeling in `lib/transactions/rule-target.ts`, gedeeld door
`lib/category-rules.ts`, `transaction-form.tsx` en de regel-route. Die stond op
drie plekken met net andere invulling, en dat kostte precies wat drift kost: de
regel-route legde de ondergrens alleen op de `user_own_ibans`-tak, waardoor een
zoekterm van twee tekens als substring-regel élke volgende import kon sturen. De bestaande
bulkpaden (`lib/category-rules.ts`, `ai-categorize-sheet.tsx`,
`own-accounts-reclassify.ts`) worden **niet** verbouwd: hun retro-tak is
criterium-gebaseerd en dus family (b), en die semantiek de nieuwe primitive in
trekken zou precies weghalen wat besluit 1 koopt. Convergentie is een aparte
kaart; tot dan staat het als aandachtspunt op de plaat.

## Overwogen en verworpen

- **Criterium-hash die de server hervalideert.** Voelt als een compromis, maar
  bewijst het verkeerde: dat client en server hetzelfde filter *bedoelen*, niet
  dat ze dezelfde rijen *vinden*. De tweede uitvoering — en dus het gat — blijft.
- **Optimistic locking op de selectie (versie/tijdstempel per rij).** Zou een
  tweede tabblad afvangen, maar de requirements kiezen expliciet "laatste
  schrijver wint, het rapport toont de werkelijkheid" (§7). Het eerlijke
  resultaatrapport is hier de goedkopere en beter uitlegbare control.
- **Soft delete / prullenbak.** Buiten scope bij eigenaarsbesluit B1; zou de
  leespaden van elke aggregatie raken.
- **Per-item resultaat voor alle rijen.** Zie besluit 7.

## Gevolgen

- Er ontstaat een nieuwe applicatieservice **Transactiedienst** (`as-transacties`)
  onder `/api/transactions/**`: de eerste server-side dienst voor het zoeken en
  muteren van transacties. Transactie-CRUD liep tot nu toe client-direct
  (grandfathered); import blijft bij `as-import`.
- `transaction_type` wordt langs een nieuw pad geschreven. Dat veld bepaalt via
  `isRealAggRow` in z'n eentje of een boeking meetelt in spaarquote, vrijheids-%
  en FIRE-projectie. Elke wijziging aan de bulkroute is dus een wijziging aan de
  rekengrondslag, ook als er geen rekenmotor in het diff staat.
- Hard verwijderen zonder tombstones betekent dat een verwijderde
  banktransactie bij een volgende sync opnieuw kan binnenkomen: de unieke
  dedup-index `transactions_import_hash_per_account_idx` blokkeert niets meer
  zodra de rij weg is. Bewust geaccepteerd (R-NF7), gemeld aan de gebruiker
  (F18), en vastgelegd als aandachtspunt met tombstones als uitweg.
- De 5.000-grens is zichtbaar gedrag: een gebruiker met meer treffers moet zijn
  filter verfijnen. Dat is de prijs van een begrensde blast radius.
- De overlay toont minder rijen dan de transactiepagina zelf in een huishouden.
  Dat verschil is bewust en wordt benoemd, niet verstopt.
