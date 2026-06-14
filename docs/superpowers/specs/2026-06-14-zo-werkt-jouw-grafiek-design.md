# Zo werkt jouw grafiek — totstandkoming van de FIRE-grafiek

**Datum:** 2026-06-14
**Status:** ontwerp goedgekeurd (2 vormkeuzes bevestigd) → klaar voor implementatieplan
**Module:** Horizon (`/toekomst`)
**Anker:** de bestaande **Simulatie Prognose**-modal (`SimChartModal`, `components/app/horizon/sim-chart-widget.tsx`), geopend via de **"Details"-knop** in het grafiekgebied bovenaan `/toekomst` (`horizon-client.tsx:2738` → `setSimModalOpen`).

## Probleem & doel

De FIRE-grafiek is de kern van `/toekomst`, maar *hoe* hij tot stand komt is nu alleen technisch onderbouwd (de "Kassabon" met formules en parameters in de modal). Een leek kan de grafiek lezen, maar niet *navertellen waarom* hij zo loopt.

**Doel:** een generieke, visueel + tekstuele weergave die de **route van de werkelijke berekening** inzichtelijk en navolgbaar maakt voor een leek, gevoed met **de eigen data** van de gebruiker. Niet 100% rekenkundig exact — wel een eerlijke, herkenbare weergave van de échte route. Werkt voor élke gebruiker.

Bron van de uitleg-inhoud: de interne werkdoc-pagina `/beheer/grafiek-werking` (fases, snijpunt, voorkeuren, gebeurtenissen, strategieën, onttrekking, terugrekening) — die pagina blijft intern; deze feature is de gebruikersgerichte vertaling ervan.

## Concept: jouw grafiek in 4 bewegingen

Een verhalende walkthrough van vier genummerde hoofdstukken. Elk hoofdstuk = **één zin leek-uitleg** + **jouw eigen kerngetallen** + **een uitgelicht stukje van je eigen curve** (en bij de abstracte stappen een klein concept-diagram). De vier hoofdstukken zijn precies de échte rekenroute:

1. **Opbouw** — *"Je vermogen groeit elk jaar: wat je inlegt + rendement, min belasting."*
   - Data: `rows[0].startPortfolio` (startvermogen), jaarlijkse inleg (`accumulation`-rijen `savings`, ×12 voor weergave zoals nu), gemiddelde jaargroei (`growth` over `accumulation`-rijen), aantal opbouwjaren.
   - Beeld: de échte vermogenslijn met het **opbouw-segment** benadrukt (rest gedempt).
   - Framing: groei in vrijheidstijd (`formatWithFreedom`).

2. **Terugrekening (benodigd vermogen / V_nodig)** — *"De app rekent áchteruit: hoeveel heb je nodig om de rest van je leven van te leven?"*
   - Data: `requiredFirePortfolio` als ankergetal; uitleg dat dit bedrag *daalt* met de leeftijd (kortere te overbruggen periode + AOW/pensioen als inkomensbodem).
   - Beeld: klein **concept-diagram** (dalende benodigd-lijn) geadapteerd uit `grafiek-werking`'s `Snijpunt`-SVG, geparametriseerd met de eigen FIRE-leeftijd en het eigen bedrag. Géén verzonnen per-jaar V_nodig-reeks tenzij de engine die goedkoop levert; anders illustratief + echte anker-getallen.

3. **Snijpunt = vrijheid** — *"Vrijheid is waar je opbouw de terugrekening inhaalt."*
   - Data: `fireAgeFractional` (vrijheidsleeftijd), `firePortfolioAtFire` (vermogen op dat moment), `implicitWithdrawalRate`.
   - Beeld: het FIRE-punt op de eigen lijn gemarkeerd/gepulseerd + klein concept-diagram (opbouw kruist benodigd).
   - Edge: **niet bereikbaar** → eerlijke, strategie-bewuste tekst (hergebruik bestaande copy uit de widget) i.p.v. een snijpunt.

4. **Onttrekking** — *"Daarna leeft je vermogen mee met je keuzes."*
   - Data: `withdrawal`/`transition`-rijen; gekozen **strategie** (`deplete`/`perpetual`/`legacy`/`pensioen` via `STRATEGY_LABELS`); AOW/pensioen + levensgebeurtenissen uit `cashflows` (en `rows[].cashflowNet`/`oneTimeNet`) die de opname verlagen of het pad verstoren.
   - Beeld: de échte lijn met het **afbouw-/behoud-segment** benadrukt; levensgebeurtenissen als markers met hun impact.
   - Framing: per strategie de juiste afsluitende zin (afbouw naar €0 / behoud koopkracht / nalatenschap `targetEndPortfolio`).

Dit dekt de vier gevraagde elementen: netto opbouw (1), impact strategieën/voorkeuren (4 + parameters in 1/2), impact levensgebeurtenissen (4), onttrekkingsfase (4) en terugrekening (2).

## Vorm (keuze bevestigd)

**Verhaal voorop, rest inklapbaar.** De 4-stappen-walkthrough wordt de **hoofdweergave** bovenaan de `SimChartModal`. De huidige **Kassabon-onderbouwing** + **jaar-op-jaar tabel** blijven bestaan, maar verhuizen naar een **inklapbaar "Onder de motorkap"**-blok eronder (default ingeklapt). Eén modal bedient zo zowel de leek (verhaal) als de power-user (onderbouwing). De grafiek + de bestaande legenda blijven.

## Beeld (keuze bevestigd)

