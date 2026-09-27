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
 *
 * Tabbladen met accent (optioneel, `KaternKopItem.accent`, eigenaarswens 27 sep): de
 * koppen worden tabs op een map — een tabstrook op een basislijn, elke tab een eigen
 * omkaderd vlak met een streep in zijn eigen accent bovenaan. De actieve tab ligt vóór:
 * papierkleur van de pagina (`--bg`), sterkere streep, en hij sluit zonder lijn aan op
 * het katern eronder. De inactieve tabs liggen zichtbaar achter: een ingetogen,
 * donkerder papiertoon (gemengd uit `--border-ed` en `--bg`) en `ink-2`. Het accent is
 * hier nooit een vlak — de subpagina krijgt haar accent via `KaternAccentScope`.
 * Nog steeds geen segmented control (D6 blijft staan): tabs openen een eigen route met
 * een eigen katern eronder; de modus-switch wisselt een weergave van dezelfde grafiek.
 * Het statuspunt blijft stoplicht en onderscheidt zich van het accent door vorm (punt
 * vs. streep) en chroma. Zonder accent: het oorspronkelijke kicker-gedrag, ongewijzigd.
 */

import { useId } from 'react'
import Link from 'next/link'
import { LEVERAGE_STATUS_DOT, type LeverageStatus } from '@/lib/leverage-status'
import type { KaternAccent } from './katern-accent-scope'

export type { KaternAccent } from './katern-accent-scope'

export interface KaternKopStatus {
  /** Ernst van de (hoogste) melding — kleurt het punt. */
  ernst: LeverageStatus
  /**
   * Tekst voor schermlezers ZONDER de kopnaam, bv. "melding: AOW ontbreekt". De kop
   * zet zijn eigen label ervoor: de link heet "Instellingen, melding: AOW ontbreekt".
   */
  label: string
  /** Aantal meldingen in dit katern; bij > 1 staat het getal bij het punt. */
  aantal?: number
}

/**
 * De accentstreep per tab. Letterlijke strings, want Tailwind v4 genereert alleen wat het
 * in de bron ziet (geen `var(--color-${accent}-…)`-template). `color:`-hint, omdat een
 * var() in `border-t-[…]` anders als breedte gelezen kan worden.
 *  - achter: `-400`, bij hover `-500`;
 *  - vóór (actief): `-600`.
 */
const ACCENT_STREEP: Record<KaternAccent, { achter: string; voor: string }> = {
  kern: {
    achter: 'border-t-[color:var(--color-kern-400)] hover:border-t-[color:var(--color-kern-500)]',
    voor: 'border-t-[color:var(--color-kern-600)]',
  },
  wil: {
    achter: 'border-t-[color:var(--color-wil-400)] hover:border-t-[color:var(--color-wil-500)]',
    voor: 'border-t-[color:var(--color-wil-600)]',
  },
  horizon: {
    achter: 'border-t-[color:var(--color-horizon-400)] hover:border-t-[color:var(--color-horizon-500)]',
    voor: 'border-t-[color:var(--color-horizon-600)]',
  },
  fin: {
    achter: 'border-t-[color:var(--color-fin-400)] hover:border-t-[color:var(--color-fin-500)]',
    voor: 'border-t-[color:var(--color-fin-600)]',
  },
}

/**
 * Een tab die achter ligt: geen eigen toon, hij ligt op de pagina (`--bg`). Alleen de
 * actieve tab is wit (`--paper`) en loopt over in de witte katern-module eronder
 * (`KATERN_MODULE`). Een gemengde tint gaf op warme schermen een roze waas (eigenaar
 * 27 sep); het onderscheid zit nu in wit tegenover pagina, niet in een tint.
 */
const TAB_ACHTER = 'bg-transparent text-[var(--ink-2)] hover:bg-[var(--paper)] hover:text-[var(--ink)]'

/**
 * De witte module onder de tabbladen: dezelfde kaart als het canvas (papier, hairline,
 * schaduw `--s0`), zonder bovenrand — de basislijn van de tabstrook is die rand, en de
 * actieve tab schuift er 1px overheen. Utilities in plaats van `.card-editorial`: die
 * klasse staat buiten de CSS-lagen en laat zich niet per zijde overschrijven, en zijn
 * hover-lift hoort niet op een vlak met overlays erin. Onder `sm` loopt de module tot de
 * schermrand, zodat de inhoud even breed blijft (één-scherm-eis in Doelen).
 */
export const KATERN_MODULE =
  '-mx-4 border-y border-t-0 border-[var(--border-ed)] bg-[var(--paper)] px-4 pb-6 pt-4 shadow-[var(--s0)] sm:mx-0 sm:border-x sm:px-6 sm:pt-5'

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
  /**
   * Het accent van dit katern. Met accent is de kop een tabblad (omkaderd vlak, Playfair-
   * naam, accentstreep bovenaan). Zonder: het mono-kicker-gedrag.
   */
  accent?: KaternAccent | null
}

export interface KaternKoppenProps {
  items: readonly KaternKopItem[]
  actiefKey: string
  /** Toegankelijke naam van de navigatie. */
  label: string
  className?: string
}

