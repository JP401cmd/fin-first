import { Wallet, Flame, RefreshCw, Lightbulb, BarChart3, Trophy, ArrowUpCircle } from 'lucide-react'
import { DEFAULT_MATRIX, FEATURES, PHASES, type FeatureDef } from '@/lib/feature-phases'

// ── Temporal Balance levels ──────────────────────────────────────────

export const temporalLevels = [
  {
    level: 1,
    icon: '\uD83D\uDD25',
    name: 'The Hedonist',
    nameNl: 'De Levensgenieter',
    tagline: 'Burn Bright Now.',
    description:
      'Je wilt niet inleveren op comfort. FIRE is een leuke bonus, geen obsessie. Comfort > Snelheid.',
  },
  {
    level: 2,
    icon: '\uD83E\uDDED',
    name: 'The Voyager',
    nameNl: 'De Reiziger',
    tagline: 'Enjoy the Journey.',
    description:
      'Je spaart wat overblijft. Ervaringen en herinneringen gaan voor. Balans, licht hellend naar nu.',
  },
  {
    level: 3,
    icon: '\u2696\uFE0F',
    name: 'The Architect',
    nameNl: 'De Architect',
    tagline: 'Build with Balance.',
    description:
      'Je optimaliseert bewust. Bereid luxe op te offeren als het tijd oplevert, maar geen kluizenaar. De gulden middenweg.',
  },
  {
    level: 4,
    icon: '\uD83C\uDFDB\uFE0F',
    name: 'The Stoic',
    nameNl: 'De Sto\u00efcijn',
    tagline: 'Discipline is Freedom.',
    description:
      'Je haalt plezier uit soberheid en efficiency. Streng en doelgericht. Snelheid > Comfort.',
  },
  {
    level: 5,
    icon: '\uD83D\uDC8E',
    name: 'The Essentialist',
    nameNl: 'De Essentialist',
    tagline: 'Pure Focus.',
    description:
      'Alles wat niet essentieel is, moet weg. Minimalistisch leven voor maximale snelheid naar vrijheid.',
  },
]

// ── Chronology Scale ─────────────────────────────────────────────────

export type ChronologyLevel = {
  level: number
  name: string
  focus: string
  metaphor: string
  phase: number
}

export const chronologyPhases = [
  { phase: 1, name: 'Recovery', subtitle: 'Restoring Balance', color: 'rose' },
  { phase: 2, name: 'Stability', subtitle: 'Fortifying Time', color: 'blue' },
  { phase: 3, name: 'Momentum', subtitle: 'Multiplying Time', color: 'teal' },
  { phase: 4, name: 'Mastery', subtitle: 'Owning Time', color: 'amber' },
] as const

export const chronologyLevels: ChronologyLevel[] = [
  { level: -2, name: 'Time Deficit', focus: 'Stop the Leak', metaphor: 'Je verliest actief tijd. Elke euro is al eigendom van iemand anders.', phase: 1 },
  { level: -1, name: 'Time Drag', focus: 'Eliminate Drag', metaphor: 'Je sleept het verleden achter je aan. Rente vertraagt je snelheid.', phase: 1 },
  { level: 0, name: 'The Reset', focus: 'Calibration', metaphor: 'Het nulpunt. De teller staat stil. Niet achteruit, nog niet vooruit.', phase: 1 },
  { level: 1, name: 'The Anchor', focus: 'Secure Foundation', metaphor: 'Het anker is uitgeworpen. Je drijft niet meer af bij storm.', phase: 2 },
  { level: 2, name: 'Time Shield', focus: 'Maximum Security', metaphor: 'Een schild van 3\u20136 maanden tijd. Externe schokken raken je niet meer.', phase: 2 },
  { level: 3, name: 'Velocity', focus: 'Acceleration', metaphor: 'Je geld genereert zijn eigen tijd. Sneller dan je alleen kunt lopen.', phase: 3 },
  { level: 4, name: 'Autonomous', focus: 'Gliding', metaphor: 'De motoren kunnen uit. Je huidige vaart bereikt de bestemming vanzelf.', phase: 3 },
  { level: 5, name: 'Sovereign', focus: 'Independence', metaphor: 'Je bezit 100% van je eigen klok. Geen tijd meer ruilen voor geld.', phase: 4 },
  { level: 6, name: 'Timeless', focus: 'Infinity', metaphor: 'Meer tijd dan je op kunt maken. Je bouwt aan de tijdlijnen van anderen.', phase: 4 },
]

// ── Phase color helpers ──────────────────────────────────────────────

