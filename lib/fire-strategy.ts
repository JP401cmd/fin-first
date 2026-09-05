/**
 * FIRE Eindstrategie — types, defaults en labels.
 *
 * Vier modi:
 *  - deplete:   Portfolio → €0 op instelbare leeftijd (default 90)
 *  - legacy:    Portfolio → instelbaar bedrag op instelbare leeftijd
 *  - perpetual: Portfolio behoudt koopkracht, eeuwigdurend geïndexeerd
 *  - pensioen:  Opbouw tot AOW-leeftijd, daarna onttrekking
 *
 * Pure types, geen Supabase dependency.
 */

import { guardFreedomAge } from '@/lib/horizon/outcome-guard'
// Alleen het TYPE (geen module-cyclus: de kernel-bridge importeert dit bestand).
import type { KernelStopAnker } from '@/lib/horizon-kernel/types'

/**
 * De vijf eindstrategieën. 'nu-stoppen' (ADR 0127): werken stopt vandaag — de kernel
 * kortsluit FIRE op de startleeftijd (maand 0) en toetst of het vermogen tot de eigen
 * eindleeftijd reikt (doel €0). Geen doelvermogen (D4), vrijheids-% = tijdsdekking (D5).
 */
export type FireEndStrategy = 'perpetual' | 'legacy' | 'deplete' | 'pensioen' | 'nu-stoppen'

export interface FireStrategyConfig {
  strategy: FireEndStrategy
  endAge: number        // 60–120, voor deplete/legacy; display-horizon voor perpetual
  legacyAmount: number  // in huidige euro's, alleen voor legacy
}

export const DEFAULT_FIRE_STRATEGY: FireStrategyConfig = {
  strategy: 'deplete',
  endAge: 90,
  legacyAmount: 0,
}

export const STRATEGY_LABELS: Record<FireEndStrategy, { name: string; subtitle: string }> = {
  deplete: {
    name: 'Vermogen opeten',
    subtitle: 'Vermogen volledig opgemaakt — inflatiegecorrigeerd',
  },
  legacy: {
    name: 'Nalatenschap',
    subtitle: 'Eindig met een doelbedrag — onttrekkingen inflatiebestendig',
  },
  perpetual: {
    name: 'Eeuwigdurend',
    subtitle: 'Koopkracht blijft intact — alleen reëel rendement onttrekken',
  },
  pensioen: {
    name: 'Pensioenleeftijd',
    subtitle: 'Opbouw tot AOW, inflatiebestendige onttrekking, restant als nalatenschap',
  },
  // ADR 0127 — RELEASE-SCHAKELAAR: de UI-pickers itereren over deze map, dus deze
  // entry maakt 'nu-stoppen' overal kiesbaar. Beschrijvend, nooit "je kunt stoppen"
  // (definitieve tekst gaat nog langs merkstem/compliance).
  'nu-stoppen': {
    name: 'Nu stoppen',
    subtitle: 'Werken stopt vandaag — zie tot welke leeftijd je vermogen reikt',
  },
}

/**
 * De canonieke allowlist — AFGELEID uit `STRATEGY_LABELS`, nooit een handmatige lijst
 * (ADR 0127 D9). Elke tweede lijst (parser, draft-persistentie, regressiesuites,
 * API-allowlist) leest hier, zodat een vijfde strategie niet stil naar 'deplete' vouwt.
 */
export const FIRE_END_STRATEGIES: readonly FireEndStrategy[] = Object.keys(
  STRATEGY_LABELS,
) as FireEndStrategy[]

/** Type-guard op de canonieke allowlist. */
export function isFireEndStrategy(value: unknown): value is FireEndStrategy {
  return typeof value === 'string' && (FIRE_END_STRATEGIES as readonly string[]).includes(value)
}

/**
 * Parse profile data to FireStrategyConfig with safe defaults.
 *
 * DE GEVAARLIJKSTE CONSUMENT (ADR 0127 D9): een onbekende waarde vouwt hier stil
 * naar 'deplete' — de DB zegt dan X en de hele app rekent een deplete-plan. Daarom
 * leest de allowlist uit `STRATEGY_LABELS` en niet uit een eigen `includes`-lijst.
 */
