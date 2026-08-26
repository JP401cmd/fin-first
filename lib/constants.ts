/**
 * Centralized financial constants for TriFinity.
 *
 * SINGLE SOURCE OF TRUTH for all shared financial assumptions.
 * No other file should define these values locally.
 *
 * Categories:
 * - Investment assumptions (returns, volatility)
 * - Withdrawal rates (SWR, NL-specific)
 * - Dutch tax system (Box 3 — jaargebonden, afgeleid uit box3-data.ts)
 * - Dutch social security (AOW)
 * - Inflation
 * - Transaction costs (verkoopkosten per asset-type)
 */

// Type-only import: bij compilatie geheel weg-erased, dus geen runtime-cycle
// (asset-data.ts importeert constants.ts niet). Houdt deze leaf vrij van runtime-deps.
import type { AssetType } from '@/lib/asset-data'
// Runtime-import van de canonieke Box 3-jaartabel. box3-data.ts is een pure leaf
// (alleen type-imports) en importeert constants.ts NIET terug → geen cycle. Hiermee
// zijn de NL-FIRE-belastingafgeleiden hieronder één-op-één afgeleid van de bron.
import { BOX3_PARAMS, CURRENT_TAX_YEAR } from '@/lib/box3-data'

// ── Investment Assumptions ──────────────────────────────────────

/** Default expected annual return on investments — 7% nominal, long-term global equity average. */
export const DEFAULT_RETURN = 0.07

/**
 * Verwachte nominale spaarrente — 1,3% per jaar.
 *
 * De tegenhanger van `DEFAULT_RETURN` (7% verwacht beleggingsrendement) zodra een
 * scenario vermogen VERSCHUIFT van beleggen naar sparen: het verwachte
 * rendementsverschil is `DEFAULT_RETURN − EXPECTED_SAVINGS_RETURN` (2026 ≈ 5,7
 * procentpunt). De fiscale-strategie-optimizer gebruikt dat verschil om het NETTO
 * effect van een samenstelling-shift te tonen (belastingbesparing − verwacht
 * misgelopen rendement). Zonder die aanname oogt "€ 47 minder Box 3-heffing" als
 * pure winst, terwijl dezelfde shift per saldo honderden tot duizenden euro's
 * verwacht rendement kost.
 *
 * Waarom 1,3%: dat ligt op het niveau van het forfaitair rendement SPAREN dat de
 * Belastingdienst voor 2026 hanteert (1,28% — `BOX3_PARAMS[2026].forfaitSpaargeld`).
 * Dat forfait wordt jaarlijks vastgesteld op de gerealiseerde gemiddelde
 * spaarrente en is daarmee de best onderbouwde publieke schatting die voorhanden
 * is; 1,3% is de afgeronde, uitlegbare vorm daarvan.
 *
 * Bewust NIET afgeleid van `BOX3_PARAMS[...].forfaitSpaargeld`: dat forfait is een
 * FISCALE grootheid (wettelijk vastgesteld, terugkijkend), terwijl dit — net als
 * DEFAULT_RETURN — een ECONOMISCHE verwachting is. Stelt de wetgever het forfait
 * om fiscale redenen bij, dan mag de rendementsaanname niet stil meebewegen.
 */
export const EXPECTED_SAVINGS_RETURN = 0.013

/** Default annual portfolio volatility for Monte Carlo simulations — 15%. */
export const DEFAULT_VOLATILITY = 0.15

