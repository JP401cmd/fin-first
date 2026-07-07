'use client'

import { OnboardingShell } from './onboarding-shell'
import { TypeIcon } from '@/components/app/quick-add-wizard/icon-map'
import { ASSET_TYPE_ICONS } from '@/lib/asset-data'
import { DEBT_TYPE_ICONS } from '@/lib/debt-data'
import type { AssetQuickInput, DebtQuickInput } from '@/lib/quick-add/types'
import type { SpaardoelPresetKey } from '@/lib/onboarding-presets'
import { formatCurrency } from '@/lib/format'

/**
 * Stap 5 — Klaar (recap-figures-strip + primaire CTA).
 *
 * Boldin "almost-done"-moment. Elementen:
 *   1. Editorial header (kicker "KLAAR · v." + headline + deck)
 *   2. Figures-strip met 3 cellen (recap-totalen):
 *        - Inkomen → kicker `NETTO/MND`, body DM Mono €
 *        - Bezit  → kicker `NETTO VERMOGEN`, body DM Mono €
 *        - Spaardoel óf Voortgang → kicker `SPAARDOEL`/`VOORTGANG`, body
 *          italic Playfair met highlight-marker (`--module-active-200`)
 *      (De oude "DOEL"-cel is verwijderd: sinds de doel-stap uit onboarding
 *      is, was die altijd leeg — zie git-historie jun 2026.)
 *   3. Primaire CTA `Begin met TriFinity` (orchestrator hangt save+redirect
 *      eraan; component noemt de save niet rechtstreeks).
 *   4. Secundaire tekstlink `Voeg nog iets toe →` (terug naar stap 4).
 *
 * **Niet hetzelfde als `onboarding-success.tsx`**: dat blijft het post-save
 * scherm (toont module-kaarten, Will-avatar, philosophical closing). Deze
 * stap leeft tussen stap 4 en de save-call.
 *
 * **Facts-paneel = startpositie** — de rechter aside (desktop) / inline-blok
 * (mobiel) toont nu de individuele bezittingen en schulden als zachte
 * markers (`OnboardingStartpositie`). Dit is complementair aan de
 * recap-strip, die alleen het *totale* netto vermogen toont — hier zie je
 * juist de opsplitsing per post.
 */
/**
 * Compact spaardoel-recap voor cel 4 van de figures-strip. Wanneer aanwezig
 * vervangt deze de standaard "Voortgang 100%"-cel met de gekozen label en
 * het streefbedrag. Skip-flow zet deze prop op `null` — dan blijft de
 * voortgangs-cel zichtbaar zoals altijd.
 */
export interface OnboardingKlaarSpaardoelRecap {
  presetKey: SpaardoelPresetKey
  /** Uiteindelijke label die de gebruiker invulde (na trim). */
  label: string
  /** Streefbedrag in euro's. */
  amount: number
}

export interface OnboardingKlaarProps {
  netMonthlyIncome: number
  netWorth: number | null
  /**
   * Spaardoel-recap van stap v. — `null` wanneer de gebruiker geskipt of
   * niets ingevuld heeft. Caller (orchestrator) bepaalt deze gating.
   */
  spaardoel?: OnboardingKlaarSpaardoelRecap | null
  /** Individuele bezittingen uit de quick-add stap (voor het startpositie-paneel). */
  assets: AssetQuickInput[]
  /** Individuele schulden uit de quick-add stap (voor het startpositie-paneel). */
  debts: DebtQuickInput[]
  /** "Voeg nog iets toe →" — terug naar stap 4. */
  onAddMore: () => void
  /** Primaire CTA — orchestrator triggert save + redirect. */
  onFinish: () => void
  onBack: () => void
  /** 1-indexed stap-nummer voor de voortgangsbalk (default 6 sinds stap v.). */
  currentStep?: number
  totalSteps?: number
}

