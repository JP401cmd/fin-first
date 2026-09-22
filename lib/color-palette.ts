/**
 * OKLCH-based palette generator for dynamic module accent colors.
 *
 * Generates 11-step color palettes (50–950) from a single hex color,
 * using the OKLCH color model — the same model Tailwind v4 uses internally.
 *
 * No external dependencies. ~100 lines of pure TypeScript.
 */

/**
 * De vier instelbare identiteits-accenten. De DB-sleutels blijven bewust
 * `kern` / `wil` / `horizon` — die namen dragen óók de AI-DNA, de
 * contextbouwers, `WidgetModule` en `NavModule`, dus een kleur-scoped rename
 * zou het vocabulaire splitsen in plaats van herstellen (besluit UR3-32,
 * 6 sep 2026). Wat de gebruiker ziet is wél opnieuw ingedeeld:
 *
 *  - `kern`    → Bezittingen (kleurt ook de route /overzicht en Fins linkeroog)
 *  - `wil`     → Schulden    (kleurt ook de route /mijn en Fins rechteroog)
 *  - `horizon` → Budget      (kleurt ook de route /toekomst en Fins onderste stip)
 *  - `fin`     → Fin zelf    (bubbel, chat-header, verzendknop, /berichten, /nieuws)
 */
export type ModuleColorConfig = {
  kern: string    // hex — Bezittingen
  wil: string     // hex — Schulden
  horizon: string // hex — Budget
  fin: string     // hex — Fin
}

/**
 * Defaults overgenomen uit de hefboomfamilies (Bezittingen = groen,
 * Schulden = terracotta/amber, Budget = staalsblauw). De hefbomen droegen tot
 * UR3-32 Tailwind-standaardkleuren die letterlijk op het stoplicht botsten
 * (emerald-700 op 3,1° van "op koers"-groen, amber-700 exact box1). Het
 * werkelijke onderscheid tussen identiteit en status zit in chroma, niet in
 * hue — zie `accentClashesWithStatus` hieronder.
 *
 * UR3-32 zette ze daarom op C ≈ 0,065. Dat bleek in gebruik té gedempt.
 *
 * **EIGENAARSBESLUIT 8 sep 2026: voor de ACCENTEN is de koppeling met de
 * stoplicht-semantiek losgelaten.** Elk accent staat op zijn sRGB-gamutgrens
 * voor zijn eigen hue en lightness. Er is geen chroma-plafond meer op de
 * accenten.
 *
 * Wat dat opgeeft, expliciet: acceptatiecriterium 2 van UR3-32 luidde "welke
 * accentkeuze dan ook — een statuskleur blijft te onderscheiden van de
 * identiteitskleur". Dat geldt niet meer. Een accent mag er nu uitzien als
 * "op koers", "aandacht" of "actie". De eigenaar heeft die afweging twee keer
 * expliciet gemaakt, mét de meting erbij; dit is geen drift.
 *
 * Wat NIET is losgelaten: `accentClashesWithStatus` bestaat gewoon nog en
 * bewaakt onverkort de **budget- en fasekleuren** (zie de tests onderaan
 * `color-palette.accent-status.test.ts`). Alleen de accenten zijn eruit
 * gehaald. Verwar die twee niet — de vorige poging om dit via
 * `ACCENT_CHROMA_MAX` te regelen ontwapende juist die andere groepen.
 *
 * **EIGENAARSBESLUIT 15 sep 2026: lightness omhoog tot tégen de AA-ondergrens
 * (4,5:1 op papier `#faf9f6`), niet eroverheen.** Op 8 sep werd L bewust niet
 * verhoogd (een eerdere poging naar L 0,56 liet kern zakken tot 4,20:1). Het
 * verschil nu: chroma stijgt méé met lightness in dit hele bereik (bij vaste L
 * zaten alle vier de accenten al op hun gamutgrens — daar was géén ruimte
 * meer over), dus de enige resterende hendel voor "feller" is L optrekken tot
 * net vóór het punt waar contrast onder AA zakt. Elke accent is individueel
 * op zijn eigen hue gezocht naar het hoogste L met contrast ≥ 4,5 op papier
 * (marge ingebouwd: alle vier landen op 4,55–4,58). Resultaat, chroma t.o.v.
 * 8 sep: kern 0,108→0,112 (+4%, groen/teal blijft het smalst — dat is gamut,
 * geen nalatigheid), wil 0,137→0,149 (+9%), horizon 0,129→0,137 (+6%), fin
 * 0,170→0,294 (+73% — fin had als donkerste accent (L 0,33) verreweg de meeste
 * contrastmarge liggen, en is nu duidelijk zichtbaar een andere, veel fellere
 * violet dan voorheen — een bewuste identiteitsverschuiving, niet alleen een
 * tint feller). Hue is bij alle vier ongewijzigd.
 */
