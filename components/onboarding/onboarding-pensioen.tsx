'use client'

import { useMemo, useState } from 'react'
import { Calculator, Pencil, Upload } from 'lucide-react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import { PensionPdfUpload } from '@/components/app/horizon/pension-pdf-upload'
import { parseBedragInput } from './onboarding-inkomen'
import {
  estimateAccruedPensionFromNet,
  estimateAccruedPensionMonthly,
  roundToEstimateStep,
} from '@/lib/jaarruimte'
import {
  NL_AOW_AGE,
  NL_AOW_MONTHLY,
  NL_AOW_MONTHLY_SAMENWONEND,
  NL_PENSIOENOPBOUW_STARTLEEFTIJD,
} from '@/lib/constants'
import { formatCurrency } from '@/lib/format'
import type { PensionParseResult } from '@/app/api/pension/parse/route'

/**
 * Stap — Pensioen (optioneel). Boldin-stijl: één vraag, drie uitwegen.
 *
 * "Heb je al pensioen opgebouwd?" met drie uitkomsten:
 *   (i)   Schatting — vrij bruto-maandbedrag (+ optioneel ingangsleeftijd), met
 *         een inschat-hulp die bij bekende leeftijd + inkomen als "Schat het
 *         voor me" vóórvult (B-055, zelfde patroon als de inkomenstap, ADR 0131:
 *         een schatting is een zichtbare placeholder, nooit een stille keuze).
 *   (ii)  Upload je mijnpensioen.nl-overzicht (XML/JSON volledig client-side,
 *         zonder AI) — HERGEBRUIKT `PensionPdfUpload` met `context="onboarding"`:
 *         het PDF-pad (AI) is hier niet bruikbaar (V-002).
 *   (iii) Overslaan ("kan altijd later nog") — als deferred field getrackt.
 *
 * Het scherm rapporteert alleen z'n keuze terug aan de orchestrator
 * (`PensionDraft`); de daadwerkelijke `life_events`-write gebeurt centraal bij
 * de eind-save (`applyPensionParseResult`), zodat het POST-contract en de
 * ownership-scoping (auth.uid()) ongewijzigd blijven.
 *
 * "Geld is opgeslagen tijd": pensioen is *vrijheid die later vanzelf binnenkomt*.
 */

export type PensionMode = 'estimate' | 'upload'

export interface PensionDraft {
  /** Gekozen pad — null tot de gebruiker iets selecteert. */
  mode: PensionMode | null
  /** Geschat bruto maandbedrag (raw invoerstring). */
  grossMonthly: string
  /** Optionele verwachte ingangsleeftijd (raw invoerstring). */
  startAge: string
  /**
   * Is `grossMonthly` door de inschat-hulp gevuld ("Schat het voor me" of
   * "Neem over")? Dan draagt het veld een "(schatting)"-label; typen wist de
   * vlag (criterium 3 van UR3-05). Optioneel: oudere concepten dragen 'm niet.
   */
  isEstimate?: boolean
  /** Resultaat van een JSON/PDF-upload — null wanneer (nog) niet geüpload. */
  parseResult: PensionParseResult | null
}

export const INITIAL_PENSION_DRAFT: PensionDraft = {
  mode: null,
  grossMonthly: '',
  startAge: '',
  isEstimate: false,
  parseResult: null,
}

export interface OnboardingPensioenProps {
  data: PensionDraft
  onChange: (data: PensionDraft) => void
  /** Woonsituatie voor de mijnpensioen.nl JSON-import (AOW-bedrag). */
  samenwonend: boolean
  /**
   * Functionele AOW-leeftijd van de gebruiker (hele jaren, `Math.ceil` van de
   * fractionele leeftijd — zelfde conventie als `aow_target_age` server-side).
   * Gebruikt als verwachte ingangsleeftijd wanneer de inschat-hulp wordt
   * toegepast, en als placeholder van het leeftijdsveld.
   */
  aowAge?: number
  /**
   * Weergave-label van diezelfde AOW-leeftijd, exact geformuleerd ("67 jaar en
   * 3 maanden" — `formatAowAge`). BEWUST gescheiden van `aowAge`: de ceil is
   * een reken-/opslagconventie en mag nooit woordelijk als "je AOW-leeftijd"
   * worden gepresenteerd (display-drift-lock, zie pensioen-aow-widget).
   * Default: "`aowAge` jaar".
   */
  aowAgeLabel?: string
  /**
   * Huidige leeftijd uit de geboortedatum (`null` zonder geboortedatum). Voedt
   * samen met `netMonthlyIncome` de knop "Schat het voor me": ontbreekt een van
   * beide, dan verschijnt die knop niet — liever geen knop dan een verzonnen
   * bedrag (eigenaarsbesluit UR3-05).
   */
  age?: number | null
  /** Netto maandinkomen zoals eerder in de wizard ingevuld of geschat (0 = onbekend). */
  netMonthlyIncome?: number
  /** Is dat inkomen zélf al een app-schatting? Dan zegt de hint dat erbij. */
  incomeIsEstimate?: boolean
  onNext: () => void
  onBack: () => void
  /** "Kan altijd later nog" — wist de keuze en gaat door (deferred). */
  onSkip: () => void
  currentStep?: number
  totalSteps?: number
}