export const phaseColors: Record<string, { dot: string; activeDot: string; line: string; badge: string; text: string }> = {
  rose: { dot: 'bg-rose-200', activeDot: 'bg-rose-500', line: 'bg-rose-200', badge: 'bg-rose-50 text-rose-700 border-rose-200', text: 'text-rose-600' },
  blue: { dot: 'bg-blue-200', activeDot: 'bg-blue-500', line: 'bg-blue-200', badge: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-600' },
  teal: { dot: 'bg-teal-200', activeDot: 'bg-teal-500', line: 'bg-teal-200', badge: 'bg-teal-50 text-teal-700 border-teal-200', text: 'text-teal-600' },
  amber: { dot: 'bg-amber-200', activeDot: 'bg-amber-500', line: 'bg-amber-200', badge: 'bg-amber-50 text-amber-700 border-amber-200', text: 'text-amber-600' },
}

// ── Level criteria & progress ────────────────────────────────────────

export type LevelCriteria = {
  label: string
  criteria: string[]
  progress: (data: { netWorth: number; monthsCovered: number; freedomPct: number; hasConsumerDebt: boolean }) => number
}

export const levelCriteriaMap: Record<number, LevelCriteria> = {
  [-2]: {
    label: 'Voorbij',
    criteria: ['Negatief vermogen', 'Actieve consumptieve schulden (creditcard, persoonlijke lening, etc.)'],
    progress: (d) => d.netWorth < 0 && d.hasConsumerDebt ? 100 : 0,
  },
  [-1]: {
    label: 'Voorbij',
    criteria: ['Negatief vermogen', 'Geen consumptieve schulden'],
    progress: (d) => d.netWorth < 0 && !d.hasConsumerDebt ? 100 : (d.netWorth >= 0 ? 0 : 0),
  },
  [0]: {
    label: 'Nulpunt bereikt',
    criteria: ['Vermogen \u2265 \u20AC0 (geen schulden meer)'],
    progress: (d) => {
      if (d.netWorth >= 0) return 100
      return 0
    },
  },
  [1]: {
    label: '1 maand buffer',
    criteria: ['Minimaal 1 maand aan uitgaven als buffer opzij'],
    progress: (d) => Math.min(100, Math.round((Math.max(0, d.monthsCovered) / 1) * 100)),
  },
  [2]: {
    label: '3\u20136 maanden noodfonds',
    criteria: ['Minimaal 3 maanden aan uitgaven als noodfonds'],
    progress: (d) => Math.min(100, Math.round((Math.max(0, d.monthsCovered) / 3) * 100)),
  },
  [3]: {
    label: 'Groeiend vermogen',
    criteria: ['Minimaal 6 maanden buffer', 'Vrijheidspercentage \u2265 10%'],
    progress: (d) => {
      const bufferPct = Math.min(100, (Math.max(0, d.monthsCovered) / 6) * 100)
      const freedomPct = Math.min(100, (Math.max(0, d.freedomPct) / 10) * 100)
      return Math.round((bufferPct + freedomPct) / 2)
    },
  },
  [4]: {
    label: 'Coast FIRE',
    criteria: ['Vrijheidspercentage \u2265 25%'],
    progress: (d) => Math.min(100, Math.round((Math.max(0, d.freedomPct) / 25) * 100)),
  },
  [5]: {
    label: 'Bijna onafhankelijk',
    criteria: ['Vrijheidspercentage \u2265 75%'],
    progress: (d) => Math.min(100, Math.round((Math.max(0, d.freedomPct) / 75) * 100)),
  },
  [6]: {
    label: 'Volledige onafhankelijkheid',
    criteria: ['Vrijheidspercentage \u2265 100% (passief inkomen dekt alle uitgaven)'],
    progress: (d) => Math.min(100, Math.round((Math.max(0, d.freedomPct) / 100) * 100)),
  },
}

// ── Feature Roadmap helpers ───────────────────────────────────────────

/** Determine the first phase where a feature becomes available */
export function getFeatureUnlockPhase(featureId: string): string | null {
  const matrix = DEFAULT_MATRIX[featureId]
  if (!matrix) return null
  for (const phase of PHASES) {
    if (matrix[phase.id]) return phase.id
  }
  return null
}

/** Map of feature icons (emoji) by feature id */
export const featureIcons: Record<string, string> = {
  nibud_benchmark: '\uD83D\uDCCA',
  box3_belasting: '\uD83C\uDFDB\uFE0F',
  budget_optimalisatie: '\uD83D\uDCA1',
  schulden_aflosplan: '\uD83D\uDD17',
  asset_allocatie: '\uD83D\uDCC8',
  fire_projecties: '\uD83D\uDD25',
  monte_carlo: '\uD83C\uDFB2',
  levensgebeurtenissen: '\uD83C\uDFAF',
  withdrawal_strategie: '\uD83D\uDCB8',
  veerkracht_score: '\uD83D\uDEE1\uFE0F',
  vermogensprojectie_chart: '\uD83D\uDCC9',
  fire_scenario_analyse: '\uD83D\uDD00',
  fire_geavanceerde_params: '\u2699\uFE0F',
  vermogensverloop: '\uD83D\uDCC5',
  snapshot_vergelijking: '\uD83D\uDD0D',
  cashflow_sankey: '\uD83C\uDF0A',
  data_export: '\uD83D\uDCE4',
  doelen_systeem: '\uD83C\uDFAF',
  beslissingspatronen: '\uD83E\uDDE0',
}

/** Group features by the phase where they first unlock */
export function getFeaturesPerPhase(): Record<string, FeatureDef[]> {
  const result: Record<string, FeatureDef[]> = {}
  for (const phase of PHASES) {
    result[phase.id] = []
  }
  for (const feature of FEATURES) {
    const unlockPhase = getFeatureUnlockPhase(feature.id)
    if (unlockPhase && result[unlockPhase]) {
      result[unlockPhase].push(feature)
    }
  }
  return result
}

export const NOTIFICATION_TYPES = [
  { type: 'budget', label: 'Budget alerts', description: 'Meldingen over budgetoverschrijdingen', icon: Wallet },
  { type: 'streak', label: 'Streak waarschuwingen', description: 'Meldingen als je streak in gevaar is', icon: Flame },
  { type: 'sync', label: 'Synchronisatie', description: 'Updates over bankconnecties', icon: RefreshCw },
  { type: 'recommendation', label: 'Aanbevelingen', description: 'Financi\u00eble tips en suggesties', icon: Lightbulb },
  { type: 'insight', label: 'Inzichten', description: 'Patronen in je uitgaven', icon: BarChart3 },
  { type: 'badge', label: 'Badges', description: 'Behaalde prestaties en badges', icon: Trophy },
  { type: 'levelup', label: 'Level-ups', description: 'Soevereiniteitsniveau wijzigingen', icon: ArrowUpCircle },
] as const