/**
 * Zoek-/weergavegrens voor de **rendement-marge** van de marktcheck
 * (`lib/horizon-kernel/rendement-marge.ts`): de binaire zoektocht naar de
 * rendement-verschuiving waarbij het plan omslaat loopt over
 * `[−RENDEMENT_MARGE_GRENS, +RENDEMENT_MARGE_GRENS]` (decimaal; 0,15 = 15
 * procentpunt per jaar).
 *
 * Waarom 15 procentpunt: het verwachte rendement is `DEFAULT_RETURN` (7%). Een
 * verschuiving van −15pp betekent −8% nominaal rendement per jaar, LEVENSLANG —
 * ruim voorbij elke historische 40-jaars periode van een gespreide portefeuille.
 * Een marge daarbuiten is dus geen informatie meer maar "onverwoestbaar"; de
 * uitkomst wordt daarom als begrensd gemarkeerd (`begrensd: 'boven' | 'onder'`)
 * en de copy zegt "meer dan 15%" in plaats van een schijnprecies getal.
 *
 * Dit is een WEERGAVE-/zoekgrens, geen rekengrens: de gap-toets zelf werkt op
 * elke shift. Verruimen kost alleen zoekbereik, geen correctheid.
 */
export const RENDEMENT_MARGE_GRENS = 0.15

// ── Withdrawal Rates ────────────────────────────────────────────

/** Classic Safe Withdrawal Rate — 4% rule (Trinity Study / Bengen 1994). */
export const SWR = 0.04

/** Classic FIRE multiplier — 1 / SWR = 25× annual expenses. */
export const CLASSIC_MULTIPLIER = 1 / SWR // = 25

/**
 * Referentie-spaarquote (%) die als "FIRE-optimaal" wordt getoond op de
 * spaarquote-widget (benchmark-lijn + label). Puur een UI-oriëntatiepunt (bij een
 * ~50% spaarquote halveert de opbouwtijd t.o.v. lagere quotes), GEEN afgeleide of
 * fiscale waarde — daarom een vaste, benoemde constante i.p.v. een magic number
 * verspreid over de widget.
 */
export const FIRE_SAVINGS_RATE_BENCHMARK_PCT = 50

// ── Numerieke tolerantie ────────────────────────────────────────

/**
 * Tolerantie (in euro's) voor het vergelijken van float-geldsommen met nul.
 * Een halve cent: kleiner dan de kleinste betekenisvolle munteenheid, groter dan
 * de opeenstapelende IEEE-754-afrondingsruis van optellingen. Gebruik
 * `Math.abs(bedrag) < CENT_EPSILON` i.p.v. `bedrag === 0` op BEREKENDE sommen
 * (portefeuille-totalen, restwaarden), zodat een bijna-nul-restsom als "leeg"
 * telt i.p.v. een lege-staat te missen. NIET voor exact-geparste losse bedragen.
 */
export const CENT_EPSILON = 0.005

// ── Uitgaven-tarief (vrijheidstijd) ─────────────────────────────

/**
 * Rolling-venster (maanden) waarover het canonieke dagtarief (€/dag) de
 * werkelijke uitgaven middelt vóór de €→vrijheidstijd-conversie. 12 maanden =
 * één vol jaar, zodat seizoenspieken (vakantie, feestdagen, jaarlijkse premies)
 * niet één losse maand onevenredig laten doorwegen. Gedeelde bron voor
 * `lib/expense-rate.ts`: élk oppervlak (balans/budget/vermogen-rapport,
 * dashboard-widgets, bezittingen, freedom-time-badges, sidebar) middelt over
 * exact dit venster zodat hetzelfde bedrag overal dezelfde vrijheidstijd geeft.
 */
export const EXPENSE_RATE_ROLLING_MONTHS = 12

// ── Spaarquote-meetvenster ──────────────────────────────────────

/**
 * Aantal VOLTOOIDE kalendermaanden in het meetvenster van de canonieke
 * spaarquote (`computeSavingsRate6m`, lib/savings-source.ts).
 *
 * "Voltooid" is hier het hele punt. Tot 26 aug 2026 liep het venster over zes
 * kalendermaanden INCLUSIEF de lopende — terwijl het aantal datamaanden waarmee
 * geëxtrapoleerd wordt (`savingsRateDataMonths`) alleen de VERSTREKEN maanden
 * telt. Die scheefheid maakte de quote structureel te laag, en bij weinig
 * historie dramatisch: wie vóór zijn salarisdatum keek, had de vaste lasten van
 * de lopende maand al wél in de teller staan en zijn salaris nog niet — met een
 * spaarquote van −265 % en een rode "je hebt deze maand een tekort"-melding tot
 * gevolg, terwijl de eigen prognose een overschot voorspelde (bevinding C6).
 *
 * Het venster loopt dus van `SAVINGS_RATE_WINDOW_MONTHS` maanden terug tot en
 * met de vorige maand; de lopende maand valt er per definitie buiten en wordt
 * apart getoond als "tot nu toe" (`currentMonthWindowLabel`).
 */
