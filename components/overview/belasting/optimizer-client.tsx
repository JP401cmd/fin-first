'use client'

import { useMemo, useState } from 'react'
import { formatMaskedCurrency } from '@/lib/format'
import { VoorkeurBewerkenSheet } from '@/components/future/voorkeur-bewerken-sheet'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { ScenarioCallout, OrnamentColophon } from '@/components/editorial'
import { BesprekMetWillButton } from '@/components/app/chat/bespreek-met-fin-button'
import { OPTIMIZER_DISCLAIMER, OPTIMIZER_DISCLAIMER_SHORT } from '@/lib/tax-optimizer/compliance'
import { DEFAULT_RETURN, EXPECTED_SAVINGS_RETURN } from '@/lib/constants'
import type { OptimizerCurrentStanding } from '@/lib/tax-optimizer'
import type { GoalSection, OptimizerTopChoice } from '@/lib/tax-optimizer/types'
import type { TaxYear } from '@/lib/box3-data'
import { OptimizerStanding } from './optimizer-standing'
import { OptimizerCompare } from './optimizer-compare'
import { OptimizerDetails } from './optimizer-details'
import {
  buildOpportunities,
  findWinner,
  sortOpportunities,
  type SortMode,
} from './optimizer-model'

const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/**
 * Waar het verwachte beleggingsrendement WOONT: `profiles.expected_return`,
 * beheerd via de markt-aannames op /toekomst/voorkeuren. Dezelfde instelling
 * voedt de FIRE-/horizon-projectie én het netto effect hier.
 *
 * De chip is nu een inline editor: hij opent dezelfde `VoorkeurBewerkenSheet`
 * (kolom 'expected_return') die /toekomst/voorkeuren gebruikt — dus één editor,
 * één schrijfpad (PUT /api/parameters), één waarheid. Dat is géén tweede
 * bewerkpunt maar hetzelfde bewerkpunt, hier bereikbaar op de plek waar je de
 * aanname tegenkomt. De route hieronder blijft als secundaire uitgang binnen de
 * sheet ("beheer al je aannames"), zodat de samenhang met Toekomst zichtbaar
 * blijft zonder een tweede editor.
 */
const RENDEMENT_INSTELLING_HREF = '/toekomst/voorkeuren'

/** Percentage in NL-notatie uit een fractie (0,07 → "7,0%"). */
function fractionPct(fraction: number, digits = 1): string {
  return `${(fraction * 100).toLocaleString('nl-NL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`
}

/** In-page scroll; respecteert prefers-reduced-motion (dan instant i.p.v.
 *  smooth). No-op buiten de browser of waar scrollIntoView ontbreekt (jsdom). */
function scrollToId(id: string) {
  if (typeof document === 'undefined') return
  const el = document.getElementById(id)
  if (el && typeof el.scrollIntoView === 'function') {
    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }
}

/**
 * Box3OptimizerClient — het oppervlak van de fiscale optimizer, in vier
 * katernen: waar je nu staat (I), de vergelijking (II), inzoomen per kans (III)
 * en de voetnoten (IV). Vergelijken komt eerst; het detail volgt op aanvraag.
 *
 * De scenario-generatie, de ranking, de netto-effect-velden en de topkans komen
 * server-side uit `lib/tax-optimizer` (die op zijn beurt de canonieke Box 3-/
 * Box 1-motoren consumeert). Deze component rendert die data puur: sorteren en
 * filteren gebeurt op geleverde velden — geen enkele herberekening.
 *
 * Wft: alles wordt geframed als doorgerekend scenario/kans, met één
 * "Indicatie, geen advies"-callout onder de vergelijking. Nooit imperatief.
 */