export function parseFireStrategy(profile: {
  fire_end_strategy?: string | null
  fire_end_age?: number | null
  fire_legacy_amount?: number | string | null
}): FireStrategyConfig {
  return {
    strategy: isFireEndStrategy(profile.fire_end_strategy) ? profile.fire_end_strategy : 'deplete',
    endAge: profile.fire_end_age ?? 90,
    legacyAmount: Number(profile.fire_legacy_amount ?? 0),
  }
}

// ── Het PLAN: stop-anker × eind-vorm (ADR 0129, fase F1) ───────────────────
//
// `FireEndStrategy` hierboven mengt twee vragen die los van elkaar staan:
//   • WANNEER stop ik  — `pensioen` (AOW) en `nu-stoppen` (vandaag) zijn ankers
//   • WAT geldt aan het EIND — `deplete` · `legacy` · `perpetual` zijn eind-vormen
// Ze zitten in één enum omdat ze zo gegroeid zijn. Gevolg: zeven van de twaalf
// combinaties zijn onuitdrukbaar (`aow × legacy` — "stop op AOW en houd €X over"),
// terwijl de stop-slider ze allang doorrekent; en de twee ankers dragen elk een
// IMPLICIETE eind-vorm die de gebruiker niet kan zien of kiezen.
//
// Dit blok is de expand-fase: het plan-type bestaat naast de enum, `parseFirePlan`
// leest BEIDE rijvormen, en niets gedraagt zich anders. F2 brengt het anker naar de
// kernel, F3 naar de oppervlakken, F4 contraheert de enum tot de drie eind-vormen.

/** Wanneer stopt het werken? De vierde (`age`) is de zelfgekozen stopleeftijd. */
export type StopAnchor =
  | { kind: 'solved' }
  | { kind: 'aow' }
  | { kind: 'now' }
  | { kind: 'age'; age: number }

/** Wat moet er aan het eind gelden? De enum zonder de twee ankers. */
export type FireEndForm = 'deplete' | 'legacy' | 'perpetual'

export interface FirePlan {
  anchor: StopAnchor
  endForm: FireEndForm
  /** Tot welke leeftijd moet het vermogen reiken (B51). */
  endAge: number
  /** Alleen betekenisvol bij `endForm: 'legacy'`. */
  legacyAmount: number
}

/**
 * De vijf plan-kolommen op `profiles` als ÉÉN select-fragment (ADR 0129, contract-
 * ronde L1). Elke profiel-select die het plan leest gebruikt dit fragment — nooit een
 * losse opsomming van drie van de vijf. De aanleiding: zestien selects lazen
 * `fire_end_strategy, fire_end_age, fire_legacy_amount` zónder het anker, waardoor
 * bv. `horizon-client#loadData` de server-seed (mét anker) overschreef met een rij
 * zónder — de hero sprong van AOW naar een gesolvede leeftijd. Wie een zesde
 * plan-kolom toevoegt, doet dat hier en nergens anders.
 */
export const FIRE_PLAN_COLUMNS =
  'fire_end_strategy, fire_end_age, fire_legacy_amount, fire_stop_anchor, fire_stop_age' as const

/** De vier ankers als allowlist — bron voor de DB-CHECK én de API-validatie. */
export const STOP_ANCHOR_KINDS = ['solved', 'aow', 'now', 'age'] as const
export type StopAnchorKind = (typeof STOP_ANCHOR_KINDS)[number]

/** De drie eind-vormen; `FireEndStrategy` minus de twee ankers. */
export const FIRE_END_FORMS: readonly FireEndForm[] = ['deplete', 'legacy', 'perpetual']

export function isStopAnchorKind(value: unknown): value is StopAnchorKind {
  return typeof value === 'string' && (STOP_ANCHOR_KINDS as readonly string[]).includes(value)
}

export function isFireEndForm(value: unknown): value is FireEndForm {
  return typeof value === 'string' && (FIRE_END_FORMS as readonly string[]).includes(value)
}

// ── Schrijfkant: anker + stopleeftijd valideren zoals een CLIENT ze aanreikt ──
//
// Gedeeld door `PUT /api/fire-settings` en `POST /api/onboarding/save-own-data`
// (ADR 0129, onboarding-stap "Jouw plan", 5 sep 2026): twee routes schrijven
// hetzelfde plan, dus één toets. Een Next-route kan geen losse functie exporteren
// (de route-typevalidator weigert extra exports), daarom woont de toets hier en
// delegeren beide routes. STRENG — geen stille afronding; zie `normalizeStopAge`
// hieronder voor waarom LEZEN wél tolerant is.

