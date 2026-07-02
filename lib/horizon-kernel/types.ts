/**
 * Horizon-kernel — kern-typen (maandbasis, nominaal, Excel-oracle).
 *
 * De rekenkern (ADR 0032) volgt het eigen Excel-model `Core calc v5.xlsm` exact:
 * maandbasis (index 0..1199, leeftijd tot 100), forward-recursie, **nominaal**
 * (reële invoer wordt vooraf geïndexeerd met (1+inflatie)^(m/12)), en een
 * structurele één-maand-lag. Deze module bevat de gedeelde, DOMEIN-VRIJE typen
 * die de tabel-modules (`tables/*`) delen: de maandindex, de generieke
 * potten-definitie en `KernelInput` — de **volledige** statische invoer-oppervlakte.
 *
 * ## `KernelInput` dekt de HELE Excel-invoer (FASE 2, stap 2)
 * `KernelInput` bevat bewust de volledige input-oppervlakte van het Excel-model
 * (P-parameters + bens-potten + TS-prio's + Geb-gebeurtenissen + Auto-gebeurtenissen
 * + PT-partner + Werk-strategie + onzekerheid). De doelstelling: de komende
 * parallelle tabel-porters (CF, Ont, Af, Verdeling, Bez, S, Prognose, Toename-en-
 * afname, Werk, …) hoeven alléén hun eigen `tables/<x>.ts` + parity-test toe te
 * voegen en NOOIT dit gedeelde bestand of `input-from-fixture.ts` te wijzigen.
 *
 * Elk veld is één-op-één herleidbaar naar een Excel-invoercel (`docs/horizon-oracle/
 * inputs.json` / `structuur.md`); de cel-referentie staat in het commentaar. De
 * kern kent bewust géén domeinbegrippen buiten wat het Excel zelf voert.
 *
 * **Bewust GEEN input** (solver-outputs, ADR 0032): P!B16 (FIRE-leeftijd), P!B38
 * (gap), P!B93-B100 (statussen). Ook afgeleide/gekoppelde cellen die van de solver
 * of van een maandtabel afhangen (bv. P!B82 guardrails-anker, P!B35/B36 doel) zijn
 * geen static input — die komen teacher-forced via de `DepView` van hun porter.
 *
 * Pure typen + constanten, geen runtime-afhankelijkheden; veilig in
 * test/server/client.
 */

/** Maandindex in de projectie: 0..1199 (maand 0 = startmaand op P!B7). */
export type MonthIndex = number

/** Aantal maanden in de horizon (index 0..1199); Excel rekent tot leeftijd 100. */
export const HORIZON_MONTHS = 1200

/**
 * Maximale leeftijd (Excel-horizon-guard). Zodra `P!B7 + m/12 > MAX_AGE` leegt
 * Excel de leeftijd/maand-in-jaar-kolommen én alle reken-kolommen ("" ); de
 * maandindex-kolom (A) blijft numeriek. Zie `scaffold.ts`.
 */
export const MAX_AGE = 100

// ── Box 3 (fiscale kern; wél kern, geen domein-expander) ─────────────────────

/** Box 3-methode-selector (P!B90): forfaitair rendement of werkelijk rendement. */
export type Box3Method = 'forfaitair' | 'werkelijk'

/** Box 3-type van een bezitting-pot (bens kolom D). */
export type AssetBox3Type = 'Box 3 spaar' | 'Box 3 investering' | 'Geen Box 3'

/** Box 3-type van een schuld-pot (bens kolom F). */
export type DebtBox3Type = 'Box 3 schuld' | 'Geen Box 3 schuld'

/**
 * Box 3-parameters uit het P-invoerblok. Bedragen per persoon worden in de
 * berekening met `personen` én de inflatie-index geschaald (heffingvrij
 * vermogen, schuldendrempel), conform het Excel.
 */