export function Box3OptimizerClient({
  sections,
  topChoice = null,
  standing,
  hasPartner,
  perspectiveAware = false,
  year = 2026,
  expectedReturn = DEFAULT_RETURN,
  expectedReturnIsPersonal = false,
}: {
  sections: GoalSection[]
  topChoice?: OptimizerTopChoice | null
  /** De huidige situatie (buildCurrentStanding) — de referentie van katern I. */
  standing: OptimizerCurrentStanding
  hasPartner: boolean
  perspectiveAware?: boolean
  year?: TaxYear
  /**
   * Het verwachte beleggingsrendement waarmee de server de scenario's ECHT
   * heeft doorgerekend (`loadFiscaleKansen(...).expectedReturn`). Weergave-only:
   * de chip toont dit percentage in plaats van de constante nog eens zelf te
   * importeren — anders kan het getoonde percentage van het gebruikte gaan
   * afwijken zodra een gebruiker zijn eigen rendement instelt.
   */
  expectedReturn?: number
  /** true = eigen profiel-instelling; false = de app-standaard. */
  expectedReturnIsPersonal?: boolean
}) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)

  const [sortMode, setSortMode] = useState<SortMode>('netto')
  const [openId, setOpenId] = useState<string | null>(null)
  const [rendementOpen, setRendementOpen] = useState(false)

  const { baseline, opportunities } = useMemo(() => buildOpportunities(sections), [sections])
  const sorted = useMemo(
    () => sortOpportunities(opportunities, sortMode),
    [opportunities, sortMode],
  )
  const winner = useMemo(() => findWinner(sorted, topChoice), [sorted, topChoice])

  const jaarruimteSection = sections.find(
    (s): s is Extract<GoalSection, { kind: 'jaarruimte' }> => s.kind === 'jaarruimte',
  )
  const previewSection = sections.find(
    (s): s is Extract<GoalSection, { kind: 'preview' }> => s.kind === 'preview',
  )

  const openDetail = (id: string) => {
    setOpenId(id)
    scrollToId(`optimizer-detail-${id}`)
  }
  const toggleDetail = (id: string) => {
    setOpenId((current) => (current === id ? null : id))
  }

  return (
    <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6 sm:pb-20">
      {/* ── Aannames waarop de vergelijking rust ─────────────────────────
          Het getoonde rendement is het GEBRUIKTE rendement: server-geleverd via
          `expectedReturn`, niet lokaal uit een constante gelezen. De chip opent
          de editor voor diezelfde instelling. De spaarrente-aanname blijft een
          constante — daar bestaat (nog) geen gebruikersinstelling voor, dus daar
          valt niets te beheren. */}
      <div className="mb-9 flex flex-wrap gap-2">
        <AannameChip
          label="verwacht rendement beleggen"
          value={fractionPct(expectedReturn)}
          note={expectedReturnIsPersonal ? 'eigen instelling' : 'standaard'}
          onEdit={() => setRendementOpen(true)}
          editLabel="aanpassen"
          title={
            expectedReturnIsPersonal
              ? 'Je eigen verwachte rendement uit je toekomst-voorkeuren. Dezelfde aanname voedt je projectie op Toekomst. Klik om aan te passen.'
              : 'De standaardaanname van TriFinity. Klik om je eigen verwachte rendement in te stellen; dezelfde aanname voedt je projectie op Toekomst.'
          }
        />
        <AannameChip label="spaarrente-aanname" value={fractionPct(EXPECTED_SAVINGS_RETURN)} />
        <AannameChip label="belastingjaar" value={String(year)} />
      </div>

      {/* Dezelfde editor als op /toekomst/voorkeuren — zelfde kolom, zelfde
          schrijfpad (PUT /api/parameters), zelfde servernorm (1–15%). Na
          opslaan doet de sheet `router.refresh()`: de server rekent de
          scenario's, de curve, het verloop, de ranking én de topkans opnieuw
          door met de nieuwe aanname (de kansen-loader is React-`cache()`-
          gewrapt, en die cache is request-gescoped — een refresh is een nieuw
          request en levert dus verse data).

          `minPct`/`maxPct` geven we bewust NIET mee: de sheet-default ís de
          servernorm (lib/parameters-band.ts, gedeeld met de route). Ze hier
          herhalen zou een derde kopie van dezelfde band introduceren. */}
      {/* Bewust ONVOORWAARDELIJK gemount met een `open`-prop: bij conditioneel
          mounten draait de focus-trap-cleanup niet en landt een
          toetsenbordgebruiker na sluiten op `<body>` in plaats van terug op de
          chip. */}
      <VoorkeurBewerkenSheet
          open={rendementOpen}
          title="Verwacht rendement beleggen"
          column="expected_return"
          currentValuePct={expectedReturn * 100}
          stepPct={0.1}
          helperText="Dezelfde aanname voedt je projectie op Toekomst: pas je 'm hier aan, dan verschuift daar ook je FIRE-datum en je vrijheidstijd. Wereldwijde aandelen-historie: ~6-8%. Conservatief: 4-5%."
          secondaryLink={{
            href: RENDEMENT_INSTELLING_HREF,
            label: 'Beheer al je aannames op Toekomst › Voorkeuren',
          }}
          onClose={() => setRendementOpen(false)}
        />

      {/* ── Katern I ────────────────────────────────────────────────── */}
      <OptimizerStanding
        standing={standing}
        year={year}
        perspectiveAware={perspectiveAware}
        fc={fc}
      />

      <hr className="my-11 border-t border-[var(--border-ed)]" />

      {/* ── Katern II ───────────────────────────────────────────────── */}
      {opportunities.length === 0 ? (
        <GeenKansen hasPartner={hasPartner} />
      ) : (
        <>
          <OptimizerCompare
            baseline={baseline}
            opportunities={sorted}
            winner={winner}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
            onOpenDetail={openDetail}
            fc={fc}
            year={year}
          />
          {/* Fallback hangt aan de SERVER-waarheid (topChoice), niet aan de
              gefilterde weergave: in de stand "zonder rendementsverlies" kan de
              winnaar uit `sorted` wegvallen terwijl er wél een kans bestaat. */}
          {!topChoice && (
            <div className="mt-6 border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5">
              <p
                className="max-w-[60ch] text-sm italic leading-snug text-[var(--ink-2)]"
                style={{ fontFamily: SOURCE_SERIF }}
              >
                Er springt nu geen kans uit die per saldo vrijheid oplevert. Dat kan goed nieuws
                zijn — je zit fiscaal al gunstig. Wil je toch samen kijken waar ruimte ligt?
              </p>
              <div className="mt-4">
                <BesprekMetWillButton
                  onderwerp="Mijn fiscale situatie"
                  detail="Er is nu geen doorgerekende kans die per saldo voordeel oplevert in de optimizer."
                  vraag="Waar liggen voor mij nog fiscale kansen om vrijheid terug te kopen?"
                />
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-6">
        <ScenarioCallout title={OPTIMIZER_DISCLAIMER_SHORT}>
          {' ' + OPTIMIZER_DISCLAIMER}
        </ScenarioCallout>
      </div>

      <hr className="my-11 border-t border-[var(--border-ed)]" />

      {/* ── Katern III ──────────────────────────────────────────────── */}
      <OptimizerDetails
        opportunities={sorted}
        jaarruimteSection={jaarruimteSection}
        openId={openId}
        onToggle={toggleDetail}
        fc={fc}
        year={year}
      />

      {/* ── Katern IV: voetnoten ────────────────────────────────────── */}
      <div className="mt-14 grid grid-cols-2 gap-6 border-t-4 border-double border-[var(--ink)] pt-6 md:grid-cols-4">
        {/* Zelfde grootheid als de chip bovenaan, dus dezelfde bron: server-
            geleverd `expectedReturn`. Zou hier nog de constante staan, dan
            sprak de voetnoot de chip tegen zodra iemand zijn eigen rendement
            instelt. */}
        <FooterNote kicker="Aannames">
          Verwacht rendement beleggen {fractionPct(expectedReturn)}
          {expectedReturnIsPersonal ? ' (je eigen instelling)' : ' (standaard)'}, spaarrente-aanname{' '}
          {fractionPct(EXPECTED_SAVINGS_RETURN)}, belastingjaar {year}. De vergelijking rekent
          met deze uitgangspunten.
        </FooterNote>
        <FooterNote kicker="Methode">
          Elke heffing komt uit de canonieke Box 3-motor; de jaarruimte-besparing is
          marginaal-correct via de Box 1-motor. Geen eigen sommen op deze pagina.
        </FooterNote>
        <FooterNote kicker="Binnenkort">
          {previewSection?.previewNote ??
            'Laagste belastingdruk over je hele leven: onttrekkingsvolgordes over spaargeld, beleggingen, pensioen en lijfrente. Nog niet doorgerekend.'}
        </FooterNote>
        <FooterNote kicker="Geen advies">{OPTIMIZER_DISCLAIMER}</FooterNote>
      </div>

      <div className="mt-10">
        <OrnamentColophon text="Fiscale optimizer" module="Belasting" />
      </div>
    </section>
  )
}

/**
 * Aanname-chip. Read-only span, tenzij er een `onEdit` is: dan wordt dezelfde
 * chip een knop die de editor voor die aanname opent — bewerken waar je de
 * aanname tegenkomt, zonder de pagina te verlaten.
 *
 * Styling blijft ongewijzigd (mono, `--border-ed`, paper-bg); de knop-variant
 * krijgt alleen een 44px touch-target op klein scherm (`sm:min-h-0` houdt 'm op
 * desktop visueel identiek aan de read-only chips ernaast), een zichtbare
 * focus-ring en een onderstreepte waarde als klikbaarheids-affordance.
 */
function AannameChip({
  label,
  value,
  note,
  onEdit,
  editLabel,
  title,
}: {
  label: string
  value: string
  /** Kleine herkomst-markering, bv. "eigen instelling". */
  note?: string
  /** Aanwezig → de chip wordt een knop die de editor van deze aanname opent. */
  onEdit?: () => void
  /** Wat er gebeurt bij klikken, bv. "aanpassen" — sluit de accessible name af. */
  editLabel?: string
  title?: string
}) {
  const base =
    'inline-flex items-baseline gap-1.5 border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink-2)]'
  const body = (
    <>
      {label}
      <b className="font-medium tabular-nums text-[var(--ink)]">{value}</b>
      {note ? <span className="text-[9.5px] text-[var(--ink-3)]">· {note}</span> : null}
    </>
  )

  if (!onEdit) {
    return (
      <span className={base} title={title}>
        {body}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      // Een aria-label VERVANGT de accessible name, dus de waarde en de
      // herkomst moeten erin — anders hoort een screenreader-gebruiker als
      // enige chip op de rij niet wélk percentage er staat. `title` wordt
      // bovendien niet voorgelezen (aria-label wint) en is onbereikbaar op
      // touch, dus die kan de inhoud niet dragen.
      aria-label={`${label} ${value}${note ? `, ${note}` : ''}${editLabel ? ` — ${editLabel}` : ''}`}
      title={title}
      className={`${base} min-h-[44px] items-center text-left underline decoration-dotted decoration-from-font underline-offset-4 transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-3)] sm:min-h-0 sm:items-baseline`}
    >
      {body}
    </button>
  )
}

function FooterNote({ kicker, children }: { kicker: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.20em] text-[var(--ink-3)]">
        {kicker}
      </div>
      <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">{children}</p>
    </div>
  )
}

/** Geen enkele doorgerekende kans: neutraal, zonder groene bedragen. */
function GeenKansen({ hasPartner }: { hasPartner: boolean }) {
  return (
    <section id="optimizer-vergelijking" className="scroll-mt-24">
      <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <p
          className="mx-auto max-w-[54ch] text-center text-base italic leading-snug text-[var(--ink-2)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Op dit moment vinden we geen scenario dat je Box 3-heffing verlaagt. Dat kan goed nieuws
          zijn — je zit fiscaal al gunstig
          {hasPartner ? '' : ', of je vermogen valt (nog) onder het heffingsvrije vermogen'}.
        </p>
        <div className="mt-5 flex justify-center">
          <BesprekMetWillButton
            onderwerp="Mijn fiscale situatie"
            detail="Er is nu geen doorgerekende directe besparingskans in de optimizer."
            vraag="Waar liggen voor mij nog fiscale kansen om vrijheid terug te kopen?"
          />
        </div>
      </div>
    </section>
  )
}