export const DEFAULT_MODULE_COLORS: ModuleColorConfig = {
  kern: '#00825f',
  wil: '#b85600',
  horizon: '#0077bb',
  fin: '#af16ff',
}

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
export type Shade = (typeof SHADES)[number]

// ── Lightness & chroma curves (derived from Tailwind palette analysis) ──

const LIGHTNESS: Record<Shade, number> = {
  50: 0.977, 100: 0.949, 200: 0.903, 300: 0.837,
  400: 0.748, 500: 0.675, 600: 0.596, 700: 0.516,
  800: 0.447, 900: 0.395, 950: 0.277,
}

// Chroma multipliers (fraction of max chroma; peak at 600)
const CHROMA_MULT: Record<Shade, number> = {
  50: 0.055, 100: 0.135, 200: 0.27, 300: 0.48,
  400: 0.72, 500: 0.90, 600: 1.0, 700: 0.88,
  800: 0.73, 900: 0.59, 950: 0.40,
}

// ── Color space conversions ─────────────────────────────────────────────

function hexToSrgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ]
}

function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ]
}

export function hexToOklch(hex: string): { L: number; C: number; h: number } {
  const [sr, sg, sb] = hexToSrgb(hex)
  const [lr, lg, lb] = [srgbToLinear(sr), srgbToLinear(sg), srgbToLinear(sb)]
  const [L, a, b] = linearRgbToOklab(lr, lg, lb)
  const C = Math.sqrt(a * a + b * b)
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
  return { L, C, h }
}

function oklchToLinearRgb(L: number, C: number, h: number): [number, number, number] {
  const hRad = (h * Math.PI) / 180
  const a = C * Math.cos(hRad)
  const b = C * Math.sin(hRad)
  return oklabToLinearRgb(L, a, b)
}

function isInGamut(r: number, g: number, b: number): boolean {
  const eps = 0.0001
  return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && b >= -eps && b <= 1 + eps
}

/** Binary-search chroma clamping to keep color within sRGB gamut */
function clampChromaToGamut(L: number, C: number, h: number): number {
  if (C <= 0) return 0
  let lo = 0, hi = C
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const [r, g, b] = oklchToLinearRgb(L, mid, h)
    if (isInGamut(r, g, b)) lo = mid
    else hi = mid
  }
  return lo
}