export function OnboardingKlaar({
  netMonthlyIncome,
  netWorth,
  spaardoel = null,
  assets,
  debts,
  onAddMore,
  onFinish,
  onBack,
  currentStep = 5,
  totalSteps = 5,
}: OnboardingKlaarProps) {
  // Detect minimal-input scenario: user only filled mandatory fields.
  // We adapt messaging to feel encouraging rather than incomplete.
  const hasOptionalData = netMonthlyIncome > 0 || netWorth !== null || spaardoel !== null

  const headline = (
    <>
      Bijna{' '}
      <em
        className="font-normal italic"
        style={{ color: 'var(--module-active-700)' }}
      >
        klaar
      </em>
      .
    </>
  )

  return (
    <OnboardingShell
      kicker="Klaar"
      romanNum="viii."
      title={headline}
      deck={
        hasOptionalData
          ? "Dit is je startpunt — vanaf hier vertaal ik je geld naar vrijheid. Alles blijft aanpasbaar vanuit je dashboard."
          : "Je hebt de basis gelegd — vanaf hier laat ik je vrijheid groeien, in je eigen tempo vanuit je dashboard."
      }
      // Facts-paneel = startpositie: de individuele posten (opsplitsing),
      // complementair aan de totale-netto-vermogen-cel in de recap-strip.
      factsPanel={<OnboardingStartpositie assets={assets} debts={debts} />}
      currentStep={currentStep}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={
        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={onFinish}
            className="w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
          >
            Begin met TriFinity
          </button>
          <button
            type="button"
            onClick={onAddMore}
            className="w-full min-h-11 text-xs italic text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink-2)] hover:underline"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Voeg nog iets toe &rarr;
          </button>
        </div>
      }
    >
      {/* ── Figures-strip — 3 cellen op desktop, gestapeld op mobile ──── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-b border-[var(--ink)] my-2">
        {/* Cel 1: Inkomen (€/mnd) */}
        <RecapCell
          kicker="Netto/mnd"
          mobileBottomBorder
          value={
            netMonthlyIncome > 0 ? (
              <span
                className="block text-[22px] sm:text-[28px] font-black leading-none tabular-nums tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', color: 'var(--ink)' }}
              >
                {formatCurrency(netMonthlyIncome)}
              </span>
            ) : (
              <span
                className="block text-[13px] italic leading-snug text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                Vul je later aan
              </span>
            )
          }
        />

        {/* Cel 2: Netto vermogen */}
        <RecapCell
          kicker="Netto vermogen"
          mobileBottomBorder
          value={
            netWorth === null ? (
              <span
                className="block text-[13px] italic leading-snug text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                Vul je later aan
              </span>
            ) : (
              <>
                <span
                  className="block text-[22px] sm:text-[28px] font-black leading-none tabular-nums tracking-[-0.02em]"
                  style={{
                    fontFamily: 'var(--font-playfair, Georgia, serif)',
                    color: netWorth < 0 ? 'var(--negative)' : 'var(--ink)',
                  }}
                >
                  {formatCurrency(netWorth)}
                </span>
                {/* Tastbare eerste "win": kwalitatieve vrijheids-vertaling onder
                    het vermogen. Bewust GEEN cijfer-vertaling (X jaar vrijheid):
                    de onboarding verzamelt geen uitgaven-/dagkosten-cijfer om door
                    te delen (estimated_monthly_expenses wordt nooit ingevuld in
                    deze flow), dus elk getal zou verzonnen zijn. Alleen tonen bij
                    positief vermogen — bij €0 of een tekort zou "opgebouwde
                    vrijheid" misleidend zijn. */}
                {netWorth > 0 && (
                  <span
                    className="mt-1.5 block text-[11px] italic leading-snug text-[var(--ink-3)]"
                    style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                  >
                    Je eerste vrijheid staat op de teller &mdash; vanaf hier laat ik &lsquo;m groeien.
                  </span>
                )}
              </>
            )
          }
        />

        {/* Cel 3: Spaardoel (indien aanwezig) óf Voortgang als fallback. */}
        {spaardoel ? (
          <RecapCell
            kicker="Spaardoel"
            value={
              <span
                className="block text-[16px] sm:text-[18px] italic leading-tight"
                style={{
                  fontFamily: 'var(--font-playfair, Georgia, serif)',
                  color: 'var(--ink)',
                }}
              >
                {spaardoel.label}
                <span className="not-italic text-[var(--ink-3)]"> · </span>
                <span
                  className="tabular-nums px-1"
                  style={{
                    backgroundImage:
                      'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
                  }}
                >
                  {formatCurrency(spaardoel.amount)}
                </span>
              </span>
            }
          />
        ) : (
          <RecapCell
            kicker="Voortgang"
            value={
              <span
                className="block text-[22px] sm:text-[28px] font-black leading-none italic tabular-nums tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', color: 'var(--ink)' }}
              >
                <span
                  className="inline px-1"
                  style={{
                    backgroundImage:
                      'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
                  }}
                >
                  100%
                </span>
              </span>
            }
          />
        )}
      </div>

      {/* Subtiele uitleg onder de strip — krant-italic, optioneel. */}
      <p
        className="mt-4 italic text-sm leading-snug text-[var(--ink-3)] max-w-[60ch]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {hasOptionalData
          ? 'Klopt het? Tik door naar je overzicht — alles is later aanpasbaar.'
          : 'Je bent klaar! Aanvullen kan altijd, vanuit je overzicht.'}
      </p>
    </OnboardingShell>
  )
}

