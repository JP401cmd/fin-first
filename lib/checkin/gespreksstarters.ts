/**
 * Pure engine voor de check-in "gespreksstarters" (reflectievragen).
 *
 * Spiegelt lib/aandachtspunten.ts: geen Supabase, geen I/O. De route
 * (app/api/checkin/gespreksstarters/route.ts) haalt data op, stelt
 * GespreksstartersInput samen en roept buildGespreksstarters() aan.
 */
// Engine-uitvoertype: wordt door buildGespreksstarters() geproduceerd en
// door de route (app/api/checkin/gespreksstarters/route.ts) afgenomen.
import type { GesprekStarterData } from '@/lib/checkin-types'

// ── Voice (aanspreekvorm) ──────────────────────────────────────────────
// Nederlands vervoegt werkwoorden per onderwerp; Voice levert vooraf-
// vervoegde fragmenten zodat elke template één keer geschreven wordt.

export type Audience = 'solo' | 'household'

export interface Voice {
  audience: Audience
  subj: string      // 'je' | 'jullie'
  subjCap: string   // 'Je' | 'Jullie'
  poss: string      // 'je' | 'jullie'      → "{poss} vermogen"
  hebt: string      // 'hebt' | 'hebben'
  heb: string       // 'heb' | 'hebben'   (inversie: "heb je" / "hebben jullie")
  wilt: string      // 'wilt' | 'willen'
  wil: string       // 'wil' | 'willen'   (inversie: "wil je" / "willen jullie")
  bent: string      // 'bent' | 'zijn'
  kun: string       // 'kun' | 'kunnen'   (inversie: "kun je" / "kunnen jullie")
  voelt: string     // 'voel je je' | 'voelen jullie je'
  samen: string     // 'voor jezelf' | 'samen'
}

export function buildVoice(audience: Audience): Voice {
  if (audience === 'household') {
    return {
      audience,
      subj: 'jullie', subjCap: 'Jullie', poss: 'jullie',
      hebt: 'hebben', heb: 'hebben', wilt: 'willen', wil: 'willen', bent: 'zijn', kun: 'kunnen',
      voelt: 'voelen jullie je', samen: 'samen',
    }
  }
  return {
    audience,
    subj: 'je', subjCap: 'Je', poss: 'je',
    hebt: 'hebt', heb: 'heb', wilt: 'wilt', wil: 'wil', bent: 'bent', kun: 'kun',
    voelt: 'voel je je', samen: 'voor jezelf',
  }
}

// ── Freedom-time helpers (verplaatst uit de route) ─────────────────────

// EUR-formattering hergebruikt de canonieke helper (incl. NaN-guard) i.p.v. dupliceren.
// Geïmporteerd als lokale naam zodat detectoren in deze module formatEUR(...) kunnen aanroepen.
import { formatCurrency as formatEUR } from '@/lib/format'
export { formatEUR }

export function freedomDays(amount: number, dailyExpenses: number): number {
  if (dailyExpenses <= 0) return 0
  return Math.round(Math.abs(amount) / dailyExpenses)
}

export function freedomLabel(days: number): string {
  if (days >= 365) {
    const years = Math.floor(days / 365)
    const months = Math.round((days % 365) / 30)
    return months > 0 ? `${years} jaar en ${months} maanden` : `${years} jaar`
  }
  if (days >= 30) {
    const m = Math.floor(days / 30)
    const d = days % 30
    return d > 0 ? `${m} maanden en ${d} dagen` : `${m} maanden`
  }
  return `${days} ${days === 1 ? 'dag' : 'dagen'}`
}

// ── Kandidaat-model + selectie ─────────────────────────────────────────

export type StarterTheme =
  | 'vermogen' | 'sparen' | 'uitgaven' | 'doelen'
  | 'schulden' | 'acties' | 'fire' | 'algemeen'

export interface StarterVariant {
  vraag: string
  actie: string
  context: string
  vrijheidstijd?: string
}

export interface StarterCandidate {
  id: string
  theme: StarterTheme
  sentiment: 'positive' | 'neutral' | 'alert'
  /** Relevantie 0..100 (magnitude-gedreven). */
  score: number
  /** 2-4 formuleringen; de engine roteert per maand. */
  variants: Array<(v: Voice) => StarterVariant>
}

const MAX_STARTERS = 5
const MIN_STARTERS = 2
const MAX_PER_THEME = 2

function materialize(c: StarterCandidate, v: Voice, monthIndex: number): GesprekStarterData {
  const n = c.variants.length
  if (n === 0) throw new Error(`StarterCandidate "${c.id}" heeft geen varianten`)
  const idx = ((monthIndex % n) + n) % n // veilig voor negatieve monthIndex
  const variant = c.variants[idx](v)
  return {
    id: c.id,
    sentiment: c.sentiment,
    vraag: variant.vraag,
    context: variant.context,
    actie: variant.actie,
    vrijheidstijd: variant.vrijheidstijd,
  }
}

/**
 * Kies de te tonen starters: score-gesorteerd, max 2 per thema, en aangevuld
 * tot MIN_STARTERS uit fallback (best-effort — niet gegarandeerd als de
 * fallback-lijst te kort is), max 5. Variant gekozen via maand-rotatie.
 */