export interface Box3Params {
  /** P!B90 — selecteert of de canonieke heffing (N) forfaitair of werkelijk is. */
  readonly method: Box3Method
  /** P!B20 — tarief Box 3 (bv. 0,36). */
  readonly tarief: number
  /** P!B21 — forfaitair rendement spaargeld (per jaar; maandelijks /12). */
  readonly forfaitSpaar: number
  /** P!B22 — forfaitair rendement overige bezittingen (per jaar; /12). */
  readonly forfaitOverig: number
  /** P!B23 — forfaitair rendement schulden (per jaar; /12). */
  readonly forfaitSchuld: number
  /** P!B18 — heffingvrij vermogen per persoon (geïndexeerd × personen). */
  readonly heffingvrijVermogenPP: number
  /** P!B19 — aantal fiscale personen (`=1+PT!B2`; 1 of 2 bij fiscaal partnerschap). */
  readonly personen: number
  /** P!B24 — schuldendrempel per persoon (geïndexeerd × personen). */
  readonly schuldendrempelPP: number
  /** P!B92 — heffingvrij inkomen totaal (= P!B91 × personen); werkelijk-tak. */
  readonly heffingvrijInkomenTotaal: number
}

// ── Categorieën & getypte slot-rollen ────────────────────────────────────────

/** Bezitting-categorie (bens kolom E). */
export type AssetCategorie =
  | 'Spaargeld'
  | 'Beleggingen'
  | 'Pensioen'
  | 'Vastgoed'
  | 'Eigen huis'
  | 'Overig'

/** Schuld-categorie (bens kolom I). */
export type DebtCategorie =
  | 'Woning'
  | 'Consumptief'
  | 'Studie'
  | 'Zakelijk'
  | 'Overig'
  | 'Tekort'

/**
 * Getypte rol van een bezitting-slot. De eigen woning MOET op bens rij 6
 * (slot 2) staan — bewaakt door Controle!K8. De rol is een expliciete markering
 * (geen positie-aanname elders in de kern).
 */
export type AssetRol = 'eigenHuis'

/**
 * Getypte rol van een schuld-slot (bewaakt contract, Controle!K9 + gereserveerde
 * slots): hypotheek op bens rij 17 (slot 0), opeethypotheek op rij 20 (slot 3),
 * tekort-lening op rij 23 (slot 6).
 */
export type DebtRol = 'hypotheek' | 'opeethypotheek' | 'tekortLening'

// ── Generieke potten (bens rij 4-13 bezittingen, rij 17-23 schulden) ─────────

/**
 * Eén bezitting-pot. `slot` = 0-gebaseerde bens-rij-index (rij 4..13 → 0..9);
 * de volgorde bepaalt hoe DepView-arrays (rendement per maand) aansluiten.
 * `rol` markeert de contract-gebonden slot (eigen huis = slot 2 / bens rij 6),
 * i.p.v. elders in de kern een positie aan te nemen.
 */
export interface AssetPot {
  readonly slot: number
  readonly naam: string | null
  /** bens kolom D — Box 3-type (bepaalt de fiscale grondslag; "Geen Box 3" = huis). */
  readonly box3Type: AssetBox3Type
  /** bens kolom E — categorie (stuurt TS-prio's, waterval en niet-liquide-vlaggen). */
  readonly categorie: AssetCategorie
  /** bens kolom B — startwaarde (maand 0). */
  readonly startwaarde: number
  /** bens kolom C — nominaal jaarrendement (maandelijks /12). */
  readonly rendement: number
  /** bens kolom F — investering-vlag (1 = schuift mee met scenarioband/MC/Hist). */
  readonly investering: boolean
  /** Getypte slot-rol (contract) of null. */
  readonly rol: AssetRol | null
}

/**
 * Eén schuld-pot. `slot` = 0-gebaseerde bens-rij-index (rij 17..23 → 0..6).
 * `rol` markeert de gereserveerde/contract-slots (hypotheek/opeet/tekort).
 */