export const SAVINGS_RATE_WINDOW_MONTHS = 6

/**
 * Welk aandeel van een normaal maandinkomen binnen moet zijn voordat de
 * GEREALISEERDE lopende maand als "inkomen compleet" telt.
 *
 * Gebruikt door `transactiesCardStatus` (lib/cashflow-cards.ts): zolang er
 * minder dan dit aandeel van het effectieve maandinkomen op de rekening staat,
 * is een negatief maandsaldo geen tekort maar een halve maand — dan alarmeert de
 * kaart niet, mits de eigen prognose voor een vólle maand niet negatief is.
 * 80 % laat ruimte voor een salaris dat in delen binnenkomt of licht varieert,
 * en slaat toch aan zodra de hoofdinkomstenpost ontbreekt.
 */
export const CURRENT_MONTH_INCOME_COMPLETE_RATIO = 0.8

// ── Noodfonds (emergency fund) ──────────────────────────────────

/**
 * Doel-buffer noodfonds, uitgedrukt in maanden NETTO MAANDSALARIS — 3× (Nibud
 * spreekt van 3–6 maanden; de ondergrens op de salaris-grondslag). Dit is sinds
 * het eigenaar-besluit van 29 jul 2026 de norm waartegen de noodbuffer wordt
 * beoordeeld: het salaris is het getal dat de gebruiker zelf invoert en herkent
 * (instellingenblok onderaan /overzicht/cashflow), terwijl de gemeten
 * maanduitgaven bij transactie-zware of net gestarte accounts wild schommelen.
 *
 * SINGLE SOURCE voor de noodfonds-bundel (`lib/emergency-fund.ts`), de
 * gezondheidsscore-pijler en de noodfonds-widget.
 */
export const TARGET_EMERGENCY_SALARY_MONTHS = 3

/**
 * Terugval-buffer in maanden VASTE LASTEN — 6× (Nibud-bovengrens). Wordt alleen
 * nog gebruikt wanneer er géén netto maandsalaris bekend is (nul inkomen), zodat
 * de buffer-pijler dan niet degenereert. Blijft daarnaast de grondslag voor de
 * standaard-doelen-kiezer (`lib/goals/standaard-doelen.ts`) en de onboarding-
 * prefill: een noodfonds-DOEL in euro's mag de gebruiker vrij kiezen — het
 * stuurt sinds 29 jul 2026 alleen de score-target niet meer.
 */
export const TARGET_EMERGENCY_MONTHS = 6

/**
 * BOVENGRENS voor de noodfonds-target in maanden (24 = twee jaar vaste lasten).
 *
 * Waarom: een noodfonds-doel in EURO's wordt naar maanden vertaald via
 * `doelbedrag / maanduitgaven`. Bij (bijna) nul maanduitgaven — een net gestart
 * of leeg account — explodeert die deling: op productie levert een €5.000-doel
 * bij €12,85 gemeten maanduitgaven een "target" van 389 maanden (en op de
 * 6-maands-noemer zelfs 2.335). Dat is geen buffer meer maar een deling door
 * bijna-nul, en het zou zowel de tegel ("0,0 / 389 maanden gedekt") als de
 * score-curve onbruikbaar maken.
 *
 * Deze grens is de symmetrische tegenhanger van de anti-gaming-VLOER
 * (`MIN_EMERGENCY_SCORE_TARGET_MONTHS`, 3): de vloer voorkomt dat een
 * mini-doel triviaal 100% scoort, het plafond voorkomt dat een absurd hoge
 * (of door een degenerate noemer opgeblazen) target de score voor altijd op 0
 * pint. 24 maanden is ruim boven de Nibud-richtlijn van 3–6 en boven de
 * 12 maanden die voor wisselende inkomens gebruikelijk is.
 *
 * Let op: alleen de MAANDEN-expressie wordt begrensd. Het doelBEDRAG in euro's
 * (`targetAmount`) blijft altijd de onverkorte gebruikerskeuze — dat is de
 * grootheid waar de voortgangsbalk op rekent.
 */