/**
 * De toegankelijke naam van een kop met een melding: de kopnaam één keer, dan de
 * melding — "Plan, melding: tekort-lening (2 meldingen)". Expliciet als `aria-label`,
 * zodat de naam niet afhangt van hoe een browser witruimte tussen flex-items telt.
 */
function kopNaamMetStatus(label: string, status: KaternKopStatus): string {
  const aantal = status.aantal ?? 0
  return `${label}, ${status.label}${aantal > 1 ? ` (${aantal} meldingen)` : ''}`
}

const FOCUS =
  'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]'

export function KaternKoppen({ items, actiefKey, label, className = '' }: KaternKoppenProps) {
  const idBasis = useId()
  // Tabbladen zodra een kop een accent draagt: dan krijgen de tabs ruimte tussen elkaar.
  const alsTabs = items.some((item) => !!item.accent)
  return (
    <nav
      aria-label={label}
      className={`sticky top-0 z-20 -mx-4 bg-[var(--bg)] px-4 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:px-0 ${className}`}
      data-testid="katern-koppen"
    >
      <ul
        className={`grid border-b border-[var(--border-ed)] ${alsTabs ? 'gap-1 sm:gap-1.5' : ''}`}
        style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const actief = item.key === actiefKey
          const status = item.status ?? null
          const aantal = status?.aantal ?? 0
          const toonSamenvatting = !actief && !!item.samenvatting
          const naam = status ? kopNaamMetStatus(item.label, status) : null
          const samenvattingId = `${idBasis}-${item.key}-samenvatting`
          const accent = item.accent ?? null
          const kopKlassen = accent
            ? // Tabblad. Zelfde hoogte als de kicker-variant (min-h 44, pt-2.5, pb-2): de
              // één-scherm-eis van Doelen op mobiel meet het rad ónder de koppen. De streep
              // van 3px valt binnen de 44px (border-box). Zijkanten in de hairline-kleur,
              // géén onderrand: de basislijn is de rand van de `ul`.
              `block min-h-[44px] border-x border-t-[3px] border-x-[color:var(--border-ed)] px-1.5 pb-2 pt-2.5 sm:px-3 ${FOCUS} ${
                actief
                  ? `bg-[var(--paper)] text-[var(--ink)] ${ACCENT_STREEP[accent].voor}`
                  : `${TAB_ACHTER} ${ACCENT_STREEP[accent].achter}`
              }`
            : `block min-h-[44px] border-t-2 pb-2 pt-2.5 pr-2 ${FOCUS} ${
                actief
                  ? 'border-[var(--ink)] text-[var(--ink)]'
                  : 'border-transparent text-[var(--ink-3)] hover:text-[var(--ink-2)]'
              }`
          return (
            // De actieve tab schuift 1px over de basislijn: geen lijn tussen tab en katern.
            <li
              key={item.key}
              className={accent && actief ? 'relative -mb-px min-w-0' : 'min-w-0'}
              data-accent={accent ?? undefined}
            >
              <Link
                href={item.href}
                // Katernen van één pagina: de layout (kop, canvas) blijft staan, dus Next
                // scrolt niet naar het nieuwe segment. Zonder dit eerst `scrollTop = 0`,
                // daarna `scrollIntoView` op het katern: twee sprongen per klik. Waar de
                // pagina dan wel moet schuiven, beslist de host (fixronde C1).
                scroll={false}
                aria-current={actief ? 'page' : undefined}
                // Met een melding een expliciete naam; de samenvatting blijft dan als
                // beschrijving bereikbaar. Zonder melding is de inhoud de naam.
                aria-label={naam ?? undefined}
                aria-describedby={naam && toonSamenvatting ? samenvattingId : undefined}
                onClick={item.onSelect}
                className={kopKlassen}
                data-testid={`katern-kop-${item.key}`}
              >
                <span
                  className={
                    accent
                      ? 'flex items-center gap-1.5 font-display text-[14px] font-semibold leading-tight sm:text-[17px]'
                      : 'flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em]'
                  }
                >
                  <span className="truncate">{item.label}</span>
                  {status && (
                    <span className="inline-flex shrink-0 items-center gap-1" title={naam ?? undefined}>
                      <span
                        aria-hidden="true"
                        className={`inline-block h-2 w-2 rounded-full ${LEVERAGE_STATUS_DOT[status.ernst]}`}
                        data-testid={`katern-kop-punt-${item.key}`}
                      />
                      {aantal > 1 && (
                        <span
                          aria-hidden="true"
                          className={`text-[10px] tabular-nums tracking-normal ${accent ? 'font-mono font-medium' : ''}`}
                        >
                          {aantal}
                        </span>
                      )}
                    </span>
                  )}
                </span>
                {toonSamenvatting && (
                  <span
                    id={samenvattingId}
                    // Op de achter-toon haalt ink-3 geen 4,5:1 (4,36); ink-2 wel (7,2).
                    className={`mt-0.5 hidden truncate font-serif normal-case lg:block ${
                      accent ? 'text-[13px] text-[var(--ink-2)]' : 'text-[12px] text-[var(--ink-3)]'
                    }`}
                  >
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
