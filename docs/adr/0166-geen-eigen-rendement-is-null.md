---
id: 0166-geen-eigen-rendement-is-null
title: "Geen eigen rendement" is NULL — en een ingevulde 0 blijft een bewuste 0%
status: aanvaard
date: 2026-09-19
elements: [do-bezitting, as-vermogen, as-planning, t-supabase]
---

`public.assets.expected_return` was `numeric NOT NULL DEFAULT 0` en kon daardoor twee wezenlijk verschillende dingen niet uit elkaar houden: "deze bezitting rendeert bewust 0%" (betaalrekening, bitcoin, afschrijvende auto) en "ik heb hier geen eigen aanname; reken met mijn profielrendement". Besluit: de kolom wordt **nullable zonder default**; `NULL` betekent "geen eigen aanname" en valt terug op het profielrendement, een ingevulde `0` blijft een bewuste 0%. **Geen backfill** — bestaande nullen zijn overwegend de juiste waarde. De keuze wordt in de twee formulieren **expliciet**; een leeg veld wordt nooit stil `NULL`.

## Context

TPR-02 legde in september 2026 de terugvalketting al in de kern: `potRendement()` (`lib/horizon-kernel/adapter/potten.ts`) leest `null` als "val terug op `resolveFireParams(profile).grossReturn`". Alleen kón `null` er via de database nooit binnenkomen — de kolom was `NOT NULL DEFAULT 0`, het bezittingenformulier weigerde een leeg veld, `POST /api/assets` eiste `z.number()`. De terugval dekte dus alleen in-memory-, synthetische en legacy-rijen. De Voorkeuren-kaart "Bruto rendement" beloofde ondertussen aan de gebruiker dat dit getal zijn plan stuurde, terwijl er in de praktijk geen enkele bezitting op terugviel.

Het gevolg voor de gebruiker: wie geen mening heeft over het rendement van een specifiek bezit, moest tóch een getal kiezen. Koos hij 0, dan kreeg hij stil "dit groeit niet" in plaats van "reken met mijn standaard" — en dat verschil is over dertig jaar het verschil tussen wel en niet vrij zijn.

## Overwogen

**A — kolom nullable (gekozen).** `NULL` = geen eigen aanname. Sluit aan op de ketting die de kern al draagt en op de manier waarop de rest van de app "niet ingevuld" uitdrukt. De bestaande CHECK (`>= -100 AND <= 100`) hoeft niet te wijzigen: een CHECK evalueert bij `NULL` naar `NULL` en passeert.

Binnen A lag nog de vraag of de `DEFAULT 0` moest blijven. Gekozen is **A2: ook de default laten vallen**, zodat "weggelaten bij INSERT" hetzelfde betekent als "geen eigen aanname". Dat kon veilig omdat de twee live triggerfuncties (`fn_auto_link_bank_account_asset`, `ensure_companion_cash_asset`) gemeten tegen `pg_proc` een **expliciete** `0` schrijven en dus niet op de default leunden.

**B — een aparte boolean `use_default_return`, kolom blijft NOT NULL.** Geen enkele lezer breekt. Afgewezen: twee kolommen die elkaar kunnen tegenspreken (`true` naast de waarde 6 — wat wint?), en het gooit de `null`-ketting weg die de kern al als contract draagt.

**C — een sentinelwaarde (bv. `-999`).** Afgewezen: botst met de bestaande CHECK, en een sentinel die ongemerkt door `Number()` glipt is precies de stille-foutklasse die we hier juist wegnemen.

## Besluit

1. **Migratie `20260919140000`**: `drop not null` + `drop default` op `public.assets.expected_return`, plus een kolom-comment dat de drie betekenissen vastlegt. Additief; de kolom erft ongewijzigd de bestaande policies (SELECT huishoud-gedeeld, UPDATE strikt eigen-rij). Geen nieuwe policy, geen nieuw schrijfpad, geen service-role.

2. **Geen backfill.** Gemeten 19-09-2026: 134 rijen over 16 gebruikers, waarvan 63 op exact 0 — cash 39, other 8, crypto 7, vehicle 5, physical 3, eigen_huis 1. Voor het merendeel is 0 daar de juiste waarde (`TYPICAL_RETURNS` geeft checking/joint/business/contant_geld en bitcoin/ethereum/altcoins/defi allemaal 0). Een backfill `0 → NULL` zou betaalrekeningen en bitcoin op het profielrendement laten renderen in ieders projectie: een stille verslechtering van bestaande plannen. Er is bovendien geen kolom die vastlegt of het veld ooit is aangeraakt, dus "nooit ingevuld" en "bewust 0" zijn achteraf niet te scheiden. **NULL geldt alleen vooruit.**