export const MAX_EMERGENCY_TARGET_MONTHS = 24

// ── Inflation ───────────────────────────────────────────────────

/** Default annual inflation rate — 2% (ECB target). */
export const INFLATION = 0.02

/** Jaarlijks onderhoud eigen woning als fractie van de woningwaarde — 1%. */
export const NL_HOME_MAINTENANCE_PCT = 0.01

/** Dutch long-term average inflation — 2% (CBS). Alias for NL-specific FIRE calculations. */
export const NL_INFLATIE = 0.02

// ── Dutch Social Security (AOW) ─────────────────────────────────

/** Dutch state pension (AOW) eligibility age. Source: SVB 2025. */
export const NL_AOW_AGE = 67

/** Dutch AOW netto monthly benefit, single person — €1 581,55 per 1-7-2026, SVB. */
export const NL_AOW_MONTHLY = 1581.55

/** Dutch AOW netto monthly benefit, cohabiting/married — €1 084,13 per person, per 1-7-2026, SVB. */
export const NL_AOW_MONTHLY_SAMENWONEND = 1084.13

// ── Dutch Tax System — Box 3 (jaargebonden) ────────────────────
//
// GEEN losse literals meer: forfait en tarief worden één-op-één afgeleid uit de
// canonieke jaartabel BOX3_PARAMS[CURRENT_TAX_YEAR] (lib/box3-data.ts). Zo kunnen
// het FIRE-forfait en de aangifte-engine nooit meer divergeren (was: 5,88% hier
// vs. 6,00% in de tabel). Het jaartal wisselt op één plek: CURRENT_TAX_YEAR.

/** Forfaitair rendement beleggingen — afgeleid uit BOX3_PARAMS[CURRENT_TAX_YEAR] (2026: 6,00%). Source: Belastingdienst. */
export const NL_FICTIEF_BELEGGINGEN = BOX3_PARAMS[CURRENT_TAX_YEAR].forfaitBeleggingen

/** Box 3 belastingtarief — afgeleid uit BOX3_PARAMS[CURRENT_TAX_YEAR] (2026: 36%). Source: Belastingdienst. */
export const BOX3_TARIEF = BOX3_PARAMS[CURRENT_TAX_YEAR].tarief

/** Effective annual Box 3 tax drag: forfait × tarief (2026 ≈ 2,16%). */
export const BOX3_DRAG = NL_FICTIEF_BELEGGINGEN * BOX3_TARIEF

// ── NL-FIRE Derived Constants ───────────────────────────────────

/** Netherlands-specific SWR: DEFAULT_RETURN − BOX3_DRAG − NL_INFLATIE (2026 ≈ 2,84%). */
export const NL_SWR = DEFAULT_RETURN - BOX3_DRAG - NL_INFLATIE

/** NL FIRE multiplier — 1 / NL_SWR (2026 ≈ 35,2× annual expenses). */
export const NL_MULTIPLIER = 1 / NL_SWR

// ── Transaction Costs — verkoopkosten per asset-type ────────────

