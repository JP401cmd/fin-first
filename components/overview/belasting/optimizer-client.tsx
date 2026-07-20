'use client'

import { useState } from 'react'
import {
  Clock,
  ArrowRight,
  Sparkles,
  TrendingDown,
  Users,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react'
import { formatCurrency, formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import {
  Kicker,
  SectionLabel,
  SubsectionLabel,
  ScenarioCallout,
  FiguresStrip,
  OrnamentColophon,
  TogglePill,
  HighlightMark,
} from '@/components/editorial'
import { BesprekMetWillButton } from '@/components/app/chat/bespreek-met-fin-button'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import { JaarruimteCard } from '@/components/overview/jaarruimte-card'
import { OPTIMIZER_DISCLAIMER, OPTIMIZER_DISCLAIMER_SHORT } from '@/lib/tax-optimizer/compliance'
import type {
  GoalSection,
  OptimizerStrategy,
  OptimizerTopChoice,
  TaxOptimizerGoal,
} from '@/lib/tax-optimizer/types'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

const KIND_ICON = {
  'samenstelling-shift': TrendingDown,
  partnerverdeling: Users,
  baseline: Sparkles,
} as const

/** De twee Box 3-toggle-standen (single source, geleefd op top-niveau). */
type Box3Mode = 'minimaal' | 'geen-verlies'

/** Smooth in-page scroll naar een sectie-`id`; `scroll-mt-24` op de sectie
 *  vangt de offset onder de balk op. No-op buiten de browser of waar
 *  `scrollIntoView` ontbreekt (jsdom). */
function scrollToId(id: string) {
  if (typeof document === 'undefined') return
  const el = document.getElementById(id)
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

/**
 * GoalChooser — compacte rij doel-chips als NAVIGATIE (geen filter). Alle
 * secties blijven staan; een klik scrollt naar de betreffende sectie en zet
 * voor de twee Box 3-standen tevens de gedeelde `box3Mode`. Editorial chips:
 * scherpe hoeken, `--border-ed`, hover/active, echte buttons met aria-label.
 */
function GoalChooser({
  hasMinimaal,
  hasGeenVerlies,
  hasJaarruimte,
  hasLevenslang,
  onSelectBox3,
  onSelectJaarruimte,
  onSelectLevenslang,
}: {
  hasMinimaal: boolean
  hasGeenVerlies: boolean
  hasJaarruimte: boolean
  hasLevenslang: boolean
  onSelectBox3: (mode: Box3Mode) => void
  onSelectJaarruimte: () => void
  onSelectLevenslang: () => void
}) {
  const chipClass =
    'inline-flex min-h-[44px] items-center border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 text-[12px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink)] active:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]'

  return (
    <div className="mb-8">
      <SubsectionLabel>Kies een doel</SubsectionLabel>
      <div className="flex flex-wrap gap-2">
        {hasMinimaal && (
          <button
            type="button"
            className={chipClass}
            aria-label="Ga naar Box 3, gesorteerd op grootste besparing"
            onClick={() => onSelectBox3('minimaal')}
          >
            Grootste besparing
          </button>
        )}
        {hasGeenVerlies && (
          <button
            type="button"
            className={chipClass}
            aria-label="Ga naar Box 3, gesorteerd zonder rendementsverlies"
            onClick={() => onSelectBox3('geen-verlies')}
          >
            Zonder rendementsverlies
          </button>
        )}
        {hasJaarruimte && (
          <button
            type="button"
            className={chipClass}
            aria-label="Ga naar Jaarruimte"
            onClick={onSelectJaarruimte}
          >
            Jaarruimte
          </button>
        )}
        {hasLevenslang && (
          <button
            type="button"
            className={chipClass}
            aria-label="Ga naar Levenslange druk"
            onClick={onSelectLevenslang}
          >
            Levenslange druk
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Box3OptimizerClient — het oppervlak van de fiscale-strategie-optimizer.
 *
 * De pagina LEIDT met één duidelijke aanbeveling (`topChoice`, "Je grootste kans
 * nu"), gevolgd door "Alle opties": de twee Box 3-doelen SAMENGEVOEGD tot één
 * katern met een toggle, de jaarruimte (Box 1) en de levenslange-druk-preview.
 * Geen gestapelde muur van vier gelijkwaardige doelen meer.
 *
 * De scenario-generatie én de ranking-per-doel gebeuren server-side; deze
 * component krijgt kant-en-klare `sections` + `topChoice` als plain data en
 * rendert ze puur. Geen data-fetch, geen herberekening van belasting of ranking.
 *
 * Wft: alles wordt geframed als doorgerekend scenario/kans, met een vaste
 * "Indicatie, geen advies"-callout bovenaan. Nooit imperatief.
 */
export function Box3OptimizerClient({
  sections,
  topChoice = null,
  hasPartner,
  perspectiveAware = false,
}: {
  sections: GoalSection[]
  topChoice?: OptimizerTopChoice | null
  hasPartner: boolean
  perspectiveAware?: boolean
}) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)

  // Box 3-toggle-stand op TOP-niveau (single source): zowel de doel-chips
  // bovenaan als de in-sectie-toggle besturen dezelfde `box3Mode`.
  const [box3Mode, setBox3Mode] = useState<Box3Mode>('minimaal')

  // Doelen uit de geleverde secties halen (server-ranking onaangeroerd).
  const box3Min = sections.find(
    (s): s is Extract<GoalSection, { kind: 'box3' }> =>
      s.kind === 'box3' && s.goalId === 'box3-minimaal',
  )
  const box3NoLoss = sections.find(
    (s): s is Extract<GoalSection, { kind: 'box3' }> =>
      s.kind === 'box3' && s.goalId === 'box3-geen-rendementsverlies',
  )
  const jaarruimte = sections.find(
    (s): s is Extract<GoalSection, { kind: 'jaarruimte' }> => s.kind === 'jaarruimte',
  )
  const preview = sections.find(
    (s): s is Extract<GoalSection, { kind: 'preview' }> => s.kind === 'preview',
  )

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-14 sm:pb-20">
      {/* ── Wft-callout: één keer, bovenaan ───────────────────────── */}
      <ScenarioCallout title={OPTIMIZER_DISCLAIMER_SHORT}>{' ' + OPTIMIZER_DISCLAIMER}</ScenarioCallout>

      {/* ── Doel-chips: navigatie naar de secties (geen filter) ───── */}
      <GoalChooser
        hasMinimaal={!!box3Min}
        hasGeenVerlies={!!box3NoLoss}
        hasJaarruimte={!!jaarruimte}
        hasLevenslang={!!preview}
        onSelectBox3={(m) => {
          setBox3Mode(m)
          scrollToId('optimizer-box3')
        }}
        onSelectJaarruimte={() => scrollToId('optimizer-jaarruimte')}
        onSelectLevenslang={() => scrollToId('optimizer-levenslang')}
      />

      {/* ── Leidende aanbeveling ──────────────────────────────────── */}
      <TopChoiceBlock topChoice={topChoice} fc={fc} />

      {/* ── Alle opties: geconsolideerde doelen ───────────────────── */}
      <div>
        <Kicker className="mb-2">Alle opties</Kicker>
        <p
          className="mb-8 text-sm italic leading-snug text-[var(--ink-2)] max-w-[62ch]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Elke fiscale kans doorgerekend — in euro’s én in vrijheidsdagen. Vergelijk op je
          eigen voorwaarden.
        </p>

        <div className="space-y-12 sm:space-y-14">
          {(box3Min || box3NoLoss) && (
            <Box3MergedSection
              num="I"
              minimaal={box3Min}
              geenVerlies={box3NoLoss}
              mode={box3Mode}
              onModeChange={setBox3Mode}
              hasPartner={hasPartner}
              perspectiveAware={perspectiveAware}
              fc={fc}
            />
          )}

          {jaarruimte && (
            <section id="optimizer-jaarruimte" className="scroll-mt-24">
              <GoalHeader num="II" goal={jaarruimte.goal} />
              <JaarruimteCard
                grossYearlyIncome={jaarruimte.grossYearlyIncome}
                pensioenAangroei={jaarruimte.pensionFactorA}
                year={2026}
                dailyExpenses={jaarruimte.dailyExpenses}
              />
            </section>
          )}

          {preview && (
            <section id="optimizer-levenslang" className="scroll-mt-24">
              <GoalHeader num="III" goal={preview.goal} soon />
              <PreviewBody note={preview.previewNote} />
            </section>
          )}
        </div>
      </div>

      <div className="mt-14">
        <OrnamentColophon text="Fiscale optimizer" module="Belasting" />
      </div>
    </section>
  )
}

/**
 * TopChoiceBlock — "Je grootste kans nu". De leidende aanbeveling: de
 * opportuniteit met de hoogste impact over ALLE doelen. Prominente editorial
 * kaart (ink-border + box-accent), besparing groot in vrijheidstijd-framing, een
 * eerlijke kanttekening en één "Bespreek met Fin" + een in-page "Bekijk →".
 *
 * `topChoice === null` → neutrale variant: geen groen bedrag, wél de Fin-knop.
 */
function TopChoiceBlock({
  topChoice,
  fc,
}: {
  topChoice: OptimizerTopChoice | null
  fc: (v: number) => string
}) {
  if (!topChoice) {
    return (
      <div className="mb-12 border border-[var(--ink)] bg-[var(--paper)] p-5 sm:p-7">
        <Kicker>Je grootste kans nu</Kicker>
        <p
          className="mt-3 text-base italic leading-snug text-[var(--ink-2)] max-w-[54ch]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Op dit moment vinden we geen directe besparingskans. Dat kan goed nieuws zijn — je zit
          fiscaal al gunstig. Wil je toch samen kijken waar ruimte ligt?
        </p>
        <div className="mt-5">
          <BesprekMetWillButton
            onderwerp="Mijn fiscale situatie"
            detail="Er is nu geen doorgerekende directe besparingskans in de optimizer."
            vraag="Waar liggen voor mij nog fiscale kansen om vrijheid terug te kopen?"
          />
        </div>
      </div>
    )
  }

  const { title, savings, freedomDays, caveat, kind, anchorId } = topChoice
  const accent = kind === 'box3' ? 'var(--color-box3-500)' : 'var(--color-box1-500)'
  const finDetail =
    `Deze kans levert naar schatting ${formatCurrency(savings)} per jaar op (≈ ${freedomDays} ` +
    `vrijheidsdagen).${caveat ? ` Kanttekening: ${caveat}` : ''}`

  return (
    <div
      className="mb-12 border border-[var(--ink)] bg-[var(--paper)] p-5 sm:p-7"
      style={{ borderLeftWidth: '4px', borderLeftColor: accent }}
    >
      <Kicker>Je grootste kans nu</Kicker>

      <h2
        className="mt-2.5 text-[24px] sm:text-[30px] font-black leading-tight tracking-[-0.02em] text-[var(--ink)]"
        style={{ fontFamily: PLAYFAIR }}
      >
        {title}
      </h2>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className="text-[40px] sm:text-[52px] font-black leading-none tracking-[-0.03em] tabular-nums"
          style={{ fontFamily: PLAYFAIR, color: 'var(--ink)' }}
        >
          <HighlightMark>{fc(savings)}</HighlightMark>
        </span>
        <span className="text-sm uppercase tracking-[0.12em] font-mono text-[var(--ink-3)]">
          per jaar
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-sm text-[var(--ink-2)]">
        <Clock className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
        ≈ <span className="font-semibold text-[var(--ink)]">{freedomDays} vrijheidsdagen</span>{' '}
        teruggekocht per jaar
      </div>

      {caveat && (
        <div className="mt-4 flex items-start gap-2 border-t border-[var(--rule-soft)] pt-3">
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]"
            aria-hidden="true"
          />
          <p className="text-xs leading-snug text-[var(--ink-2)] max-w-[62ch]">{caveat}</p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <BesprekMetWillButton
          onderwerp={title}
          detail={finDetail}
          vraag="Past dit bij mijn situatie en moet ik dit nu doen?"
        />
        <a
          href={`#${anchorId}`}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--ink-2)] underline underline-offset-2 transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          Bekijk
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    </div>
  )
}

/**
 * Box3MergedSection — de twee Box 3-doelen (box3-minimaal +
 * box3-geen-rendementsverlies) samengevoegd tot ÉÉN katern met een toggle.
 * Beide sections worden al server-side geleverd; de toggle wisselt puur welke
 * van de twee getoond wordt (client-state, default "Grootste besparing").
 */
function Box3MergedSection({
  num,
  minimaal,
  geenVerlies,
  mode,
  onModeChange,
  hasPartner,
  perspectiveAware,
  fc,
}: {
  num: string
  minimaal?: Extract<GoalSection, { kind: 'box3' }>
  geenVerlies?: Extract<GoalSection, { kind: 'box3' }>
  /** Gedeelde toggle-stand (single source, van top-niveau). */
  mode: Box3Mode
  onModeChange: (mode: Box3Mode) => void
  hasPartner: boolean
  perspectiveAware: boolean
  fc: (v: number) => string
}) {
  // Actieve section: gekozen stand, met defensieve fallback op de andere.
  const active =
    mode === 'minimaal' ? minimaal ?? geenVerlies : geenVerlies ?? minimaal
  if (!active) return null

  return (
    <section id="optimizer-box3" className="scroll-mt-24">
      <SectionLabel num={num}>Fiscaal doel</SectionLabel>
      <div className="-mt-3 mb-5">
        <h2
          className="text-[22px] sm:text-[26px] font-black leading-tight tracking-[-0.02em] text-[var(--ink)]"
          style={{ fontFamily: PLAYFAIR }}
        >
          Box 3-vermogen
        </h2>
        <p
          className="mt-1.5 text-sm italic leading-snug text-[var(--ink-2)] max-w-[62ch]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Verlaag de belasting op je spaargeld en beleggingen. Kies of je puur op de grootste
          besparing wilt sturen, of alleen op besparingen die je geen rendement kosten.
        </p>
      </div>

      {/* Toggle tussen de twee al-geleverde standen. min-h-[44px]-wrapper voor
          een volwaardig touch-target rond de pills. */}
      {minimaal && geenVerlies && (
        <div className="mb-5 flex min-h-[44px] flex-wrap items-center gap-2">
          <span className="mr-1 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
            Sorteer op
          </span>
          <TogglePill
            on={mode === 'minimaal'}
            label="Grootste besparing"
            onClick={() => onModeChange('minimaal')}
          />
          <TogglePill
            on={mode === 'geen-verlies'}
            label="Zonder rendementsverlies"
            onClick={() => onModeChange('geen-verlies')}
          />
        </div>
      )}

      <Box3GoalBody
        section={active}
        hasPartner={hasPartner}
        perspectiveAware={perspectiveAware}
        fc={fc}
      />
    </section>
  )
}

/** Doel-kop: genummerde rule + Playfair-label + editorial deck (goal.description). */
function GoalHeader({
  num,
  goal,
  soon = false,
}: {
  num: string
  goal: TaxOptimizerGoal
  soon?: boolean
}) {
  return (
    <div>
      <SectionLabel num={num}>Fiscaal doel</SectionLabel>
      <div className="-mt-3 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <h2
            className="text-[22px] sm:text-[26px] font-black leading-tight tracking-[-0.02em] text-[var(--ink)]"
            style={{ fontFamily: PLAYFAIR }}
          >
            {goal.label}
          </h2>
          {soon && (
            <span className="shrink-0 rounded-full border border-[var(--rule-soft)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] font-mono text-[var(--ink-3)]">
              binnenkort
            </span>
          )}
        </div>
        <p
          className="mt-1.5 text-sm italic leading-snug text-[var(--ink-2)] max-w-[62ch]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          {goal.description}
        </p>
      </div>
    </div>
  )
}

/** De Box 3-scenario-vergelijking: FiguresStrip + ScenarioBars + winnaar-kaart
 *  volledig + overige scenario's als compacte, uitklapbare rijen. */
function Box3GoalBody({
  section,
  hasPartner,
  perspectiveAware,
  fc,
}: {
  section: Extract<GoalSection, { kind: 'box3' }>
  hasPartner: boolean
  perspectiveAware: boolean
  fc: (v: number) => string
}) {
  const { baseline, ranked, best, goalId } = section
  const hasStrategies = ranked.length > 0
  const lowestTax = best ? best.optimizedTax : baseline.currentTax

  // De stand "zonder rendementsverlies" (box3-geen-rendementsverlies): een
  // rendement-kostende shift telt hier NIET als besparing. De summary-labels en
  // de scenario-styling zijn erop afgestemd zodat "Besparing € 0" niet in
  // tegenspraak staat met een groene shift-kaart eronder. De stand "grootste
  // besparing" laat de shift wél als groene winst zien.
  const noReturnLoss = goalId === "box3-geen-rendementsverlies"

  // Progressive disclosure: de winnaar volledig, de rest compact + uitklapbaar.
  const rest = ranked.filter((s) => s.id !== best?.id)

  return (
    <>
      {/* Uitkomst-strook */}
      <div className="flex flex-wrap items-center gap-3">
        <Kicker>Wat het kan opleveren</Kicker>
        {perspectiveAware && <PerspectiveContextLabel />}
      </div>
      <FiguresStrip
        cols={4}
        figures={[
          { kicker: "Huidige heffing", amount: fc(baseline.currentTax), sub: "per jaar" },
          {
            kicker: noReturnLoss ? "Laagst haalbaar (kosteloos)" : "Laagst haalbaar",
            amount: fc(lowestTax),
            sub: "in dit scenario",
          },
          {
            kicker: "Besparing",
            amount: fc(best ? best.savings : 0),
            sub: best ? "per jaar" : noReturnLoss ? "geen kosteloze besparing" : "geen gevonden",
            variant: best ? "winner" : "neutral",
          },
          {
            kicker: "Vrijheid",
            amount: best && best.freedomDays > 0 ? `${best.freedomDays} dagen` : "—",
            sub: "teruggekocht per jaar",
            variant: best && best.freedomDays > 0 ? "positive" : "neutral",
          },
        ]}
      />

      {/* Kleine visualisatie: alle scenario’s als zichtbare keuze t.o.v. "nu". */}
      {hasStrategies && (
        <div className="mt-1 mb-6">
          <SubsectionLabel>Alle scenario’s t.o.v. nu</SubsectionLabel>
          <ScenarioBars baseline={baseline} ranked={ranked} dimReturnCost={noReturnLoss} fc={fc} />
        </div>
      )}

      {/* Scenario’s naast elkaar (detail): de winnaar volledig uitgeklapt, de
          overige scenario’s als compacte rij met "Toon detail"-uitklap. */}
      <SubsectionLabel>De scenario’s naast elkaar</SubsectionLabel>
      {!hasStrategies ? (
        <EmptyState hasPartner={hasPartner} />
      ) : (
        <div className="space-y-3">
          {/* Referentie-rij: de huidige situatie. */}
          <BaselineRow tax={baseline.currentTax} fc={fc} />
          {best && (
            <StrategyCard
              strategy={best}
              isBest
              returnCostMuted={noReturnLoss && best.hasReturnCost}
              fc={fc}
            />
          )}
          {rest.map((s) => (
            <CompactStrategyRow
              key={s.id}
              strategy={s}
              returnCostMuted={noReturnLoss && s.hasReturnCost}
              fc={fc}
            />
          ))}
        </div>
      )}

      {/* Doel B zonder kosteloze winnaar: uitleg waarom er geen "beste" is. */}
      {hasStrategies && !best && noReturnLoss && (
        <p
          className="mt-4 text-sm italic leading-snug text-[var(--ink-2)] max-w-[60ch]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          De enige hefboom die je heffing nu verlaagt kost verwacht rendement. Een verlaging
          zónder rendementsverlies vraagt een fiscaal partner om het vermogen mee te verdelen.
        </p>
      )}
    </>
  )
}

/**
 * ScenarioBars — compacte editorial balk-visualisatie die alle scenario’s van
 * een box3-doel tegen de huidige situatie zet. Puur presentatie o.b.v.
 * bestaande OptimizerStrategy-velden (currentTax/optimizedTax/savings/
 * freedomDays) — géén nieuwe rekenwaarden. Alle balken delen één as (max-heffing
 * = volle breedte); box3-heffing als enige grondslag (geen box1-bedragen).
 *
 * Per scenario: een solide "resterende heffing"-segment (optimizedTax) + een
 * gemarkeerd "bespaard"-segment (savings). In Doel II worden rendement-kostende
 * scenario’s gedempt/gearceerd i.p.v. positief-groen getoond.
 */
function ScenarioBars({
  baseline,
  ranked,
  dimReturnCost,
  fc,
}: {
  baseline: OptimizerStrategy
  ranked: OptimizerStrategy[]
  dimReturnCost: boolean
  fc: (v: number) => string
}) {
  // Gedeelde as: de grootste heffing die op een balk voorkomt (referentie of een
  // scenario’s eigen ‘currentTax’) = volle breedte. min. 1 tegen deel-door-nul.
  const maxTax = Math.max(
    baseline.currentTax,
    ...ranked.map((s) => Math.max(s.currentTax, s.optimizedTax)),
    1,
  )
  // Canonieke grafiek-animatie: balken vullen van 0% → eindbreedte bij
  // viewport-intrede, met een lichte stagger (zie spaarquote-widget).
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })
  return (
    <div ref={ref} className="space-y-2.5">
      <BarRow
        label="Huidige situatie"
        amount={`${fc(baseline.currentTax)}/jr`}
        taxPct={(baseline.currentTax / maxTax) * 100}
        savingsPct={0}
        tone="reference"
        hasEntered={hasEntered}
        delayIndex={0}
      />
      {ranked.map((s, i) => (
        <BarRow
          key={s.id}
          label={s.title}
          amount={`${fc(s.optimizedTax)}/jr`}
          taxPct={(s.optimizedTax / maxTax) * 100}
          savingsPct={(s.savings / maxTax) * 100}
          tone={dimReturnCost && s.hasReturnCost ? "muted" : "positive"}
          hasEntered={hasEntered}
          delayIndex={i + 1}
          note={
            dimReturnCost && s.hasReturnCost
              ? "kost rendement — zie Grootste besparing"
              : s.freedomDays > 0
                ? `−${fc(s.savings)} · ${s.freedomDays} vrijheidsdagen`
                : `−${fc(s.savings)}`
          }
        />
      ))}
    </div>
  )
}

function BarRow({
  label,
  amount,
  taxPct,
  savingsPct,
  tone,
  note,
  hasEntered,
  delayIndex,
}: {
  label: string
  amount: string
  /** Breedte van het resterende-heffing-segment (%). */
  taxPct: number
  /** Breedte van het bespaard-segment (%). */
  savingsPct: number
  tone: "reference" | "positive" | "muted"
  note?: string
  /** True zodra de container in beeld is (start de fill-animatie). */
  hasEntered: boolean
  /** Stagger-index: 60ms per balk. */
  delayIndex: number
}) {
  // Gearceerde vulling voor rendement-kostende besparing: leest niet als winst.
  const savingsFill =
    tone === "muted"
      ? {
          backgroundColor: "var(--subtle)",
          backgroundImage:
            "repeating-linear-gradient(45deg, var(--ink-4) 0, var(--ink-4) 1.5px, transparent 1.5px, transparent 5px)",
        }
      : { backgroundColor: "var(--positive)" }
  const noteColor = tone === "positive" ? "var(--positive)" : "var(--ink-3)"
  // Canonieke fill-animatie: 0% → eindbreedte bij intrede, met stagger. De delay
  // zit ín de transition-shorthand (geen aparte transitionDelay-longhand — dat
  // mixt shorthand/longhand en waarschuwt React). Vóór intrede geen transition.
  const barTransition = hasEntered
    ? `width 700ms cubic-bezier(.22,1,.36,1) ${delayIndex * 60}ms`
    : "none"
  const taxWidth = hasEntered ? `${taxPct}%` : "0%"
  const savingsWidth = hasEntered ? `${savingsPct}%` : "0%"
  return (
    <div className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 sm:gap-4">
      <span className="truncate text-[12px] leading-snug text-[var(--ink-2)]" title={label}>
        {label}
      </span>
      <div className="h-2.5 w-full overflow-hidden bg-[var(--subtle)]">
        <div className="flex h-full w-full">
          <div
            className="h-full"
            style={{
              width: taxWidth,
              transition: barTransition,
              backgroundColor: tone === "reference" ? "var(--ink-3)" : "var(--ink-4)",
            }}
          />
          {savingsPct > 0 && (
            <div
              className="h-full"
              style={{ width: savingsWidth, transition: barTransition, ...savingsFill }}
            />
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-[12px] tabular-nums text-[var(--ink)]">{amount}</div>
        {note && (
          <div className="font-mono text-[10px] tabular-nums leading-tight" style={{ color: noteColor }}>
            {note}
          </div>
        )}
      </div>
    </div>
  )
}

/** Preview-doel: gedempte, gemarkeerde kaart met wat er straks doorgerekend wordt. */
function PreviewBody({ note }: { note: string }) {
  return (
    <div className="border border-dashed border-[var(--rule-soft)] bg-transparent p-6">
      <p
        className="text-sm italic leading-snug text-[var(--ink-2)] max-w-[60ch]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        {note}
      </p>
      <p className="mt-3 text-[11px] uppercase tracking-[0.14em] font-mono text-[var(--ink-3)]">
        Nog niet doorgerekend
      </p>
    </div>
  )
}

function BaselineRow({ tax, fc }: { tax: number; fc: (v: number) => string }) {
  return (
    <div className="flex items-center justify-between gap-3 border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3">
      <span className="flex items-center gap-2.5">
        <Sparkles className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
        <span className="text-sm font-semibold text-[var(--ink)]">Huidige situatie</span>
        <span className="text-[10px] uppercase tracking-[0.1em] font-mono text-[var(--ink-3)]">referentie</span>
      </span>
      <span className="text-sm font-mono tabular-nums text-[var(--ink-2)]">{fc(tax)}/jr</span>
    </div>
  )
}

function StrategyCard({
  strategy,
  isBest,
  returnCostMuted = false,
  fc,
}: {
  strategy: OptimizerStrategy
  isBest: boolean
  /** True in Doel II voor rendement-kostende scenario's: gedempt tonen (niet
   *  positief-groen) zodat de kaart niet leest als een aanbevolen besparing. */
  returnCostMuted?: boolean
  fc: (v: number) => string
}) {
  const Icon = KIND_ICON[strategy.kind] ?? Sparkles
  // Een besparing die rendement kost, telt in Doel II niet als "winst": geen
  // positieve kleur, wel het bedrag (ter info) + een expliciete marker.
  const positive = strategy.savings > 0 && !returnCostMuted
  const savingsColor = returnCostMuted
    ? 'var(--ink-3)'
    : positive
      ? 'var(--positive)'
      : 'var(--ink)'

  return (
    <article
      className={`bg-[var(--paper)] ${returnCostMuted ? 'border border-[var(--border-ed)]' : 'border border-[var(--ink)]'}`}
      style={
        isBest && !returnCostMuted
          ? { borderLeftWidth: '4px', borderLeftColor: 'var(--positive)' }
          : undefined
      }
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center bg-[var(--color-box3-50)]">
              <Icon className="h-4 w-4 text-[var(--color-box3-700)]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-[var(--ink)] leading-snug">
                  {strategy.title}
                </h3>
                {isBest && (
                  <span className="rounded-full bg-[color-mix(in_srgb,var(--positive)_14%,transparent)] px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-mono font-semibold text-[var(--positive)]">
                    grootste kans
                  </span>
                )}
              </div>
              <p
                className="mt-1 text-sm italic leading-snug text-[var(--ink-2)] max-w-[62ch]"
                style={{ fontFamily: SOURCE_SERIF }}
              >
                {strategy.description}
              </p>
            </div>
          </div>
        </div>

        {/* Compare: huidig → geoptimaliseerd + besparing */}
        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
          <BeforeAfter
            currentLabel={strategy.currentLabel}
            currentTax={strategy.currentTax}
            optimizedLabel={strategy.optimizedLabel}
            optimizedTax={strategy.optimizedTax}
            fc={fc}
          />
          {/* Op mobiel links-uitgelijnd onder de before/after gestapeld (weg uit
              de rechtsonder-FAB-baan); vanaf sm rechts uitgelijnd als vanouds. */}
          <div className="w-full text-left sm:w-auto sm:ml-auto sm:text-right">
            <div className="text-[10px] uppercase tracking-[0.14em] font-mono text-[var(--ink-3)]">
              Besparing
            </div>
            <div
              className="text-[26px] sm:text-[30px] font-black leading-none tracking-[-0.02em] tabular-nums"
              style={{ fontFamily: PLAYFAIR, color: savingsColor }}
            >
              {fc(strategy.savings)}
            </div>
            {returnCostMuted ? (
              <div className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-[var(--ink-3)]">
                <TrendingDown className="h-3 w-3" aria-hidden="true" />
                kost rendement — zie Grootste besparing
              </div>
            ) : (
              positive &&
              strategy.freedomDays > 0 && (
                <div className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {strategy.freedomDays} vrijheidsdagen
                </div>
              )
            )}
          </div>
        </div>

        {/* Uitlegbaarheid: aanname / regeling / jaar */}
        {strategy.detail.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
            {strategy.detail.map((d, i) => (
              <li
                key={i}
                className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-3)]"
              >
                <span
                  aria-hidden
                  className="inline-block h-1 w-1 rounded-full bg-[var(--ink-4)]"
                />
                {d}
              </li>
            ))}
          </ul>
        )}

        {/* Kanttekening (afweging voor de gebruiker) */}
        {strategy.caveat && (
          <div className="mt-3 flex items-start gap-2 border-t border-[var(--rule-soft)] pt-3">
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]"
              aria-hidden="true"
            />
            <p className="text-xs leading-snug text-[var(--ink-2)]">{strategy.caveat}</p>
          </div>
        )}
      </div>
    </article>
  )
}

