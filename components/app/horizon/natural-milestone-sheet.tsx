'use client'

/**
 * NaturalMilestoneSheet — info-overlay voor een automatisch afgeleide mijlpaal.
 *
 * In tegenstelling tot een life-event opent een natuurlijke mijlpaal (hypotheek
 * afgelost, eerste miljoen, vermogen op, Box 3-drempel, …) **geen** edit-pane —
 * er valt niets te bewerken. Wel verdient het moment context: waarom is dit
 * relevant, hoe is het berekend, wat is de bron?
 *
 * Render-strategie: ShellOverlay kind="sheet" (driewegregel). Single-context
 * informatie-card, terugkeer naar chart. Geen multi-section navigatie, dus
 * niet pane. Geen onomkeerbaarheid, dus niet confirm. Sheet matched perfect:
 * "even iets snel doen" — hier: "even iets snel lezen + doorklikken naar
 * bron".
 *
 * Krant-design:
 *  - Kicker met streep (categorie-label, mono UPPERCASE)
 *  - Headline (Playfair) met italic-em op het kern-woord
 *  - Editorial deck (italic Source Serif) onder titel
 *  - Figures-strip (2 cols) met leeftijd + bedrag
 *  - Body-paragraaf met kind-specifieke uitleg
 *  - Primary action: "Bekijk bron" of "Sluiten" (sim-momenten zonder bron)
 */

import { useRouter } from 'next/navigation'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { noteOverlayNavigation } from '@/lib/overlay-history'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type { NaturalMilestone, NaturalMilestoneKind } from '@/lib/natural-milestones'

// ── Kind-specifieke copy ───────────────────────────────────────────

interface MilestoneCopy {
  /** UPPERCASE kicker-label */
  kicker: string
  /** Hero-titel — italic-em-keyword tussen %em%-markers */
  headline: string
  /** Editorial-deck-zin (Source Serif italic) */
  deck: string
  /** Body-paragraaf met "waarom dit relevant is" — kan inline highlights bevatten */
  body: string
  /** Krant-toon label voor het hoofdbedrag (figures-strip rechter cel) */
  amountLabel: string
}