/**
 * Verkoopkosten (transactiekosten) bij liquidatie van een niet-liquide asset, als
 * fractie van de verkoopprijs. Gebruikt door de generieke asset-liquidatie in de
 * v2-grootboek-engine (`buildGenericAssetLiquidations`, lib/horizon-engine/build-input.ts).
 *
 *  • Roerende zaken (voertuig/inboedel/overig/deelneming): ~2% — bemiddeling/
 *    overdracht, geen overdrachtsbelasting/notaris.
 *  • Vastgoed (real_estate ≠ eigen_huis, bv. beleggingspand): ~3% — makelaar +
 *    overdrachtskosten, lager dan een eigen-huis-verkoop omdat het downsize-pad
 *    (eigen_huis) zijn eigen, door de gebruiker instelbare salesCostsPct draagt.
 *
 * `eigen_huis` staat hier bewust NIET in: dat loopt via het housing-downsize-pad
 * (`buildV2DownsizeHousing`) met een door de gebruiker gekozen verkoopkosten-%.
 * Een type dat ontbreekt valt terug op `DEFAULT_SALES_COSTS_PCT` (= roerend 2%).
 * Per-event override via `metadata.verkoopkostenPct` (geldig in [0, 0.20]) wint.
 */
export const SALES_COSTS_BY_TYPE: Partial<Record<AssetType, number>> = {
  vehicle: 0.02,
  physical: 0.02,
  other: 0.02,
  deelneming: 0.02,
  real_estate: 0.03,
}

/** Fallback-verkoopkosten voor een asset-type dat niet in SALES_COSTS_BY_TYPE staat — roerend 2%. */
export const DEFAULT_SALES_COSTS_PCT = 0.02

/**
 * Verkoopkosten eigen-woning-downsize (makelaar + notaris + verhuizen) als fractie
 * van de verkoopprijs — 4%. Door de gebruiker overschrijfbaar via de downsize-config;
 * dit is de default. Hoger dan SALES_COSTS_BY_TYPE.real_estate (3%, beleggingspand)
 * omdat een eigen-woning-verkoop verhuiskosten meeneemt.
 */
export const DOWNSIZE_DEFAULT_SALES_COSTS_PCT = 0.04

/**
 * Geschatte maandelijkse woonlast ná verkoop (huur of kleinere hypotheek) als fractie
 * van de WOZ-waarde, op jaarbasis — 4%/jaar ≈ NL-gemiddelde middenhuur-niveau
 * (bij €400K WOZ ≈ €1.333/mnd). Door de gebruiker overschrijfbaar via de downsize-config.
 */
export const HOUSING_COST_AFTER_SALE_PCT = 0.04

// ── Opeethypotheek (reverse mortgage) ───────────────────────────

/**
 * Max % van de overwaarde dat als opeethypotheek (verzilverhypotheek) kan worden
 * opgenomen — 50%. NL-marktstandaard ligt tussen 35–65% afhankelijk van leeftijd;
 * 50% is een conservatieve middenwaarde. Dit is de leen-RUIMTE-cap én de FIRE-
 * eligibility-fractie van de overwaarde (één grondslag, zie reverseMortgageBorrowable).
 */
export const REVERSE_MORTGAGE_DEFAULT_MAX_LOAN_PCT = 0.5

/**
 * Jaarlijkse rente op een opeethypotheek (decimaal) — 5,5% (NL marktrate 2026).
 * Bewust LAGER dan een ongedekte lening: de woning dient als onderpand
 * (onderpand-korting). Genoteerd als NOMINALE rente; de v2-grootboek-engine accrued
 * 'm — net als élke andere schuldrente in blok 3 — direct op het (reëel gegroeide)
 * saldo zónder reëel-conversie, zodat opeethypotheek-rente en gewone hypotheekrente
 * op dezelfde grondslag stapelen (zie engine.ts comment bij de opeetschuld).
 */
export const REVERSE_MORTGAGE_DEFAULT_RATE = 0.055

