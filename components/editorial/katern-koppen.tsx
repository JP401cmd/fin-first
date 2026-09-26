/**
 * KaternKoppen — navigatie tussen de katernen van één pagina (ADR 0179 D6).
 *
 * Uiterlijk: het kicker-met-streep-patroon van `CategoryTabs` (`pattern="tabs"`),
 * maar als `<nav>` met `Link`s, omdat elke kop een eigen route is en geen paneel
 * wisselt. Bewust GEEN segmented control: dat is de modus-switch boven de grafiek,
 * en twee gelijke controls verwarren. De streep staat bovenaan de kop (de koppen
 * liggen onder het canvas en "openen" het katern eronder).
 *
 * - De actieve kop draagt `aria-current="page"` en géén samenvatting (zijn inhoud
 *   staat eronder); inactieve koppen dragen hun samenvatting, alleen vanaf `lg`.
 * - Een katern met een melding krijgt een statuspunt in stoplichtkleur
 *   (`LEVERAGE_STATUS_DOT`, nooit het module-accent) met een tekstlabel voor
 *   schermlezers — kleur alleen is geen informatie (WCAG 1.4.1). Bij meer dan één
 *   melding staat het aantal bij het punt; badges zijn er niet.
 * - Mobiel kleven de koppen bovenaan de tray-scroller (`sticky top-0`). De TopBar
 *   staat bewust BUITEN de scrollende `<main>` van `MobileStackShell`, dus `top-0`
 *   ís de onderrand van de TopBar — geen offset-var nodig. Vanaf `lg` statisch.
 * - Elke kop is minstens 44px hoog (raakgebied).
 *
 * Presentational: geen route-lezing, geen data. De host bepaalt `actiefKey`.
 */

import Link from 'next/link'
import { LEVERAGE_STATUS_DOT, type LeverageStatus } from '@/lib/leverage-status'

export interface KaternKopStatus {
  /** Ernst van de (hoogste) melding — kleurt het punt. */
  ernst: LeverageStatus
  /** Tekst voor schermlezers, bv. "Instellingen, melding: AOW ontbreekt". */
  label: string
  /** Aantal meldingen in dit katern; bij > 1 staat het getal bij het punt. */
  aantal?: number
}

export interface KaternKopItem {
  key: string
  label: string
  href: string
  /** Samenvattingsregel; alleen zichtbaar op een inactieve kop, vanaf `lg`. */
  samenvatting?: string | null
  status?: KaternKopStatus | null
  /**
   * Bij een klik op de kop, náást de navigatie. De host gebruikt dit om een
   * geminimaliseerde melding van dat katern weer uit te klappen (spec §4.8: klik op
   * de kop opent het katern met de melding uitgeklapt).
   */
  onSelect?: () => void
}

export interface KaternKoppenProps {
  items: readonly KaternKopItem[]
  actiefKey: string
  /** Toegankelijke naam van de navigatie. */
  label: string
  className?: string
}

export function KaternKoppen({ items, actiefKey, label, className = '' }: KaternKoppenProps) {
  return (
    <nav
      aria-label={label}
      className={`sticky top-0 z-20 -mx-4 bg-[var(--bg)] px-4 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:px-0 ${className}`}
      data-testid="katern-koppen"
    >
      <ul
        className="grid border-b border-[var(--border-ed)]"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const actief = item.key === actiefKey
          const status = item.status ?? null
          const aantal = status?.aantal ?? 0
          const toonSamenvatting = !actief && !!item.samenvatting
          return (
            <li key={item.key} className="min-w-0">
              <Link
                href={item.href}
                aria-current={actief ? 'page' : undefined}
                onClick={item.onSelect}
                className={`block min-h-[44px] border-t-2 pb-2 pt-2.5 pr-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] ${
                  actief
                    ? 'border-[var(--ink)] text-[var(--ink)]'
                    : 'border-transparent text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                }`}
                data-testid={`katern-kop-${item.key}`}
              >
                <span className="flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em]">
                  <span className="truncate">{item.label}</span>
                  {status && (
                    <span className="inline-flex shrink-0 items-center gap-1" title={status.label}>
                      <span
                        aria-hidden="true"
                        className={`inline-block h-2 w-2 rounded-full ${LEVERAGE_STATUS_DOT[status.ernst]}`}
                        data-testid={`katern-kop-punt-${item.key}`}
                      />
                      {aantal > 1 && (
                        <span aria-hidden="true" className="text-[10px] tabular-nums tracking-normal">
                          {aantal}
                        </span>
                      )}
                      <span className="sr-only">
                        {aantal > 1 ? `${status.label} (${aantal} meldingen)` : status.label}
                      </span>
                    </span>
                  )}
                </span>
                {toonSamenvatting && (
                  <span className="mt-0.5 hidden truncate font-serif text-[12px] normal-case text-[var(--ink-3)] lg:block">
                    {item.samenvatting}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