// ── Subcomponents ─────────────────────────────────────────────────────

/**
 * Eén cel binnen de recap-figures-strip. De strip is op mobile één gestapelde
 * kolom en op desktop (≥sm) drie kolommen naast elkaar:
 *  - desktop: verticale scheidingslijn tussen de kolommen (`sm:border-r`, de
 *    laatste kolom krijgt er geen via `sm:last:border-r-0`);
 *  - mobile: horizontale scheidingslijn tussen de gestapelde rijen via
 *    `mobileBottomBorder` (`border-b`, op de laatste cel weggelaten).
 */
function RecapCell({
  kicker,
  value,
  mobileBottomBorder,
}: {
  kicker: string
  value: React.ReactNode
  mobileBottomBorder?: boolean
}) {
  return (
    <div
      className={`p-3 sm:p-4 sm:border-r sm:border-[var(--rule-soft)] sm:last:border-r-0 ${
        mobileBottomBorder ? 'border-b sm:border-b-0 border-[var(--rule-soft)]' : ''
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.20em] font-mono text-[var(--ink-3)] mb-1.5">
        {kicker}
      </div>
      {value}
    </div>
  )
}

// ── Startpositie-paneel ───────────────────────────────────────────────

/** Drie nadruk-tiers o.b.v. relatief bedrag binnen één groep. */
type PostTier = 'sm' | 'md' | 'lg'

interface StartPost {
  /** Lucide-icon-key uit ASSET_TYPE_ICONS / DEBT_TYPE_ICONS. */
  iconName: string
  name: string
  /** Positief bedrag (bezitting) of positief saldo (schuld, semantiek bepaalt kleur). */
  amount: number
  tier: PostTier
}

/**
 * Bepaalt de nadruk-tier van elke post t.o.v. de grootste post in de groep.
 * Bewust grof (3 tiers) i.p.v. continue schaling: dat leest als een rustige
 * "wolk" van posten zonder dat de markers een fiddly puzzel worden, en blijft
 * editorial-coherent. Grootste post(en) = `lg`, ≥40% = `md`, rest = `sm`.
 */
function toTieredPosts(
  items: { iconName: string; name: string; amount: number }[],
): StartPost[] {
  const max = items.reduce((m, it) => Math.max(m, Math.abs(it.amount)), 0)
  return items.map((it) => {
    const ratio = max > 0 ? Math.abs(it.amount) / max : 0
    const tier: PostTier = ratio >= 0.99 ? 'lg' : ratio >= 0.4 ? 'md' : 'sm'
    return { ...it, tier }
  })
}

/** Tier → Tailwind sizing voor de marker (tekst + padding). */
const TIER_CLASS: Record<PostTier, string> = {
  sm: 'text-[12px] px-2.5 py-1',
  md: 'text-[13px] px-3 py-1.5',
  lg: 'text-[14px] px-3.5 py-2',
}

/** Tier → icoon-grootte (px). */
const TIER_ICON: Record<PostTier, number> = { sm: 12, md: 13, lg: 15 }

/**
 * Eén post als zachte, afgeronde marker — naam (afgekapt) + bedrag in
 * font-mono tabular-nums, met optioneel type-icoon ervoor. Positief/negatief
 * volgt de semantische kleuren (`text-positive`/`text-negative`), NIET de
 * module-accenten (CLAUDE.md kleurconventie).
 */
function PostMarker({
  post,
  tone,
}: {
  post: StartPost
  tone: 'positive' | 'negative'
}) {
  const toneClass = tone === 'positive' ? 'text-positive' : 'text-negative'
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border bg-[var(--paper)] ${TIER_CLASS[post.tier]}`}
      style={{ borderColor: 'var(--rule-soft)' }}
      title={`${post.name} · ${formatCurrency(post.amount)}`}
    >
      <TypeIcon
        name={post.iconName}
        size={TIER_ICON[post.tier]}
        className={`shrink-0 ${toneClass}`}
        aria-hidden
      />
      <span className="min-w-0 truncate text-[var(--ink-2)]">{post.name}</span>
      <span className={`shrink-0 font-mono tabular-nums ${toneClass}`}>
        {formatCurrency(post.amount)}
      </span>
    </span>
  )
}