// ── Kosten koper — aankoop eigen woning (hoofdverblijf) ─────────
//
// Fiscale grenzen/tarieven zijn JAARGEBONDEN — verifieer jaarlijks bij de bron.
// Deze constanten voeden lib/kosten-koper.ts (computeKostenKoper), de enige bron
// voor het life-event 'house_purchase' in de Horizon-scenario/projectie. Het
// totaal stroomt als eenmalige uitgave in de FIRE-berekening; verkeerde grenzen =
// verkeerd bedrag. Geen losse literals meer in de UI dupliceren.

/** Overdrachtsbelasting eigen woning (hoofdverblijf, niet-starter) — 2%. Bron: Belastingdienst, 2026 — jaarlijks verifiëren. */
export const OVB_TARIEF_EIGEN_WONING = 0.02

/** Startersvrijstelling overdrachtsbelasting: vrijgesteld tot deze woningwaarde — €555.000. Bron: Belastingdienst, 2026 — jaarlijks verifiëren. */
export const STARTERSVRIJSTELLING_MAX = 555000

/** NHG-kostengrens: max koopsom om NHG te kunnen afsluiten — €470.000. Bron: nhg.nl, 2026 — jaarlijks verifiëren. */
export const NHG_KOSTENGRENS = 470000

/** NHG borgtochtprovisie: eenmalig over de hypotheeksom — 0,4%. Bron: nhg.nl, 2026 — jaarlijks verifiëren. */
export const NHG_BORGTOCHTPROVISIE_PCT = 0.004

/** Notariskosten (leverings- + hypotheekakte), vaste indicatie — €1.200. Bron: marktgemiddelde, 2026 — jaarlijks verifiëren. */
export const KOSTEN_KOPER_NOTARIS = 1200

/** Taxatiekosten woning, vaste indicatie — €500. Bron: marktgemiddelde, 2026 — jaarlijks verifiëren. */
export const KOSTEN_KOPER_TAXATIE = 500

/** Bankgarantie (waarborgsom-garantie), als fractie van de aankoopprijs — 0,1%. Bron: marktgemiddelde, 2026 — jaarlijks verifiëren. */
export const KOSTEN_KOPER_BANKGARANTIE_PCT = 0.001

// ── Historische Weerbaarheid — weergavedrempels (backtest-succeskans) ──
//
// Stoplicht-grenzen voor de backtest-succeskans (0–100), gedeeld door de
// weerbaarheids-widgets zodat de tinten en het schild-icoon één bron hebben.
// Dit zijn WEERGAVE-drempels (geen financiële aanname): boven STERK = "weerbaar",
// eronder maar boven MATIG = "aandacht", daaronder = "kwetsbaar". Het schild
// kantelt op WEERBAAR_SCHILD. De succeskans zelf komt canoniek uit runBacktest.

/** Succeskans-grens (%) waarboven een plan historisch als weerbaar geldt (groen + benchmark-doel). */
export const WEERBAARHEID_STERK = 85

/** Succeskans-grens (%) waarboven een plan als "aandacht" geldt; eronder = kwetsbaar (rood). */
export const WEERBAARHEID_MATIG = 65

/** Succeskans-grens (%) waarboven het schild-icoon op "veilig" (ShieldCheck) staat. */
export const WEERBAARHEID_SCHILD = 75

/**
 * Bovengrens (%) voor de GETOONDE historische slaagkans. De ruwe backtest-fractie
 * kan legitiem 100% zijn (elk startjaar slaagde), maar we tonen nooit 100% —
 * epistemische bescheidenheid: een gemodelleerde toekomst is nooit zeker.
 * Dit is een DISPLAY-cap op de canonieke bundelwaarde (dashboard-data-loader),
 * niet op de meting zelf (runBacktest blijft 0–1). Geen semantische drempel.
 */
export const WEERBAARHEID_DISPLAY_MAX = 99

// ── Volgende Stap — signaaldrempels (nudge) ─────────────────────
//
// Drempels waarboven/waaronder de Volgende Stap-motor een groei-stap voorstelt.
// Dit zijn SIGNAAL-drempels (wanneer nudgen we?), geen financiële aannames: de
// onderliggende cijfers (spaarquote, vaste lasten, noodfonds-dekking) komen
// canoniek uit de bundel. Ze staan hier zodat motor en widget één bron delen.

