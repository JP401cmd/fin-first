'use client'

import { useMemo, useRef, useState, type Ref } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Info } from 'lucide-react'
import type { AandachtItem, Domein } from '@/lib/beheer/dashboard/signalen'
import { statusToon } from '@/lib/beheer/dashboard/status'
import { TOON_KLASSEN, impactKop, momentTekst } from './opmaak'
import { ErnstTeken } from './status-teken'

/**
 * De aandachtslijst: één regel per incident, zwaarste eerst. Elke regel zegt
 * wat er is, wie het raakt, sinds wanneer, op welke regel het rust en waar de
 * beheerder verder kan.
 *
 * WAT JE ERMEE DOET
 *  - filteren op domein (technisch of functioneel) en op "alleen dringend";
 *  - de onderbouwing per regel of voor alle regels tegelijk uitklappen.
 *
 * EEN FILTER VERBERGT NOOIT STIL. Staat er een filter aan, dan zegt de lijst
 * hoeveel signalen buiten beeld zijn en hoeveel daarvan dringend. Het filter
 * wordt niet onthouden: wie het scherm opnieuw opent, ziet alles. Een filter
 * dat blijft hangen, zou een kritiek signaal weken uit beeld kunnen houden.
 *
 * De lijst krijgt haar signalen kant-en-klaar van de server (`bouwAandacht`);
 * hier wordt alleen gekozen wat in beeld staat, niet wat een signaal is.
 */

const DOMEIN_LABEL: Record<Domein, string> = { technisch: 'Technisch', functioneel: 'Functioneel' }
const DOMEINEN: readonly Domein[] = ['technisch', 'functioneel']

const META_LABEL = 'font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-meta)]'

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]'

function isDringend(item: AandachtItem): boolean {
  return item.ernst === 'kritiek' || item.ernst === 'hoog'
}