export interface DebtPot {
  readonly slot: number
  readonly naam: string | null
  /** bens kolom F — Box 3-type. */
  readonly box3Type: DebtBox3Type
  /** bens kolom I — categorie. */
  readonly categorie: DebtCategorie
  /** bens kolom B — startsaldo (maand 0). */
  readonly startwaarde: number
  /** bens kolom C — geplande aflossing als % van startwaarde per jaar. */
  readonly aflossingPct: number
  /** bens kolom D — geplande aflossing als vast €-bedrag per jaar (alternatief voor %). */
  readonly aflossingEur: number
  /** bens kolom E — nominaal jaarrente (maandelijks /12). */
  readonly rente: number
  /** bens kolom G — liquide (ja/nee). */
  readonly liquide: boolean
  /** bens kolom H — "in sparen na aflossing" (Ja → rente-vrijval via CF!G). */
  readonly inSparenNaAflossing: boolean
  /** Getypte slot-rol (contract) of null. */
  readonly rol: DebtRol | null
}

// ── P-parameterblokken ───────────────────────────────────────────────────────

/** Persoon & tijdas (P-blok "Persoon & spaargedrag" + AOW-leeftijd). */
export interface PersoonParams {
  /** P!B5 — geboortejaar. */
  readonly geboortejaar: number
  /** P!B6 — startjaar (jaar 0 van de prognose). */
  readonly startjaar: number
  /** P!B55 — AOW-/pensioenleeftijd (spiegel ES!C15; ook doel van eindstrategie 'Pensioenleeftijd'). */
  readonly aowLeeftijd: number
}

/** Inkomen & uitgaven (nominale jaarbasis, vooraf geïndexeerd in de stromen). */
export interface InkomenUitgavenParams {
  /** P!B10 — netto jaarinkomen (→ CF!D, /12·index). */
  readonly nettoJaarinkomen: number
  /** P!B11 — netto jaaruitgaven (→ CF!E, /12·index). */
  readonly nettoJaaruitgaven: number
  /** P!B15 — uitgave na pensioen per jaar (→ Ont!D). */
  readonly uitgaveNaPensioenPerJaar: number
}

/** P!B28 — Toename-strategie (mapt op TS-toename-prio's). */
export type ToenameStrategie =
  | 'Sparen'
  | 'gelijk verdelen over bezittingen'
  | 'Eerst schulden aflossen (hoge rente eerst)'
  | 'Beleggen'
  | 'Eigen indeling'

/** P!B29 — Afname-strategie (mapt op TS-afname-prio's). */
export type AfnameStrategie =
  | 'Spaargeld eerst'
  | 'gewogen onttrekken uit bezittingen behalve eigen huis'
  | 'Uit beleggingen'
  | 'Eigen indeling'

/** P!B30 — Onttrekking-strategie (mapt op TS-onttrekking-prio's). */
export type OnttrekkingStrategie =
  | 'Toegankelijk eerst (default)'
  | 'Rendement laten doorgroeien'
  | 'Pensioen/huis ontzien'
  | 'Eigen indeling'

/** De drie strategie-selectors (P!B28/B29/B30) die de TS-prio-mapping sturen. */
export interface StrategieSelectors {
  readonly toename: ToenameStrategie
  readonly afname: AfnameStrategie
  readonly onttrekking: OnttrekkingStrategie
}

/** P!B48 — Eindstrategie-selector. */
export type Eindstrategie = 'Vermogen opeten' | 'Nalatenschap' | 'Eeuwigdurend' | 'Pensioenleeftijd'

/** Ja/Nee-schakelaar (Excel-tekst). */
export type JaNee = 'Ja' | 'Nee'

/**
 * FIRE-doel & eindstrategie (P-blok "Eindstrategie"). ES is een pure spiegel van
 * deze P-cellen (geen eigen inputs); het doelbedrag P!B36 en de eindleeftijd
 * P!B35 zijn AFGELEID (solver-afhankelijk) en dus geen static input.
 */
