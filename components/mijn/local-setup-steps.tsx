'use client'

import { Download, RefreshCw, Loader2, Check, AlertTriangle, FlaskConical } from 'lucide-react'
import { type LocalModelProgress } from '@/lib/ai/local/model-manager'
import { formatModelGb, type LocalModelDescriptor } from '@/lib/ai/local/model-catalog'
import { LOCAL_PROOF_TASKS, type ProofOutcome } from '@/lib/ai/local/output-proof'
import type { LocalModelPhase } from './local-model-section'

/**
 * Twee stappen naar lokale AI, elk met zijn eigen knop en zijn eigen uitleg.
 *
 * Ze zaten aan elkaar vast: één klik startte de download én de test, en wie
 * zakte wist niet welke van de twee dingen nu eigenlijk mislukt was. Het zijn
 * ook twee wezenlijk verschillende dingen — het één haalt bestanden op, het
 * ander stelt een vraag aan je grafische chip — en ze falen om totaal andere
 * redenen. Daarom uit elkaar.
 *
 * TRANSPARANTIE IS HIER DE KERN. De proef bepaalt of iemands toestel wordt
 * toegelaten; dan mag hij niet als orakel werken. Vóór het draaien staat er
 * daarom wát er gevraagd wordt en wát het goede antwoord is, en ná afloop staat
 * per vraag het ECHTE antwoord van het model. Zo kan iedereen zelf zien of een
 * afwijzing terecht is — die controle is niet theoretisch: de eerste versie van
 * deze proef verwierp een prima toestel op een quizvraag.
 */

/** Voortgang → percentage 0..100 (het contract levert bytes, geen percent). */
function percent(p: LocalModelProgress | null): number {
  if (!p || !p.totalBytes) return 0
  return Math.min(100, Math.max(0, (p.loadedBytes / p.totalBytes) * 100))
}