export interface StopAnchorWriteInput {
  anchor: StopAnchorKind
  stopAge: number | null
}

/**
 * De grenzen van het plan — ÉÉN bron voor de schrijftoets hieronder, de zod-schema's
 * van `/api/fire-settings` en `/api/onboarding/save-own-data`, en de client-validatie
 * (`lib/horizon/plan-draft.ts` re-exporteert ze; de `<input min/max>` in de plan-vragen
 * lezen ze). `END_AGE_MIN` is 60 als spiegel van de live DB-CHECK
 * `profiles_fire_end_age_check` (60..120) — er komt geen migratie; een lagere client-
 * grens zou een geldige invoer in een 23514 laten eindigen. Gepind in
 * `lib/onboarding-plan.test.ts`.
 */
export const STOP_AGE_MIN = 18
export const STOP_AGE_MAX = 100
export const END_AGE_MIN = 60
export const END_AGE_MAX = 120

/**
 * De eindleeftijd waarop de backfill 20260903141000 (D6/M1) de bestaande
 * `pensioen`-rijen zette: een plan dat op de AOW ankert rekent tot 100. Een OUDE
 * draft of client die het label 'pensioen' nog stuurt, kan de 90-default nooit zelf
 * hebben gekozen (de oude stap toonde geen eindleeftijd-veld) — dus krijgt zo'n rij
 * dezelfde 100 als de backfill, niet de meegestuurde default.
 */
export const LEGACY_PENSIOEN_END_AGE = 100

/**
 * De eindleeftijd die de plan-vragen ZETTEN zodra de gebruiker "Mijn vermogen mag
 * niet slinken" (`perpetual`) kiest (eigenaar-besluit 5 sep 2026). Onder perpetual is
 * de eindleeftijd geen keuze maar een weergave-horizon: de kernel rekent die vorm tot
 * 100 (`gap.ts#eindleeftijdVan`), het veld is verborgen, en zonder deze zet zou de
 * B7-toets (stopleeftijd vóór eindleeftijd) naar een onzichtbare 90 verwijzen.
 * Dezelfde waarde als `LEGACY_PENSIOEN_END_AGE`, bewust een eigen naam: andere reden.
 */
export const PERPETUAL_END_AGE = 100

/**
 * Halve jaren (ADR 0129 B6): een waarde tussen twee halve jaren wordt NIET stil
 * afgerond — dat zou een keuze van de gebruiker vervalsen — maar afgewezen, zodat
 * de client zijn eigen resolutie corrigeert. De consistentie-eis (`age` ⟺ leeftijd
 * aanwezig) spiegelt de DB-CHECK, zodat een ongeldige combinatie een leesbare 400
 * geeft i.p.v. een 23514. De aanroeper past zijn eigen default toe op een ontbrekend
 * anker (`body.fire_stop_anchor ?? 'solved'`).
 */
export function validateStopAnchorInput(
  rawAnchor: unknown,
  rawAge: unknown,
): StopAnchorWriteInput | { error: string } {
  if (!isStopAnchorKind(rawAnchor)) {
    return { error: `Ongeldig stop-anker: ${String(rawAnchor)}` }
  }

  if (rawAnchor !== 'age') {
    if (rawAge != null) {
      return { error: 'Een stopleeftijd hoort alleen bij het anker "age".' }
    }
    return { anchor: rawAnchor, stopAge: null }
  }

  const age = Number(rawAge)
  if (!Number.isFinite(age)) {
    return { error: 'Kies een stopleeftijd bij het anker "age".' }
  }
  if (age * 2 !== Math.floor(age * 2)) {
    return { error: 'Een stopleeftijd loopt in stappen van een half jaar.' }
  }
  if (age < STOP_AGE_MIN || age > STOP_AGE_MAX) {
    return { error: `Stopleeftijd moet tussen ${STOP_AGE_MIN} en ${STOP_AGE_MAX} liggen.` }
  }
  return { anchor: rawAnchor, stopAge: age }
}

/** R4 (B7): de 400-tekst wanneer de stopleeftijd op of voorbij de eindleeftijd ligt. */
export const STOP_AGE_BEFORE_END_AGE_ERROR = 'Een stopleeftijd moet vóór de eindleeftijd van je plan liggen.'