export function oklchToHex(L: number, C: number, h: number): string {
  const clamped = clampChromaToGamut(L, C, h)
  const [lr, lg, lb] = oklchToLinearRgb(L, clamped, h)
  const r = Math.round(Math.min(1, Math.max(0, linearToSrgb(lr))) * 255)
  const g = Math.round(Math.min(1, Math.max(0, linearToSrgb(lg))) * 255)
  const b = Math.round(Math.min(1, Math.max(0, linearToSrgb(lb))) * 255)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// ── WCAG contrast ───────────────────────────────────────────────────────

/**
 * Relative luminance of an sRGB hex color per WCAG 2.x.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(hex: string): number {
  const [sr, sg, sb] = hexToSrgb(hex)
  const [r, g, b] = [srgbToLinear(sr), srgbToLinear(sg), srgbToLinear(sb)]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * WCAG 2.x contrast ratio between two hex colors (1:1 .. 21:1).
 * Order-independent. Pure & testable: contrastRatio('#000000', '#ffffff') === 21.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA)
  const lB = relativeLuminance(hexB)
  const lighter = Math.max(lA, lB)
  const darker = Math.min(lA, lB)
  return (lighter + 0.05) / (darker + 0.05)
}

// ── Identiteit vs. status: de chroma-band ───────────────────────────────

/**
 * De drie stoplichtkleuren zoals `lib/leverage-status.ts` ze draagt
 * (emerald-500 / amber-500 / red-500), uitgedrukt in OKLCH-hue. Die kleuren
 * dragen BETEKENIS (op koers / aandacht / actie) en zijn daarom bewust niet
 * instelbaar — net als positief/negatief en risico-rood.
 */
export const STATUS_HUES = {
  goed: 162.5,     // #10b981
  aandacht: 70.1,  // #f59e0b
  actie: 25.3,     // #ef4444
} as const

/**
 * Bovengrens van de accent-band. Een identiteitskleur mag dicht bij een
 * statushue liggen zolang hij onder deze grens blijft — zo botst het gedempte
 * goud (6,5° van amber-warn) nooit met "aandacht".
 *
 * De grens ligt op 0,10: middenin het lege gat tussen beide banden (stoplicht
 * op C = 0,149 / 0,165 / 0,208), en net onder het oude hefboom-emerald
 * (`#047857`, C = 0,1049, 3,1° van "op koers"-groen) — precies de botsing die
 * deze toets moet vangen.
 *
 * **LET OP — waar deze toets sinds 8 sep 2026 nog wél voor geldt.** De
 * accent-presets zijn er bewust uit gehaald (eigenaarsbesluit; zie
 * `DEFAULT_MODULE_COLORS` hierboven). Wat overblijft is:
 *   - de **budget-typekleuren** en de **fasekleuren** — die worden hier nog
 *     onverkort op getoetst, en die tests staan onderaan
 *     `color-palette.accent-status.test.ts`;
 *   - elke toekomstige kleurgroep die de scheiding identiteit/status wél wil.
 *
 * Verhoog deze constante dus NIET om een accent ruimte te geven — accenten
 * kennen geen plafond meer, dus die reden bestaat niet. Op 8 sep is dat één
 * keer geprobeerd (0,10 → 0,13) en het effect was uitsluitend collateraal:
 * `DEFAULT_BUDGET_COLORS.debt` en `phase_recovery` stopten met waarschuwen en
 * `#047857` werd weer 'ok'. Vier tests vingen het.
 *
 * De toets weegt hue en chroma, maar NIET lightness — terwijl daar veel van het
 * feitelijke onderscheid zit (budget/fase L ≈ 0,4–0,55, stoplicht L ≈ 0,63–0,70).
 * Wie hem ooit verfijnt, begint daar.
 */
export const ACCENT_CHROMA_MAX = 0.10

/** Hoe dicht een hue bij een statushue mag komen vóór we meekijken (graden). */
export const STATUS_HUE_WINDOW = 20

/** Kleinste hoek tussen twee hues op de kleurencirkel (0..180). */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 360) % 360)
  return d > 180 ? 360 - d : d
}

/**
 * Botst een gekozen accentkleur met de stoplicht-semantiek?
 *
 * `'warn'` wanneer de hue binnen `STATUS_HUE_WINDOW` van een statushue ligt
 * ÉN de verzadiging boven de accent-band uitkomt. Beide voorwaarden moeten
 * gelden: hue alléén zou het gedempte goud/olijf onterecht afkeuren, chroma
 * alléén zou een verzadigd indigo onterecht afkeuren.
 *
 * Waarschuwen, nooit blokkeren — zelfde lijn als de bestaande WCAG-hint.
 * Pure functie; getest in `lib/color-palette.accent-status.test.ts`.
 */
