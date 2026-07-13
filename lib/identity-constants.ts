import { Wallet, RefreshCw, Compass, Bell, CheckCircle2, Sparkles, Mail } from 'lucide-react'

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
  { phase: 1, name: 'Herstel', subtitle: 'Balans herstellen', color: 'phase_recovery' },
  { phase: 2, name: 'Stabiliteit', subtitle: 'Tijd opbouwen', color: 'phase_stability' },
  { phase: 3, name: 'Momentum', subtitle: 'Tijd vermenigvuldigen', color: 'phase_momentum' },
  { phase: 4, name: 'Meesterschap', subtitle: 'Tijd bezitten', color: 'phase_mastery' },
] as const

export const chronologyLevels: ChronologyLevel[] = [
  { level: -2, name: 'Tijdtekort', focus: 'Lek dichten', metaphor: 'Je verliest actief tijd. Elke euro is al eigendom van iemand anders.', phase: 1 },
  { level: -1, name: 'Tijdverlies', focus: 'Weerstand wegnemen', metaphor: 'Je sleept het verleden achter je aan. Rente vertraagt je snelheid.', phase: 1 },
  { level: 0, name: 'Het Reset-punt', focus: 'Kalibratie', metaphor: 'Het nulpunt. De teller staat stil. Niet achteruit, nog niet vooruit.', phase: 1 },
  { level: 1, name: 'Het Anker', focus: 'Stabiel fundament', metaphor: 'Het anker is uitgeworpen. Je drijft niet meer af bij storm.', phase: 2 },
  { level: 2, name: 'Tijdschild', focus: 'Maximale zekerheid', metaphor: 'Een schild van 3\u20136 maanden tijd. Externe schokken raken je niet meer.', phase: 2 },
  { level: 3, name: 'Snelheid', focus: 'Versnelling', metaphor: 'Je geld genereert zijn eigen tijd. Sneller dan je alleen kunt lopen.', phase: 3 },
  { level: 4, name: 'Autonoom', focus: 'Glijden', metaphor: 'De motoren kunnen uit. Je huidige vaart bereikt de bestemming vanzelf.', phase: 3 },
  { level: 5, name: 'Soeverein', focus: 'Onafhankelijkheid', metaphor: 'Je bezit 100% van je eigen klok. Geen tijd meer ruilen voor geld.', phase: 4 },
  { level: 6, name: 'Tijdloos', focus: 'Oneindigheid', metaphor: 'Meer tijd dan je op kunt maken. Je bouwt aan de tijdlijnen van anderen.', phase: 4 },
]

// ── Phase color helpers ──────────────────────────────────────────────

export const phaseColors: Record<string, { dot: string; activeDot: string; line: string; badge: string; text: string }> = {
  phase_recovery:  { dot: 'bg-[var(--color-phase-recovery-200)]',  activeDot: 'bg-[var(--color-phase-recovery-500)]',  line: 'bg-[var(--color-phase-recovery-200)]',  badge: 'bg-[var(--color-phase-recovery-50)] text-[var(--color-phase-recovery-700)] border-[var(--color-phase-recovery-200)]',   text: 'text-[var(--color-phase-recovery-600)]' },
  phase_stability: { dot: 'bg-[var(--color-phase-stability-200)]', activeDot: 'bg-[var(--color-phase-stability-500)]', line: 'bg-[var(--color-phase-stability-200)]', badge: 'bg-[var(--color-phase-stability-50)] text-[var(--color-phase-stability-700)] border-[var(--color-phase-stability-200)]',  text: 'text-[var(--color-phase-stability-600)]' },
  phase_momentum:  { dot: 'bg-[var(--color-phase-momentum-200)]',  activeDot: 'bg-[var(--color-phase-momentum-500)]',  line: 'bg-[var(--color-phase-momentum-200)]',  badge: 'bg-[var(--color-phase-momentum-50)] text-[var(--color-phase-momentum-700)] border-[var(--color-phase-momentum-200)]',   text: 'text-[var(--color-phase-momentum-600)]' },
  phase_mastery:   { dot: 'bg-[var(--color-phase-mastery-200)]',   activeDot: 'bg-[var(--color-phase-mastery-500)]',   line: 'bg-[var(--color-phase-mastery-200)]',   badge: 'bg-[var(--color-phase-mastery-50)] text-[var(--color-phase-mastery-700)] border-[var(--color-phase-mastery-200)]',    text: 'text-[var(--color-phase-mastery-600)]' },
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

export const NOTIFICATION_TYPES = [
  { type: 'budget', label: 'Budget alerts', description: 'Meldingen over budgetoverschrijdingen', icon: Wallet },
  { type: 'sync', label: 'Synchronisatie', description: 'Bankconnecties en jaarlijkse WOZ-/pensioen-reminders', icon: RefreshCw },
  { type: 'recommendation', label: 'Partner-acties', description: 'Wanneer je partner een toegewezen actie afrondt', icon: CheckCircle2 },
  { type: 'horizon', label: 'Toekomst', description: 'FIRE-aandachtspunten en vrijheidswaarschuwingen', icon: Compass },
  { type: 'holding_alert', label: 'Prijs-alerts', description: 'Holdings prijs- en allocatie-alerts', icon: Bell },
  { type: 'briefing', label: 'Briefing', description: 'Je wekelijkse briefing met je vrijheidswinst', icon: Sparkles },
] as const

/**
 * Opt-in voor de wekelijkse briefing PER E-MAIL — bewust LOS van
 * NOTIFICATION_TYPES: die voeden de push-voorkeuren-blob in app_settings (die
 * naar default-true coerced = opt-out). Een e-mail-kanaal moet opt-IN zijn
 * (AVG/e-Privacy), dus dit hangt aan een eigen profiles-kolom
 * (weekly_briefing_email, DEFAULT FALSE) via /api/briefing/email/pref. Deze
 * constante beschrijft alleen de UI-copy van de aparte toggle op
 * /mijn/notificaties.
 */
export const WEEKLY_BRIEFING_EMAIL_TOGGLE = {
  label: 'Briefing per e-mail',
  description: 'Ontvang je wekelijkse briefing ook per e-mail (opt-in, zonder bedragen)',
  icon: Mail,
} as const