export function selectStarters(
  candidates: StarterCandidate[],
  voice: Voice,
  monthIndex: number,
  fallback: StarterCandidate[],
): GesprekStarterData[] {
  const sorted = [...candidates].sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id),
  )

  const perTheme: Record<string, number> = {}
  const chosen: StarterCandidate[] = []
  for (const c of sorted) {
    if (chosen.length >= MAX_STARTERS) break
    const used = perTheme[c.theme] || 0
    if (used >= MAX_PER_THEME) continue
    perTheme[c.theme] = used + 1
    chosen.push(c)
  }

  for (const f of fallback) {
    if (chosen.length >= MIN_STARTERS) break
    if (chosen.some(c => c.id === f.id)) continue
    chosen.push(f)
  }

  return chosen.slice(0, MAX_STARTERS).map(c => materialize(c, voice, monthIndex))
}

// ── Util ───────────────────────────────────────────────────────────────
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

// ── Input ──────────────────────────────────────────────────────────────

export interface GespreksstartersInput {
  audience: Audience
  /** Absolute maandteller (year*12 + month) → rotatie schuift elke maand. */
  monthIndex: number

  netWorth: number
  /**
   * Brutobezit: som van de actieve bezittingen (gewogen met
   * net_worth_inclusion_pct) plus losse bankrekeningen — dus vóór aftrek van
   * schulden. Dit is de enige juiste noemer voor een AANDEEL-vraag: `netWorth`
   * is bezit MÍNUS schulden, dus een woning met hypotheek is groter dan het
   * netto vermogen en leverde percentages boven de 100% op.
   */
  totalAssets: number
  netWorthTrend: number          // laatste − vorige snapshot
  prevNetWorth: number
  monthlyIncome: number
  monthlyExpenses: number
  prevMonthIncome: number
  prevMonthExpenses: number
  monthlySavings: number
  prevMonthlySavings: number
  /**
   * De maand vóór de vorige. De starters die twee maanden VERGELIJKEN gebruiken
   * bewust `prevMonth*` naast deze velden en NOOIT de lopende maand: die is bij
   * een check-in begin van de maand een paar dagen oud, en dan meldt een
   * vergelijking "je gaf 97% minder uit dan vorige maand — vrijheidsdagen
   * gewonnen!" over niets anders dan een nog niet verstreken maand (B-016).
   */
  monthBeforePrevExpenses: number
  monthBeforePrevSavings: number
  /**
   * De GEMETEN 6-maands transactiequote (`computeSavingsRate6m`), NIET de
   * effectieve spaarquote die de app-oppervlakken tonen (ADR 0103 /
   * eigenaar-besluit 31 aug 2026). Dat is hier bewust: de gespreksstarters zetten
   * dit getal steeds naast een gemeten maandbedrag, en elke tekst die 'm gebruikt
   * benoemt het venster ("6-maands", "over 6 maanden") — de enige toegestane
   * plek voor de meting. Gebruik hem NOOIT in een zin die 'm als "je spaarquote"
   * presenteert; dat getal is `effectiveSavingsRatePct`.
   */
  savingsRate6m: number
  dailyExpenses: number

  goals: Array<{
    name: string; current: number; target: number;
    completed: boolean; targetDate: string | null
  }>
  totalDebts: number
  debtCount: number
  completedActionsThisMonth: number
  completedActionsFreedomDays: number
  pendingActionsCount: number

  fireAge: number | null
  prevFireAge: number | null
  expensesByCategory: Array<{ name: string; amount: number; prevAmount: number; limit: number | null }>
  newRecurring: Array<{ name: string; monthlyAmount: number }>
  topAsset: { name: string; value: number } | null
}

type Detector = (input: GespreksstartersInput) => StarterCandidate[]

// ── Behouden detectoren ────────────────────────────────────────────────

const detectVermogen: Detector = (i) => {
  if (i.dailyExpenses <= 0 || Math.abs(i.netWorthTrend) < 50) return []
  const days = freedomDays(i.netWorthTrend, i.dailyExpenses)
  if (i.netWorthTrend > 0) {
    const eur = formatEUR(i.netWorthTrend)
    return [{
      id: 'vermogen-groei', theme: 'vermogen', sentiment: 'positive',
      score: clamp(days * 1.5, 5, 100),
      variants: [
        (v) => ({
          vraag: `${v.subjCap} ${v.poss} vermogen is gegroeid met ${eur} — dat zijn ${days} extra vrijheidsdagen. Waar ${v.wil} ${v.subj} die vrijheid aan besteden?`,
          context: `Netto vermogen steeg van ${formatEUR(i.prevNetWorth)} naar ${formatEUR(i.netWorth)}.`,
          actie: `Bespreek ${v.samen} wat de volgende financiële mijlpaal zou kunnen zijn.`,
          vrijheidstijd: freedomLabel(days),
        }),
        (v) => ({
          vraag: `${eur} erbij deze maand — ${freedomLabel(days)} dichter bij volledige vrijheid. Wat ${v.heb} ${v.subj} goed gedaan?`,
          context: `Vermogensgroei van ${eur} sinds de vorige check-in.`,
          actie: `Benoem ${v.samen} de keuze die het meeste bijdroeg.`,
          vrijheidstijd: freedomLabel(days),
        }),
        (v) => ({
          vraag: `${v.subjCap} ${v.poss} vermogen groeide met ${eur}. Verandert dat hoe ${v.subj} naar ${v.poss} doelen ${v.wilt} kijken?`,
          context: `Van ${formatEUR(i.prevNetWorth)} naar ${formatEUR(i.netWorth)}.`,
          actie: `Toets ${v.samen} of een doel sneller haalbaar is geworden.`,
          vrijheidstijd: freedomLabel(days),
        }),
      ],
    }]
  }
  const eur = formatEUR(Math.abs(i.netWorthTrend))
  return [{
    id: 'vermogen-daling', theme: 'vermogen', sentiment: 'alert',
    score: clamp(days * 1.5 + 10, 15, 100),
    variants: [
      (v) => ({
        vraag: `${v.subjCap} ${v.poss} vermogen is deze maand ${eur} gedaald. Hoe ${v.voelt} daarover, en is er een oorzaak die ${v.subj} ${v.samen} ${v.wilt} aanpakken?`,
        context: `Netto vermogen daalde met ${eur} (${days} vrijheidsdagen).`,
        actie: `Kijk ${v.samen} of het eenmalig was of structureel.`,
        vrijheidstijd: freedomLabel(days),
      }),
      (v) => ({
        vraag: `${eur} eraf deze maand. Was dat een bewuste investering of een tegenvaller?`,
        context: `Vermogensdaling van ${eur} sinds de vorige check-in.`,
        actie: `Bepaal ${v.samen} of er actie nodig is.`,
        vrijheidstijd: freedomLabel(days),
      }),
    ],
  }]
}