export function accentClashesWithStatus(hex: string): 'ok' | 'warn' {
  const { C, h } = hexToOklch(hex)
  if (C < ACCENT_CHROMA_MAX) return 'ok'
  const near = Object.values(STATUS_HUES).some(
    (statusHue) => hueDistance(h, statusHue) <= STATUS_HUE_WINDOW,
  )
  return near ? 'warn' : 'ok'
}

// ── Palette generation ──────────────────────────────────────────────────

export type Palette = Record<Shade, { oklch: string; hex: string }>

/**
 * Generates an 11-step palette from a single hex color (the "500" shade).
 * Keeps hue constant, varies lightness and chroma using curves derived
 * from Tailwind's built-in palettes.
 */
export function generatePalette(hex: string): Palette {
  const { L: inputL, C: inputC, h } = hexToOklch(hex)

  // Compute L-offset: how far the input's lightness is from the reference shade-500
  const refL500 = LIGHTNESS[500]
  const lOffset = inputL - refL500

  // Determine max chroma for this hue (at shade 600, where chroma peaks)
  // We scale from the input chroma at shade 500 (mult = 0.90)
  const maxChroma = inputC / CHROMA_MULT[500]

  const palette = {} as Palette

  for (const shade of SHADES) {
    const refL = LIGHTNESS[shade]

    // Apply L-offset with tapering towards extremes (50 and 950)
    const distFromCenter = Math.abs(shade - 500) / 450 // 0 at 500, ~1 at extremes
    const taper = 1 - distFromCenter * 0.7
    const L = Math.min(0.995, Math.max(0.1, refL + lOffset * taper))

    // Chroma from bell curve
    const C = maxChroma * CHROMA_MULT[shade]

    // Gamut clamp
    const clampedC = clampChromaToGamut(L, C, h)

    const lRound = Math.round(L * 1000) / 1000
    const cRound = Math.round(clampedC * 10000) / 10000

    palette[shade] = {
      oklch: `oklch(${lRound} ${cRound} ${Math.round(h * 10) / 10})`,
      hex: oklchToHex(L, C, h),
    }
  }

  return palette
}

// ── CSS variable generation ─────────────────────────────────────────────

export type ModuleName = 'kern' | 'wil' | 'horizon' | 'fin'
const MODULE_NAMES: ModuleName[] = ['kern', 'wil', 'horizon', 'fin']

/**
 * Generates a flat object of CSS custom property name → oklch value
 * for all 4 accents (44 variables total).
 *
 * Example: { '--color-kern-50': 'oklch(0.977 0.012 84.4)', ... }
 */
export function generateModuleColorVars(
  config: ModuleColorConfig = DEFAULT_MODULE_COLORS
): Record<string, string> {
  const vars: Record<string, string> = {}

  for (const mod of MODULE_NAMES) {
    const hex = config[mod] || DEFAULT_MODULE_COLORS[mod]
    const palette = generatePalette(hex)

    for (const shade of SHADES) {
      vars[`--color-${mod}-${shade}`] = palette[shade].oklch
    }
  }

  return vars
}