export interface EindstrategieParams {
  /** P!B48 — gekozen eindstrategie. */
  readonly selector: Eindstrategie
  /** P!B51 — eindleeftijd bij 'Vermogen opeten' (deplete). */
  readonly eindleeftijdOpeten: number
  /** P!B52 — eindleeftijd bij 'Nalatenschap' (legacy). */
  readonly eindleeftijdNalatenschap: number
  /** P!B53 — nalatenschapbedrag in koopkracht-nu (doelbedrag legacy). */
  readonly nalatenschapBedrag: number
  /** P!B54 — niet-liquide meetellen in nalatenschap (→ ES!C13 → P!B37 / MC!B8). */
  readonly nietLiquideMeetellen: JaNee
}

/** P!B57 — Woning-strategie-selector. */
export type WoningStrategie = 'Meerekenen' | 'Uitsluiten' | 'Verkopen' | 'Opeethypotheek'

/** P!B58 — Trigger voor verkoop. */
export type VerkoopTrigger = 'Vaste leeftijd' | 'Wanneer nodig'

/** Woning-strategie-parameters (P-blok "Woning-strategie", B57-B67). */
export interface WoningStrategieParams {
  readonly selector: WoningStrategie
  /** P!B58 — trigger (vaste leeftijd vs. wanneer nodig). */
  readonly trigger: VerkoopTrigger
  /** P!B59 — verkoopleeftijd (vaste leeftijd / fallback). */
  readonly verkoopleeftijd: number
  /** P!B60 — drempel in maanden-uitgave (trigger 'Wanneer nodig'). */
  readonly drempelMaandenUitgave: number
  /** P!B61 — verkoopprijs als % van WOZ. */
  readonly verkoopprijsPctWoz: number
  /** P!B62 — verkoopkosten %. */
  readonly verkoopkostenPct: number
  /** P!B63 — huur na verkoop (% van WOZ per jaar). */
  readonly huurNaVerkoopPctWozPerJaar: number
  /** P!B64 — startleeftijd opname (opeethypotheek). */
  readonly opeetStartleeftijdOpname: number
  /** P!B65 — max lening als % van de overwaarde. */
  readonly opeetMaxLeningPctOverwaarde: number
  /** P!B66 — rente opeethypotheek per jaar (spiegel bens!E20). */
  readonly opeetRentePerJaar: number
  /** P!B67 — maandopname opeethypotheek; `null` = auto (leeg). */
  readonly opeetMaandopname: number | null
}

/** P!B69 — Onttrekkingsprofiel-selector. */
export type Onttrekkingsprofiel = 'Vast' | 'Afnemend' | 'Oplopend' | 'Guardrails'

/**
 * Onttrekkingsprofiel (P-blok "Onttrekkingsprofiel", B69-B81). De fase-factoren
 * zijn in **procenten** (100/85/70); de guardrail-drempels zijn ratio's (0,8/1,2).
 *
 * Bewust GEEN veld: P!B82 (m−1-referentie-anker `=INDEX(Prognose!J, (B16−B7)·12)`)
 * hangt van de solver (B16) én van Prognose!J af en is dus geen static input —
 * de Ont-porter leest dit anker teacher-forced uit zijn `DepView`.
 */
export interface OnttrekkingsprofielParams {
  readonly profiel: Onttrekkingsprofiel
  /** P!B71 — fase 1 t/m leeftijd (go-go). */
  readonly fase1TotLeeftijd: number
  /** P!B72 — factor 1 (%). */
  readonly factor1Pct: number
  /** P!B73 — fase 2 t/m leeftijd (slow-go). */
  readonly fase2TotLeeftijd: number
  /** P!B74 — factor 2 (%). */
  readonly factor2Pct: number
  /** P!B75 — factor 3 (%) daarna (no-go). */
  readonly factor3Pct: number
  /** P!B77 — guardrails floor (min. factor). */
  readonly guardrailFloor: number
  /** P!B78 — guardrails ceiling (max. factor). */
  readonly guardrailCeiling: number
  /** P!B79 — guardrails onderdrempel-ratio. */
  readonly guardrailOnderdrempelRatio: number
  /** P!B80 — guardrails bovendrempel-ratio. */
  readonly guardrailBovendrempelRatio: number
  /** P!B81 — guardrails stap (aanpassing per keer). */
  readonly guardrailStap: number
}

