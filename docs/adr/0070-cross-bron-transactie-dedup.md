---
id: 0070-cross-bron-transactie-dedup
title: 'Cross-bron transactie-dedup — additieve laag 2 met een exacte sleutel, laag 1 blijft bevroren'
status: aanvaard
date: 2026-07-29
elements: [t-bankimport, do-transactie]
---

# 0070 — Cross-bron transactie-dedup

Fase 2 van `specs/bank-connect-doelrekening/plan.md` (§6), met de importkant in
fase 3.

## Context

`import_hash` (SHA-256 over `datum|bedrag|omschrijving`,
`lib/parsers/shared.ts#computeHash`) is laag 1: idempotent, spiegelt de unieke
index op `transactions`, en pint sinds fase 0b als golden-vector-test. Ze vangt
één ding niet: dezelfde boeking die uit een ANDERE bron komt met een andere
omschrijvingstekst — een TrueLayer-sync levert een andere string dan een
ING-CSV voor exact dezelfde afschrijving, dus de hash verschilt terwijl het om
één boeking gaat. Wie eerst CSV-historie importeerde en daarna dezelfde
rekening koppelt (of andersom), krijgt zonder tweede laag een dubbele reeks,
een dubbel geteld saldo, of allebei.

De unieke index op `transactions` is sinds de herstelreeks (B1, migratie
`20260729171125_transactions_drift_account_scoped_dedup_and_source.sql`)
rekening-gescoped: `(user_id, account_id, import_hash, coalesce(bank_seq,''))`.
Dat is de grondslag waarop laag 2 hieronder voortbouwt.

## Besluit

**Laag 1 (`import_hash`) is en blijft bevroren.** `computeHash` verandert niet;
het contract is met golden vectors gepind in `lib/parsers/shared.test.ts`
(fase 0b). Laag 2 komt er **additief naast**, niet in de plaats van.

**De sleutel is exact, niet fuzzy** (`lib/parsers/cross-source-dedup.ts`),
gescoped op `(user_id, account_id)`:

1. datum binnen **±1 kalenderdag** (`CROSS_SOURCE_DATE_TOLERANCE_DAYS`) —
   bank en bestand boeken dezelfde transactie soms een dag uit elkaar
   (valutadatum vs. boekdatum);
2. bedrag **exact gelijk op de cent, inclusief teken** (hele centen,
   `Math.round`, niet `Math.trunc` — anders wordt "exact" stil "bijna");
3. tegenpartij-IBAN **exact gelijk** na normalisatie, of — als één van beide
   zijden géén IBAN heeft — `normalizeCounterparty(naam)` exact gelijk.

**Géén fuzzy matching.** Geen bedragmarge, geen Levenshtein, geen
scoredrempel. Twee IBANs die van elkaar verschillen zijn positief bewijs van
twee tegenpartijen; naamgelijkheid mag dat niet overrulen. Ontbreekt aan één
kant zowel een bruikbare IBAN als een bruikbare naam, dan is er geen match —
op alleen datum + bedrag matchen zou elke maandelijkse vaste last op zichzelf
laten lijken. De asymmetrie is bewust: een fout-positief is stil verlies van
een échte transactie (niemand ziet het, het saldo klopt niet meer); een
fout-negatief is een zichtbaar duplicaat dat de gebruiker kan wegklikken. Deze
module leunt consequent naar het fout-negatief.

**Dedup verhindert alleen INSERTs — nooit een update, merge of delete. De
oudste rij wint en houdt haar budget-toewijzing** (`budget_id`,
`category_source`). Een "slimme" samenvoeging zou precies weggooien wat de
gebruiker met de hand heeft gezet. Er komt **geen** "mogelijk
duplicaat"-status in `transactions` — dat zou een derde waarheid worden die
élke lezer (dashboard, budgetten, AI-context, FIRE-motor) correct zou moeten
negeren, en die vergeet er altijd één.

**Geen DB-unique op laag 2.** De sleutel leunt op tekstnormalisatie
(`normalizeCounterparty`) en een tijdstolerantie — geen van beide is een
stabiele database-constraint. Laag 2 draait dus als applicatielogica vóór de
insert, niet als een tweede unieke index.

**Eén bestaande rij absorbeert hooguit één kandidaat**
(`partitionCrossSourceDuplicates`). Twee échte boekingen van €5 bij dezelfde
bakker op dezelfde dag matchen anders allebei op één bestaande rij en één van
de twee verdwijnt stil — precies het fout-positief dat deze laag moet
vermijden.

**Twee afnemers, één module.** De sync-route (laag 2 vangt hier alleen nog de
3-dagen-marge van B9/ADR 0072 op, sinds B9 het koppelpad grotendeels
overlap-vrij maakt) en het importpad (`POST /api/transactions/import`, ADR
0074 — na B9 de primaire afnemer) roepen dezelfde pure functie aan
(`lib/parsers/cross-source-dedup.ts`, geen Supabase-import). Bij een sync
wordt een laag-2-treffer **stil** overgeslagen (de gebruiker is niet
aanwezig); bij een import wordt hij **zichtbaar voorgedeselecteerd met
reden** en is hij overrulebaar (de gebruiker is wél aanwezig, FR12).

**De rekening-gescoped unieke index (B1) is de grondslag, niet een
bijkomstigheid (R6).** Zonder die schaalvergroting zou een gebruiker-brede
vergelijking twee échte boekingen op twee verschillende rekeningen als
duplicaat hebben gelezen.

## Alternatieven

- **Fuzzy matching (Levenshtein/similariteitsscore) op de omschrijving** —
  verworpen: een scoredrempel introduceert een tuning-probleem zonder
  duidelijk juiste waarde, en het risico ligt aan de verkeerde kant
  (fout-positief = stil dataverlies).
- **Eén DB-unique-index op de genormaliseerde sleutel** — verworpen: de
  sleutel bevat een tijdstolerantie (±1 dag) en tekstnormalisatie, geen van
  beide is een stabiele indexeerbare gelijkheid.
- **Een "mogelijk duplicaat"-status in `transactions`** — verworpen: een
  derde waarheid naast "bestaat"/"bestaat niet" die elke lezer opnieuw moet
  interpreteren.

## Gevolgen

- Een bank die de tegenpartij anders levert dan de CSV én geen IBAN meegeeft,
  glipt door de sleutel heen en levert een dubbele rij zonder signaal
  (restrisico 1). De gesplitste tellers in `bank_sync_log`
  (`transactions_dup_cross_source_iban` / `_name`) maken zichtbaar hóéveel
  laag 2 vangt; een structureel lage teller op een rekening met bekende
  overlap is het signaal dat de sleutel tekortschiet.
- De naam-fallback kan onterecht matchen op twee pinbetalingen van hetzelfde
  bedrag op dezelfde dag bij twee filialen van dezelfde keten (restrisico 2).
  Bij import zichtbaar en overrulebaar; bij sync stil — de enige plek waar dit
  besluit een transactie kan laten verdwijnen die er had moeten zijn.
- Opruiming van al bestaande historische duplicaten (van vóór deze laag) valt
  buiten scope.
- Wie `lib/parsers/cross-source-dedup.ts` uitbreidt met een nieuwe matchregel,
  behoudt de exacte-sleutel-doctrine of neemt dit besluit expliciet over.