/**
 * Gedeelde ring van achttien alternatieve accenttinten — de voorkeuzes op
 * `/mijn/uiterlijk` én de trekkingspot voor een nieuwe gebruiker
 * (`randomModuleColors`). Stond tot 17 sep 2026 in
 * `components/mijn/module-accent-picker.tsx`; verhuisd omdat een tweede
 * consument (de onboarding) er anders een kopie van had moeten maken — en een
 * gekopieerde kleurenlijst is precies hoe de ene helft van de app straks een
 * andere tint "Jade" kent dan de andere.
 *
 * ── Herkomst van de getallen (verhuisd mét de constante) ──
 *
 * Een raster van 20° over de hele kleurencirkel, elk op zijn **sRGB-gamutgrens**
 * — de fysieke bovengrens, niet een gekozen getal.
 *
 * Het raster begint bewust op 17° en niet op 0°. Dat is de offset die de
 * grootste afstand houdt tot de vier standaarden (kern 165,6° · wil 49,9° ·
 * horizon 244,2° · fin 308,2°): minimaal 7,1°, tegen 4,1° bij zestien tinten en
 * 3,2° bij twintig. Zonder die offset zou op elke kaart een ring-tint vrijwel
 * samenvallen met de standaard erboven.
 *
 * Sinds 8 sep 2026 geldt hier GEEN chroma-plafond meer: de koppeling met de
 * stoplicht-semantiek is voor accenten losgelaten (eigenaarsbesluit, zie
 * DEFAULT_MODULE_COLORS hierboven). Scharlaken en Karmijn liggen daardoor
 * bewust naast "actie"-rood, Oker naast "aandacht"-amber en Smaragd naast
 * "op koers"-groen. Dat is geen ongeluk en geen drift.
 *
 * **EIGENAARSBESLUIT 15 sep 2026: elke tint op zijn eigen chroma-optimale
 * lightness, niet meer allemaal op één vaste L ~ 0,52.** Voorheen was de hele
 * ring op één lightness geplat (gekozen omdat dat de bovengrens was voor de
 * meest beperkte hue in de set); dat liet chroma liggen bij elke hue waarvan
 * de sRGB-piek elders ligt. Per tint gezocht naar de lightness die de chroma
 * maximaliseert zónder onder de AA-ondergrens (4,5:1 op papier `#faf9f6`,
 * marge ingebouwd) te zakken: groen/oranje/geel pieken pas ver boven L 0,52
 * (te donker leesbaar, dus daar geldt de AA-grens als plafond); blauw/paars
 * (Indigo, Violet) piekt juist ónder of rond L 0,52 — die twee kregen dus
 * hun eigen, lagere piek-L in plaats van de AA-grens, en werden zo ook
 * feller. Netto chroma-winst t.o.v. 8 sep: 4-14% op vrijwel alle tinten.
 *
 * Waarom ze niet allemaal even fel ogen: sRGB laat in het groen/teal nog altijd
 * maar C ~ 0,10-0,13 toe tegen ~0,29-0,30 in het blauw/paars. Dat is de gamut,
 * geen terughoudendheid.
 *
 * Alle achttien halen minimaal 4,55:1 tegen papier (WCAG AA voor tekst = 4,5),
 * gepind in `module-accent-picker.test.tsx`. Voeg hier dus nooit een tint toe
 * zonder 'm langs diezelfde meetlat te leggen — de onboarding trekt inmiddels
 * blind uit deze lijst.
 */
export const ACCENT_RING: readonly { name: string; hex: string }[] = [
  { name: 'Scharlaken', hex: '#e30046' },
  { name: 'Roest', hex: '#d03e00' },
  { name: 'Karamel', hex: '#b05c00' },
  { name: 'Oker', hex: '#996900' },
  { name: 'Olijf', hex: '#867100' },
  { name: 'Mos', hex: '#6c7900' },
  { name: 'Gras', hex: '#398200' },
  { name: 'Smaragd', hex: '#00834f' },
  { name: 'Jade', hex: '#00816e' },
  { name: 'Petrol', hex: '#007f82' },
  { name: 'Staal', hex: '#007d96' },
  { name: 'Kobalt', hex: '#0079ae' },
  { name: 'Ultramarijn', hex: '#006ee5' },
  { name: 'Indigo', hex: '#4b00fe' },
  { name: 'Violet', hex: '#8900fe' },
  { name: 'Orchidee', hex: '#be00ea' },
  { name: 'Magenta', hex: '#d200b2' },
  { name: 'Karmijn', hex: '#dd007e' },
]

/**
 * Afstanden (in ring-stappen van 20°) tussen de vier getrokken accenten.
 * 4 + 5 + 4 + 5 = 18, dus de vier tinten liggen altijd rond de héle
 * kleurencirkel verdeeld met minimaal 80° ertussen.
 *
 * Waarom niet vier losse trekkingen: die leveren met regelmaat twee buurtinten
 * op (kans op een paar binnen 40° is ruim een derde), en dan zijn Bezittingen
 * en Schulden op één scherm niet meer uit elkaar te houden. De kleur draagt
 * hier betekenis — dat mag de dobbelsteen niet stukmaken.
 */