/** Spaarquote (%) waaronder de motor "spaarquote verhogen" voorstelt. */
export const VOLGENDE_STAP_SPAARQUOTE_MIN_PCT = 15

/** Aandeel vaste lasten (% van inkomen) waarboven de motor "vaste lasten verlagen" voorstelt. */
export const VOLGENDE_STAP_VASTE_LASTEN_MAX_PCT = 60

// ── Werktijd (werkjaar-noemer) ──────────────────────────────────
//
// De WERKTIJD-metafoor ("hoeveel van je werkjaar gaat hier naartoe") is een
// ANDERE grootheid dan de VRIJHEIDSTIJD-metafoor ("hoeveel dagen leven koopt dit
// bedrag"). Vrijheidstijd deelt door het UITGAVEN-dagtarief
// (EXPENSE_RATE_ROLLING_MONTHS hierboven → lib/expense-rate.ts); werktijd deelt
// door het INKOMEN-dagtarief (lib/income-rate.ts). Meng ze nooit: twee
// vrijheidstijd-getallen zijn niet optelbaar tot een werkjaar — dat was precies
// de bug waarbij twee pagina's samen "18 van de 12 maanden" claimden (ADR 0105).

/**
 * Dagen per kalenderjaar — de noemer van élke jaarbedrag→dagtarief-conversie.
 * Bewust 365, niet 12×30=360: dat scheelt ~1,4% en laat elke afgeleide tijd
 * dezelfde fractie té lang ogen (zie `dailyExpenseRate` in lib/format.ts, dat
 * dezelfde 365 hanteert).
 */
export const DAYS_PER_YEAR = 365

/**
 * Maanden in één werkjaar — de vaste noemer van elke "X van de 12 maanden"-claim.
 * Omdat álle werktijd-claims op hetzelfde bruto jaarinkomen delen, zijn ze delen
 * van DEZELFDE taart en kan hun som per constructie niet boven dit getal
 * uitkomen zolang de bedragen samen het bruto jaarinkomen niet overschrijden.
 */
export const WORK_YEAR_MONTHS = 12

/**
 * DISPLAY-cap (maanden) op een getoonde werktijd-claim. Beschermt tegen een
 * absurde weergave bij een degenereerde noemer (bv. een bijna nul bruto
 * jaarinkomen naast reële vaste lasten): "4.812 van de 12 maanden" is geen
 * signaal maar ruis. Dit is een WEERGAVE-grens op de canonieke uitkomst, geen
 * grens op de meting — `WorkTimeBreakdown.shareOfWorkYear` en `.workDays`
 * blijven ongeknipt, en `exceedsWorkYear` blijft het eerlijke alarm.
 */
export const WORK_TIME_DISPLAY_MAX_MONTHS = 99

// ── Doelvoortgang: pace-toets ("haal je het tempo?") ─────────────
//
// Bevindingen M31 + M32. De oude on-track-toets voor doelen mat een LINEAIRE
// TIJD-FRACTIE sinds `created_at` ("hoeveel % van de looptijd is verstreken?").
// Het doelBEDRAG kwam daar niet in voor, dus een doel zwaarder maken (hoger
// bedrag, eerdere deadline) kon de status ongewijzigd op "op koers" laten (M32),
// terwijl een zojuist aangemaakt doel per constructie meteen "achter op
// planning" was (M31: `now` ligt altijd nét ná `created_at`, dus de verwachte
// fractie is altijd een piepklein positief getal en het afgeronde pct 0).
// Vervangen door een PACE-toets: benodigde inleg per maand tot de streefdatum
// versus de feitelijk gerealiseerde inleg per maand.