// ── Onzekerheid (scenarioband + Monte-Carlo + backtest) ──────────────────────

/** P!B42 — scenarioband-keuze. */
export type ScenarioBand = 'Pessimistisch' | 'Verwacht' | 'Optimistisch'

/**
 * Monte-Carlo-parameters (tab MC). De per-pot idiosyncratische ruis (MC!C12:L12)
 * en de gedeelde marktschok (MC!B10) zijn DETERMINISTISCHE OUTPUTS (sin-hash op
 * de runteller B11), geen input — de MC-porter genereert die zelf uit deze
 * parameters. `mu` (MC!B2 `=AVERAGEIFS`) is eveneens afgeleid uit bens-rendement.
 */
export interface McParams {
  /** MC!B1 — aantal runs (N). */
  readonly aantalRuns: number
  /** MC!B3 — sigma (jaarvolatiliteit van de gedeelde marktschok). */
  readonly sigma: number
  /** MC!B5 — MC actief (0/1). */
  readonly actief: boolean
}

/**
 * Backtest-parameters (tab Hist). `rendementReeks` is de jaarreeks Hist!B4:B99
 * (leeg = scaffolding zonder data; `null` per lege jaarcel).
 */
export interface HistParams {
  /** Hist!B1 — startjaar. */
  readonly startjaar: number
  /** Hist!B2 — backtest actief (0/1). */
  readonly actief: boolean
  /** Hist!B4:B99 — historische jaarrendement-reeks (null per lege cel). */
  readonly rendementReeks: readonly (number | null)[]
}

/** Onzekerheidslaag: scenarioband-keuze + Monte-Carlo + backtest. */
export interface OnzekerheidParams {
  /** P!B42 — scenarioband-keuze (shift −0,02 / 0 / +0,02 via de afgeleide P!B43). */
  readonly scenario: ScenarioBand
  /** P!B43 — de door B42 gekozen rendement-shift (afgeleid via SWITCH; als parameter gebruikt). */
  readonly shift: number
  /** P!B44 — shift alleen op investeringspotten (bens!F=1). */
  readonly shiftAlleenInvestering: boolean
  readonly mc: McParams
  readonly hist: HistParams
}

// ── TS (strategie-prioriteiten + niet-liquide) ───────────────────────────────

/** TS!A16:A21 — schuld-categorie-label (wijkt af van bens 'Tekort' → 'Tekort-lening'). */
export type TsSchuldCategorieLabel =
  | 'Woning'
  | 'Consumptief'
  | 'Studie'
  | 'Zakelijk'
  | 'Overig'
  | 'Tekort-lening'

/**
 * Eén bezitting-categorie in TS (rij 5-10). De prio's B/C/D zijn de door de
 * strategie-selectors (P!B28/29/30) geresolveerde per-categorie-prioriteiten
 * (INDEX op de mapping-matrix). Semantiek (TS!A73:B78): prio 1-4 = gelijktijdig
 * gewogen (gewicht ½^(prio−1) genormaliseerd), prio 5 = reserve (alleen restant),
 * prio ≥ 6 = nooit → tekort-lening.
 */
export interface TsBezitCategorie {
  readonly categorie: AssetCategorie
  /** TS!B — prio toename. */
  readonly prioToename: number
  /** TS!C — prio afname. */
  readonly prioAfname: number
  /** TS!D — prio onttrekking. */
  readonly prioOnttrekking: number
  /** TS!G — gevuld (€ > 0). */
  readonly gevuld: boolean
  /** TS!H5:H10 — niet-liquide (huis: `=IF(P!B57="Meerekenen","Nee","Ja")`). */
  readonly nietLiquide: boolean
}