const detectSparenVergelijking: Detector = (i) => {
  // ── VOLGORDE: acuut vóór historisch ────────────────────────────────────────
  // "Deze maand ging er meer uit dan er binnenkwam" is een toestand van NU en
  // weegt zwaarder dan "je spaarde minder dan de maand daarvoor". Deze tak stond
  // onderaan en werd toen afgeschermd doordat de vergelijking hierboven al
  // returnde; dat kon pas gebeuren nadat de vergelijking op afgeronde maanden
  // overging (B-016) — daarvóór sloot haar guard op `monthlySavings > 0` dit
  // geval per ongeluk uit. Expliciet vooraan gezet i.p.v. impliciet vrijgelaten.
  if (i.monthlySavings <= 0 && i.monthlyIncome > 0) {
    return [{
      id: 'negatief-sparen', theme: 'sparen', sentiment: 'alert',
      score: 78,
      variants: [
        (v) => ({
          vraag: `Deze maand ${v.heb} ${v.subj} meer uitgegeven dan er binnenkwam. Dat kan bewust zijn — maar is het hoe ${v.subj} het ${v.wilt}? Welk klein bedrag zou ${v.subj} volgende maand wél opzij kunnen zetten?`,
          context: `Uitgaven (${formatEUR(i.monthlyExpenses)}) overschreden inkomen (${formatEUR(i.monthlyIncome)}).`,
          actie: `Spreek ${v.samen} een realistisch minimaal spaarbedrag af.`,
        }),
        (v) => ({
          vraag: `Rood deze maand: ${formatEUR(i.monthlyExpenses - i.monthlyIncome)} meer uit dan in. Eenmalig of een patroon?`,
          context: `Inkomen ${formatEUR(i.monthlyIncome)} vs uitgaven ${formatEUR(i.monthlyExpenses)}.`,
          actie: `Bepaal ${v.samen} één concrete bijsturing.`,
        }),
      ],
    }]
  }
  // Afgelopen maand t.o.v. de maand daarvóór — twee VOLLEDIGE maanden. Zie de
  // toelichting bij monthBeforePrev* in GespreksstartersInput.
  if (i.prevMonthlySavings > 0 && i.monthBeforePrevSavings > 0) {
    const delta = i.prevMonthlySavings - i.monthBeforePrevSavings
    if (delta > 50) {
      const extraDays = freedomDays(delta * 12, i.dailyExpenses)
      const eur = formatEUR(delta)
      return [{
        id: 'sparen-stijging', theme: 'sparen', sentiment: 'positive',
        score: clamp(delta / 8, 10, 90),
        variants: [
          (v) => ({
            vraag: `${v.subjCap} ${v.hebt} afgelopen maand ${eur} meer gespaard dan de maand daarvoor. Op jaarbasis is dat ${freedomLabel(extraDays)} extra vrijheid. Welke keuze maakte het verschil?`,
            context: `Spaarquote: ${i.savingsRate6m.toFixed(0)}% (6-maands).`,
            actie: `Bespreek welke uitgaven ${v.subj} bewust ${v.hebt} verminderd.`,
            vrijheidstijd: freedomLabel(extraDays),
          }),
          (v) => ({
            vraag: `${eur} meer opzij dan de maand daarvoor — ${freedomLabel(extraDays)} extra vrijheid per jaar. Houdbaar?`,
            context: `Maandbesparing steeg met ${eur}.`,
            actie: `Toets ${v.samen} of dit tempo vol te houden is.`,
            vrijheidstijd: freedomLabel(extraDays),
          }),
        ],
      }]
    }
    if (delta < -50) {
      const eur = formatEUR(i.prevMonthlySavings)
      const prev = formatEUR(i.monthBeforePrevSavings)
      return [{
        id: 'sparen-daling', theme: 'sparen', sentiment: 'neutral',
        score: clamp(Math.abs(delta) / 12, 8, 70),
        variants: [
          (v) => ({
            vraag: `De maandelijkse besparing daalde van ${prev} naar ${eur}. Was dat een bewuste keuze, of onverwachte kosten?`,
            context: `Verschil: ${formatEUR(delta)} minder gespaard.`,
            actie: `Kijk ${v.samen} of ${v.subj} volgende maand terug ${v.wilt} naar het oude niveau.`,
          }),
          (v) => ({
            vraag: `${prev} → ${eur} gespaard. Wat veranderde er afgelopen maand?`,
            context: `Maandbesparing daalde met ${formatEUR(Math.abs(delta))}.`,
            actie: `Benoem ${v.samen} de grootste verschuiving.`,
          }),
        ],
      }]
    }
    return []
  }
  return []
}