/**
 * CompactStrategyRow — een niet-winnaar-scenario in compacte vorm: titel +
 * voor→na-heffing + besparing, met een "Toon detail"-uitklap voor de
 * kanttekening en detail-bullets. Houdt de rendement-kostende demping (
 * `returnCostMuted`) aan in de stand "zonder rendementsverlies".
 */
function CompactStrategyRow({
  strategy,
  returnCostMuted,
  fc,
}: {
  strategy: OptimizerStrategy
  returnCostMuted: boolean
  fc: (v: number) => string
}) {
  const [open, setOpen] = useState(false)
  const positive = strategy.savings > 0 && !returnCostMuted
  const savingsColor = returnCostMuted
    ? 'var(--ink-3)'
    : positive
      ? 'var(--positive)'
      : 'var(--ink)'
  const hasDetail = strategy.detail.length > 0 || !!strategy.caveat

  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)]">
      <div className="flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold leading-snug text-[var(--ink)]">
            {strategy.title}
          </h4>
          <div className="mt-1 flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
            <span className="line-through decoration-[var(--ink-4)]">
              {fc(strategy.currentTax)}/jr
            </span>
            <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="text-[var(--ink-2)]">{fc(strategy.optimizedTax)}/jr</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className="font-mono text-[15px] font-semibold leading-none tabular-nums"
            style={{ color: savingsColor }}
          >
            {fc(strategy.savings)}
          </div>
          {returnCostMuted ? (
            <div className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] text-[var(--ink-3)]">
              <TrendingDown className="h-3 w-3" aria-hidden="true" />
              kost rendement — zie Grootste besparing
            </div>
          ) : (
            positive &&
            strategy.freedomDays > 0 && (
              <div className="mt-1 font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
                {strategy.freedomDays} vrijheidsdagen
              </div>
            )
          )}
        </div>
      </div>

      {hasDetail && (
        <div className="border-t border-[var(--rule-soft)]">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex w-full items-center gap-1 px-3 py-2 text-left text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] sm:px-4"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
            {open ? 'Verberg detail' : 'Toon detail'}
          </button>
          {open && (
            <div className="px-3 pb-3 sm:px-4">
              <p
                className="text-sm italic leading-snug text-[var(--ink-2)] max-w-[62ch]"
                style={{ fontFamily: SOURCE_SERIF }}
              >
                {strategy.description}
              </p>
              {strategy.detail.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                  {strategy.detail.map((d, i) => (
                    <li
                      key={i}
                      className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-3)]"
                    >
                      <span
                        aria-hidden
                        className="inline-block h-1 w-1 rounded-full bg-[var(--ink-4)]"
                      />
                      {d}
                    </li>
                  ))}
                </ul>
              )}
              {strategy.caveat && (
                <div className="mt-3 flex items-start gap-2 border-t border-[var(--rule-soft)] pt-3">
                  <AlertTriangle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]"
                    aria-hidden="true"
                  />
                  <p className="text-xs leading-snug text-[var(--ink-2)]">{strategy.caveat}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BeforeAfter({
  currentLabel,
  currentTax,
  optimizedLabel,
  optimizedTax,
  fc,
}: {
  currentLabel: string
  currentTax: number
  optimizedLabel: string
  optimizedTax: number
  fc: (v: number) => string
}) {
  return (
    <div className="flex items-center gap-3">
      <ValueBlock label={currentLabel} value={fc(currentTax)} muted />
      <ArrowRight className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
      <ValueBlock label={optimizedLabel} value={fc(optimizedTax)} />
    </div>
  )
}

function ValueBlock({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] font-mono text-[var(--ink-3)]">
        {label}
      </div>
      <div
        className={`text-sm font-mono tabular-nums ${muted ? 'text-[var(--ink-3)] line-through decoration-[var(--ink-4)]' : 'text-[var(--ink)] font-semibold'}`}
      >
        {value}/jr
      </div>
    </div>
  )
}

function EmptyState({ hasPartner }: { hasPartner: boolean }) {
  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-6 text-center">
      <p
        className="text-base italic leading-snug text-[var(--ink-2)] max-w-[52ch] mx-auto"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        Op dit moment vinden we geen scenario dat je Box 3-heffing verlaagt. Dat kan goed nieuws
        zijn — je zit fiscaal al gunstig
        {hasPartner ? '' : ', of je vermogen valt (nog) onder het heffingsvrije vermogen'}.
      </p>
    </div>
  )
}