/**
 * R4 (B7): een stopleeftijd op of voorbij de eindleeftijd laat geen plan over om te
 * toetsen — de kernel zou 'm stil op `eind − 1/12` klemmen, en stil afronden
 * vervalst een keuze.
 */
export function stopAgeConflictsWithEndAge(input: StopAnchorWriteInput, endAge: number): boolean {
  return input.anchor === 'age' && input.stopAge !== null && input.stopAge >= endAge
}

/**
 * Ligt het stopmoment vast, of zoekt de app het?
 *
 * DE ENIGE TOETS op "vast anker" — vervangt in F3 elke `isPensioenMode`,
 * `isNuStoppenMode` en `requiredFireIsStartPortfolio`-als-strategieproxy. Twee
 * predicaten voor één feit is precies hoe de twee ankers uit elkaar zijn gegroeid.
 */
export function isFixedAnchor(plan: Pick<FirePlan, 'anchor'>): boolean {
  return plan.anchor.kind !== 'solved'
}

/**
 * Halve jaren (ADR 0129 B6) — TOLERANT LEZEN, STRENG SCHRIJVEN.
 *
 * Deze functie leest een reeds opgeslagen `fire_stop_age` en rondt 'm naar de
 * dichtstbijzijnde halve jaar (58,3 → 58,5). Dat is bewust ánders dan de PUT-route
 * (`app/api/fire-settings`), die dezelfde 58,3 met een 400 afwijst. De twee lagen
 * beantwoorden verschillende vragen:
 *  - SCHRIJVEN is een keuze van de gebruiker: stil afronden zou die keuze vervalsen,
 *    dus de route weigert en laat de client zijn resolutie corrigeren.
 *  - LEZEN gaat over een rij die er al is: de DB-CHECK
 *    (`fire_stop_age * 2 = floor(fire_stop_age * 2)`, migratie 20260903140000)
 *    garandeert halve jaren, dus in de praktijk is deze afronding de identiteit. Ze
 *    staat er als vangnet voor een rij die buiten de route om is ontstaan (seed,
 *    handmatige SQL, een toekomstige kolomwijziging): liever een leesbaar plan op
 *    58,5 dan een crash of een stil naar `solved` gevallen anker.
 * Buiten [18, 100] is geen leeftijd → `null` → het anker valt terug op `solved`.
 * Gepind in `fire-strategy.plan.test.ts` en WF-KRUIS-28 (`tolerantGelezen58.3`).
 */
function normalizeStopAge(raw: unknown): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  const halved = Math.round(n * 2) / 2
  if (halved < 18 || halved > 100) return null
  return halved
}

/**
 * Lees het plan uit een profielrij — deterministisch over BEIDE rijvormen.
 *
 * DE TEGENSPRAAK-REGEL (ADR 0129 D2): tijdens de expand-fase dragen sommige rijen
 * het anker nog in `fire_end_strategy` ('pensioen'/'nu-stoppen') en andere al in
 * `fire_stop_anchor`. Een legacy-waarde in de OUDE kolom WINT altijd voor het anker.
 * Daarmee kan geen enkele rij zichzelf tegenspreken, en is er nooit een moment met
 * twee waarheden — ook niet halverwege de backfill.
 *
 * De eind-vorm valt terug op 'deplete' wanneer de oude kolom een anker draagt: dat
 * is precies wat de kernel onder beide ankers vandaag al doet (doel €0).
 */
export function parseFirePlan(profile: {
  fire_end_strategy?: string | null
  fire_end_age?: number | null
  fire_legacy_amount?: number | string | null
  fire_stop_anchor?: string | null
  fire_stop_age?: number | string | null
}): FirePlan {
  const legacyStrategy = profile.fire_end_strategy

  const anchor: StopAnchor =
    legacyAnchorOf(legacyStrategy) ??
    resolveStoredAnchor(profile.fire_stop_anchor, profile.fire_stop_age)

  const endForm: FireEndForm = isFireEndForm(legacyStrategy) ? legacyStrategy : 'deplete'

  return {
    anchor,
    endForm,
    endAge: profile.fire_end_age ?? 90,
    legacyAmount: Number(profile.fire_legacy_amount ?? 0),
  }
}