export function OnboardingPensioen({
  data,
  onChange,
  samenwonend,
  aowAge = NL_AOW_AGE,
  aowAgeLabel,
  age = null,
  netMonthlyIncome = 0,
  incomeIsEstimate = false,
  onNext,
  onBack,
  onSkip,
  currentStep = 5,
  totalSteps = 7,
}: OnboardingPensioenProps) {
  const [error, setError] = useState<string | null>(null)
  const aowLabel = aowAgeLabel ?? `${aowAge} jaar`

  /**
   * Vóórvulling voor "Schat het voor me": alleen wanneer leeftijd én inkomen
   * bruikbaar zijn. `grossFromNet` (60 bisecties) is goedkoop, maar hoort niet
   * op elke toetsaanslag opnieuw te draaien — vandaar de memo.
   */
  const autoPrefill = useMemo(() => {
    if (age === null || !Number.isFinite(age) || age <= 0) return null
    if (!Number.isFinite(netMonthlyIncome) || netMonthlyIncome <= 0) return null
    return estimateAccruedPensionFromNet({ netMonthly: netMonthlyIncome, age })
  }, [age, netMonthlyIncome])

  function selectMode(mode: PensionMode) {
    setError(null)
    onChange({ ...data, mode })
  }

  // "Verder" is alleen zinvol wanneer er iets ingevuld/geüpload is; anders is
  // overslaan de natuurlijke actie. We blokkeren niet hard — een lege schatting
  // wordt bij save genegeerd.
  const hasEstimate =
    data.mode === 'estimate' && parseBedragInput(data.grossMonthly) > 0
  const hasUpload = data.mode === 'upload' && data.parseResult !== null
  const canContinue = hasEstimate || hasUpload

  const headline = (
    <>
      Heb je al{' '}
      <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
        pensioen
      </em>{' '}
      opgebouwd?
    </>
  )

  return (
    <OnboardingShell
      kicker="Pensioen"
      romanNum="v."
      title={headline}
      deck="Pensioen is vrijheid die later vanzelf binnenkomt. Geef een schatting, upload je overzicht, of sla over — je vult het altijd later aan."
      factsPanel={
        <FactsPanel
          stat="€1.300"
          sub="gemiddeld aanvullend pensioen per maand"
          source="Indicatief · DNB/CBS"
        />
      }
      currentStep={currentStep}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={
        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={onNext}
            disabled={!canContinue}
            className="w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Verder
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="w-full min-h-11 text-xs italic text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink-2)] hover:underline"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Kan altijd later nog &rarr;
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Drie keuze-tegels. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ModeTile
            icon={<Pencil className="h-4 w-4" strokeWidth={2} />}
            label="Schat het zelf"
            sublabel="Een bruto bedrag per maand"
            active={data.mode === 'estimate'}
            onClick={() => selectMode('estimate')}
          />
          <ModeTile
            icon={<Upload className="h-4 w-4" strokeWidth={2} />}
            label="Upload je overzicht"
            sublabel="XML of JSON van mijnpensioen.nl"
            active={data.mode === 'upload'}
            onClick={() => selectMode('upload')}
          />
        </div>

        {/* Schatting-pad. */}
        {data.mode === 'estimate' && (
          <div className="space-y-4 border-l-2 border-[var(--module-active-500)] pl-4">
            <div>
              <label
                htmlFor="ob-pension-gross"
                className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]"
              >
                Geschat bruto pensioen per maand{' '}
                <span className="text-xs font-normal italic text-[var(--ink-3)]">
                  {data.isEstimate ? '(schatting)' : '(huidige waarde)'}
                </span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-4)]">
                  &euro;
                </span>
                <input
                  id="ob-pension-gross"
                  type="text"
                  inputMode="decimal"
                  value={data.grossMonthly}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      grossMonthly: e.target.value.replace(/[^0-9.,]/g, ''),
                      // Typen is per definitie een eigen bedrag (UR3-05, crit. 3).
                      isEstimate: false,
                    })
                  }
                  placeholder="0"
                  autoComplete="off"
                  className="w-full border border-[var(--border-ed)] bg-[var(--subtle)] py-2.5 pr-3 pl-7 font-mono text-base tabular-nums text-[var(--ink)] outline-none focus:border-[var(--module-active-500)] focus:ring-1 focus:ring-[var(--module-active-500)] sm:text-sm"
                />
              </div>
              <p
                className="mt-1 text-xs italic text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                De huidige waarde van wat je tot nu toe hebt opgebouwd —
                inclusief aanvullend werkpensioen. Grof mag — later aanpasbaar.
              </p>
            </div>

            <div>
              <label
                htmlFor="ob-pension-age"
                className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]"
              >
                Verwachte ingangsleeftijd{' '}
                <span className="text-xs font-normal italic text-[var(--ink-3)]">(optioneel)</span>
              </label>
              <input
                id="ob-pension-age"
                type="text"
                inputMode="numeric"
                value={data.startAge}
                onChange={(e) =>
                  onChange({ ...data, startAge: e.target.value.replace(/[^0-9]/g, '') })
                }
                placeholder={String(aowAge)}
                autoComplete="off"
                className="w-full border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5 font-mono text-base tabular-nums text-[var(--ink)] outline-none focus:border-[var(--module-active-500)] focus:ring-1 focus:ring-[var(--module-active-500)] sm:text-sm"
              />
              <p
                className="mt-1 text-xs italic text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                Leeg laten = je AOW-leeftijd ({aowLabel}).
              </p>
            </div>

            {/* Inschat-hulp: salaris × NL-opbouw × jaren → vult het bedrag in. */}
            <PensionEstimateHelper
              aowAgeLabel={aowLabel}
              samenwonend={samenwonend}
              prefill={autoPrefill}
              incomeIsEstimate={incomeIsEstimate}
              onApply={(monthly) =>
                onChange({
                  ...data,
                  grossMonthly: String(monthly),
                  startAge: String(aowAge),
                  isEstimate: true,
                })
              }
            />
          </div>
        )}

        {/* Upload-pad — hergebruikt PensionPdfUpload. In de onboarding alleen de
            data-route (XML/JSON, zonder AI): een PDF uitlezen vraagt AI en dat kan
            pas in de app met een AI-abonnement (V-002). Geen link weg uit de
            onboarding — die zou de voortgang kosten. */}
        {data.mode === 'upload' && (
          <div className="space-y-3 border-l-2 border-[var(--module-active-500)] pl-4">
            <p
              className="text-xs italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              Log in op mijnpensioen.nl, download je overzicht als XML of JSON en upload het hier.
            </p>
            <PensionPdfUpload
              context="onboarding"
              samenwonend={samenwonend}
              onParseResult={(result) => {
                setError(null)
                onChange({ ...data, mode: 'upload', parseResult: result as PensionParseResult })
              }}
              onFileRemoved={() => onChange({ ...data, parseResult: null })}
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}
      </div>
    </OnboardingShell>
  )
}

