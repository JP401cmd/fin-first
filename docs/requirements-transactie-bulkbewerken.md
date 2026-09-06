# Requirements — Transactie-bulkbewerken

> Status: vastgesteld 11 aug 2026 · Pijplijn: `/new-feature` · Volgt op de
> inventarisatie ("bestaat dit al?") en het externe best-practice-onderzoek.

## 1. Aanleiding

Het zoekveld op `/overzicht/budget/transacties` doorzoekt **niet** de volledige
historie. Het is een client-side filter over een al-geladen venster:

- [`transactie-tijdlijn.tsx:191`](../components/overview/transacties/transactie-tijdlijn.tsx) —
  filtert in JS over de `transactions`-prop; die komt uit `resolveFetchWindow`
  ([`lib/transaction-insights.ts:341`](../lib/transaction-insights.ts)) en reikt
  **maximaal ~12–13 maanden** terug.
- [`cash-account-view.tsx:2196`](../components/app/cash-account-view.tsx) — een
  tweede, apart geïmplementeerd zoekveld over **één kalendermaand**.
- De command-palette doorzoekt assets, schulden, budgetten, doelen en holdings —
  transacties bewust **niet**.

Daarnaast bestaat er geen enkele manier om méérdere transacties tegelijk te
bewerken op basis van een eigen selectie. Wat wél bestaat is smal en werkt altijd
op *automatisch gedetecteerde* tegenpartij-siblings, niet op een vrije keuze:

| Bestaand pad | Selectie | Beperkt tot | Pagineert | Telt geraakte rijen |
|---|---|---|---|---|
| Sleepmodus (`lib/category-rules.ts`) | auto-siblings | `budget_id IS NULL` | nee | ja |
| `ai-categorize-sheet.tsx` | auto-groepen | `budget_id IS NULL` | ja (lees) / nee (retro) | ja |
| Scope-prompt (`transaction-form.tsx`) | auto-match op naam | — (ook gecategoriseerd) | nee | **nee** |
| `own-accounts-reclassify.ts` | IBAN/naam-regels | — | **ja** | **ja** |

`own-accounts-reclassify.ts` is het enige correcte referentiepatroon voor
"doe iets over de volledige historie".

Bulk-verwijderen bestaat alleen als neveneffect van het verwijderen van een héle
bankrekening (`DELETE /api/bank-accounts/[id]`).

## 2. Vastgestelde beslissingen (eigenaar, 11 aug 2026)

| # | Keuze | Consequentie |
|---|---|---|
| B1 | **Hard verwijderen** met zware bevestiging. Géén prullenbak, géén soft-delete, géén aparte "verbergen/uitsluiten"-actie. | Geen migratie voor `deleted_at`; geen aanpassing van leespaden. Onherstelbaar — de bevestiging moet het gewicht dragen. Expliciet afgewogen tegen het alternatief en zo besloten. |
| B2 | **Alles in één oplevering**: zoeken + selecteren + hercategoriseren + verwijderen. | Geen tussentijds bruikbare fase; de destructieve kant gaat tegelijk live. |
| B3 | **Regel aanbieden ná hercategorisatie**, uitsluitend op expliciete bevestiging. | Sluit aan op bestaande regel-machinerie; nooit stilzwijgend een regel wegschrijven. |

## 3. Scope

### In scope
- Eén nieuw oppervlak: een bulkbewerk-overlay, bereikbaar vanaf de
  transactiepagina via een expliciete zoekknop.
- Zoeken over de **volledige** transactiehistorie (geen datumvenster), met
  server-side paginatie.
- Filteren binnen de resultaten op ten minste: periode, rekening, budget,
  richting (in/uit), bedragbereik.
- Meervoudige selectie: per rij, per pagina, en expliciet "alle N resultaten".
- Bulkactie **hercategoriseren** naar één budget.
- Bulkactie **verwijderen**.
- Impact-samenvatting (aantal, totaalbedrag, vrijheidstijd) vóór uitvoering.
- Resultaatterugkoppeling ná uitvoering, inclusief gedeeltelijke mislukking.
- Aanbod om van een hercategorisatie een blijvende regel te maken (B3).

### Uit scope
- Prullenbak / herstel na verwijderen (B1).
- Een aparte "uitsluiten van berekeningen"-as (B1).
- Bulk bewerken van andere velden dan budget (notitie, tegenpartij, eigendom,
  datum). Het model moet uitbreiding wél toelaten.
- Bulk bewerken van `investment_transactions` / `crypto_transactions`.
- Het opheffen van het tweede zoekveld in `cash-account-view.tsx`. Dat blijft
  bestaan; wel wordt de nieuwe overlay daar niet gedupliceerd.
- Tombstones op de dedup-sleutel om herimport te voorkomen (zie R-NF7 —
  waarschuwen, niet voorkomen).