/**
 * De D2-vertaling van de twee LEGACY-labels naar een anker — de ENIGE plek waar
 * `'pensioen'`/`'nu-stoppen'` een anker worden. `parseFirePlan` leest hier, en
 * `resolveFreedomAnchor` valt hierop terug voor lezers die alleen nog de oude
 * `strategy`-string aanreiken (F4 verwijdert die terugval samen met de labels).
 *
 * `null` = geen anker-label (een eind-vorm of onbekend): de aanroeper kiest dan
 * zijn eigen terugval (de nieuwe kolom, of `solved`).
 */
export function legacyAnchorOf(strategy: string | null | undefined): StopAnchor | null {
  if (strategy === 'pensioen') return { kind: 'aow' }
  if (strategy === 'nu-stoppen') return { kind: 'now' }
  return null
}

/**
 * De kernel-echo van het anker (`SimResult.stopAnker`, Nederlands: aow/nu/leeftijd)
 * terug naar het app-plan-anker (aow/now/age). Eén mapping-home; `null`/`undefined`
 * (de solver zocht het stopmoment) is `solved`.
 */
export function stopAnchorFromKernel(anker: KernelStopAnker | null | undefined): StopAnchor {
  if (anker == null) return { kind: 'solved' }
  if (anker.soort === 'aow') return { kind: 'aow' }
  if (anker.soort === 'nu') return { kind: 'now' }
  return { kind: 'age', age: anker.leeftijd }
}

/**
 * Het plan van een profielrij MÉT het schaduwpad `feature_preferences.
 * fire_strategy_override` opgelost (ADR 0129 D2 + het pensioen-parkeerpad).
 *
 * Eén home voor de kernel-adapter (`adapter/params.ts`) én de loaders die het plan
 * naast hun `FireStrategyConfig` doorgeven: zou een loader kaal `parseFirePlan`
 * lezen terwijl de adapter het schaduwpad wél oplost, dan rekent de kernel een
 * aow-anker en toont de bundel `solved` — twee waarheden op één rij.
 */
export function resolveFirePlanWithOverride(
  profile: Parameters<typeof resolveFireStrategyWithOverride>[0] & {
    fire_stop_anchor?: string | null
    fire_stop_age?: number | string | null
  },
): FirePlan {
  const cfg = resolveFireStrategyWithOverride(profile)
  return parseFirePlan({ ...profile, fire_end_strategy: cfg.strategy })
}

/** `age` zonder geldige leeftijd is geen anker — dan valt het plan terug op `solved`
 *  (de DB-CHECK verbiedt die combinatie, maar de parser mag er niet op vertrouwen). */
function resolveStoredAnchor(rawKind: unknown, rawAge: unknown): StopAnchor {
  if (!isStopAnchorKind(rawKind)) return { kind: 'solved' }
  if (rawKind !== 'age') return { kind: rawKind }
  const age = normalizeStopAge(rawAge)
  return age === null ? { kind: 'solved' } : { kind: 'age', age }
}

// ── Afgeleide vrijheids-/pensioentoestand (consume-only, ADR 0009) ──────────
//
// Eén canonieke, GEDEELDE bron die hero, status-banner én AI consumeren, zodat
// er geen drift ontstaat ("UI zegt vrij, Fin zegt nog 8 jaar te gaan"). Deze
// helpers HERBEREKENEN niets: ze lezen reeds-berekende waarden (freedomPct uit
// computeFreedomProgress, currentAge/fireAge/aowAge uit de loaders/unified
// projection) en bevatten GEEN hardcoded leeftijden of forfaits — de AOW-leeftijd
// komt via `lib/aow-leeftijd.ts`/de loaders binnen als parameter.