const detectUitgaven: Detector = (i) => {
  // Twee VOLLEDIGE maanden tegenover elkaar: afgelopen maand vs. de maand
  // daarvóór. Stond hier als lopende maand vs. vorige maand, wat bij een
  // check-in op de 4e van de maand een daling van ~97% "vond" en die vierde als
  // gewonnen vrijheidsdagen (B-016).
  if (i.monthBeforePrevExpenses <= 0 || i.prevMonthExpenses <= 0) return []
  const change = ((i.prevMonthExpenses - i.monthBeforePrevExpenses) / i.monthBeforePrevExpenses) * 100
  if (change > 15) {
    const extra = i.prevMonthExpenses - i.monthBeforePrevExpenses
    const days = freedomDays(extra * 12, i.dailyExpenses)
    return [{
      id: 'uitgaven-stijging', theme: 'uitgaven', sentiment: 'neutral',
      score: clamp(change, 15, 85),
      variants: [
        (v) => ({
          vraag: `${v.subjCap} ${v.poss} uitgaven waren afgelopen maand ${change.toFixed(0)}% hoger dan de maand daarvoor. Dat verschil (${formatEUR(extra)}) is op jaarbasis ${freedomLabel(days)}. Welke uitgaven voelden waardevol?`,
          context: `Van ${formatEUR(i.monthBeforePrevExpenses)} naar ${formatEUR(i.prevMonthExpenses)}.`,
          actie: `Loop ${v.samen} de grootste categorieën door.`,
        }),
        (v) => ({
          vraag: `${formatEUR(extra)} meer uitgegeven dan de maand daarvoor (+${change.toFixed(0)}%). Bewust of geslopen?`,
          context: `Maanduitgaven stegen naar ${formatEUR(i.prevMonthExpenses)}.`,
          actie: `Markeer ${v.samen} wat de moeite waard was.`,
        }),
      ],
    }]
  }
  if (change < -10) {
    const saved = i.monthBeforePrevExpenses - i.prevMonthExpenses
    const days = freedomDays(saved, i.dailyExpenses)
    return [{
      id: 'uitgaven-daling', theme: 'uitgaven', sentiment: 'positive',
      score: clamp(days * 2, 10, 85),
      variants: [
        (v) => ({
          vraag: `${v.subjCap} ${v.hebt} afgelopen maand ${formatEUR(saved)} minder uitgegeven dan de maand daarvoor — ${days} vrijheidsdagen gewonnen! Wat ${v.heb} ${v.subj} anders gedaan?`,
          context: `Uitgaven daalden ${Math.abs(change).toFixed(0)}%.`,
          actie: `Bespreek of ${v.subj} dit patroon ${v.wilt} vasthouden.`,
          vrijheidstijd: `${days} dagen`,
        }),
        (v) => ({
          vraag: `${formatEUR(saved)} minder uitgegeven — ${freedomLabel(days)} vrijheid erbij. Welke gewoonte hielp?`,
          context: `Uitgaven daalden ${Math.abs(change).toFixed(0)}% t.o.v. de maand daarvoor.`,
          actie: `Leg ${v.samen} vast wat ${v.subj} wilt herhalen.`,
          vrijheidstijd: `${days} dagen`,
        }),
      ],
    }]
  }
  return []
}

const detectDoelen: Detector = (i) => {
  const active = i.goals.filter(g => !g.completed && g.target > 0)
  if (active.length === 0) return []
  const closest = active
    .map(g => ({ ...g, pct: (g.current / g.target) * 100 }))
    .sort((a, b) => b.pct - a.pct)[0]
  if (closest.pct >= 50 && closest.pct < 100) {
    const remaining = closest.target - closest.current
    const days = i.dailyExpenses > 0 ? freedomDays(remaining, i.dailyExpenses) : 0
    return [{
      id: 'doel-bijna', theme: 'doelen', sentiment: 'positive',
      score: clamp(closest.pct, 50, 95),
      variants: [
        (v) => ({
          vraag: `${v.subjCap} ${v.bent} al ${closest.pct.toFixed(0)}% op weg naar "${closest.name}". Nog ${formatEUR(remaining)} te gaan! Hoe ${v.wil} ${v.subj} dit ${v.samen} vieren als het lukt?`,
          context: `Doel "${closest.name}": ${formatEUR(closest.current)} van ${formatEUR(closest.target)}.`,
          actie: `Spreek een kleine beloning af bij het bereiken.`,
          vrijheidstijd: days > 0 ? freedomLabel(days) : undefined,
        }),
        (v) => ({
          vraag: `"${closest.name}" staat op ${closest.pct.toFixed(0)}%. Wat is de laatste zet om het af te maken?`,
          context: `Nog ${formatEUR(remaining)} tot het doel.`,
          actie: `Plan ${v.samen} de resterende stortingen.`,
          vrijheidstijd: days > 0 ? freedomLabel(days) : undefined,
        }),
      ],
    }]
  }
  if (closest.pct < 20) {
    return [{
      id: 'doel-start', theme: 'doelen', sentiment: 'neutral',
      score: 30,
      variants: [
        (v) => ({
          vraag: `${v.subjCap} doel "${closest.name}" staat op ${closest.pct.toFixed(0)}%. Welk concreet bedrag ${v.kun} ${v.subj} per maand opzij leggen om sneller op koers te komen?`,
          context: `Doel "${closest.name}" is net gestart.`,
          actie: `Stel ${v.samen} een automatische maandstorting in.`,
        }),
        (v) => ({
          vraag: `"${closest.name}" is net begonnen. Wat maakt dit doel belangrijk genoeg om vol te houden?`,
          context: `Voortgang: ${closest.pct.toFixed(0)}%.`,
          actie: `Benoem ${v.samen} het "waarom" achter dit doel.`,
        }),
      ],
    }]
  }
  return []
}

