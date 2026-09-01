'use client'

import { Check } from 'lucide-react'
import { useHomeScreen, type HomeScreen } from '@/lib/hooks/use-home-screen'

/**
 * HomeScreenPicker — de startscherm-keuze "Overzicht" ⇄ "Budgetteren" op
 * /mijn/uiterlijk, naast de andere profiel-brede weergavekeuzes.
 *
 * WAAROM HIER: de keuze bestaat óók als ⌘K-actie, maar wie de palette niet
 * kent moet 'm kunnen vinden op de plek waar de rest van de weergave staat.
 * De menu-indeling verandert niet mee — alleen "ga naar hoofdscherm"-
 * navigaties (login-landing, PWA-start, top-bar ←, long-press op de waffle)
 * volgen de keuze.
 *
 * GEEN TWEEDE SCHRIJFPAD: de knoppen zetten `setHomeScreen` uit
 * `useHomeScreen()` — dezelfde optimistische state + `PUT /api/home-screen`
 * die de ⌘K-actie gebruikt, met rollback bij een mislukte call. Er komt hier
 * dus géén eigen fetch, geen localStorage-spiegel en geen tweede leespad bij.
 */

type ScreenMeta = {
  label: string
  /** Wat je krijgt als je dit kiest — één zin, gewone taal. */
  description: string
}

const SCREEN_META: Record<HomeScreen, ScreenMeta> = {
  overzicht: {
    label: 'Overzicht — alles bij elkaar',
    description:
      'De app opent op je Overzicht: vermogen, cashflow en je vrijheidstijd in één oogopslag.',
  },
  budget: {
    label: 'Budgetteren — direct je budgetten',
    description:
      'De app opent op de Budgetteren-pagina, met je maandbudgetten meteen in beeld.',
  },
}

export function HomeScreenPicker() {
  const { homeScreen, setHomeScreen } = useHomeScreen()
  const screens = Object.entries(SCREEN_META) as [HomeScreen, ScreenMeta][]

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
        Startscherm
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {screens.map(([key, meta]) => {
          const active = homeScreen === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setHomeScreen(key)}
              aria-pressed={active}
              className={`group rounded-2xl border p-3 sm:p-4 text-left transition-all ${
                active
                  ? 'border-[var(--ink-2)] shadow-sm'
                  : 'border-[var(--border-ed)] hover:border-[var(--ink-3)]'
              }`}
            >
              <header className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-[var(--ink)]">{meta.label}</span>
                {active && (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--ink)] text-[var(--paper)]">
                    <Check className="w-3 h-3" aria-hidden="true" />
                  </span>
                )}
              </header>
              <p className="text-[11px] text-[var(--ink-3)] leading-snug">{meta.description}</p>
            </button>
          )
        })}
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
        Je keuze reist mee naar je andere apparaten. Snel wisselen kan ook met het zoekscherm (
        <kbd className="font-mono">⌘K</kbd> of <kbd className="font-mono">Ctrl</kbd>+
        <kbd className="font-mono">K</kbd>); op mobiel ga je direct naar je startscherm door de
        middelste knop van de navigatiepil anderhalve seconde ingedrukt te houden.
      </p>
    </div>
  )
}