## 4. Functionele requirements

### Zoeken

- **F1** — De transactiepagina krijgt een expliciete zoekknop die de
  bulkbewerk-overlay opent. Het bestaande inline-zoekveld blijft ongewijzigd
  werken op het zichtbare venster.
- **F2** — De overlay zoekt op vrije tekst over `description` en
  `counterparty_name`, over de **volledige** historie van de gebruiker, zonder
  datumvenster.
- **F3** — Resultaten worden server-side gepagineerd en gesorteerd op datum
  aflopend. Het **totale** aantal treffers is bekend en wordt getoond, ook als
  slechts één pagina geladen is.
- **F4** — Binnen de resultaten kan aanvullend gefilterd worden op periode,
  rekening, budget, richting en bedragbereik. De actieve filters zijn te allen
  tijde zichtbaar.
- **F5** — Zonder zoekterm en zonder filter toont de overlay de volledige
  historie (nieuwste eerst); een lege zoekterm is geen foutsituatie.

### Selecteren

- **F6** — Elke rij heeft een checkbox. De kopcheckbox selecteert **uitsluitend
  de rijen op de huidige pagina** en kent drie standen: leeg, indeterminate, vol.
- **F7** — Is de hele pagina geselecteerd én zijn er méér treffers dan die
  pagina, dan verschijnt een aparte affordance die **het getal noemt**:
  "Selecteer alle N gevonden transacties". Dit is nooit de standaard.
- **F8** — Shift-klik selecteert een aaneengesloten bereik.
- **F9** — Een permanente selectieteller toont het juiste aantal, ook over
  pagina's heen, met een knop om de selectie te wissen.
- **F10** — Wijzigt de zoekterm of een filter, dan **vervalt de selectie**. Dit
  wordt zichtbaar gemeld; er verdwijnt nooit stilzwijgend een selectie waarop
  daarna een actie zou kunnen volgen.
- **F11** — Zolang er een selectie is, zijn rij-eigen acties (rij openen om te
  bewerken) uitgeschakeld.

### Bulkacties

- **F12** — Bij een selectie verschijnt een bulk-actiebalk met ten minste
  "Koppel aan budget" en "Verwijderen", plus een annuleerknop. De balk blijft
  zichtbaar tijdens scrollen.
- **F13** — De actiebalk toont de **impact van de selectie**: aantal, som van de
  bedragen en de vrijheidstijd-equivalent van die som.
- **F14** — *Hercategoriseren*: de gebruiker kiest één budget uit dezelfde
  keuzelijst als het bewerkformulier (`buildBudgetSelectEntries`), inclusief de
  archive-post "Eigen rekening". Bevestiging toont aantal, totaalbedrag en de
  actieve filtercontext.
- **F15** — Kiest de gebruiker de "Eigen rekening"-post, dan schrijft de
  bulkactie het **canonieke trio** (`transaction_type='transfer'`,
  `category_source='transfer'`, `budget_id`), gelijk aan
  [`transaction-form.tsx`](../components/app/transaction-form.tsx). Kiest hij een
  gewoon budget voor rijen die nú een verschuiving zijn, dan wordt
  `transaction_type` gewist — en uitsluitend op die rijen, zodat importherkomst
  (`'DEBIT'`, `'payment'`) elders intact blijft.
- **F16** — *Verwijderen*: de bevestiging noemt het aantal, het totaalbedrag en
  de actieve filtercontext, en stelt onomwonden dat het definitief is. De
  knoptekst benoemt de uitkomst ("Verwijder 43 transacties"), niet "OK". Rood is
  nooit het enige signaal.
- **F17** — Boven een drempel (voorstel: 25 transacties) vereist verwijderen
  type-to-confirm: de gebruiker typt het aantal over.
- **F18** — Bevat de selectie transacties afkomstig van een gekoppelde
  bankrekening, dan waarschuwt de bevestiging dat die bij een volgende sync
  opnieuw kunnen binnenkomen.
- **F19** — Na afloop toont de app wat er daadwerkelijk is gebeurd: "X van Y
  gewijzigd/verwijderd", met de reden bij overgeslagen rijen. Het getal is
  **herleid uit wat de database teruggaf**, nooit uit het aantal kandidaten.
- **F20** — Na een geslaagde hercategorisatie biedt de app aan er een blijvende
  regel van te maken, met vermelding van waarop die zou matchen. Alleen op
  expliciete bevestiging; wegklikken laat geen regel achter.

## 5. Niet-functionele requirements

- **R-NF1 (datapad)** — Lezen én muteren loopt via nieuwe API-routes onder
  `app/api/transactions/**`, conform ADR 0058. Géén client-directe
  `.select()`/`.update()`/`.delete()` vanuit de overlay. Mutatie-routes
  valideren hun body met zod via `parseBody`, en gebruiken de foutvorm uit
  `lib/api/respond.ts`.