3. **Eén plek beslist wat `null` betekent.** `heeftEigenRendement()` in `lib/asset-return.ts` is het predicaat; `resolveExpectedReturnPct()` is de resolver op **procent**-schaal en `potRendement()` de bestaande op **decimale** schaal. Bewust géén gedeelde resolver over beide schalen: `0.07 × 100 ÷ 100 !== 0.07`, en die drift zou de gouden horizon-matrix laten kantelen. Gedeeld wordt de *beslissing*, niet de rekensom.

4. **De keuze is expliciet, in beide hosts.** `lib/asset-return-keuze.ts` draagt de optie-kopij als `Record<Union, {keuze, effect, waarom}>`; het bezittingenformulier, de cash-rekeningkaart en de laag-2-editor van de plan-review renderen dezelfde tekst. Een leeg getalveld blijft een invoerfout en wordt nooit stil `NULL` — anders wordt elke onvoltooide invoer een profielrendement-aanname op bijvoorbeeld een auto.

5. **Het live effect in de wizard rekent niets zelf.** `RegelSimOverride.assetExpectedReturns` accepteert `number | null`; bij `null` gaat de rij als `null` de kern in en past `potRendement` daar de terugval toe — dezelfde ketting als bij opslaan.

## Gevolgen

**De compile-gate die dit besluit zou afdwingen, bestaat niet.** Dat is de belangrijkste les van deze wijziging en hij is tegengesteld aan wat bij het ontwerp werd aangenomen. De verwachting was dat `Asset.expected_return: number → number | null` elke lezer via TypeScript zou aanwijzen. Gemeten: `npx tsc --noEmit` bleef daarna **groen (exit 0)**. Vrijwel elke lezer haalt zijn waarde door `Number(...)`, en `Number(null) === 0` is volstrekt legaal — geen `NaN`, geen typefout. Een nieuwe `Number(a.expected_return)` zou dus zonder één rode poort een NULL als 0% lezen.

De grendel is daarom een **bron-scan**: `lib/asset-return.null-semantiek.test.ts`, in hetzelfde idioom als de andere scannende poorten in deze repo (`lib/beheer/geen-inhoud.test.ts`, de euro-view-toets, `scripts/check-client-data-reads.mjs`). Hij flagt een kale `Number(<asset>.expected_return)` of `?? 0` / `|| 0` op het veld, houdt een expliciete uitzonderingslijst die alleen mag **krimpen**, en bevat een zelftoets die bewijst dat de scan bijt. De profiel-kolom `profiles.expected_return` heet toevallig net zo maar is een andere grootheid; de scan pint daarom de ontvanger vast op `a`/`asset`/`bezit`.

Verder:

- **Lezers moeten mee.** Elke projectie- en KPI-lezer kiest bewust tussen terugval op het profielrendement, een expliciete "geen eigen rendement"-weergave, of een gedocumenteerde nul-basis. Een oppervlak dat 0% toont waar de kern 7% rekent, is dezelfde bezitting met twee getallen.
- **De partnerkolom volgt dezelfde ketting** (`lib/horizon-kernel/adapter/partner-blok.ts`), anders rekent de partnerkolom anders dan de eigen kolom.
- **De migratie is niet terug te draaien**, wel vooruit te corrigeren; de correctiemigratie staat uitgeschreven in de kop van het migratiebestand.
- **Bewust ongewijzigd:** `app/api/holdings/import/route.ts` (literal 7) en `app/api/bank-connect/callback/route.ts` (literal 0) zijn bedoelde aannames per importbron, geen ontbrekende waarden.

## Losse vondst (geen blocker)

`save_onboarding_data` **bestaat niet live** (gemeten tegen `pg_proc`, 19-09-2026), terwijl drie migratiebestanden in de repo hem definiëren mét `COALESCE(…, 0)` op deze kolom (`20260319000002`, `20260408000002`, `20260414000001`). Wie alleen de repo leest, ontwerpt rond een RPC die er niet is. Past bij ADR 0045: de repo beschrijft de bedoeling, de database is de werkelijkheid.