/**
 * Eén schuld-categorie in TS (rij 16-21). Alleen de toename-kant (aflossing) heeft
 * een prio — TS!C/D zijn structureel leeg voor schulden. `null` = geen prio (bv.
 * lege of niet-geprioriteerde categorie).
 */
export interface TsSchuldCategorie {
  readonly categorie: TsSchuldCategorieLabel
  /** TS!B — aflos-prio (toename-kant); `null` als leeg. */
  readonly prioAflossing: number | null
  /** TS!G — gevuld (€ > 0). */
  readonly gevuld: boolean
  /** TS!H16:H20 — niet-liquide (woning: `=IF(P!B57="Meerekenen","Nee","Ja")`). */
  readonly nietLiquide: boolean
}

/** Strategie-prioriteiten & niet-liquide-markering (tab TS). */
export interface TsParams {
  /** TS rij 5-10 (6 bezitting-categorieën). */
  readonly bezitCategorien: readonly TsBezitCategorie[]
  /** TS rij 16-21 (5 schuld-categorieën + tekort-lening). */
  readonly schuldCategorien: readonly TsSchuldCategorie[]
}

// ── Geb (handmatige gebeurtenissen, rij 4-13) ────────────────────────────────

/** Geb-post-type (Eenmalig of Periodiek). */
export type GebPostType = 'Eenmalig' | 'Periodiek'

/**
 * Eén post van een handmatige gebeurtenis (Geb rij 4-13, tot 3 posten per rij).
 * `bedrag` is in koopkracht-nu (+ bate / − kost); de motor indexeert centraal.
 * Eind leeg (`null`) = eenmalig (bij 'Eenmalig') of doorlopend (bij 'Periodiek').
 * De "Geïnd. (start)"-kolommen (D/K/R) en de helper-indices (W:AE) zijn AFGELEID.
 */
export interface GebPost {
  readonly type: GebPostType
  /** kolom C/J/Q — bedrag in koopkracht-nu (+ bate / − kost). */
  readonly bedrag: number
  /** kolom E/L/S — startleeftijd. */
  readonly startLeeftijd: number
  /** kolom F/M/T — startmaand (maand-in-jaar). */
  readonly startMaand: number
  /** kolom G/N/U — eindleeftijd (`null` = leeg). */
  readonly eindLeeftijd: number | null
  /** kolom H/O/V — eindmaand (`null` = leeg). */
  readonly eindMaand: number | null
}

/** Eén handmatige gebeurtenis-rij (Geb rij 4-13) met 0-3 gevulde posten. */
export interface GebeurtenisRij {
  /** Excel-rij (4..13). */
  readonly rij: number
  /** kolom A — naam van de gebeurtenis. */
  readonly naam: string | null
  /** Gevulde posten (post 1/2/3); lege posten weggelaten. */
  readonly posten: readonly GebPost[]
}

// ── Auto-gebeurtenissen (domeinkennis → Geb rij 14-30, OUTPUT) ───────────────

/**
 * Eén pensioen-pot-slot (Auto-gebeurtenissen rij 26-31). Kolom-mapping uit de
 * waargenomen kopregel (rij 25); J/K/L/M (duur model / maandbedrag / eind /
 * Geb-bedrag) zijn AFGELEID en horen niet in de input. Sinds fixture-ronde 3
 * vult `gezin` een slot: de waarde-semantiek (PMT-annuïtisering + duur-SWITCH
 * per type) is oracle-bewezen in `tables/auto-gebeurtenissen.ts`.
 */