const detectSchulden: Detector = (i) => {
  if (i.debtCount <= 0 || i.totalDebts <= 0 || i.dailyExpenses <= 0) return []
  const days = freedomDays(i.totalDebts, i.dailyExpenses)
  return [{
    id: 'schulden-vrijheid', theme: 'schulden', sentiment: 'neutral',
    score: clamp(days / 3, 10, 60),
    variants: [
      (v) => ({
        vraag: `${v.subjCap} ${v.poss} totale schuld is ${formatEUR(i.totalDebts)} — dat is ${freedomLabel(days)} aan vrijheid die ${v.subj} nog terugkopen. Welke schuld ${v.wil} ${v.subj} het eerste aanpakken?`,
        context: `${i.debtCount} ${i.debtCount === 1 ? 'schuld' : 'schulden'}, totaal ${formatEUR(i.totalDebts)}.`,
        actie: `Bespreek ${v.samen} een extra aflossing op de duurste schuld.`,
        vrijheidstijd: freedomLabel(days),
      }),
      (v) => ({
        vraag: `${formatEUR(i.totalDebts)} schuld = ${freedomLabel(days)} teruggekochte vrijheid. Welke aflossing geeft de meeste rust?`,
        context: `Totale schuldenlast over ${i.debtCount} ${i.debtCount === 1 ? 'schuld' : 'schulden'}.`,
        actie: `Kies ${v.samen} de eerstvolgende schuld om op te focussen.`,
        vrijheidstijd: freedomLabel(days),
      }),
    ],
  }]
}

const detectActies: Detector = (i) => {
  if (i.completedActionsThisMonth > 0) {
    const fd = i.completedActionsFreedomDays
    const n = i.completedActionsThisMonth
    return [{
      id: 'acties-momentum', theme: 'acties', sentiment: 'positive',
      score: clamp(fd * 2 + n * 5, 15, 85),
      variants: [
        (v) => ({
          vraag: `${v.subjCap} ${v.hebt} deze maand ${n} ${n === 1 ? 'actie' : 'acties'} afgerond${fd > 0 ? ` en ${fd} vrijheidsdagen verdiend` : ''}. Welke had de meeste impact?`,
          context: `${n} afgeronde ${n === 1 ? 'actie' : 'acties'} deze maand.`,
          actie: `Kies ${v.samen} de volgende actie.`,
          vrijheidstijd: fd > 0 ? `${fd} dagen` : undefined,
        }),
        (v) => ({
          vraag: `${n} ${n === 1 ? 'actie' : 'acties'} afgevinkt deze maand. Wat gaf het beste gevoel?`,
          context: `Afgeronde acties: ${n}.`,
          actie: `Plan ${v.samen} de volgende stap.`,
          vrijheidstijd: fd > 0 ? `${fd} dagen` : undefined,
        }),
      ],
    }]
  }
  if (i.pendingActionsCount > 0) {
    const n = i.pendingActionsCount
    return [{
      id: 'acties-openstaand', theme: 'acties', sentiment: 'neutral',
      score: 25,
      variants: [
        (v) => ({
          vraag: `Er staan ${n} openstaande ${n === 1 ? 'actie' : 'acties'} klaar. Welke ${v.wil} ${v.subj} deze maand ${v.samen} oppakken?`,
          context: `${n} aanbevolen acties wachten.`,
          actie: `Kies ${v.samen} 1 actie en plan een moment.`,
        }),
        (v) => ({
          vraag: `${n} acties op de plank. Welke geeft de grootste sprong richting vrijheid?`,
          context: `${n} openstaande aanbevelingen.`,
          actie: `Prioriteer ${v.samen} de eerstvolgende.`,
        }),
      ],
    }]
  }
  return []
}

const detectSparenVrijheid: Detector = (i) => {
  if (i.monthlySavings <= 100 || i.dailyExpenses <= 0) return []
  const days = freedomDays(i.monthlySavings, i.dailyExpenses)
  return [{
    id: 'sparen-vrijheid', theme: 'sparen', sentiment: 'positive',
    score: clamp(days * 1.5, 8, 70),
    variants: [
      (v) => ({
        vraag: `${v.subjCap} ${v.hebt} deze maand ${formatEUR(i.monthlySavings)} gespaard — dat zijn ${days} nieuwe vrijheidsdagen. Hoe ${v.voelt} daarover?`,
        context: `6-maands spaarquote (gemeten): ${i.savingsRate6m.toFixed(0)}% van het inkomen.`,
        actie: `Bespreek of ${v.subj} tevreden ${v.bent} of ${v.wilt} versnellen.`,
        vrijheidstijd: `${days} dagen`,
      }),
      (v) => ({
        vraag: `${formatEUR(i.monthlySavings)} opzij = ${days} vrijheidsdagen erbij. Tevreden met dit tempo?`,
        context: `6-maands spaarquote: ${i.savingsRate6m.toFixed(0)}%.`,
        actie: `Bepaal ${v.samen} of het tempo omhoog kan.`,
        vrijheidstijd: `${days} dagen`,
      }),
    ],
  }]
}