function copyFor(kind: NaturalMilestoneKind): MilestoneCopy {
  switch (kind) {
    case 'debt_payoff':
      return {
        kicker: 'Schuld · Aflossing voltooid',
        headline: 'Een %em%schuld%em% van je balans',
        deck:
          'Op deze leeftijd is de laatste termijn betaald. Het maandelijkse bedrag ' +
          'dat tot dan toe naar de schuldeiser ging, komt vrij voor jezelf.',
        body:
          'Berekend op basis van je huidige saldo, rente en maandelijkse betaling. ' +
          'Verandert wanneer je extra aflost of de looptijd aanpast.',
        amountLabel: 'Nog af te lossen',
      }
    case 'debt_free':
      return {
        kicker: 'Schuld · Schuldenvrij',
        headline: 'Volledig %em%schuldenvrij%em%',
        deck:
          'Alle actieve schulden zijn op deze leeftijd afgelost — een sterke ' +
          'financiële mijlpaal.',
        body:
          'Het tijdstip waarop je laatste schuld afgelost is. Voortaan werkt al ' +
          'je vermogen voor jou, niet meer voor de bank.',
        amountLabel: 'Aantal schulden nu',
      }
    case 'fixed_rate_reset':
      return {
        kicker: 'Hypotheek · Rentevast eindigt',
        headline: 'Je %em%renteperiode%em% loopt af',
        deck:
          'Vanaf dit moment moet je een nieuwe renteperiode kiezen. Een hogere ' +
          'rentevoet kan je maandlasten en daarmee je vrijheidsdatum raken.',
        body:
          'Goed moment om scenarios door te rekenen: oversluiten, extra aflossen, ' +
          'of meenemen naar een nieuwe woning.',
        amountLabel: 'Resterend saldo nu',
      }
    case 'asset_expiry':
      return {
        kicker: 'Bezitting · Polis-uitkering',
        headline: 'Je %em%polis%em% keert uit',
        deck:
          'De afgesproken einddatum van je levensverzekering. Het uit te keren ' +
          'bedrag komt op deze leeftijd vrij voor je vermogen.',
        body:
          'Het exacte uitkeringsbedrag hangt af van de polisvoorwaarden en eventueel ' +
          'overgangsrecht (polissen vóór 2001).',
        amountLabel: 'Huidige opbouwwaarde',
      }
    case 'asset_maturity':
      return {
        kicker: 'Bezitting · Vrij beschikbaar',
        headline: 'Je deposito wordt %em%vrij%em%',
        deck:
          'Op deze datum is je lock-periode voorbij en kun je over het geld ' +
          'beschikken — zonder boete voor vroegtijdige opname.',
        body:
          'Een goed moment om te beslissen: herinleggen tegen actuele rente, ' +
          'verschuiven naar beleggingen, of beschikbaar houden als buffer.',
        amountLabel: 'Huidige waarde',
      }
    case 'vehicle_runoff':
      return {
        kicker: 'Voertuig · Afschrijving voltooid',
        headline: 'Je voertuig is %em%volledig afgeschreven%em%',
        deck:
          'Volgens je opgegeven afschrijvingstempo bereikt deze auto op deze ' +
          'leeftijd waarde €0 op je balans.',
        body:
          'In de praktijk houdt een auto vaak nog wat restwaarde. Goed moment ' +
          'om de boekwaarde te herijken aan een actuele taxatie.',
        amountLabel: 'Huidige waarde',
      }
    case 'sim_out_of_cash':
      return {
        kicker: 'Simulatie · Kritisch',
        headline: 'Je %em%vermogen%em% is op',
        deck:
          'In het huidige scenario bereikt je portfolio op deze leeftijd nul. ' +
          'Vanaf hier zijn AOW en eventuele andere vaste inkomens je enige bron.',
        body:
          'Overwegingen: langer doorwerken, uitgaven verlagen, hoger rendement ' +
          'najagen (met meer risico), of een conservatievere onttrekkingsstrategie.',
        amountLabel: 'Drempel',
      }
    case 'sim_peak':
      return {
        kicker: 'Simulatie · Top van de curve',
        headline: 'Je %em%piek-vermogen%em%',
        deck:
          'Het hoogste vermogen dat je in de simulatie bereikt. Hierna begint ' +
          'het netto-vermogen te dalen door onttrekkingen.',
        body:
          'Dit is geen alarm — onttrekken nadat je FIRE-doel bereikt is, is ' +
          'precies waar het plan voor bedoeld is. Het markeert de overgang van ' +
          'opbouw naar afbouw.',
        amountLabel: 'Vermogen op piek',
      }
    case 'sim_first_million':
      return {
        kicker: 'Simulatie · Mijlpaal',
        headline: 'Je eerste %em%miljoen%em%',
        deck:
          'Een psychologische grens — op deze leeftijd passeert je vermogen ' +
          'in het huidige scenario voor het eerst € 1 miljoen.',
        body:
          'Veel langer dan je denkt? Compound interest is een marathon — de ' +
          'tweede miljoen komt typisch sneller dan de eerste.',
        amountLabel: 'Vermogen op die leeftijd',
      }
    case 'sim_box3_threshold':
      return {
        kicker: 'Simulatie · Box 3-drempel',
        headline: 'Voorbij het %em%heffingsvrij%em% vermogen',
        deck:
          'Op deze leeftijd passeert je vermogen het Box 3-vrijstellingsbedrag. ' +
          'Vanaf dit punt betaal je fictief rendement-belasting over het ' +
          'meerdere.',
        body:
          'Strategieën: pensioen-opbouw met fiscaal voordeel, schenken aan ' +
          'kinderen, of vastgoed (Box 1) als woningwaarde-component.',
        amountLabel: 'Heffingsvrij vermogen',
      }
    default:
      return {
        kicker: 'Natuurlijke mijlpaal',
        headline: 'Een moment op je tijdlijn',
        deck: 'Een automatisch afgeleid moment uit je financiële gegevens.',
        body: 'Geen verdere uitleg beschikbaar.',
        amountLabel: 'Bedrag',
      }
  }
}

/** Bepaalt naar welke route de "Bekijk bron"-knop linkt. `null` betekent geen bron-actie. */
function sourceRouteFor(m: NaturalMilestone): { href: string; label: string } | null {
  if (m.category === 'debt') {
    return { href: '/core/debts', label: 'Bekijk schuld' }
  }
  if (m.category === 'asset') {
    return { href: '/core/assets', label: 'Bekijk bezitting' }
  }
  // sim-momenten hebben geen bron-rij — alleen sluit-knop
  return null
}

/** Splits `headline` op `%em%word%em%` markers en rendert het kern-woord als italic-em. */
function renderHeadline(template: string) {
  const parts = template.split(/%em%/g)
  return parts.map((part, idx) => {
    if (idx % 2 === 1) {
      return (
        <em
          key={idx}
          className="font-serif italic font-normal text-[var(--color-horizon-700)]"
        >
          {part}
        </em>
      )
    }
    return <span key={idx}>{part}</span>
  })
}

// ── Component ──────────────────────────────────────────────────────

