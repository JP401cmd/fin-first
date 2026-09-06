'use client'

import Link from 'next/link'
import { AlertTriangle, Building2, ExternalLink, History, Link2, Plus } from 'lucide-react'
import { formatDateShort } from '@/lib/format'
import { isSelectableTargetOption, type TargetAccountOption } from '@/lib/truelayer/target-account'

/**
 * DE DOELREKENING-KEUZE in stap 2 van de bank-koppelwizard.
 *
 * Puur presentational: geen fetch, geen supabase, geen router. De pagina
 * (`app/(app)/core/cash/connect/page.tsx`) laadt de kandidaten via
 * `GET /api/bank-connect/accounts`, houdt de keuze vast en stuurt 'm mee naar
 * `POST /api/bank-connect/auth-link`.
 *
 * "Nieuwe rekening aanmaken" is een **gelijkwaardige optie in dezelfde
 * radiogroep** en niet de afwezigheid van een keuze (FR13) — anders koppelt
 * iemand per ongeluk aan een verkeerde rekening door niets aan te raken.
 *
 * Een rekening die al een actieve koppeling draagt is sinds fase 6 (FR5)
 * **zichtbaar maar uitgeschakeld**, niet weggelaten: een verdwenen optie is
 * verwarrender dan een uitgelegde optie — wie zijn eigen betaalrekening niet in de
 * lijst ziet, gaat zoeken. De reden staat erbij, mét de uitweg (verbreek eerst de
 * bestaande koppeling), want zonder die regel is de blokkade een dood eind.
 * `auth-link` weigert de keuze met een 409 en de partiële unieke index in de
 * datalaag is het slot; dit is de vriendelijke voorkant daarvan.
 *
 * De datum in de ophaal-regel komt kant-en-klaar uit `fetch_plan.start_date`
 * (server-side `planInitialFetch`, fase 1). Hier staat bewust géén tweede
 * "−3 dagen"-som: twee plekken die hetzelfde startpunt berekenen lopen ooit
 * uiteen, en dan liegt de wizard over wat er gaat gebeuren.
 *
 * Zie `specs/bank-connect-doelrekening/plan.md`, fase 4.
 */

/**
 * Waar de koppeling landt: op een bestaande rekening, of op een nieuwe.
 *
 * `none` = nog niets gekozen. Zolang er iets te kiezen valt start de wizard
 * daarop en blijft de knop "Verbind met …" uit: dat de app zelf een rekening
 * uitkoos is precies wat fase 4 repareert. Is er niets te kiezen (verse
 * gebruiker) of kon de lijst niet geladen worden, dan zet de pagina `new`.
 */
export type TargetSelection = { kind: 'none' } | { kind: 'new' } | { kind: 'existing'; id: string }

export type TargetAccountChoiceProps = {
  /** Kandidaat-rekeningen uit GET /api/bank-connect/accounts. Lege array = er is niets om te kiezen. */
  accounts: TargetAccountOption[]
  loading: boolean
  /** NL-melding als de lijst niet geladen kon worden; de koppeling kan dan alleen op een nieuwe rekening landen. */
  loadError: string | null
  selection: TargetSelection
  onSelect: (selection: TargetSelection) => void
  /** Voorgevinkt B2-vinkje: staat alleen aan/zichtbaar bij een gekozen bestaande rekening met budget_tracking === false. */
  enableBudgetTracking: boolean
  onToggleBudgetTracking: (next: boolean) => void
  /** Naam van de gekozen bank, voor de copy (bv. "ING"). */
  providerName: string
  disabled?: boolean
}

/** Eén naam voor de hele groep — anders zijn de radio's geen exclusieve keuze. */
const RADIO_NAME = 'bank-connect-doelrekening'

/**
 * Eén feitenregel per rekening: hoeveel er al staat, en over welke periode.
 *
 * Geëxporteerd omdat het correctiemoment op de success-pagina
 * (`carrier-correction.tsx`) dezelfde rekeningen in dezelfde woorden toont. Twee
 * formuleringen voor hetzelfde feit lopen ooit uiteen, en dan lijkt het alsof de
 * twee lijsten iets anders bedoelen.
 */