// ── Nieuwe detectoren A ────────────────────────────────────────────────

const detectFire: Detector = (i) => {
  if (i.fireAge == null || i.prevFireAge == null) return []
  const delta = i.fireAge - i.prevFireAge // negatief = eerder vrij
  if (delta <= -1) {
    const yrs = Math.round(Math.abs(delta))
    return [{
      id: 'fire-versnelling', theme: 'fire', sentiment: 'positive',
      score: clamp(yrs * 20, 20, 90),
      variants: [
        (v) => ({
          vraag: `${v.subjCap} ${v.bent} ${yrs} jaar dichter bij volledige vrijheid dan vorige maand (FIRE rond ${i.fireAge}). Wat zette dat in beweging?`,
          context: `Geschatte FIRE-leeftijd: ${i.prevFireAge} → ${i.fireAge}.`,
          actie: `Benoem ${v.samen} de keuze die het meeste hielp.`,
        }),
        (v) => ({
          vraag: `FIRE schoof ${yrs} jaar naar voren. Hoe ${v.voelt} bij dat tempo?`,
          context: `FIRE-leeftijd daalde naar ${i.fireAge}.`,
          actie: `Bespreek of ${v.subj} dit tempo ${v.wilt} vasthouden.`,
        }),
      ],
    }]
  }
  if (delta >= 1) {
    const yrs = Math.round(delta)
    return [{
      id: 'fire-vertraging', theme: 'fire', sentiment: 'alert',
      score: clamp(yrs * 20 + 5, 25, 90),
      variants: [
        (v) => ({
          vraag: `${v.subjCap} geschatte FIRE-leeftijd schoof ${yrs} jaar op (naar ${i.fireAge}). Is er iets veranderd dat ${v.subj} ${v.samen} ${v.wilt} bespreken?`,
          context: `FIRE-leeftijd: ${i.prevFireAge} → ${i.fireAge}.`,
          actie: `Kijk ${v.samen} of het door uitgaven of een eenmalige post komt.`,
        }),
        (v) => ({
          vraag: `Volledige vrijheid kwam ${yrs} jaar verder weg te liggen. Eenmalig of structureel?`,
          context: `FIRE-leeftijd steeg naar ${i.fireAge}.`,
          actie: `Bepaal ${v.samen} of bijsturen nodig is.`,
        }),
      ],
    }]
  }
  return []
}

const detectSpaarquoteTrend: Detector = (i) => {
  if (i.savingsRate6m >= 25) {
    return [{
      id: 'spaarquote-sterk', theme: 'sparen', sentiment: 'positive',
      score: clamp(i.savingsRate6m, 25, 80),
      variants: [
        (v) => ({
          vraag: `${v.subjCap} ${v.poss} spaarquote staat op ${i.savingsRate6m.toFixed(0)}% over 6 maanden — flink boven gemiddeld. Wat maakt dat mogelijk?`,
          context: `6-maands spaarquote: ${i.savingsRate6m.toFixed(0)}%.`,
          actie: `Bespreek ${v.samen} of dit comfortabel voelt of te streng.`,
        }),
        (v) => ({
          vraag: `${i.savingsRate6m.toFixed(0)}% spaarquote over de laatste zes maanden — sterk. Voelt de balans tussen nu en later goed?`,
          context: `Gemiddeld over 6 maanden.`,
          actie: `Toets ${v.samen} of ${v.subj} ook genoeg ${v.subj === 'je' ? 'geniet' : 'genieten'}.`,
        }),
      ],
    }]
  }
  if (i.savingsRate6m > 0 && i.savingsRate6m < 10) {
    return [{
      id: 'spaarquote-laag', theme: 'sparen', sentiment: 'neutral',
      score: clamp(15 - i.savingsRate6m, 8, 55),
      variants: [
        (v) => ({
          vraag: `${v.subjCap} ${v.poss} spaarquote ligt op ${i.savingsRate6m.toFixed(0)}% over 6 maanden. Welke kleine stap zou die kunnen verhogen?`,
          context: `6-maands spaarquote: ${i.savingsRate6m.toFixed(0)}%.`,
          actie: `Kies ${v.samen} één uitgave om bij te sturen.`,
        }),
        (v) => ({
          vraag: `Met ${i.savingsRate6m.toFixed(0)}% spaarquote over zes maanden bouwt vrijheid langzaam op. Bewuste keuze of ruimte voor meer?`,
          context: `Gemiddeld over 6 maanden.`,
          actie: `Bepaal ${v.samen} een haalbaar streefpercentage.`,
        }),
      ],
    }]
  }
  return []
}

