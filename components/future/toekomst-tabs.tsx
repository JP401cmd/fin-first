'use client'

import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { type ReactNode } from 'react'
import { Compass, Target, CalendarClock, SlidersHorizontal, ArrowRight } from 'lucide-react'

/**
 * /toekomst segmented-control wrapper. Vier tabs uit navigatie-redesign-plan
 * §6.3: Tijdas (default) · Doelen · Gebeurtenissen · Voorkeuren.
 *
 * Niet-destructieve scaffolding: de Tijdas-tab toont het bestaande
 * HorizonPage (via children). De andere drie tabs tonen — voor nu —
 * placeholder-cards die deeplinken naar de huidige routes
 * (`/toekomst/strategie`, `/toekomst/whatif`, `/toekomst/uitgaven-na-pensioen`).
 *
 * Toekomst-iteraties extraheren de respectievelijke content uit
 * HorizonPage naar dedicated tab-views, totdat de hele Tijdas/Doelen/
 * Gebeurtenissen/Voorkeuren-structuur native is.
 *
 * URL-state: `?tab=doelen|gebeurtenissen|voorkeuren`. Default = tijdas
 * (geen query). Bookmarkable; switching gebeurt via `router.replace`
 * met `scroll: false`.
 */
type ToekomstTab = 'tijdas' | 'doelen' | 'gebeurtenissen' | 'voorkeuren'

const TABS: { id: ToekomstTab; label: string; Icon: typeof Compass }[] = [
  { id: 'tijdas', label: 'Tijdas', Icon: Compass },
  { id: 'doelen', label: 'Doelen', Icon: Target },
  { id: 'gebeurtenissen', label: 'Gebeurtenissen', Icon: CalendarClock },
  { id: 'voorkeuren', label: 'Voorkeuren', Icon: SlidersHorizontal },
]

export function ToekomstTabs({
  tijdasView,
  doelenView,
}: {
  tijdasView: ReactNode
  /** Optionele content voor Doelen-tab. Wanneer afwezig: placeholder. */
  doelenView?: ReactNode
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const raw = searchParams.get('tab')
  const isKnown = TABS.some((t) => t.id === raw)
  const current: ToekomstTab = isKnown ? (raw as ToekomstTab) : 'tijdas'

  function navigate(tab: ToekomstTab) {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'tijdas') {
      params.delete('tab')
    } else {
      params.set('tab', tab)
    }
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <nav
          aria-label="Toekomst-tabs"
          className="mb-4 flex flex-wrap gap-1 rounded-2xl border border-[var(--border-ed)] bg-[var(--subtle)] p-1"
        >
          {TABS.map(({ id, label, Icon }) => {
            const active = current === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => navigate(id)}
                aria-pressed={active}
                className={[
                  'flex-1 min-w-[80px] min-h-[44px] inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold px-3 py-2.5 rounded-xl transition-colors',
                  active
                    ? 'bg-[var(--paper)] text-[var(--ink)] shadow-[var(--s1)]'
                    : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]',
                ].join(' ')}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {current === 'tijdas' && tijdasView}
      {current === 'doelen' && (doelenView ?? <DoelenTabPlaceholder />)}
      {current === 'gebeurtenissen' && <GebeurtenissenTabPlaceholder />}
      {current === 'voorkeuren' && <VoorkeurenTabPlaceholder />}
    </>
  )
}

/**
 * Placeholder-card per niet-actieve tab. Toont kicker + uitleg + deep-link
 * naar de bestaande route waar de content nu nog leeft. Wordt vervangen
 * door dedicated tab-views naarmate de refactor vordert.
 */
function PlaceholderCard({
  Icon,
  label,
  description,
  links,
}: {
  Icon: typeof Compass
  label: string
  description: string
  links: { href: string; label: string }[]
}) {
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
      <article className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-6 sm:p-8">
        <header className="flex items-center gap-3 mb-3">
          <span className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
            <Icon className="w-5 h-5 text-violet-700" aria-hidden="true" />
          </span>
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
              Toekomst — {label.toLowerCase()}
            </div>
            <h2 className="font-serif text-xl text-[var(--ink)]">{label}</h2>
          </div>
        </header>
        <p className="text-sm text-[var(--ink-2)] leading-relaxed mb-4">
          {description}
        </p>
        <div className="flex flex-col gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex items-center justify-between gap-2 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] hover:bg-[var(--paper)] hover:border-[var(--ink-3)] px-4 py-3 transition-all text-sm font-medium text-[var(--ink-2)]"
            >
              <span>{link.label}</span>
              <ArrowRight className="w-4 h-4 text-[var(--ink-3)]" aria-hidden="true" />
            </Link>
          ))}
        </div>
        <p className="mt-4 text-[11px] italic text-[var(--ink-3)]">
          Deze tab krijgt in een volgende iteratie eigen content. Voor nu
          deeplinken we naar de huidige routes.
        </p>
      </article>
    </section>
  )
}

function DoelenTabPlaceholder() {
  return (
    <PlaceholderCard
      Icon={Target}
      label="Doelen"
      description="Hier komen al je financiële doelen met status-flags (on-track / aandacht / off-track) en bijdrage-monitoring. Status-codering is identiek aan het vier-hefbomen-kompas zodat het verhaal consistent is."
      links={[
        { href: '/overzicht?focus=doelen', label: 'Doelen op /overzicht bekijken' },
        { href: '/will#goals', label: 'Will — doelen-overzicht (legacy route)' },
      ]}
    />
  )
}

function GebeurtenissenTabPlaceholder() {
  return (
    <PlaceholderCard
      Icon={CalendarClock}
      label="Gebeurtenissen"
      description="Levensgebeurtenissen (kind · erfenis · ZZP-start · verhuizing) plus drie levensstrategieën (AOW · Pensioen · Huis). Events verschijnen als punten op de tijdas; strategieën als bandjes met eigen multi-step-flow."
      links={[
        { href: '/toekomst/strategie', label: 'Levensstrategieën bewerken' },
        { href: '/toekomst/whatif', label: 'Wat-Als — scenario’s spelen' },
        { href: '/toekomst/uitgaven-na-pensioen', label: 'Uitgaven na pensioen' },
      ]}
    />
  )
}

function VoorkeurenTabPlaceholder() {
  return (
    <PlaceholderCard
      Icon={SlidersHorizontal}
      label="Voorkeuren"
      description="Eindstrategie, onttrekkingsstrategie, onttrekkingsvolgorde, verdeling bij toename, onttrekking bij afname en markt-aannames. Regels die op de hele tijdas + alle events werken."
      links={[
        { href: '/identity/parameters', label: 'FIRE-parameters & withdrawal' },
        { href: '/identity/instellingen', label: 'Profiel & inkomensgegevens' },
      ]}
    />
  )
}