// ── Subcomponenten ─────────────────────────────────────────────────────

/**
 * Inschat-hulp binnen het schatting-pad: "weet je het bedrag niet?" →
 * bruto jaarsalaris + jaren pensioenopbouw → indicatief opgebouwd bruto
 * maandpensioen via de canonieke `estimateAccruedPensionMonthly`
 * (lib/jaarruimte.ts: factor A = opbouw% × (salaris − franchise); géén eigen
 * formule of constanten hier). "Neem over" vult het schattingsveld en zet de
 * ingangsleeftijd op de AOW-leeftijd — schatten blijft een expliciete
 * gebruikersactie (zelfde filosofie als resolvePensionFactorA: nooit stil
 * een geraden getal als "bekend" presenteren).
 *
 * Met `prefill` (leeftijd + netto inkomen bekend, B-055) is de ingang een
 * zichtbare knop "Schat het voor me" — letterlijk dezelfde woorden als op de
 * inkomenstap — die beide velden vóórvult uit `estimateAccruedPensionFromNet`;
 * de velden blijven bewerkbaar. Zonder prefill blijft de bescheiden link.
 */
function PensionEstimateHelper({
  aowAgeLabel,
  samenwonend,
  prefill,
  incomeIsEstimate,
  onApply,
}: {
  /** Geformuleerde AOW-leeftijd ("67 jaar en 3 maanden") — alleen weergave. */
  aowAgeLabel: string
  /** Bepaalt welk SVB-AOW-bedrag als contrast wordt genoemd. */
  samenwonend: boolean
  /** Vóórvulling uit leeftijd + netto inkomen; `null` = niet beschikbaar. */
  prefill: { grossYearly: number; years: number } | null
  /** Was het netto inkomen zelf al een app-schatting? */
  incomeIsEstimate: boolean
  onApply: (monthly: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [salaryRaw, setSalaryRaw] = useState('')
  const [yearsRaw, setYearsRaw] = useState('')
  const [applied, setApplied] = useState(false)
  /** Zijn de velden door "Schat het voor me" gevuld (en nog niet overtypt)? */
  const [prefilled, setPrefilled] = useState(false)

  const salary = parseBedragInput(salaryRaw)
  const years = yearsRaw ? parseInt(yearsRaw, 10) : NaN
  // Afgerond op de schattingsstap (€25): het getal moet lezen als schatting,
  // niet als meting — dezelfde conventie als de cohort-schatting van het inkomen.
  const estimate =
    salary > 0 && isFinite(years) && years > 0
      ? roundToEstimateStep(estimateAccruedPensionMonthly(salary, years))
      : null

  const aowContrast = formatCurrency(samenwonend ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY)

  function applyPrefill() {
    if (!prefill) return
    setSalaryRaw(String(prefill.grossYearly))
    setYearsRaw(String(prefill.years))
    setPrefilled(true)
    setApplied(false)
    setOpen(true)
  }

  if (!open) {
    return prefill ? (
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={applyPrefill}
          className="inline-flex min-h-9 items-center gap-1.5 border border-[var(--module-active-500)] bg-[var(--module-active-50)]/50 px-3 py-1.5 text-xs font-medium text-[var(--module-active-800)] transition-colors hover:bg-[var(--module-active-100)]"
        >
          <Calculator className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Schat het voor me
        </button>
        <p
          className="text-xs italic text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Op basis van je leeftijd en het {incomeIsEstimate ? '(geschatte) ' : ''}netto
          maandinkomen dat je eerder invulde. Je kunt alles aanpassen.
        </p>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-1.5 text-xs italic text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink-2)] hover:underline"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        <Calculator className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Geen idee? Help me schatten &rarr;
      </button>
    )
  }

  return (
    <div className="space-y-4 border border-[var(--border-ed)] bg-[var(--subtle)]/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-[var(--ink-2)]">
          Schat op basis van je salaris
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-9 -my-2 px-2 text-xs italic text-[var(--ink-3)] underline-offset-4 hover:text-[var(--ink-2)] hover:underline"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Verberg
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="ob-pension-helper-salary"
            className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]"
          >
            Bruto jaarsalaris
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-4)]">
              &euro;
            </span>
            <input
              id="ob-pension-helper-salary"
              type="text"
              inputMode="decimal"
              value={salaryRaw}
              onChange={(e) => {
                setSalaryRaw(e.target.value.replace(/[^0-9.,]/g, ''))
                setApplied(false)
                setPrefilled(false)
              }}
              placeholder="50.000"
              autoComplete="off"
              className="w-full border border-[var(--border-ed)] bg-[var(--paper)] py-2.5 pr-3 pl-7 font-mono text-base tabular-nums text-[var(--ink)] outline-none focus:border-[var(--module-active-500)] focus:ring-1 focus:ring-[var(--module-active-500)] sm:text-sm"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="ob-pension-helper-years"
            className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]"
          >
            Jaren pensioenopbouw
          </label>
          <input
            id="ob-pension-helper-years"
            type="text"
            inputMode="numeric"
            value={yearsRaw}
            onChange={(e) => {
              setYearsRaw(e.target.value.replace(/[^0-9]/g, ''))
              setApplied(false)
              setPrefilled(false)
            }}
            placeholder="15"
            autoComplete="off"
            className="w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2.5 font-mono text-base tabular-nums text-[var(--ink)] outline-none focus:border-[var(--module-active-500)] focus:ring-1 focus:ring-[var(--module-active-500)] sm:text-sm"
          />
        </div>
      </div>

      {prefilled && (
        <p
          className="text-xs italic leading-relaxed text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Voorgevuld: het bruto jaarsalaris is afgeleid van het
          {incomeIsEstimate ? ' (geschatte)' : ''} netto maandinkomen dat je eerder
          invulde, en we gaan uit van opbouw vanaf je {NL_PENSIOENOPBOUW_STARTLEEFTIJD}e
          &mdash; pas de jaren aan als je eerder of later begon, of jaren geen pensioen
          opbouwde (studie, zzp, buitenland).
        </p>
      )}

      <p
        className="text-xs italic leading-relaxed text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        Jaren in loondienst waarin je pensioen opbouwde via je werkgever(s).
        We rekenen met het hoogste percentage dat de wet toestaat, over het
        deel van je salaris boven een drempel — over dat eerste deel bouw je
        geen pensioen op, daar is de AOW al voor. Veel regelingen bouwen
        langzamer op, dus zie het bedrag eerder als bovengrens dan als
        ondergrens. Grof mag, later aanpasbaar.
      </p>

      {estimate !== null && (
        <div className="space-y-3 border-t border-[var(--border-ed)] pt-3">
          {estimate > 0 ? (
            <>
              {/* Het bedrag en de AOW staan bewust in aparte zinnen: de AOW in
                  dezelfde zin als het bedrag was precies de verwarring van
                  melding B-055. */}
              <p className="text-sm text-[var(--ink-2)]">
                &asymp;{' '}
                <span className="font-mono font-semibold tabular-nums text-[var(--ink)]">
                  {formatCurrency(estimate)}
                </span>{' '}
                bruto per maand aan werkgeverspensioen.
              </p>
              <p
                className="text-xs italic leading-relaxed text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                <strong className="not-italic font-semibold text-[var(--ink-2)]">
                  Dit is niet je AOW.
                </strong>{' '}
                De AOW ({aowContrast} netto per maand
                {samenwonend ? ' per persoon, samenwonend' : ' voor een alleenstaande'}, SVB)
                komt daar vanaf je AOW-leeftijd ({aowAgeLabel}) bovenop en rekent de app
                apart mee. Neem je dit over, dan rekent je toekomstplan met dit bedrag als
                extra inkomen vanaf je AOW-leeftijd; een derde erboven of eronder is
                normaal &mdash; je mijnpensioen.nl-overzicht is de enige harde bron.
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--ink-2)]">
              Met dit salaris bouw je (bijna) geen pensioen op via je
              werkgever: het ligt onder de drempel waar de AOW al voor
              zorgt.
            </p>
          )}
          {estimate > 0 && (
            <button
              type="button"
              onClick={() => {
                onApply(estimate)
                setApplied(true)
              }}
              disabled={applied}
              className="min-h-9 border border-[var(--module-active-500)] bg-[var(--module-active-50)]/50 px-4 py-1.5 text-xs font-medium text-[var(--module-active-800)] transition-colors hover:bg-[var(--module-active-100)] disabled:cursor-default disabled:opacity-60"
            >
              {applied ? 'Overgenomen ✓' : 'Neem over'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ModeTile({
  icon,
  label,
  sublabel,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  sublabel: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group flex min-h-[88px] flex-col items-start gap-2 border-2 p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] ${
        active
          ? 'border-[var(--module-active-500)] bg-[var(--module-active-50)]/50'
          : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--module-active-400)] hover:bg-[var(--module-active-50)]/30'
      }`}
    >
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center text-[var(--module-active-700)]"
      >
        {icon}
      </span>
      <p
        className="font-serif text-[15px] leading-tight text-[var(--ink)] sm:text-base"
        style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
      >
        {label}
      </p>
      <p
        className="font-serif text-xs italic leading-snug text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {sublabel}
      </p>
    </button>
  )
}