export interface PensioenPot {
  /** Slot 0..5 (rij 26..31). */
  readonly slot: number
  /** kolom A — naam. */
  readonly naam: string | null
  /** kolom B — type/modus-selector. */
  readonly type: string | null
  /** kolom C — ingangsleeftijd. */
  readonly ingangsLeeftijd: number | null
  /** kolom D — invoermodus (bv. "pot"). */
  readonly invoermodus: string | null
  /** kolom E — bruto € per maand. */
  readonly brutoPerMaand: number | null
  /** kolom F — inleg (pot €). */
  readonly inlegPot: number | null
  /** kolom G — duur in jaren (invoer). */
  readonly duurJaarInvoer: number | null
  /** kolom H — geïndexeerd (rauwe Ja/Nee-tekst; onbeproefd in fixtures). */
  readonly geindexeerd: string | null
  /** kolom I — partner-uitkering %. */
  readonly partnerUitkeringPct: number | null
}

/**
 * Auto-gebeurtenissen-INVOER (B4-B18 + pensioen-multipot). De uitkomsten (AOW
 * B21, kinderen-expansie rij 35-52, erfenis-afleidingen B56-B59) zijn OUTPUT die
 * naar Geb rij 14-30 vloeit — die sla we hier over.
 */
export interface AutoGebeurtenisParams {
  /** B4 — leefsituatie (bv. "Alleenstaand"; stuurt de AOW-hoogte). Rauwe tekst: de alternatieve label is onbeproefd in de fixtures. */
  readonly leefsituatie: string
  /** B5 — AOW-opbouwjaren (0-50). */
  readonly aowOpbouwjaren: number
  /** B8 — aantal kinderen (0-3). */
  readonly aantalKinderen: number
  /** B9/B10/B11 — geboorteleeftijd ouder per kind (1..3). */
  readonly kindGeboorteLeeftijden: readonly number[]
  /** B12 — NIBUD basis-maandbedrag per kind. */
  readonly nibudBasisPerMaand: number
  /** B13 — kinderopvang netto per maand (0-4 jr). */
  readonly kinderopvangNettoPerMaand: number
  /** B14 — kinderbijslag per kind per maand. */
  readonly kinderbijslagPerMaand: number
  /** B15 — babyuitzet eenmalig. */
  readonly babyuitzetEenmalig: number
  /** B16 — erfenis bruto. */
  readonly erfenisBruto: number
  /** B17 — erfenis relatie tot erflater (rauwe tekst; bepaalt vrijstelling/tarief). */
  readonly erfenisRelatie: string
  /** B18 — erfenis verwacht op leeftijd. */
  readonly erfenisLeeftijd: number
  /** Rij 26-31 — pensioen-multipot-slots (leeg → weggelaten). */
  readonly pensioenPotten: readonly PensioenPot[]
}

// ── PT (partner-parameterlaag) ───────────────────────────────────────────────

/**
 * Partner-parameterlaag (tab PT). De head-tijdas-cellen (B10-B12: DOB-verschil,
 * partner-AOW-/pensioen-startmaand) zijn AFGELEID en geen input.
 */
export interface PartnerParams {
  /** PT!B2 — partner aanwezig (1/0); voedt ook P!B19 (`=1+PT!B2`). */
  readonly aanwezig: boolean
  /** PT!B3 — geboortejaar partner. */
  readonly geboortejaar: number
  /** PT!B4 — netto jaarinkomen partner (tot partner-AOW). */
  readonly nettoJaarinkomen: number
  /** PT!B5 — AOW-leeftijd partner (spiegel ES!C15). */
  readonly aowLeeftijd: number
  /** PT!B6 — pensioen bruto per jaar. */
  readonly pensioenBrutoPerJaar: number
  /** PT!B7 — pensioen-startleeftijd. */
  readonly pensioenStartleeftijd: number
  /** PT!B8 — pensioen geïndexeerd (1/0). */
  readonly pensioenGeindexeerd: boolean
  /** PT!B9 — AOW-bedrag per persoon per jaar. */
  readonly aowBedragPpPerJaar: number
}