export function NaturalMilestoneSheet({
  open,
  milestone,
  onClose,
}: {
  open: boolean
  milestone: NaturalMilestone | null
  onClose: () => void
}) {
  const router = useRouter()
  const { masked } = useMaskedAmounts()
  const fc = (v: number | undefined) =>
    v == null ? '—' : formatMaskedCurrency(v, masked)

  // Render lege state als open zonder milestone — zou niet moeten gebeuren,
  // maar dekt edge-cases af zodat we niet crashen op `.kind` lookup.
  if (!milestone) {
    return (
      <ShellOverlay open={open} onClose={onClose} kind="sheet" size="sm" title="Mijlpaal">
        <p className="px-5 py-6 text-sm italic text-[var(--ink-3)]">
          Geen mijlpaal-data beschikbaar.
        </p>
      </ShellOverlay>
    )
  }

  const copy = copyFor(milestone.kind)
  const source = sourceRouteFor(milestone)
  const isAsset = milestone.category === 'asset'
  const isDebt = milestone.category === 'debt'
  const isSim = milestone.category === 'simulation'

  // Datum-format voor figures-strip — "mrt 2045" stijl, krant-toon
  const formattedDate = (() => {
    if (!milestone.target_date) return '—'
    const d = new Date(milestone.target_date)
    if (Number.isNaN(d.getTime())) return milestone.target_date
    const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
    return `${months[d.getMonth()]} ${d.getFullYear()}`
  })()

  // Categorie-tint voor de kicker-streep — debt context = brown (kern), asset = gold (horizon), sim = ink
  const accentColor = isDebt
    ? 'var(--color-kern-500)'
    : isAsset
      ? 'var(--color-horizon-500)'
      : 'var(--ink-2)'

  return (
    <ShellOverlay
      open={open}
      onClose={onClose}
      kind="sheet"
      size="md"
      title="Mijlpaal"
    >
      <article className="px-5 pb-6 pt-2 sm:px-7">
        {/* Kicker met streep — categorie-label */}
        <div className="mb-3 flex items-center gap-2.5 text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--ink-3)]">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: accentColor }}
          />
          {copy.kicker}
        </div>

        {/* Hero-titel — Playfair met italic-em-keyword */}
        <h2
          className="text-[22px] sm:text-[26px] leading-tight font-bold tracking-[-0.01em] text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          {renderHeadline(copy.headline)}
        </h2>

        {/* Editorial deck — italic Source Serif onder titel */}
        <p
          className="mt-3 border-l-2 pl-3 font-serif text-[14px] italic leading-snug text-[var(--ink-2)] max-w-[60ch]"
          style={{ borderLeftColor: accentColor }}
        >
          {copy.deck}
        </p>

        {/* Figures-strip — leeftijd · datum · bedrag */}
        <div className="my-6 grid grid-cols-3 border-t border-b border-[var(--ink)]">
          <FiguresCell kicker="Leeftijd" value={`${milestone.target_age}j`} />
          <FiguresCell kicker="Datum" value={formattedDate} hasBorder />
          <FiguresCell
            kicker={copy.amountLabel}
            value={
              milestone.kind === 'debt_free' && typeof milestone.amount === 'undefined'
                ? '✓'
                : fc(milestone.amount)
            }
            hasBorder
            highlight
          />
        </div>

        {/* Body — Source Serif paragraaf met context */}
        <p className="font-serif text-[14.5px] leading-relaxed text-[var(--ink-2)] max-w-[60ch]">
          {copy.body}
        </p>

        {/* Footer-acties */}
        <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-[var(--border-ed)] pt-4">
          {source && (
            <button
              type="button"
              onClick={() => {
                // Deze sluiting hoort bij de navigatie erboven: zonder dit
                // signaal consumeert de overlay-history haar entry met een
                // `history.back()` die de nog lopende route-wissel afbreekt
                // (geen link-klik om aan te herkennen — dit is een knop).
                // Zie lib/overlay-history.ts.
                noteOverlayNavigation()
                router.push(source.href)
                onClose()
              }}
              className="inline-flex h-11 items-center gap-2 border-2 border-[var(--ink)] bg-[var(--ink)] px-4 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              {source.label}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center gap-2 border-2 border-[var(--ink)] bg-transparent px-4 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            Sluiten
          </button>
          {isSim && (
            <p className="ml-auto text-[10px] italic text-[var(--ink-4)]">
              Uit simulatie-output
            </p>
          )}
        </div>
      </article>
    </ShellOverlay>
  )
}

// ── Figures-cell sub-component ─────────────────────────────────────

function FiguresCell({
  kicker,
  value,
  hasBorder,
  highlight,
}: {
  kicker: string
  value: string
  hasBorder?: boolean
  highlight?: boolean
}) {
  return (
    <div
      className={`px-3 py-4 sm:py-5 ${hasBorder ? 'border-l border-[var(--rule-soft,var(--border-ed))]' : ''}`}
    >
      <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--ink-3)]">
        {kicker}
      </p>
      <p
        className={`mt-1.5 font-mono text-[18px] sm:text-[20px] leading-none tabular-nums tracking-[-0.01em] ${
          highlight ? 'text-[var(--ink)]' : 'text-[var(--ink)]'
        }`}
        style={
          highlight
            ? {
                background:
                  'linear-gradient(transparent 60%, var(--color-horizon-200) 60%)',
                display: 'inline-block',
                paddingLeft: '0.15em',
                paddingRight: '0.15em',
              }
            : undefined
        }
      >
        {value}
      </p>
    </div>
  )
}