/** Eén groep (bezittingen óf schulden) met kicker + marker-wolk. */
function StartGroup({
  kicker,
  deck,
  posts,
  tone,
}: {
  kicker: string
  deck: string
  posts: StartPost[]
  tone: 'positive' | 'negative'
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span
          aria-hidden
          className="inline-block h-px w-5 shrink-0 self-center"
          style={{ background: 'var(--module-active-500)' }}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.20em] text-[var(--ink-3)]">
          {kicker}
        </span>
      </div>
      <p
        className="mb-3 text-[12px] italic leading-snug text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {deck}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {posts.map((post, i) => (
          <PostMarker key={`${post.name}-${i}`} post={post} tone={tone} />
        ))}
      </div>
    </div>
  )
}

/**
 * Startpositie-paneel — toont de individuele bezittingen en schulden als
 * zachte markers, gegroepeerd (bezittingen eerst: "wat je meebrengt", dan
 * schulden: "vrijheid die je terugkoopt"). Complementair aan de recap-strip:
 * die toont het TOTALE netto vermogen, hier zie je de opsplitsing per post.
 *
 * Bewust GEEN vrijheidstijd-getal — alleen lichte kwalitatieve framing — in
 * lijn met de comment bij de "Netto vermogen"-cel (de onboarding verzamelt
 * geen dagkosten-cijfer om € naar tijd te vertalen).
 *
 * Rendert zowel in de desktop-aside (360px, sticky) als inline onder de
 * recap op mobiel (de shell dupliceert de slot). Daarom een eigen lichte
 * kop-styling die in beide contexten werkt.
 */
function OnboardingStartpositie({
  assets,
  debts,
}: {
  assets: AssetQuickInput[]
  debts: DebtQuickInput[]
}) {
  const assetPosts = toTieredPosts(
    assets.map((a) => ({
      iconName: ASSET_TYPE_ICONS[a.asset_type] ?? 'CircleDot',
      name: a.name,
      amount: Number(a.current_value) || 0,
    })),
  )
  const debtPosts = toTieredPosts(
    debts.map((d) => ({
      iconName: DEBT_TYPE_ICONS[d.debt_type] ?? 'MoreHorizontal',
      name: d.name,
      amount: Number(d.current_balance) || 0,
    })),
  )

  const hasAssets = assetPosts.length > 0
  const hasDebts = debtPosts.length > 0

  return (
    <div className="lg:rounded-none">
      {/* Paneel-kicker — editorial, zelfde toon als de RecapCell-kickers. */}
      <div className="mb-4 flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-block h-px w-7 shrink-0"
          style={{ background: 'var(--module-active-500)' }}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.20em] text-[var(--module-active-700)]">
          Jouw startpositie
        </span>
      </div>

      {!hasAssets && !hasDebts ? (
        // Empty: rustige uitnodiging i.p.v. visuele leegte.
        <p
          className="text-[13px] italic leading-snug text-[var(--ink-3)] max-w-[40ch]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Je voegde nog niets toe &mdash; dat kan straks vanuit je overzicht. Vanaf
          hier vertaal ik elke euro die je opbouwt naar vrijheid.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {hasAssets && (
            <StartGroup
              kicker="Wat je meebrengt"
              deck="Je opgebouwde vrijheid, post voor post."
              posts={assetPosts}
              tone="positive"
            />
          )}

          {/* Subtiele scheiding tussen de twee verhalen — alleen als beide bestaan. */}
          {hasAssets && hasDebts && (
            <div className="h-px w-full" style={{ background: 'var(--rule-soft)' }} aria-hidden />
          )}

          {hasDebts && (
            <StartGroup
              kicker="Vrijheid die je terugkoopt"
              deck="Schulden die je stap voor stap aflost."
              posts={debtPosts}
              tone="negative"
            />
          )}
        </div>
      )}
    </div>
  )
}