export interface FreedomStateInput {
  /** Canonieke vrijheidsvoortgang 0–100 (computeFreedomProgress). Null = onbekend. */
  freedomPct: number | null
  /** Huidige leeftijd in jaren. Null = geen geboortedatum bekend. */
  currentAge: number | null
  /**
   * Vrijheids-/FIRE-leeftijd in jaren. Null = projectie kon niet draaien.
   *
   * GEEF DE FRACTIONELE WAARDE (`fireAgeFractional`), niet een afgeronde: dit veld
   * is een DREMPEL (`currentAge >= fireAge`), geen weergave. Afronden van bv. 44,92
   * naar 45 laat "financieel vrij" tot 6 maanden te vroeg triggeren bij een
   * currentAge van 45 (WF-CANON-03). Rond alléén af waar het getal als
   * vrijheidsleeftijd wordt getoond.
   */
  fireAge: number | null
  /**
   * @deprecated F4 (ADR 0129) — de LEGACY-label. Wordt alleen nog gelezen wanneer
   * `anchor` ontbreekt: `'pensioen'`/`'nu-stoppen'` vertalen dan via
   * `legacyAnchorOf` naar `aow`/`now`. Geef bij voorkeur `anchor` mee; staan beide
   * er, dan WINT `anchor` — het is het canonieke feit, de label een echo ervan.
   */
  strategy?: FireEndStrategy
  /**
   * Het stop-anker van het plan (ADR 0129 D8) — de canonieke sleutel sinds F3a.
   * `null`/weggelaten = terugval op `strategy` en anders `solved`.
   */
  anchor?: StopAnchor | null
  /**
   * AOW-leeftijd in jaren (uit lib/aow-leeftijd.ts) — optioneel. Alleen gebruikt
   * voor precieze 'voorbij AOW'-detectie; ontbreekt 'ie, dan valt de logica terug
   * op `fireAge` (onder het aow-anker is `fireAge` ≡ de AOW-leeftijd).
   */
  aowAge?: number | null
}

/**
 * HET anker waarop de vrijheidstoestand wordt beoordeeld: het expliciete `anchor`,
 * anders de D2-vertaling van de legacy-label, anders `solved`. Eén resolutie voor
 * `isFinanciallyFree`, `isRetiredView` en `resolveFreedomFraming` — géén tweede
 * `strategy === 'pensioen'`-toets ernaast.
 */
export function resolveFreedomAnchor(input: Pick<FreedomStateInput, 'anchor' | 'strategy'>): StopAnchor {
  return input.anchor ?? legacyAnchorOf(input.strategy) ?? { kind: 'solved' }
}

/**
 * Is het gekozen stopmoment al gepasseerd? Alleen zinvol onder een vast anker.
 *  - `now`  — per definitie waar (het anker ís vandaag).
 *  - `aow`  — `currentAge ≥ aowAge`; zonder AOW-leeftijd valt de drempel terug op
 *             `fireAge` (onder dit anker ≡ de AOW-leeftijd).
 *  - `age`  — `currentAge ≥ anchor.age` (fractioneel; 58,5 blijft 58,5).
 * Onbekende leeftijd ⇒ `false`: zonder leeftijd kun je niets "bereikt" noemen.
 */
export function isAnchorReached(input: FreedomStateInput, anchor: StopAnchor): boolean {
  if (anchor.kind === 'solved') return false
  if (anchor.kind === 'now') return true
  const { currentAge } = input
  if (currentAge == null || !Number.isFinite(currentAge)) return false
  const threshold = anchor.kind === 'age' ? anchor.age : (input.aowAge ?? input.fireAge)
  return threshold != null && Number.isFinite(threshold) && currentAge >= threshold
}

/**
 * Reeds financieel vrij — DE GATE (ADR 0129 D8/B3), geen los cijfer.
 *
 *  - `solved` — de vrijheidsvoortgang staat op 100% OF de huidige leeftijd is voorbij
 *    de vrijheidsleeftijd (het bestaande gedrag).
 *  - vast anker (`aow`/`now`/`age`) — **anker bereikt ∧ dekking ≥ 100**. Beide
 *    voorwaarden. Zonder de eerste zou een dertigjarige op een AOW-anker met een
 *    100%-gedekt plan "met pensioen" heten terwijl de AOW decennia weg ligt; zonder
 *    de tweede zou een `age`-anker in het verleden (`currentAge ≥ fireAge` is dan
 *    triviaal waar) iemand vrij verklaren bij 40% dekking. Onder een vast anker is
 *    `freedomPct` de DEKKING (`computeRunwayCoveragePct`), nooit een kapitaalratio.
 *
 * Vanaf dit punt is "% op weg naar vrijheid" niet meer de juiste framing — het beeld
 * toont onttrekking, geen opbouw.
 */
export function isFinanciallyFree(input: FreedomStateInput): boolean {
  const { freedomPct, currentAge, fireAge } = input
  const gedekt = freedomPct != null && Number.isFinite(freedomPct) && freedomPct >= 100
  const anchor = resolveFreedomAnchor(input)
  if (isFixedAnchor({ anchor })) return gedekt && isAnchorReached(input, anchor)
  if (gedekt) return true
  if (currentAge != null && fireAge != null && currentAge >= fireAge) return true
  return false
}