/**
 * Dagen per maand — de noemer die "dagen tot streefdatum" omzet naar MAANDEN in
 * de doel-pace-toets. Bewust AFGELEID van `DAYS_PER_YEAR` en niet als los getal
 * neergezet: de app hanteert één jaarlengte, en een tweede (bv. 30 of 30,44)
 * zou dezelfde looptijd op twee schermen anders lang maken.
 */
export const GOAL_PACE_DAYS_PER_MONTH = DAYS_PER_YEAR / 12

/**
 * RELATIEVE marge op de benodigde maandinleg waarbinnen een doel nog "op koers"
 * heet (10%). Bewust relatief en niet absoluut: de benodigde inleg schaalt mee
 * met de omvang van het doel, dus een vaste marge in euro's zou een klein doel
 * onbereikbaar streng en een groot doel betekenisloos ruim maken. Spiegelt de
 * 10%-tolerantie van de oude tijd-fractie-toets, zodat de strengheid van het
 * stoplicht niet stilzwijgend verschuift bij deze wissel van grondslag.
 */
export const GOAL_PACE_TOLERANCE = 0.1

/**
 * Genadeperiode (dagen) ná aanmaak waarin een doel ZONDER enige bijdrage nog
 * geen oordeel krijgt (M31). Binnen dit venster is er letterlijk niets te meten:
 * de app zou een gebruiker vertellen dat hij achterloopt op een plan dat hij
 * seconden geleden maakte. Daarna is het uitblijven van bijdragen wél een
 * signaal. Twee weken = kort genoeg om niet te maskeren, lang genoeg om één
 * salaris-/spaarmoment af te wachten.
 */
export const GOAL_PACE_GRACE_DAYS = 14

/**
 * VLOER (maanden) op de gemeten periode sinds `created_at`. Zonder vloer deelt
 * een verse inleg door een periode van bijna nul en levert een oneindig hoog
 * "feitelijk tempo" op — waarmee élk doel triviaal op koers zou staan (precies
 * de klasse fout die M32 blootlegde). Eén maand betekent: een bijdrage telt
 * hooguit als het tempo van één maand, niet als het tempo van één dag.
 */
export const GOAL_PACE_MIN_MEASURE_MONTHS = 1

// ── Box 2: schaal van de dividend-schijfsimulator ────────────────
//
// Bevinding H26. De bovengrens van de dividend-schuif stond als kale `1.3` in
// components/overview/belasting/box2-dividend-simulator.tsx — een los financieel
// ogend getal in een component, precies wat CLAUDE.md verbiedt. Het is bewust
// GEEN fiscale constante (die horen in lib/box2-data.ts bij BOX2_PARAMS): er
// bestaat geen wettelijke bovengrens aan een dividenduitkering.

/**
 * WEERGAVE-schaalfactor op de partner-schijfgrens die de bovengrens van de
 * dividend-schuif bepaalt: `grensPartner × factor`, afgerond op duizendtallen
 * (2026: €137.686 × 1,3 ≈ €179.000).
 *
 * WAARVOOR: de schuif moet de omslag van 24,5% naar 31% kúnnen tonen — óók voor
 * iemand mét fiscaal partner, wiens lage schijf tot €137.686 loopt. Een factor
 * ruim boven 1 zet die omslag zichtbaar links van het einde van de schaal.
 *
 * WAARVOOR NIET (eigenaarsbesluit 26-08-2026, optie B): dit is GEEN
 * uitkeercapaciteit en géén functie van de waarde van de deelneming. Koppelen
 * aan `current_value` (optie A) is bewust afgewezen — aandelenwaarde ≠ vrije
 * reserves, en bij een klein belang zou de hoge schijf onbereikbaar worden
 * waardoor de simulator zijn enige educatieve functie verliest. Het component
 * zet er daarom een expliciet bijschrift bij; de schuif start daarnaast op het
 * WERKELIJKE Box 2-inkomen, zodat de schaal geen impliciete aanbeveling meer is.
 */
export const BOX2_SIMULATOR_SCHAAL_FACTOR = 1.3
