import type { Metadata } from 'next'
import { CheckCircle2, AlertTriangle, FileCode2, Gauge } from 'lucide-react'
import parityData from '@/docs/ai-parity/parity.json'
import { LOCAL_MODEL_TOKEN_BUDGET } from '@/lib/ai/local/litert-runtime'
import { selectParityFacts, type ParityFacts } from '@/lib/ai/local/parity-facts'
import { KennisbankClient } from './kennisbank-client'

// De parity-feiten (welke bron-DNA in sync is met de gecondenseerde lokale
// LOCAL_CHAT_DNA, plus de tokenschatting) komen uit de gegenereerde snapshot
// docs/ai-parity/parity.json — ververst via `npm run parity:scan`. De TS-constante
// LOCAL_MODEL_TOKEN_BUDGET is de single source voor het volle contextvenster; die
// wordt geïmporteerd, niet gedupliceerd in de JSON.

export const metadata: Metadata = { title: 'Kennisbank — Beheer' }

export default function BeheerKennisbankPage() {
  const parity = selectParityFacts(parityData)

  return (
    <div className="space-y-6">
      <PromptParityBlock parity={parity} contextBudget={LOCAL_MODEL_TOKEN_BUDGET} />
      <KennisbankClient />
    </div>
  )
}

/** Datum + tijd in nl-NL (bv. "24 juli 2026, 22:21"); leeg → ''. */
function formatScanMoment(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Toont alleen het bestandsdeel na de laatste '/', voor een compacte lijst. */
function baseName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

/**
 * Prompt-parity-blok (server) — toont of de gecondenseerde lokale Fin-DNA
 * (LOCAL_CHAT_DNA) nog in sync is met de cloud-bron-DNA (base.ts + wil.ts), per
 * bron, met de laatste scan-datum, de tokenschatting t.o.v. het sub-budget én het
 * volle contextvenster, en een in-sync/drift-stoplicht.
 *
 * Kleur = status-semantiek (groen in sync, rood bij drift) — GEEN module-accent.
 * Lege-staat (nog nooit gescand) → neutrale melding, geen verzonnen cijfers.
 */
function PromptParityBlock({
  parity,
  contextBudget,
}: {
  parity: ParityFacts
  contextBudget: number
}) {
  // ── Lege-staat: nog nooit een parity-scan gedraaid ──────────────────────────
  if (parity.neverGenerated) {
    return (
      <section className="space-y-2 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-5 py-4">
        <h3 className="text-sm font-semibold text-[var(--ink)]">Prompt-parity — lokale Fin-DNA</h3>
        <p className="text-sm text-[var(--ink-3)]">
          Nog geen parity-scan gedraaid. Draai{' '}
          <code className="rounded bg-[var(--subtle)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--ink-2)]">
            npm run parity:scan
          </code>{' '}
          om te controleren of de gecondenseerde lokale DNA nog in sync is met de bron-DNA.
        </p>
      </section>
    )
  }

  const inSync = parity.inSync
  const scanMoment = formatScanMoment(parity.generatedAt)
  const tokenFallback = parity.dnaTokenSource === 'manifest-fallback'
  // Vullingspercentage voor de subtiele token-balk (guard tegen deling door 0).
  const tokenPct =
    parity.dnaSubBudget > 0
      ? Math.min(100, Math.round((parity.dnaEstimatedTokens / parity.dnaSubBudget) * 100))
      : 0

  // Status-semantiek: groen = in sync, rood = drift. Geen module-accentkleur —
  // canonieke status-tokens (--positive/--negative), zoals de kernel-verificatie.
  const badgeClass = inSync
    ? 'border-[color-mix(in_oklch,var(--positive)_40%,transparent)] bg-[color-mix(in_oklch,var(--positive)_8%,transparent)] text-[var(--positive)]'
    : 'border-[color-mix(in_oklch,var(--negative)_40%,transparent)] bg-[color-mix(in_oklch,var(--negative)_8%,transparent)] text-[var(--negative)]'

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink)]">Prompt-parity — lokale Fin-DNA</h3>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Bewaakt of de gecondenseerde lokale DNA (in de systeemprompt van de on-device Fin) nog
            overeenkomt met de cloud-bron-DNA. Ververs met{' '}
            <code className="rounded bg-[var(--subtle)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--ink-2)]">
              npm run parity:scan
            </code>
            .
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass}`}
        >
          {inSync ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {inSync ? 'In sync' : 'Drift'}
        </span>
      </div>

      {/* Drift-uitleg: alleen bij daadwerkelijke afwijking */}
      {!inSync && (
        <div className="flex gap-3 rounded-lg border border-[color-mix(in_oklch,var(--negative)_40%,transparent)] bg-[color-mix(in_oklch,var(--negative)_8%,transparent)] px-4 py-3 text-sm text-[var(--ink-2)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--negative)]" aria-hidden="true" />
          <p>
            Een bron-DNA is gewijzigd zonder dat de lokale DNA opnieuw is gecondenseerd. Draai de
            skill <span className="font-mono text-[13px]">lokale-prompt-parity</span> om de lokale
            DNA opnieuw te condenseren binnen het sub-budget, en herzie de baseline daarna met{' '}
            <code className="rounded bg-[var(--subtle)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--ink-2)]">
              npm run parity:scan
            </code>
            .
          </p>
        </div>
      )}

      {/* Sub-budget-overschrijding: een eigen faalmodus, los van drift. Een
          artefact dat over zijn budget groeit, verdringt in het contextvenster
          van 8192 tokens juist de gegevens waar het over moet praten. */}
      {!parity.budgetsOk && (
        <div className="flex gap-3 rounded-lg border border-[color-mix(in_oklch,var(--warning)_45%,transparent)] bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--ink-2)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" aria-hidden="true" />
          <p>
            Eén of meer artefacten passen niet meer binnen hun eigen sub-budget. Kort de
            gecondenseerde tekst in via de skill{' '}
            <span className="font-mono text-[13px]">lokale-prompt-parity</span>, of verhoog het
            budget bewust — maar bedenk dat elke token hier ten koste gaat van de ruimte voor het
            gesprek zelf.
          </p>
        </div>
      )}

      {/* Per artefact: status, tokenverbruik t.o.v. het eigen sub-budget, en de
          bronnen waarvan het is afgeleid. */}
      {parity.artefacts.length > 0 ? (
        <ul className="space-y-2">
          {parity.artefacts.map((artefact) => {
            const pct =
              artefact.subBudget > 0
                ? Math.min(100, Math.round((artefact.estimatedTokens / artefact.subBudget) * 100))
                : 0
            return (
              <li
                key={artefact.id}
                className="space-y-2 rounded-lg border border-[var(--border-md)] bg-[var(--subtle)]/40 px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    role="img"
                    aria-label={artefact.inSync ? 'in sync' : 'drift'}
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: artefact.inSync ? 'var(--positive)' : 'var(--negative)',
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink)]">
                    {artefact.label}
                  </span>
                  <span
                    className={`shrink-0 font-mono text-xs tabular-nums ${
                      artefact.withinBudget ? 'text-[var(--ink-4)]' : 'text-[var(--warning)]'
                    }`}
                  >
                    {artefact.estimatedTokens}/{artefact.subBudget}
                    {artefact.tokenSource === 'manifest-fallback' && ' ~'}
                  </span>
                </div>

                <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: artefact.withinBudget ? 'var(--ink-3)' : 'var(--warning)',
                    }}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--ink-4)]">
                  <span className="inline-flex items-center gap-1.5">
                    <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="font-mono">{artefact.constant}</span>
                  </span>
                  {artefact.sources.map((source) => (
                    <span key={source.file} className="inline-flex items-center gap-1">
                      <span
                        role="img"
                        aria-label={source.inSync ? 'ongewijzigd' : 'gewijzigd'}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          backgroundColor: source.inSync ? 'var(--positive)' : 'var(--negative)',
                        }}
                      />
                      <span className="font-mono">{baseName(source.file)}</span>
                    </span>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        /* Terugval voor een ouder rapport zónder artefactenlijst: de oude,
           enkelvoudige weergave, VOLLEDIG — inclusief de bronlijst. Een oud
           rapport mag geen informatie verliezen omdat het formaat is
           uitgebreid; dat zou drift onzichtbaar maken precies wanneer de scan
           achterloopt. */
        <div className="space-y-3">
          <ul className="space-y-1.5">
            {parity.sources.map((source) => (
              <li
                key={source.file}
                className="flex items-center gap-2.5 rounded-lg border border-[var(--border-md)] bg-[var(--subtle)]/40 px-3 py-2"
              >
                <span
                  role="img"
                  aria-label={source.inSync ? 'in sync' : 'drift'}
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: source.inSync ? 'var(--positive)' : 'var(--negative)' }}
                />
                <FileCode2 className="h-4 w-4 shrink-0 text-[var(--ink-4)]" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-[var(--ink-2)]">
                  {baseName(source.file)}
                </span>
                <span className="shrink-0 text-xs text-[var(--ink-4)]">
                  {source.inSync ? 'ongewijzigd' : 'gewijzigd'}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
            <Gauge className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
            <span>
              Gecondenseerde DNA: geschat{' '}
              <strong className="font-mono tabular-nums">{parity.dnaEstimatedTokens}</strong> /{' '}
              <span className="font-mono tabular-nums">{parity.dnaSubBudget}</span> tokens sub-budget
              {tokenFallback && (
                <span className="text-[var(--warning)]">
                  {' '}
                  — schatting uit manifest-baseline; DNA-tekst niet gevonden
                </span>
              )}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
            <div className="h-full rounded-full bg-[var(--ink-3)]" style={{ width: `${tokenPct}%` }} />
          </div>
        </div>
      )}

      <p className="text-xs text-[var(--ink-4)]">
        Elk sub-budget telt mee in hetzelfde contextvenster van{' '}
        <span className="font-mono tabular-nums">{contextBudget}</span> tokens dat het lokale model
        deelt met je gegevens en het gesprek.
        {scanMoment && <> Laatste parity-scan: {scanMoment}.</>}
      </p>
    </section>
  )
}