export function describeAccountHistory(account: TargetAccountOption): string {
  if (account.transaction_count <= 0) return 'nog geen transacties'

  const count = account.transaction_count.toLocaleString('nl-NL')
  const noun = account.transaction_count === 1 ? 'transactie' : 'transacties'
  const { oldest_transaction_date: oldest, newest_transaction_date: newest } = account

  // Tellers en datums komen uit dezelfde query, maar een teller zonder periode
  // mag de regel niet stukmaken — dan liever alleen het aantal.
  if (!oldest || !newest) return `${count} ${noun}`
  return `${count} ${noun} · ${formatDateShort(oldest)} – ${formatDateShort(newest)}`
}

/**
 * De uitweg uit een bezette rekening: de plek waar de bestaande koppeling te
 * verbreken is.
 *
 * `/core/assets/cash/{bank_accounts.id}` is een bestaande, stabiele redirect naar
 * de rekening op haar categoriepagina (`/overzicht/bezittingen/cash?asset=…`) —
 * dezelfde bestemming die een klik op de cash-kaart al oplevert. Vandaar dat het
 * `id` van de kandidaat volstaat en de wizard geen tweede route hoeft te kennen.
 *
 * Geëxporteerd omdat het correctiemoment (`carrier-correction.tsx`) exact dezelfde
 * uitweg aanbiedt; twee formuleringen van dezelfde weg lopen ooit uiteen.
 */
/** Eén vorm voor beide uitwegen: 44px hoog, onderstreept, inkt (geen accentkleur). */
const EXIT_LINK_CLASS =
  'inline-flex min-h-[44px] items-center gap-1.5 text-xs font-medium text-[var(--ink-2)] underline decoration-[var(--border-ed)] underline-offset-2 transition-colors hover:text-[var(--ink)] hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]'

export function OccupiedAccountExit({ accountId }: { accountId: string }) {
  return (
    <div className="border-t border-[var(--border-ed)] px-3 py-2">
      {/* Nieuw tabblad, bewust: de gebruiker staat midden in een koppelflow die
          alleen in React-state leeft — wegnavigeren kost zijn bankkeuze.
          `min-h-[44px]`: raakteldoel, net als de herstelknoppen. */}
      <Link
        href={`/core/assets/cash/${accountId}`}
        target="_blank"
        rel="noopener noreferrer"
        className={EXIT_LINK_CLASS}
      >
        <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
        Ga naar deze rekening om de koppeling te verbreken
        <span className="sr-only"> (opent in een nieuw tabblad)</span>
      </Link>
    </div>
  )
}

/**
 * De GENERIEKE uitweg: naar de rekeningenlijst, wanneer we de bezette rekening
 * niet kunnen aanwijzen.
 *
 * Twee oppervlakken delen deze tekst — de wizard bij `?error=drager_bezet` waarvan
 * de drager niet in de kandidatenlijst staat (of `?error=geen_koppeling`, waar de
 * callback het simpelweg niet weet) en de `?geblokkeerd=`-band op de
 * success-pagina. Zonder deze uitweg leest de gebruiker "verbreek die eerst bij de
 * rekening" over een rekening die nergens te vinden is: een instructie zonder pad.
 *
 * Waarom hier en niet als derde variant van {@link OccupiedAccountExit}: die wijst
 * één rekening aan (en opent daarom een nieuw tabblad, want de wizardstaat leeft in
 * React-state). Deze wijst een lijst aan en verschijnt alleen op oppervlakken waar
 * er geen keuze te verliezen is — dus gewoon in hetzelfde tabblad.
 *
 * `className` is er voor de marge van het omvattende blok; de link zelf blijft
 * overal identiek.
 */
export function CashflowAccountsExit({ className = '' }: { className?: string }) {
  return (
    <Link href="/overzicht/bezittingen/cash" className={`${EXIT_LINK_CLASS} ${className}`}>
      <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
      Ga naar je rekeningen om die koppeling te verbreken
    </Link>
  )
}

/** Wat de eerste ophaal doet als de koppeling hier landt. */
function fetchPlanLine(account: TargetAccountOption): string {
  return account.fetch_plan.mode === 'incremental'
    ? `We halen transacties op vanaf ${formatDateShort(account.fetch_plan.start_date)}.`
    : 'We halen zo ver terug op als je bank geeft.'
}

const OPTION_BASE =
  'rounded-[var(--r-lg)] border transition-colors focus-within:ring-2 focus-within:ring-kern-500'
const OPTION_SELECTED = 'border-kern-500 bg-kern-50'
const OPTION_IDLE = 'border-[var(--border-ed)] bg-[var(--paper)] hover:bg-[var(--subtle)]'
/** Bezet (FR5): zichtbaar, rustig terug in het vlak, en zonder hover — er valt niets te klikken. */
const OPTION_BLOCKED = 'border-[var(--border-ed)] bg-[var(--subtle)]'
/** Radio én checkbox: één maat, één accent, één zichtbare focus-ring. */
const CONTROL_CLASS =
  'mt-0.5 h-3.5 w-3.5 shrink-0 accent-kern-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kern-600'