/**
 * Onttrekkings-/pensioenbeeld van toepassing: de gebruiker is al financieel vrij,
 * OF het plan ankert op de AOW en die is gepasseerd (ook bij een tekort toont het
 * beeld dan onttrekking, geen opbouw). Dit is de trigger voor de "dit beeld toont
 * je onttrekking tot einde leven"-duiding.
 */
export function isRetiredView(input: FreedomStateInput): boolean {
  if (isFinanciallyFree(input)) return true
  const anchor = resolveFreedomAnchor(input)
  return anchor.kind === 'aow' && isAnchorReached(input, anchor)
}

/**
 * Staat de gebruiker op of voorbij de AOW-leeftijd, of valt zijn vrijheidsmoment
 * daar? De WOORDKEUZE-hulp ("met pensioen" vs. "vrij") voor oppervlakken die dat
 * onderscheid nog maken; geen onderdeel van de gate zelf.
 */
export function isAtOrPastAow(input: FreedomStateInput): boolean {
  const anchor = resolveFreedomAnchor(input)
  if (anchor.kind === 'aow') return isAnchorReached(input, anchor)
  const atOrPastAow =
    input.aowAge != null && input.currentAge != null && input.currentAge >= input.aowAge
  const fireAtOrPastAow =
    input.aowAge != null && input.fireAge != null && input.fireAge >= input.aowAge
  return atOrPastAow || fireAtOrPastAow
}

/**
 * De drie framings (ADR 0129 D8):
 *  - 'building'  — `solved` en nog op weg ("X% op weg naar vrijheid").
 *  - 'anchored'  — een vast anker (`aow`/`now`/`age`) en (nog) niet vrij: het
 *    oppervlak toont dan geen voortgang-naar-een-moment maar het BEREIK van het plan
 *    ("als je op {stop} stopt, reikt je liquide vermogen tot …"), gedekt of tekort.
 *  - 'free'      — de gate `isFinanciallyFree` staat open (onder `solved`: 100% of
 *    leeftijd voorbij FIRE; onder een vast anker: anker bereikt ∧ dekking ≥ 100).
 *
 * De vroegere labels 'pensioen'/'nu-stoppen' waren ankers vermomd als framing; het
 * anker reist nu apart mee (`resolveFreedomAnchor` / `FreedomAgeView.anchor`), en
 * de woordkeuze "met pensioen" leest `isAtOrPastAow`.
 */
export type FreedomFraming = 'building' | 'free' | 'anchored'

export function resolveFreedomFraming(input: FreedomStateInput): FreedomFraming {
  if (isFinanciallyFree(input)) return 'free'
  return isFixedAnchor({ anchor: resolveFreedomAnchor(input) }) ? 'anchored' : 'building'
}

// ── Seam: DREMPEL vs. WEERGAVE van de vrijheidsleeftijd ────────────────────
//
// De vrijheidsleeftijd heeft twee rollen die makkelijk verwisseld raken:
//  - DREMPEL  — `currentAge >= fireAge` in `isFinanciallyFree`. Moet de
//               FRACTIONELE waarde zijn (`fireAgeFractional` uit de bundel).
//  - WEERGAVE — het getal dat als vrijheidsleeftijd op het scherm staat
//               (strip-label, grafiekmarker). Dat hoort afgerond.
//
// Ze zíjn verwisseld geweest (WF-CANON-03): een afgeronde 45,3 werd 45, en bij
// een currentAge van 45 sloeg "financieel vrij" daardoor tot zes maanden te
// vroeg om. De fix daarvan leefde in de AANROEPER en was daarmee onbewaakt —
// `fireAge: fireAge` is een compilerende, plausibel ogende shorthand die geen
// enkele test rood maakt.
//
// Daarom leiden aanroepers beide waarden af uit deze ene helper, die alléén de
// fractionele leeftijd als invoer accepteert. Rond in aanroepers niet zelf af.

/**
 * Vrijheidsleeftijd voor WEERGAVE: afgerond op hele jaren. Nooit als drempel
 * gebruiken — daarvoor is de fractionele waarde nodig (zie `FreedomStateInput`).
 */