const detectBudgetcategorie: Detector = (i) => {
  const over = i.expensesByCategory
    .filter(c => c.limit != null && c.limit > 0 && c.amount > c.limit)
    .map(c => ({ ...c, over: c.amount - (c.limit as number) }))
    .sort((a, b) => b.over - a.over)[0]
  if (!over) return []
  const pctOver = Math.round((over.over / (over.limit as number)) * 100)
  const days = freedomDays(over.over, i.dailyExpenses)
  return [{
    id: 'budgetcategorie-uitschieter', theme: 'uitgaven', sentiment: 'neutral',
    score: clamp(pctOver, 10, 80),
    variants: [
      (v) => ({
        vraag: `"${over.name}" ging het meest over budget deze maand (${formatEUR(over.amount)} van ${formatEUR(over.limit as number)}). Wat zat daarachter?`,
        context: `${pctOver}% over budget in ${over.name}.`,
        actie: `Bespreek ${v.samen} of het budget of het gedrag moet bijstellen.`,
        vrijheidstijd: days > 0 ? `${days} dagen` : undefined,
      }),
      (v) => ({
        vraag: `${over.name} schoot er ${formatEUR(over.over)} overheen. Eenmalig, of structureel te krap begroot?`,
        context: `${formatEUR(over.amount)} t.o.v. ${formatEUR(over.limit as number)} budget.`,
        actie: `Beslis ${v.samen}: budget verhogen of uitgave verlagen.`,
        vrijheidstijd: days > 0 ? `${days} dagen` : undefined,
      }),
    ],
  }]
}

const detectNieuweVasteLast: Detector = (i) => {
  if (i.newRecurring.length === 0) return []
  const top = [...i.newRecurring].sort((a, b) => b.monthlyAmount - a.monthlyAmount)[0]
  const annual = top.monthlyAmount * 12
  const days = freedomDays(annual, i.dailyExpenses)
  return [{
    id: 'nieuwe-vaste-last', theme: 'uitgaven', sentiment: 'neutral',
    score: clamp(days, 8, 60),
    variants: [
      (v) => ({
        vraag: `Er is een nieuwe vaste last: ${top.name} (${formatEUR(top.monthlyAmount)}/maand = ${freedomLabel(days)} per jaar). Is die bewust en de moeite waard?`,
        context: `Nieuw terugkerend: ${top.name}.`,
        actie: `Bevestig ${v.samen} of ${v.subj} ${top.name} ${v.wilt} houden.`,
        vrijheidstijd: freedomLabel(days),
      }),
      (v) => ({
        vraag: `${top.name} is een nieuwe maandelijkse uitgave (${formatEUR(top.monthlyAmount)}). Op jaarbasis ${freedomLabel(days)} vrijheid — past dat?`,
        context: `Nieuwe vaste last gedetecteerd.`,
        actie: `Toets ${v.samen} of dit abonnement blijft.`,
        vrijheidstijd: freedomLabel(days),
      }),
    ],
  }]
}

// ── Nieuwe detectoren B ────────────────────────────────────────────────

const detectDoelDeadline: Detector = (i) => {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const candidates = i.goals
    .filter(g => !g.completed && g.targetDate && g.targetDate >= todayStr && g.target > 0)
    .map(g => {
      const daysUntil = Math.ceil(
        (new Date(g.targetDate as string).getTime() - today.getTime()) / 86400000,
      )
      const pct = (g.current / g.target) * 100
      return { ...g, daysUntil, pct }
    })
    .filter(g => g.daysUntil <= 60 && g.pct < 75)
    .sort((a, b) => a.daysUntil - b.daysUntil)
  const g = candidates[0]
  if (!g) return []
  const remaining = g.target - g.current
  return [{
    id: 'doel-deadline', theme: 'doelen',
    sentiment: g.daysUntil <= 14 ? 'alert' : 'neutral',
    score: clamp(60 - g.daysUntil + (75 - g.pct), 15, 88),
    variants: [
      (v) => ({
        vraag: `Doel "${g.name}" heeft nog ${g.daysUntil} dagen te gaan en staat op ${g.pct.toFixed(0)}%. Is de deadline nog haalbaar, of ${v.wil} ${v.subj} 'm bijstellen?`,
        context: `Nog ${formatEUR(remaining)} tot "${g.name}", deadline over ${g.daysUntil} dagen.`,
        actie: `Beslis ${v.samen}: tempo verhogen of deadline verschuiven.`,
      }),
      (v) => ({
        vraag: `"${g.name}" loopt af over ${g.daysUntil} dagen (nu ${g.pct.toFixed(0)}%). Wat is realistisch?`,
        context: `Resterend: ${formatEUR(remaining)}.`,
        actie: `Maak ${v.samen} een realistisch eindplan voor dit doel.`,
      }),
    ],
  }]
}

// Aandeel van de grootste bezitting in het TOTALE BEZIT — niet in het netto
// vermogen. Netto vermogen is bezit min schulden, dus een woning van €1,0 mln
// met hypotheek "was" 179% van een netto vermogen van €559k: een aandeel dat
// rekenkundig niet kan bestaan. De noemer is daarom `totalAssets` (bruto), en
// het aandeel wordt geklemd op 100% zodat afrondings-/inclusieverschillen
// tussen de post en het totaal nooit opnieuw boven de 100% uitkomen.
const detectVermogensconcentratie: Detector = (i) => {
  if (!i.topAsset || i.totalAssets <= 0) return []
  const pct = clamp((i.topAsset.value / i.totalAssets) * 100, 0, 100)
  if (pct < 60) return []
  return [{
    id: 'vermogensconcentratie', theme: 'vermogen', sentiment: 'neutral',
    score: clamp(pct - 50, 10, 70),
    variants: [
      (v) => ({
        vraag: `"${i.topAsset!.name}" is ${pct.toFixed(0)}% van ${v.poss} bezittingen. Voelt die concentratie comfortabel, of ${v.wil} ${v.subj} meer spreiding?`,
        context: `${formatEUR(i.topAsset!.value)} van ${formatEUR(i.totalAssets)} aan bezittingen.`,
        actie: `Bespreek ${v.samen} of spreiding gewenst is.`,
      }),
      (v) => ({
        vraag: `Het grootste deel van ${v.poss} bezittingen (${pct.toFixed(0)}%) zit in "${i.topAsset!.name}". Wat als die waarde sterk schommelt?`,
        context: `Concentratie: ${pct.toFixed(0)}% in één post.`,
        actie: `Weeg ${v.samen} het risico van die concentratie.`,
      }),
    ],
  }]
}