**Jouw lijn uitgelicht + mini-diagram.** Per hoofdstuk dezelfde échte `SimChart`-vermogenslijn met het relevante deel benadrukt (opbouw vs. afbouw vs. FIRE-punt), plus een klein **concept-diagram** bij de abstracte stappen (terugrekening, snijpunt), gevoed met de eigen getallen. Herkenbaar (het is je eigen grafiek) én leerzaam (de abstracte stap krijgt een schematisch beeld).

- `SimChart` krijgt een additieve, backward-compatibele prop (bv. `emphasis?: 'accumulation' | 'withdrawal' | 'fire' | null`) die een segment benadrukt en de rest dimt. Default `null` = huidig gedrag (ongewijzigd voor alle bestaande call-sites).
- Concept-diagrammen als kleine client-SVG-componenten, geadapteerd uit `grafiek-werking` (`Snijpunt`, evt. `FaseTijdas`), nu geparametriseerd met eigen getallen.

## Architectuur & bestanden

Nieuwe map `components/app/horizon/grafiek-uitleg/`:
- `grafiek-uitleg-walkthrough.tsx` — client; orkestreert de 4 hoofdstukken; ontvangt dezelfde props die de modal al heeft (`simResult`, `cashflows`, `currentAge`, `yearlyExpenses`).
- `uitleg-chapter.tsx` — herbruikbare hoofdstuk-shell (nummer, titel, leek-zin, "jouw getallen"-rij, beeld-slot). Editorial-stijl, horizon-accenten.
- `concept-terugrekening.tsx`, `concept-snijpunt.tsx` — geparametriseerde concept-SVG's.
- `chapter-data.ts` — **pure** afleidingen uit `SimResult` → per-hoofdstuk-cijfers (testbaar met vitest, geen Supabase, geen herberekening van kerngetallen — alleen aggregatie van wat al in `rows`/`simResult` zit).

Wijzigen:
- `components/app/horizon/sim-chart-widget.tsx` — `SimChartModal`: walkthrough eerst renderen; bestaande Kassabon + tabel in een inklapbaar "Onder de motorkap". `SimChartWidget` (standalone card) blijft ongewijzigd qua kop, maar krijgt dezelfde modal-inhoud (het is dezelfde modal).
- `components/app/horizon/sim-chart.tsx` — additieve `emphasis`-prop (default null).

Geen wijzigingen aan: de engine, de rekenmotoren, `lib/architecture/calculations.ts` (geen nieuwe berekening — puur consumptie), DB/RLS, API-routes, of de beheer-pagina `/beheer/grafiek-werking`.

## Generiek voor alle gebruikers (harde eis)

Moet correct renderen voor:
- **Bereikbaar én niet bereikbaar** (geen snijpunt → eerlijke tekst, geen lege/kapotte stap).
- **Alle eindstrategieën**: deplete, perpetual, legacy, pensioen (pensioen = FIRE op AOW, geen overbruggingsstap-taal die misleidt).
- **Met/zonder levensgebeurtenissen** (cashflows leeg → hoofdstuk 4 valt terug op alleen-strategie-uitleg).
- **Partner/huishoudperspectief** (de modal draait al in dat perspectief; getallen volgen `simResult`).
- **Edge data**: 0 opbouwjaren (al met pensioen), zeer korte/lange horizon.

## Conventies (verplicht)

- **Consume, don't recompute**: alle getallen uit `simResult`/`cashflows`/`format.ts`; géén lokale `0.04`/forfait/SWR-constanten. (CLAUDE.md)
- **Module-kleuren**: uitsluitend `horizon-*` (en `kern-*` voor afbouw, zoals de bestaande grafiek), `var(--module-active-*)`; nooit kale Tailwind-kleuren. `useModuleHex()` voor canvas indien nodig.
- **Vrijheidstijd-framing**: `formatWithFreedom`/`formatFreedomTimeString` waar bedragen > €100 betekenis krijgen.
- **Editorial design library** (`components/editorial/`), `label-editorial`, `card-editorial`, `font-mono tabular-nums` voor bedragen, de 7 frontend-design-principes.
- **Toegankelijkheid**: hoofdstukken als nette sectiestructuur, `aria-expanded` op de "Onder de motorkap"-toggle, SVG's met `role="img"` + `aria-label`.

## Build & review (zoals gevraagd: "gebruik onze skills en agents")

1. `frontend-ui-builder` bouwt de componenten + modal-herstructurering volgens deze spec.
2. `ux-review-expert` reviewt tegen de design-patterns en consistentie.
3. Verificatie: `npx tsc --noEmit` schoon + relevante vitest (incl. nieuwe `chapter-data.test.ts`) groen.
4. Iteratie op review-bevindingen.

## Definition of done

- [ ] Walkthrough (4 hoofdstukken) is de hoofdweergave van de Simulatie Prognose-modal; technische onderbouwing inklapbaar eronder.
- [ ] Elk hoofdstuk toont eigen getallen + een uitgelicht stukje eigen curve; terugrekening & snijpunt hebben een concept-mini-diagram.
- [ ] Correct voor alle strategieën, bereikbaar/onbereikbaar, met/zonder life-events, partnerperspectief.
- [ ] `SimChart.emphasis` is additief en breekt geen bestaande call-site.
- [ ] Geen herberekening van kerngetallen; geen hardcoded financiële constanten; horizon-accenten; vrijheidstijd-framing.
- [ ] `tsc` schoon, vitest groen, ux-review akkoord.

## Buiten scope

- Wijzigen van de rekenengine of het beleid van de grafiek.
- Aparte route/pagina (we bouwen bewust op de bestaande modal).
- Nieuwe DB-tabellen, API-routes of AI.
- Verwijderen/herzien van `/beheer/grafiek-werking` (blijft interne referentie).