function StepHeader({
  nummer,
  titel,
  status,
}: {
  nummer: 1 | 2
  titel: string
  status: 'todo' | 'bezig' | 'klaar' | 'mislukt'
}) {
  const ring =
    status === 'klaar'
      ? 'border-positive bg-positive text-white'
      : status === 'mislukt'
        ? 'border-warning bg-warning-bg text-[var(--ink)]'
        : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)]'
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums ${ring}`}
        aria-hidden="true"
      >
        {status === 'klaar' ? <Check className="h-3.5 w-3.5" /> : nummer}
      </span>
      <h4 className="text-sm font-semibold text-[var(--ink)]">{titel}</h4>
      {status === 'bezig' && (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--ink-3)]" aria-hidden="true" />
      )}
    </div>
  )
}

export function LocalSetupSteps({
  phase,
  model,
  modelReady,
  progress,
  errorMsg,
  proof,
  onDownload,
  onProve,
}: {
  phase: LocalModelPhase
  model: LocalModelDescriptor
  modelReady: boolean
  progress: LocalModelProgress | null
  errorMsg: string | null
  /** Uitkomst van de laatste proef op dit toestel, of null als er nog geen is. */
  proof: ProofOutcome | null
  onDownload: () => void
  onProve: () => void
}) {
  const downloading = phase === 'downloading'
  const proving = phase === 'proving'
  const gb = formatModelGb(model.bytes)

  const stap1: 'todo' | 'bezig' | 'klaar' | 'mislukt' =
    downloading ? 'bezig' : phase === 'error' ? 'mislukt' : modelReady ? 'klaar' : 'todo'
  const stap2: 'todo' | 'bezig' | 'klaar' | 'mislukt' =
    proving ? 'bezig' : proof ? (proof.ok ? 'klaar' : 'mislukt') : 'todo'

  return (
    <div className="space-y-3">
      {/* ── Stap 1 — downloaden ────────────────────────────────────────────── */}
      <div className="space-y-3 border border-[var(--border-ed)] p-4">
        <StepHeader nummer={1} titel="Het model naar je toestel halen" status={stap1} />
        <p className="text-sm leading-relaxed text-[var(--ink-2)]">
          Eenmalig ongeveer <strong>{gb} GB</strong> ({model.label}) naar je browser. Dat is alleen het
          model zelf — er gaat geen enkel gegeven van jou de andere kant op. Daarna werkt het offline, ook
          zonder verbinding. Wifi aanbevolen.
        </p>

        {downloading && (
          <>
            <div
              className="h-2 w-full overflow-hidden bg-[var(--subtle)]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(percent(progress))}
              aria-label="Download-voortgang"
            >
              <div
                className="h-full bg-wil-500 transition-[width] duration-300"
                style={{ width: `${percent(progress)}%` }}
              />
            </div>
            <p className="text-xs tabular-nums text-[var(--ink-3)]">
              {progress
                ? `${formatModelGb(progress.loadedBytes)} / ${formatModelGb(progress.totalBytes ?? model.bytes)} GB · ${Math.round(percent(progress))}%`
                : 'Voorbereiden…'}
            </p>
            <p className="text-xs leading-relaxed text-[var(--ink-4)]">
              Je kunt dit tabblad open laten. Sluit je het tussentijds, dan hervat je de download later
              vanaf deze pagina.
            </p>
          </>
        )}

        {phase === 'error' && errorMsg && (
          <div className="flex items-start gap-2 border border-negative/30 bg-negative/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-[var(--ink-2)]">{errorMsg}</p>
          </div>
        )}

        {!downloading && (
          <button
            type="button"
            onClick={onDownload}
            disabled={proving}
            className={`inline-flex min-h-11 items-center gap-2 px-5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              modelReady
                ? 'border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--subtle)]'
                : 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--ink-2)]'
            }`}
          >
            {modelReady ? (
              <>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Opnieuw downloaden
              </>
            ) : (
              <>
                <Download className="h-4 w-4" aria-hidden="true" />
                Model downloaden (~{gb} GB)
              </>
            )}
          </button>
        )}
      </div>

      {/* ── Stap 2 — testen ────────────────────────────────────────────────── */}
      <div
        className={`space-y-3 border p-4 ${modelReady ? 'border-[var(--border-ed)]' : 'border-[var(--rule-soft)] opacity-60'}`}
      >
        <StepHeader nummer={2} titel="Je toestel testen" status={stap2} />
        <p className="text-sm leading-relaxed text-[var(--ink-2)]">
          Een toestel kan het model prima draaien en er tóch onbruikbare antwoorden uit laten komen — dat
          hebben we gemeten op een telefoon die op elke technische maat ruim voldeed. Alleen door het
          model écht iets te vragen weet je of het hier klopt. Daarom stelt je toestel deze drie vragen aan
          zichzelf. Duurt ongeveer een halve minuut; er gaat niets naar onze servers.
        </p>

        {/* De vragen staan er vóór het draaien — een poort die bepaalt of jouw
            toestel meedoet, hoort navolgbaar te zijn. */}
        <ol className="space-y-2">
          {LOCAL_PROOF_TASKS.map((taak, i) => {
            const uitslag = proof?.results.find((r) => r.id === taak.id)
            const gezakt = uitslag ? uitslag.reason !== null : false
            return (
              <li
                key={taak.id}
                className="border-l-2 pl-3 text-xs leading-relaxed"
                style={{
                  borderColor: !uitslag
                    ? 'var(--rule-soft)'
                    : gezakt
                      ? 'var(--warning)'
                      : 'var(--positive)',
                }}
              >
                <span className="block text-[var(--ink-2)]">
                  <span className="tabular-nums text-[var(--ink-4)]">{i + 1}. </span>
                  {taak.label} — verwacht: {taak.verwacht}
                </span>
                {uitslag && (
                  <span className="mt-0.5 block text-[var(--ink-3)]">
                    Antwoord: «{uitslag.raw.trim() || '—'}»
                    {gezakt && <span className="text-[var(--ink-4)]"> · {uitslag.reason}</span>}
                  </span>
                )}
              </li>
            )
          })}
        </ol>

        {proof && !proof.ok && (
          <div className="flex items-start gap-2 border border-warning/40 bg-warning-bg p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-[var(--ink-2)]">
              Zolang de test niet slaagt blijft lokaal draaien uit. Er is niets naar onze servers gestuurd
              en je blijft Cloud-AI gebruiken. De uitslag ligt niet vast — je kunt het opnieuw proberen.
            </p>
          </div>
        )}

        {proof?.ok && (
          <p className="text-xs leading-relaxed text-positive">
            Geslaagd — dit toestel geeft bruikbare antwoorden. Lokaal draaien staat aan.
          </p>
        )}

        <button
          type="button"
          onClick={onProve}
          disabled={!modelReady || proving || downloading}
          className="inline-flex min-h-11 items-center gap-2 bg-[var(--ink)] px-5 py-2 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
          {proving ? 'Bezig met testen…' : proof ? 'Test opnieuw draaien' : 'Toestel testen'}
        </button>
        {!modelReady && (
          <p className="text-xs text-[var(--ink-4)]">Rond eerst stap 1 af — zonder model valt er niets te testen.</p>
        )}
      </div>
    </div>
  )
}