const MILESTONE_STEPS = [10000, 25000, 50000, 100000, 250000, 500000, 1000000]

const detectMijlpaal: Detector = (i) => {
  if (i.netWorth <= 0) return []
  const next = MILESTONE_STEPS.find(m => m > i.netWorth)
  if (!next) return []
  const remaining = next - i.netWorth
  // Alleen "dichtbij": binnen 5% onder de volgende mijlpaal.
  if (remaining > next * 0.05) return []
  const days = freedomDays(remaining, i.dailyExpenses)
  return [{
    id: 'mijlpaal-nadering', theme: 'vermogen', sentiment: 'positive',
    score: clamp(100 - (remaining / (next * 0.05)) * 30, 40, 80),
    variants: [
      (v) => ({
        vraag: `Nog ${formatEUR(remaining)} en ${v.subj} ${v.hebt} de mijlpaal van ${formatEUR(next)} bereikt. Hoe ${v.wil} ${v.subj} dat ${v.samen} markeren?`,
        context: `Netto vermogen ${formatEUR(i.netWorth)}, volgende mijlpaal ${formatEUR(next)}.`,
        actie: `Spreek ${v.samen} een klein vier-moment af bij ${formatEUR(next)}.`,
        vrijheidstijd: days > 0 ? freedomLabel(days) : undefined,
      }),
      (v) => ({
        vraag: `${formatEUR(next)} is bijna in zicht — nog ${formatEUR(remaining)}. Wat betekent die mijlpaal voor ${v.subj}?`,
        context: `Nog ${formatEUR(remaining)} tot ${formatEUR(next)}.`,
        actie: `Benoem ${v.samen} wat de volgende mijlpaal symboliseert.`,
        vrijheidstijd: days > 0 ? freedomLabel(days) : undefined,
      }),
    ],
  }]
}

// ── Fallback (geroteerd) ───────────────────────────────────────────────
function buildFallback(_i: GespreksstartersInput): StarterCandidate[] {
  return [
    {
      id: 'algemeen-dromen', theme: 'algemeen', sentiment: 'positive', score: 0,
      variants: [
        (v) => ({
          vraag: `Als ${v.subj} volledig financieel vrij ${v.bent}, hoe ziet een ideale dinsdag eruit?`,
          context: 'Reflectiemoment over levensdoelen.',
          actie: `Schrijf ${v.audience === 'household' ? 'allebei onafhankelijk ' : ''}3 dingen op die ${v.subj} dan zou doen.`,
        }),
        (v) => ({
          vraag: `Stel: geld is geen zorg meer. Wat verandert er morgen in ${v.poss} dag?`,
          context: 'Visie op vrijheid.',
          actie: `Noteer ${v.samen} één ding dat ${v.subj} nú al kan proeven.`,
        }),
      ],
    },
    {
      id: 'algemeen-waarden', theme: 'algemeen', sentiment: 'neutral', score: 0,
      variants: [
        (v) => ({
          vraag: `Welke uitgave van afgelopen maand bracht ${v.subj} het meeste voldoening? En welke het minste?`,
          context: 'Reflectie over bewust besteden.',
          actie: `Identificeer ${v.samen} een terugkerende uitgave die niet bijdraagt.`,
        }),
        (v) => ({
          vraag: `Welke euro van vorige maand zou ${v.subj} zo weer uitgeven — en welke niet?`,
          context: 'Waarden achter bestedingen.',
          actie: `Kies ${v.samen} één uitgave om te schrappen of te vieren.`,
        }),
      ],
    },
  ]
}

// ── Hoofdentry ─────────────────────────────────────────────────────────
const DETECTORS: Detector[] = [
  detectVermogen,
  detectSparenVergelijking,
  detectUitgaven,
  detectDoelen,
  detectSchulden,
  detectActies,
  detectSparenVrijheid,
  detectFire,
  detectSpaarquoteTrend,
  detectBudgetcategorie,
  detectNieuweVasteLast,
  detectDoelDeadline,
  detectVermogensconcentratie,
  detectMijlpaal,
]

export function buildGespreksstarters(input: GespreksstartersInput): GesprekStarterData[] {
  const voice = buildVoice(input.audience)
  const candidates = DETECTORS.flatMap(d => d(input))
  return selectStarters(candidates, voice, input.monthIndex, buildFallback(input))
}

/** Alle onderwerp-id's die de engine kan produceren (voor tests/registry). */
export const STARTER_IDS = [
  'vermogen-groei', 'vermogen-daling',
  'sparen-stijging', 'sparen-daling', 'negatief-sparen',
  'uitgaven-stijging', 'uitgaven-daling',
  'doel-bijna', 'doel-start',
  'schulden-vrijheid',
  'acties-momentum', 'acties-openstaand',
  'sparen-vrijheid',
  'fire-versnelling', 'fire-vertraging',
  'spaarquote-sterk', 'spaarquote-laag',
  'budgetcategorie-uitschieter',
  'nieuwe-vaste-last',
  'doel-deadline',
  'vermogensconcentratie',
  'mijlpaal-nadering',
  'algemeen-dromen', 'algemeen-waarden',
] as const