// ── Werk-strategie ───────────────────────────────────────────────────────────

/** Eén salarissprong (Werk-strategie D3:E8). */
export interface WerkStrategieSprong {
  /** kolom D — bij leeftijd. */
  readonly bijLeeftijd: number
  /** kolom E — Δ netto per maand (reëel). */
  readonly deltaNettoPerMaand: number
}

/** Eén deeltijd-stap (Werk-strategie G3:H8; 'vanaf leeftijd' oplopend). */
export interface WerkStrategieDeeltijd {
  /** kolom G — vanaf leeftijd. */
  readonly vanafLeeftijd: number
  /** kolom H — pct (1 = voltijd). */
  readonly pct: number
}

/**
 * Werk-strategie (tab Werk-strategie): een reële salarisladder → nominale delta →
 * FIRE-gegate → CF!D. De toggle is effectief `reeleGroei > 0` of de aanwezigheid
 * van sprongen/deeltijd. De jaartabel (K/L) en maandtabel (N:S) zijn OUTPUT.
 */
export interface WerkStrategieParams {
  /** B1 — huidig netto per maand (basis; spiegel P!B10/12). */
  readonly basisNettoPerMaand: number
  /** B2 — reële groei per jaar (boven inflatie); 0 = strategie effectief uit. */
  readonly reeleGroei: number
  /** B3 — groei tot leeftijd (`null` = doorlopend). */
  readonly groeiTotLeeftijd: number | null
  /** B4 — plafond netto per maand (0 = geen). */
  readonly plafondNettoPerMaand: number
  /** D3:E8 — optionele salarissprongen. */
  readonly sprongen: readonly WerkStrategieSprong[]
  /** G3:H8 — optionele deeltijd-stappen. */
  readonly deeltijd: readonly WerkStrategieDeeltijd[]
}

// ── KernelInput ──────────────────────────────────────────────────────────────

/**
 * Statische invoer voor de rekenkern (één keer per projectie). Dekt de VOLLEDIGE
 * Excel-invoer-oppervlakte (zie module-doc). De eerste vijf velden vormen het
 * kern-scaffold dat de reeds geporte Bel-tabel consumeert (niet aanraken zonder
 * Bel-parity te herzien); daarna volgen de P-parameterblokken en de overige
 * invoer-tabbladen.
 */
export interface KernelInput {
  // ── kern-scaffold (Bel-tabel hangt hieraan) ──
  /** P!B7 — startleeftijd in hele jaren (maand 0). */
  readonly startLeeftijd: number
  /** P!B14 — algemene inflatie per jaar; indexatie-factor (1+inflatie)^(m/12). */
  readonly inflatie: number
  readonly box3: Box3Params
  /** Gevulde bezitting-potten (bens rij 4-13; lege slots weggelaten). */
  readonly assetPotten: readonly AssetPot[]
  /** Gevulde schuld-potten (bens rij 17-23; lege slots weggelaten). */
  readonly schuldPotten: readonly DebtPot[]

  // ── P-parameterblokken ──
  readonly persoon: PersoonParams
  readonly inkomenUitgaven: InkomenUitgavenParams
  /** P!B25 — rente tekort-lening (spiegel bens!E23). */
  readonly tekortLeningRente: number
  readonly strategie: StrategieSelectors
  readonly eindstrategie: EindstrategieParams
  readonly woning: WoningStrategieParams
  readonly onttrekkingsprofiel: OnttrekkingsprofielParams
  readonly onzekerheid: OnzekerheidParams

  // ── overige invoer-tabbladen ──
  readonly ts: TsParams
  /** Geb rij 4-13 — handmatige gebeurtenissen (auto-rijen 14-30 zijn OUTPUT). */
  readonly gebeurtenissen: readonly GebeurtenisRij[]
  readonly autoGebeurtenissen: AutoGebeurtenisParams
  readonly partner: PartnerParams
  readonly werkStrategie: WerkStrategieParams
}