- **R-NF2 (afkap)** — Geen enkel pad mag stil op `max_rows = 1000` afkappen. Zoek-
  en selectiequery's pagineren expliciet (`.range()`-lus), naar het model van
  [`own-accounts-reclassify.ts:60-73`](../lib/own-accounts-reclassify.ts).
  Een afkap die tóch optreedt wordt gerapporteerd, niet verzwegen.
- **R-NF3 (scoping)** — Elke mutatie is gescoped op `user_id` van de ingelogde
  gebruiker, op zowel de leesronde die de kandidaten bepaalt als de schrijfronde.
  Een bulkactie raakt **nooit** rijen van de partner, ook niet wanneer die via
  een gedeelde rekening zichtbaar zijn. Leak-check draait óók de `anon`-rol
  (0 rijen, géén fout).
- **R-NF4 (tellen)** — Geraakte rijen worden herleid uit `.select('id')` op de
  mutatie, nooit opgehoogd met het aantal kandidaten. Een RLS-blokkade geeft geen
  error maar nul rijen; kandidaten tellen zou dat verhullen.
- **R-NF5 (batching)** — Mutaties gaan in batches (≤200 ids per call). Bij een
  gesneuvelde batch wordt dat gerapporteerd; de overige batches gaan door en het
  eindrapport is eerlijk over het verschil.
- **R-NF6 (afgeleide cijfers)** — De vrijheidstijd-equivalent in de
  impact-samenvatting wordt geconsumeerd uit de canonieke bron
  (`dailyExpenseRate` uit de bundel), nooit lokaal herrekend. Onder
  bedragmaskering (ADR 0091) maskeert die regel mee.
- **R-NF7 (herimport)** — Er worden geen tombstones gebouwd; het risico wordt
  wél expliciet aan de gebruiker gemeld (F18).
- **R-NF8 (overlay)** — De overlay loopt via `<ShellOverlay>`, met de primaire
  acties in de sticky footer, ook op klein scherm. Geen hand-rolled
  `fixed inset-0`.
- **R-NF9 (kleur)** — Module-identiteit via `kern-*` (route `/overzicht`).
  Destructieve semantiek volgt de accentkeuze niet.
- **R-NF10 (toegankelijkheid)** — Echte `<input type="checkbox">` en `<button>`;
  de selectieteller is een `role="status"`-regio; volledige toetsenbediening;
  focus verspringt na verwijderen naar een voorspelbaar element.

## 6. Acceptatiecriteria (Given/When/Then)

**AC1 — zoeken reikt verder dan het venster**
Gegeven een gebruiker met een transactie van 3 jaar geleden met omschrijving
"Notaris", wanneer hij de bulkbewerk-overlay opent en op "Notaris" zoekt, dan
staat die transactie in de resultaten. *(Vandaag: geen treffer.)*

**AC2 — totaal aantal is bekend vóór de laatste pagina**
Gegeven een zoekopdracht met 340 treffers en een paginagrootte van 50, wanneer
de eerste pagina geladen is, dan toont de overlay "340 resultaten" en zijn er
50 rijen zichtbaar.

**AC3 — kopcheckbox pakt niet meer dan de pagina**
Gegeven 340 treffers en 50 zichtbare rijen, wanneer de gebruiker de kopcheckbox
aanvinkt, dan staat de teller op 50 — niet op 340 — en verschijnt een aparte
knop met de tekst "Selecteer alle 340 gevonden transacties".

**AC4 — selectie overleeft geen filterwissel**
Gegeven 40 geselecteerde rijen, wanneer de gebruiker de zoekterm of een filter
wijzigt, dan is de selectie leeg en is dat zichtbaar gemeld.

**AC5 — impact vóór de klik**
Gegeven een selectie van 12 transacties met een som van € 1.240, wanneer de
actiebalk zichtbaar is, dan toont die 12, € 1.240 en de bijbehorende
vrijheidstijd.

**AC6 — hercategoriseren over de volledige historie**
Gegeven 1.500 geselecteerde transacties, wanneer de gebruiker ze aan
"Boodschappen" koppelt, dan hebben ná afloop alle 1.500 dat budget en meldt de
app "1.500 van 1.500 gewijzigd" — het aantal komt uit de database, niet uit de
selectie.

**AC7 — Eigen rekening schrijft het canonieke trio**
Gegeven een selectie van gewone uitgaven, wanneer de gebruiker ze koppelt aan
"Eigen rekening", dan dragen ze `transaction_type='transfer'` én
`category_source='transfer'`, en tellen ze niet langer mee in inkomsten,
uitgaven en spaarquote.