const ACCENT_TETRAD_OFFSETS = [0, 4, 9, 13] as const

/**
 * Trekt vier willekeurige accentkleuren voor een nieuwe gebruiker: één
 * willekeurig startpunt op de ring, daarna de vaste tetrad-afstanden. Elke
 * uitkomst is dus een gespreide, AA-getoetste combinatie — nooit vier keer
 * bijna dezelfde tint, en nooit een tint die op papier onleesbaar is.
 *
 * `random` is injecteerbaar zodat de test elke tetrad kan afdwingen.
 */
export function randomModuleColors(random: () => number = Math.random): ModuleColorConfig {
  const ring = ACCENT_RING
  // Geen tweede `% ring.length` hier: de indexering hieronder modulo't al, en
  // (s % n + offset) % n === (s + offset) % n. Ook random() === 1 (sommige
  // generatoren geven dat) landt daarmee gewoon op index 0.
  const start = Math.floor(random() * ring.length)
  const [kern, wil, horizon, fin] = ACCENT_TETRAD_OFFSETS.map(
    (offset) => ring[(start + offset) % ring.length].hex,
  )
  return { kern, wil, horizon, fin }
}

/**
 * Returns the hex value for a specific module shade.
 * Useful for chart libraries that need hex colors.
 */
export function getModuleHex(
  config: ModuleColorConfig,
  module: ModuleName,
  shade: Shade = 500
): string {
  const hex = config[module] || DEFAULT_MODULE_COLORS[module]
  const palette = generatePalette(hex)
  return palette[shade].hex
}

// ── Budget color config ─────────────────────────────────────────────────

export type BudgetColorConfig = {
  income: string
  expense: string
  savings: string
  debt: string
  other: string
}

export const DEFAULT_BUDGET_COLORS: BudgetColorConfig = {
  income:  '#2d6a4f',   // donkergroen — groei
  expense: '#6b3a2d',   // terracotta — uitstroom
  savings: '#1d4e6b',   // staalsblauw — opbouw
  debt:    '#7a2d3a',   // bordeaux — verplichting
  other:   '#4a4840',   // neutraal ink-2
}

export type BudgetTypeName = keyof BudgetColorConfig
const BUDGET_TYPE_NAMES: BudgetTypeName[] = ['income', 'expense', 'savings', 'debt', 'other']

/**
 * Generates CSS variables for all 5 budget types (55 variables total).
 * Example: { '--color-income-50': 'oklch(...)' }
 */
export function generateBudgetColorVars(
  config: BudgetColorConfig = DEFAULT_BUDGET_COLORS
): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const type of BUDGET_TYPE_NAMES) {
    const hex = config[type] || DEFAULT_BUDGET_COLORS[type]
    const palette = generatePalette(hex)
    for (const shade of SHADES) {
      vars[`--color-${type}-${shade}`] = palette[shade].oklch
    }
  }
  return vars
}

// ── Phase color config ──────────────────────────────────────────────────

export type PhaseColorConfig = {
  phase_recovery:  string
  phase_stability: string
  phase_momentum:  string
  phase_mastery:   string
}

export const DEFAULT_PHASE_COLORS: PhaseColorConfig = {
  phase_recovery:  '#8b3a3a',   // donkerrood — urgentie/herstel
  phase_stability: '#355a78',   // staalsblauw — fundament
  phase_momentum:  '#3d3048',   // zelfde als wil-paars (ontkoppeld na instellen)
  phase_mastery:   '#c4a06b',   // zelfde als horizon-goud (ontkoppeld na instellen)
}

export type PhaseColorName = keyof PhaseColorConfig
const PHASE_COLOR_NAMES: PhaseColorName[] = ['phase_recovery', 'phase_stability', 'phase_momentum', 'phase_mastery']

/**
 * Generates CSS variables for all 4 phase types (44 variables total).
 * Example: { '--color-phase-recovery-50': 'oklch(...)' }
 */