export function fireAgeForDisplay(fireAgeFractional: number | null | undefined): number | null {
  if (fireAgeFractional == null || !Number.isFinite(fireAgeFractional)) return null
  // M6-vangrail: een leeftijd op/voorbij het horizonplafond is de parkeerstand van
  // de kernel-bisectie, geen antwoord — nooit als "vrijheidsleeftijd" tonen. Eén
  // guard (`lib/horizon/outcome-guard.ts`), zodat de /overzicht-strip én de
  // mini-vermogensgrafiek dezelfde grens hanteren als de /toekomst-hero.
  if (!guardFreedomAge(fireAgeFractional).ok) return null
  return Math.round(fireAgeFractional)
}

/** Invoer voor `resolveFreedomAgeView` — bewust ALLEEN de fractionele leeftijd. */
export interface FreedomAgeViewInput extends Omit<FreedomStateInput, 'fireAge'> {
  /** Fractionele vrijheids-/FIRE-leeftijd uit de bundel (`fireAgeFractional`). */
  fireAgeFractional: number | null
}

export interface FreedomAgeView {
  /** Afgerond — uitsluitend voor weergave. `null` óók bij een M6-vangrail-treffer. */
  fireAgeDisplay: number | null
  /** Framing, bepaald op de fractionele drempel. */
  framing: FreedomFraming
  /**
   * Het anker waarop `framing` is beoordeeld (ADR 0129) — zodat een oppervlak dat
   * onder 'free' nog "met pensioen" van "vrij" onderscheidt, of onder 'anchored'
   * het stopmoment wil noemen, niet zelf de legacy-label hoeft te herlezen.
   */
  anchor: StopAnchor
  /**
   * `true` ⇒ de motor gaf een leeftijd die niet kán kloppen (op/voorbij het
   * horizonplafond, bevinding M6). Het oppervlak toont dan een gegevensmelding
   * i.p.v. een aftelling — niet gewoon "geen aftelling", want dan verdwijnt het
   * probleem stilletjes uit beeld.
   */
  dataIssue: boolean
}

/**
 * Leidt de weergave-leeftijd én de framing af uit één fractionele invoer, zodat
 * een aanroeper de twee rollen niet meer kan verwisselen. Bewaakt door
 * `fire-strategy.test.ts` ("rondt af voor WEERGAVE maar toetst de DREMPEL
 * fractioneel").
 */
export function resolveFreedomAgeView({
  fireAgeFractional,
  ...rest
}: FreedomAgeViewInput): FreedomAgeView {
  // M6: een onmogelijke leeftijd mag ook de DREMPEL niet voeden — anders bepaalt
  // de parkeerstand (100) alsnog of iemand "financieel vrij" heet.
  const guard = guardFreedomAge(fireAgeFractional)
  const bruikbaar = guard.ok ? fireAgeFractional : null
  const state: FreedomStateInput = { ...rest, fireAge: bruikbaar }
  return {
    fireAgeDisplay: fireAgeForDisplay(bruikbaar),
    framing: resolveFreedomFraming(state),
    anchor: resolveFreedomAnchor(state),
    dataIssue: !guard.ok,
  }
}

/**
 * Resolve the fire strategy with feature_preferences fallback.
 * When the DB CHECK constraint doesn't yet include 'pensioen', the fire-settings API
 * stores the strategy override in profiles.feature_preferences.fire_strategy_override.
 *
 * Use this on server-side (e.g. dashboard-data-loader) where you have the profile data.
 */
export function resolveFireStrategyWithOverride(
  profile: {
    fire_end_strategy?: string | null
    fire_end_age?: number | null
    fire_legacy_amount?: number | string | null
    feature_preferences?: Record<string, unknown> | null
  },
): FireStrategyConfig {
  const base = parseFireStrategy(profile)

  // De kolom draagt een echte keuze (≠ de 'deplete'-parkeerwaarde van het
  // schaduwpad) → die wint; een override is dan hoogstens stale.
  if (base.strategy !== 'deplete') return base

  // Parkeerwaarde 'deplete' + een override → de override, mits die op de canonieke
  // allowlist staat (ADR 0127 D9: generiek, niet hardcoded op 'pensioen' — een
  // derde strategie loopt anders over dezelfde kabel). In de praktijk kan het
  // schaduwpad alleen nog 'pensioen' parkeren (zie app/api/fire-settings/route.ts).
  const fp = profile.feature_preferences ?? {}
  const override = fp.fire_strategy_override
  if (isFireEndStrategy(override) && override !== 'deplete') {
    return { ...base, strategy: override }
  }

  return base
}