function FilterKnop({
  actief,
  onClick,
  children,
  testId,
  knopRef,
}: {
  actief: boolean
  onClick: () => void
  children: React.ReactNode
  testId: string
  knopRef?: Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={knopRef}
      type="button"
      aria-pressed={actief}
      onClick={onClick}
      data-testid={testId}
      className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap border px-3 py-1.5 text-sm transition-colors ${FOCUS} ${
        actief
          ? 'border-[var(--ink)] bg-[var(--ink)] font-medium text-[var(--paper)]'
          : 'border-[var(--border-ed)] text-[var(--ink-2)] hover:border-[var(--border-md)] hover:text-[var(--ink)]'
      }`}
    >
      {children}
    </button>
  )
}

function Aantal({ n }: { n: number }) {
  return <span className="font-mono text-xs tabular-nums opacity-80">{n}</span>
}

/**
 * Eén signaal. In beeld staat wat nodig is om te kiezen: ernst, wat er is,
 * wie het raakt, sinds wanneer en waar je verder kunt. De delen van het
 * incident en de regel waarop het rust, staan op aanvraag eronder: zo blijft
 * de lijst in één blik te overzien, ook met meerdere signalen.
 */
function Regel({
  item,
  nu,
  open,
  onToggle,
}: {
  item: AandachtItem
  nu: Date
  open: boolean
  onToggle: (open: boolean) => void
}) {
  const toon = TOON_KLASSEN[statusToon('afwijkend', item.ernst)]
  const heeftMeer = item.onderdelen.length > 0 || item.samenloop !== null
  return (
    <li
      className={`border border-l-2 border-[var(--border-ed)] ${toon.rand} bg-[var(--paper)] px-4 py-3`}
      data-testid={`aandacht-${item.id}`}
      data-ernst={item.ernst}
      data-domein={item.domein}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <ErnstTeken ernst={item.ernst} />
          <span className={META_LABEL}>{DOMEIN_LABEL[item.domein]}</span>
        </div>
        <p className="text-xs text-[var(--ink-3)]">
          {item.sinds ? (
            <>
              {item.sindsLabel}{' '}
              <span className="font-mono tabular-nums text-[var(--ink-2)]">{momentTekst(item.sinds, nu)}</span>
            </>
          ) : (
            <span className="italic">begin niet vastgelegd</span>
          )}
        </p>
      </div>

      {/* h5: de sectie is h3, de baan ("Nu ingrijpen") h4. */}
      <h5 className="mt-1.5 text-base font-semibold leading-snug text-[var(--ink)]">{item.titel}</h5>
      <p className="mt-0.5 max-w-[80ch] text-sm leading-relaxed text-[var(--ink-2)]">{item.waarom}</p>

      <p className="mt-1.5 max-w-[80ch] text-sm text-[var(--ink-2)]">
        <span className={META_LABEL}>Gevolg voor gebruikers </span>
        <span className="font-medium text-[var(--ink)]">{impactKop(item.impact)}</span>
        <span className="text-[var(--ink-3)]"> · {item.impact.toelichting}</span>
      </p>

      {item.acties.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {item.acties.map((a, i) => (
            <li key={`${a.href}-${a.label}`}>
              <Link
                href={a.href}
                className={`inline-flex min-h-11 items-center gap-1.5 border px-3 py-1 text-sm transition-colors ${FOCUS} ${
                  i === 0
                    ? 'border-[var(--ink)] font-medium text-[var(--ink)] hover:bg-[var(--subtle)]'
                    : 'border-[var(--border-ed)] text-[var(--ink-2)] hover:border-[var(--border-md)] hover:text-[var(--ink)]'
                }`}
              >
                {a.label}
                <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <details className="group mt-1" open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
        <summary
          className={`inline-flex min-h-11 cursor-pointer items-center font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)] hover:text-[var(--ink)] ${FOCUS}`}
        >
          {heeftMeer ? 'Onderdelen en onderbouwing' : 'Onderbouwing'}
        </summary>
        <div className="max-w-[80ch] space-y-2 pb-1 text-xs leading-relaxed text-[var(--ink-3)]">
          {item.onderdelen.length > 0 && (
            <ul className="space-y-0.5 border-l border-[var(--border-ed)] pl-3">
              {item.onderdelen.map((o) => (
                <li key={o} className="break-words font-mono text-[11px] leading-relaxed">
                  {o}
                </li>
              ))}
            </ul>
          )}
          {item.samenloop && <p className="italic">{item.samenloop}</p>}
          <p>
            <span className="font-medium text-[var(--ink-2)]">Waarop dit rust:</span> {item.grond}
          </p>
        </div>
      </details>
    </li>
  )
}

/** Compacte regel voor werk dat ingepland kan worden. */
function PlanRegel({ item }: { item: AandachtItem }) {
  const eerste = item.acties[0]
  return (
    <li
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-dotted border-[var(--border-ed)] py-2"
      data-testid={`aandacht-${item.id}`}
      data-domein={item.domein}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--ink)]">{item.titel}</p>
        <p className="mt-0.5 max-w-[75ch] text-xs leading-relaxed text-[var(--ink-3)]">{item.waarom}</p>
        {item.onderdelen.length > 0 && (
          <p className="mt-0.5 break-words font-mono text-[11px] text-[var(--ink-3)]">{item.onderdelen.join(' · ')}</p>
        )}
      </div>
      {eerste && (
        <Link
          href={eerste.href}
          className={`inline-flex min-h-11 shrink-0 items-center gap-1 text-sm text-[var(--ink-2)] underline decoration-[var(--border-md)] underline-offset-2 hover:text-[var(--ink)] ${FOCUS}`}
        >
          {eerste.label}
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      )}
    </li>
  )
}

export function AandachtLijst({
  items,
  nu,
  afwijkendZonderSignaal = [],
}: {
  items: readonly AandachtItem[]
  nu: Date
  /**
   * Onderdelen die van hun norm afwijken zonder dat ingrijpen nodig is. Alleen
   * van belang als de lijst leeg is: dan mag zij niet "geen afwijkingen" zeggen.
   */
  afwijkendZonderSignaal?: readonly string[]
}) {
  const [domein, setDomein] = useState<Domein | null>(null)
  const [alleenDringend, setAlleenDringend] = useState(false)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  // Het filter is net met "Toon alles" teruggezet: de schermlezer hoort dat.
  const [teruggezet, setTeruggezet] = useState(false)
  const allesKnop = useRef<HTMLButtonElement>(null)

  const kiesDomein = (d: Domein | null) => {
    setTeruggezet(false)
    setDomein((huidig) => (d === null || huidig === d ? null : d))
  }
  const toonAlles = () => {
    setDomein(null)
    setAlleenDringend(false)
    setTeruggezet(true)
    // De knop "Toon alles" verdwijnt met het filter. De focus gaat naar de
    // knop "Alles", zodat wie met het toetsenbord werkt niet bovenaan de pagina
    // opnieuw begint.
    allesKnop.current?.focus()
  }

  const past = useMemo(
    () => (item: AandachtItem) =>
      (domein === null || item.domein === domein) && (!alleenDringend || isDringend(item)),
    [domein, alleenDringend],
  )

  const alleDirect = items.filter((i) => i.baan === 'nu')
  const alleLater = items.filter((i) => i.baan === 'inplannen')
  const direct = alleDirect.filter(past)
  // "Alleen dringend" gaat over wat nu ingrijpen vraagt; werk om in te plannen
  // is per definitie niet dringend en valt dan weg.
  const later = alleLater.filter(past)

  const filterAan = domein !== null || alleenDringend
  const verborgen = items.filter((i) => !past(i))
  const verborgenDringend = verborgen.filter(isDringend).length
  const telDomein = (d: Domein) => items.filter((i) => i.domein === d).length
  const aantalDringend = alleDirect.filter(isDringend).length

  const uitklapbaar = direct.map((i) => i.id)
  const allesOpen = uitklapbaar.length > 0 && uitklapbaar.every((id) => open.has(id))

  const zetOpen = (id: string, staatOpen: boolean) =>
    setOpen((vorige) => {
      if (vorige.has(id) === staatOpen) return vorige
      const volgende = new Set(vorige)
      if (staatOpen) volgende.add(id)
      else volgende.delete(id)
      return volgende
    })

  return (
    <div className="space-y-6" data-testid="aandacht-lijst">
      {items.length > 1 && (
        <div
          role="group"
          aria-label="Filter de aandachtslijst"
          className="flex flex-wrap items-center gap-2"
          data-testid="aandacht-filter"
        >
          <FilterKnop
            actief={domein === null}
            onClick={() => kiesDomein(null)}
            testId="filter-alles"
            knopRef={allesKnop}
          >
            Alles <Aantal n={items.length} />
          </FilterKnop>
          {DOMEINEN.map((d) => (
            <FilterKnop
              key={d}
              actief={domein === d}
              onClick={() => kiesDomein(d)}
              testId={`filter-${d}`}
            >
              {DOMEIN_LABEL[d]} <Aantal n={telDomein(d)} />
            </FilterKnop>
          ))}
          <span aria-hidden className="mx-1 hidden h-6 w-px bg-[var(--border-ed)] sm:block" />
          <FilterKnop
            actief={alleenDringend}
            onClick={() => {
              setTeruggezet(false)
              setAlleenDringend((v) => !v)
            }}
            testId="filter-dringend"
          >
            Alleen dringend <Aantal n={aantalDringend} />
          </FilterKnop>
          {uitklapbaar.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen(allesOpen ? new Set() : new Set(uitklapbaar))}
              aria-expanded={allesOpen}
              data-testid="onderbouwing-alles"
              className={`ml-auto inline-flex min-h-11 items-center px-1 text-sm text-[var(--ink-2)] underline decoration-[var(--border-md)] underline-offset-2 hover:text-[var(--ink)] ${FOCUS}`}
            >
              {allesOpen ? 'Onderbouwing inklappen' : 'Alle onderbouwing uitklappen'}
            </button>
          )}
        </div>
      )}

      {/* De melding is altijd gemount: een schermlezer hoort wat het filter deed.
          De knop staat ernaast en niet erin, anders leest de schermlezer hem bij
          elke wijziging mee voor. */}
      <div
        className={
          filterAan && verborgen.length > 0
            ? 'flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-[var(--border-md)] bg-[var(--subtle)] px-4 py-2 text-sm text-[var(--ink-2)]'
            : 'sr-only'
        }
        data-testid="filter-blok"
      >
        {filterAan && verborgen.length > 0 && <Info aria-hidden className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />}
        <p aria-live="polite" data-testid="filter-melding">
          {filterAan && verborgen.length > 0 ? (
            <>
              {verborgen.length} {verborgen.length === 1 ? 'signaal staat' : 'signalen staan'} buiten beeld door het
              filter
              {verborgenDringend > 0 ? (
                <>
                  , waarvan <strong className="font-semibold text-[var(--ink)]">{verborgenDringend} dringend</strong>
                </>
              ) : null}
              .
            </>
          ) : filterAan ? (
            'Het filter verbergt geen signalen.'
          ) : teruggezet ? (
            `Alle ${items.length} signalen staan weer in beeld.`
          ) : (
            ''
          )}
        </p>
        {filterAan && verborgen.length > 0 && (
          <button
            type="button"
            onClick={toonAlles}
            data-testid="filter-toon-alles"
            className={`inline-flex min-h-11 items-center underline decoration-[var(--border-md)] underline-offset-2 hover:text-[var(--ink)] ${FOCUS}`}
          >
            Toon alles
          </button>
        )}
      </div>

      <div>
        <h4 className="mb-3 flex items-baseline gap-2 text-sm font-semibold text-[var(--ink)]" id="aandacht-nu">
          Nu ingrijpen
          <span className="font-mono text-xs font-normal tabular-nums text-[var(--ink-3)]">
            {direct.length}
            {direct.length !== alleDirect.length && ` van ${alleDirect.length}`}
          </span>
        </h4>
        {alleDirect.length === 0 ? (
          <p
            className="flex items-start gap-2 border border-dashed border-[var(--border-ed)] bg-[var(--paper)] px-4 py-5 text-sm text-[var(--ink-2)]"
            data-testid="aandacht-leeg"
          >
            {afwijkendZonderSignaal.length > 0 ? (
              <>
                <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span>
                  Niets vraagt nu ingrijpen. {afwijkendZonderSignaal.join(', ')}{' '}
                  {afwijkendZonderSignaal.length === 1 ? 'wijkt' : 'wijken'} wel af van de norm; de statustabel
                  hieronder zegt waarin.
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
                <span>
                  Geen enkele meting wijkt af. Wat niet gemeten kon worden, staat in de statustabel hieronder.
                </span>
              </>
            )}
          </p>
        ) : direct.length === 0 ? (
          <p className="border border-dashed border-[var(--border-ed)] bg-[var(--paper)] px-4 py-5 text-sm text-[var(--ink-2)]">
            Geen signalen binnen dit filter.
          </p>
        ) : (
          <ol className="space-y-3" aria-labelledby="aandacht-nu">
            {direct.map((item) => (
              <Regel
                key={item.id}
                item={item}
                nu={nu}
                open={open.has(item.id)}
                onToggle={(staatOpen) => zetOpen(item.id, staatOpen)}
              />
            ))}
          </ol>
        )}
      </div>

      {later.length > 0 && (
        <div>
          <h4 className="mb-1 flex items-baseline gap-2 text-sm font-semibold text-[var(--ink)]" id="aandacht-later">
            Inplannen
            <span className="font-mono text-xs font-normal tabular-nums text-[var(--ink-3)]">
              {later.length}
              {later.length !== alleLater.length && ` van ${alleLater.length}`}
            </span>
          </h4>
          <p className="mb-1 text-xs text-[var(--ink-3)]">Onderhoud en verbetering zonder haast.</p>
          <ul className="border-t border-[var(--border-ed)]" aria-labelledby="aandacht-later">
            {later.map((item) => (
              <PlanRegel key={item.id} item={item} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