export function TargetAccountChoice({
  accounts,
  loading,
  loadError,
  selection,
  onSelect,
  enableBudgetTracking,
  onToggleBudgetTracking,
  providerName,
  disabled = false,
}: TargetAccountChoiceProps) {
  const hasList = !loading && !loadError && accounts.length > 0

  return (
    <section className="space-y-3">
      {/* Sectie-label in de aanhef van de pagina-header: hairline-streep + mono-kicker. */}
      <div className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--module-active-700)]">
        <span
          aria-hidden
          className="inline-block h-px w-7 shrink-0"
          style={{ background: 'var(--module-active-500)' }}
        />
        Waar komt de data terecht
      </div>
      <p
        className="text-[13px] italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        Kies je een rekening die je al hebt, dan houdt die zijn historie en zijn
        budget-toewijzingen — {providerName} landt er bovenop.
      </p>

      {/* Laden: skeleton in de maat van de echte opties, geen spinner. */}
      {loading && (
        <div className="space-y-2" role="status" aria-live="polite">
          <span className="sr-only">Rekeningen laden</span>
          <div
            aria-hidden
            className="h-[62px] animate-pulse rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)]"
          />
          <div
            aria-hidden
            className="h-[62px] animate-pulse rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)]"
          />
        </div>
      )}

      {/* Lijst niet geladen: de koppeling kan dan alleen op een nieuwe rekening landen. */}
      {!loading && loadError && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-[var(--r-lg)] border border-warning/30 bg-warning-bg px-3 py-2.5"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="space-y-0.5">
            {/* Tekst op inkt, niet `text-warning` op `bg-warning-bg`: die
                combinatie haalt 4,48:1 en blijft onder AA voor 12px-tekst (ook
                met `font-medium` — vet helpt pas vanaf 18,66px). De tint zit in
                rand en icoon. Zelfde behandeling als de herstelbanden. */}
            <p className="text-xs font-medium text-[var(--ink)]">{loadError}</p>
            <p className="text-xs text-[var(--ink-2)]">
              De koppeling landt daarom op een nieuwe rekening: {providerName} verschijnt
              als aparte rekening in TriFinity.
            </p>
          </div>
        </div>
      )}

      {/* Niets om aan te koppelen (bv. tijdens onboarding): één rustige regel,
          geen lege keuzelijst. De pagina zet `selection` dan al op 'new'. */}
      {!loading && !loadError && accounts.length === 0 && (
        /* `role="status"`: wie "Rekeningen laden" heeft gehoord, hoort ook de
           uitkomst — net als bij de laadfout hieronder. */
        <p role="status" className="text-xs leading-relaxed text-[var(--ink-3)]">
          Je hebt nog geen rekening om aan te koppelen. {providerName} verschijnt als
          nieuwe rekening in TriFinity.
        </p>
      )}

      {/* Staat élke bestaande rekening op bezet, dan is een lijst met louter grijze
          opties zonder duiding raadselachtig — en "Nieuwe rekening aanmaken" is dan
          geen keuze meer maar de uitkomst. Zelfde regel als het correctiemoment
          toont in dezelfde toestand; twee oppervlakken, één uitleg. */}
      {hasList && accounts.every((a) => !isSelectableTargetOption(a)) && (
        <p role="status" className="text-xs leading-relaxed text-[var(--ink-2)]">
          Al je bestaande rekeningen dragen al een bankkoppeling. {providerName} komt
          daarom op een nieuwe rekening terecht, tenzij je er eerst één ontkoppelt.
        </p>
      )}

      {hasList && (
        <div role="radiogroup" aria-label="Waar komt de data terecht" className="space-y-2">
          {accounts.map((account) => {
            const isSelected = selection.kind === 'existing' && selection.id === account.id
            const showBudgetToggle = isSelected && !account.budget_tracking
            // FR5: dezelfde predikaat als het correctiemoment gebruikt, zodat de twee
            // lijsten nooit iets anders aanbieden dan de route accepteert.
            const blocked = !isSelectableTargetOption(account)
            const unusable = disabled || blocked

            return (
              <div
                key={account.id}
                className={`${OPTION_BASE} ${
                  blocked ? OPTION_BLOCKED : isSelected ? OPTION_SELECTED : OPTION_IDLE
                } ${disabled ? 'opacity-60' : ''}`}
              >
                <label
                  className={`flex items-start gap-3 p-3 ${
                    unusable ? 'cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <input
                    type="radio"
                    name={RADIO_NAME}
                    value={account.id}
                    checked={isSelected}
                    disabled={unusable}
                    onChange={() => onSelect({ kind: 'existing', id: account.id })}
                    className={CONTROL_CLASS}
                  />
                  <Building2
                    aria-hidden
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]"
                  />
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span
                      className={`block text-sm font-semibold ${
                        blocked ? 'text-[var(--ink-2)]' : 'text-[var(--ink)]'
                      }`}
                    >
                      {account.name}
                    </span>
                    <span className="block text-xs text-[var(--ink-3)]">
                      {account.bank_name ?? 'Eigen rekening'}
                      {account.iban_tail ? ` · ···· ${account.iban_tail}` : ''}
                    </span>
                    <span className="block font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                      {describeAccountHistory(account)}
                    </span>
                    {/* De reden staat BINNEN het label, dus hij hoort bij de
                        toegankelijke naam van de radio — een uitgeschakelde optie
                        zonder uitleg is een raadsel. `--ink-2` en niet `--ink-3`:
                        deze regel is de énige verklaring waarom de optie uit staat,
                        en `--ink-3` haalt op deze maat geen AA-contrast. De UITWEG
                        staat eronder als echte link (zie OccupiedAccountExit) — een
                        link binnen dit label zou met de radio om de klik vechten. */}
                    {account.linked_provider_name && (
                      <span className="flex items-start gap-1.5 text-xs text-[var(--ink-2)]">
                        <Link2 aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>Al gekoppeld aan {account.linked_provider_name}.</span>
                      </span>
                    )}
                  </span>
                </label>

                {blocked && <OccupiedAccountExit accountId={account.id} />}

                {isSelected && (
                  <div className="space-y-2 border-t border-[var(--border-ed)] px-3 py-2.5">
                    <p className="flex items-start gap-2 text-xs text-[var(--ink-2)]">
                      <History aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" />
                      {fetchPlanLine(account)}
                    </p>

                    {showBudgetToggle && (
                      <label
                        className={`flex items-start gap-2 ${
                          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={enableBudgetTracking}
                          disabled={disabled}
                          onChange={(e) => onToggleBudgetTracking(e.target.checked)}
                          className={CONTROL_CLASS}
                        />
                        <span className="space-y-0.5">
                          <span className="block text-xs font-medium text-[var(--ink-2)]">
                            Neem deze rekening mee in mijn budgetten
                          </span>
                          {/* `--ink-2` en niet `--ink-3`: op 11px haalt `--ink-3`
                              3,65:1 en dus geen AA. `--ink-3` blijft voor iconen
                              en decoratieve meta. */}
                          <span className="block text-[11px] text-[var(--ink-2)]">
                            Transacties van deze rekening tellen dan mee in je budgetten.
                          </span>
                        </span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Gelijkwaardige optie, geen restpost: expliciet kiezen om níet samen te voegen. */}
          <div
            className={`${OPTION_BASE} ${
              selection.kind === 'new' ? OPTION_SELECTED : OPTION_IDLE
            } ${disabled ? 'opacity-60' : ''}`}
          >
            <label
              className={`flex items-start gap-3 p-3 ${
                disabled ? 'cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <input
                type="radio"
                name={RADIO_NAME}
                value="new"
                checked={selection.kind === 'new'}
                disabled={disabled}
                onChange={() => onSelect({ kind: 'new' })}
                className={CONTROL_CLASS}
              />
              <Plus aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" />
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="block text-sm font-semibold text-[var(--ink)]">
                  Nieuwe rekening aanmaken
                </span>
                <span className="block text-xs text-[var(--ink-3)]">
                  {providerName} komt als aparte rekening in TriFinity
                </span>
              </span>
            </label>

            {selection.kind === 'new' && (
              <div className="border-t border-[var(--border-ed)] px-3 py-2.5">
                {/* Geen vinkje: een nieuwe rekening krijgt budgetteren altijd aan. */}
                <p className="flex items-start gap-2 text-xs text-[var(--ink-2)]">
                  <History aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" />
                  TriFinity maakt een nieuwe rekening en een nieuw cash-bezit aan, en haalt
                  de volledige beschikbare historie op.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