**AC8 — terug naar een gewoon budget wist de markering**
Gegeven een selectie waarin 3 van 10 rijen een verschuiving zijn, wanneer de
gebruiker alle 10 aan "Boodschappen" koppelt, dan is `transaction_type` bij die
3 leeg en bij de overige 7 **ongewijzigd**.

**AC9 — verwijderen vraagt om gewicht**
Gegeven een selectie van 43 transacties, wanneer de gebruiker op Verwijderen
klikt, dan toont de bevestiging het aantal, het totaalbedrag en de actieve
filters, staat er dat het definitief is, en luidt de bevestigknop "Verwijder 43
transacties"; boven de drempel moet de gebruiker het aantal overtypen.

**AC10 — waarschuwing bij bankgekoppelde rijen**
Gegeven een selectie die transacties van een gekoppelde bankrekening bevat,
wanneer de verwijder-bevestiging verschijnt, dan waarschuwt die dat ze bij een
volgende sync kunnen terugkeren.

**AC11 — partnerrijen blijven onaangeraakt**
Gegeven een huishouden waarin de partner transacties heeft op een gedeelde
rekening, wanneer de gebruiker "alle N" selecteert en een bulkactie uitvoert,
dan is geen enkele rij van de partner gewijzigd of verwijderd.

**AC12 — geen stille afkap**
Gegeven een gebruiker met 4.000 transacties die aan het filter voldoen, wanneer
hij "alle 4.000" selecteert en hercategoriseert, dan zijn er 4.000 gewijzigd —
niet 1.000.

**AC13 — regel alleen op bevestiging**
Gegeven een geslaagde hercategorisatie, wanneer de app aanbiedt er een regel van
te maken en de gebruiker klikt weg, dan bestaat er géén nieuwe regel.

**AC14 — gedeeltelijke mislukking wordt gemeld**
Gegeven een bulkactie waarbij één batch faalt, wanneer de actie klaar is, dan
meldt de app hoeveel er wél en hoeveel er níét gelukt zijn.

## 7. Randgevallen

| Geval | Verwacht gedrag |
|---|---|
| Split-transactie (`is_split`) hercategoriseren | De splits bepalen het budget. Een bulk-budgetwijziging op een split is dubbelzinnig: sluit split-rijen uit van hercategoriseren en meld dat, of verwijder de splits expliciet. Te beslissen door de architect; stil overschrijven is geen optie. |
| Split-transactie verwijderen | `transaction_splits` moet meegaan (FK-gedrag verifiëren). |
| Handmatige overboeking (`linked_transfer_id`) verwijderen | De tegenboeking blijft anders als wees achter. Beide zijden meenemen of de gebruiker waarschuwen. |
| Selectie van 0 rijen | Bulkacties uitgeschakeld; geen lege bevestiging. |
| Zoekterm zonder treffers | Lege staat met suggestie, geen foutmelding. |
| Gebruiker zonder transacties | Lege staat; de zoekknop blijft zichtbaar maar meldt dat er niets te doorzoeken is. |
| Trage query bij grote historie | Laadstaat; geen bevroren UI. |
| Twee tabbladen open | Laatste schrijver wint; het resultaatrapport toont de werkelijkheid. |

## 8. Afhankelijkheden en bekende valkuilen

- **`isRealAggRow`** ([`lib/server-data/tx-aggregates.ts`](../lib/server-data/tx-aggregates.ts))
  bepaalt op `transaction_type` alléén of iets meetelt. Elke bulk-mutatie die dat
  veld raakt, verschuift spaarquote, vrijheids-% en FIRE-projectie.
- **Bestaande bulk-paden** mogen niet gedupliceerd worden. Overweeg of
  `lib/category-rules.ts` de gedeelde plek wordt voor "wijs N transacties toe".
- **`check:client-reads`** maakt een client-directe lezer in de nieuwe overlay
  hard rood — dat is de gate die R-NF1 afdwingt.
- **Zoeken op tekst over de volledige historie** kan een index vragen. De
  architect bepaalt of dat een migratie rechtvaardigt.

## 9. Definition of Done

1. Alle acceptatiecriteria AC1–AC14 aantoonbaar gehaald.
2. `npx tsc --noEmit`, lint en `npm run check:client-reads` schoon.
3. Unit-/componenttests op de selectielogica, de paginatie en het
   canonieke-trio-gedrag; een regressiecase op de bulkmutatie.
4. Leak-check op de nieuwe routes, inclusief de `anon`-rol.
5. `security-specialist`-ship-gate zonder 🔴-bevinding.
6. ADR vastgelegd; de vier views van `/beheer/architectuur` bijgewerkt
   (`npm run arch:diagram`).
7. UAT-definities geland: scenario in `lib/uat/catalog.ts`, criteria in
   `lib/uat/acceptance/`, node in `flows/`.