export function generatePhaseColorVars(
  config: PhaseColorConfig = DEFAULT_PHASE_COLORS
): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const phase of PHASE_COLOR_NAMES) {
    const hex = config[phase] || DEFAULT_PHASE_COLORS[phase]
    const palette = generatePalette(hex)
    // CSS var key: --color-phase-recovery-50 → replace underscore with hyphen
    const cssKey = phase.replace('_', '-')
    for (const shade of SHADES) {
      vars[`--color-${cssKey}-${shade}`] = palette[shade].oklch
    }
  }
  return vars
}

// ── TopBar-kleur (ADR 0174) ─────────────────────────────────────────────

/**
 * Standaardkleur van de mobiele TopBar: leisteenblauw uit de mockup van
 * 22 sep 2026. Bewust GEEN vijfde accent: de balk is chrome, geen
 * module-identiteit, en krijgt dus geen `--color-*-50..950`-palet.
 *
 * `:root` in `app/globals.css` draagt precies
 * `topbarColorVars(DEFAULT_TOPBAR_COLOR)`. Wijzig je deze waarde, regenereer
 * dan die vier regels; `color-palette.topbar.test.ts` wordt anders rood.
 * Fase F2 maakt de kleur per gebruiker instelbaar (`profiles.topbar_color`).
 */
export const DEFAULT_TOPBAR_COLOR = '#3f4a5e'

/** Voorgrond op een donkere balk. */
const TOPBAR_FG_LIGHT = '#ffffff'
/** Voorgrond op een lichte balk: gelijk aan `--ink`. */
const TOPBAR_FG_DARK = '#1a1916'

const HEX6 = /^#[0-9a-f]{6}$/i

/**
 * De vier `--topbar-*`-tokens voor één balkkleur.
 *
 * De voorgrond is wit of inkt, en wel de kleur met het meeste contrast op de
 * balk. `--topbar-fg-muted` (iconen) en `--topbar-hover` (drukvlak) zijn
 * alfa-varianten van die voorgrond, zodat ze met elke balkkleur meeschuiven
 * zonder dat iemand ze apart hoeft te kiezen.
 *
 * Een ongeldige waarde (geen `#rrggbb`) valt terug op de standaard. Dat is
 * meer dan netheid: vanaf F2 komt de invoer uit de profielrij en gaat hij
 * rechtstreeks een `style`-attribuut in.
 *
 * Grens van de keuze wit/inkt: rond een balk-luminantie van ~0,2 halen beide
 * maar ~4,2:1. Dat is een grijze middentoon, geen realistische balkkleur. De
 * picker van F2 hoort daar te waarschuwen (zelfde lijn als de WCAG-hint bij de
 * accenten).
 */
export function topbarColorVars(hex: string = DEFAULT_TOPBAR_COLOR): Record<string, string> {
  const bg = HEX6.test(hex) ? hex.toLowerCase() : DEFAULT_TOPBAR_COLOR
  const light = contrastRatio(bg, TOPBAR_FG_LIGHT) >= contrastRatio(bg, TOPBAR_FG_DARK)
  const rgb = light ? '255, 255, 255' : '26, 25, 22'
  return {
    '--topbar-bg': bg,
    '--topbar-fg': light ? TOPBAR_FG_LIGHT : TOPBAR_FG_DARK,
    '--topbar-fg-muted': `rgba(${rgb}, 0.75)`,
    '--topbar-hover': `rgba(${rgb}, ${light ? 0.12 : 0.08})`,
  }
}

/**
 * Generates all CSS color variables: accenten (44) + budget (55) + fase (44) = 143 total.
 */
export function generateAllColorVars(config: {
  modules: ModuleColorConfig
  budget: BudgetColorConfig
  phase: PhaseColorConfig
}): Record<string, string> {
  return {
    ...generateModuleColorVars(config.modules),
    ...generateBudgetColorVars(config.budget),
    ...generatePhaseColorVars(config.phase),
  }
}
