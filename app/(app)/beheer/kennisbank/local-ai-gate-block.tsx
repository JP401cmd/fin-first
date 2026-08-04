'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react'
import {
  DEFAULT_GATE_CONFIG,
  parseGateConfig,
  PROOF_TASK_COUNT,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  type LocalAiGateConfig,
} from '@/lib/ai/local/gate-config'
import { formatModelGb, type LocalModelId } from '@/lib/ai/local/model-catalog'

/**
 * /beheer/kennisbank — blok "Toelating lokale AI".
 *
 * Waarom dit instelbaar is: een toestel wordt niet toegelaten op wát het is
 * (telefoon/laptop) en ook niet op wat de GPU belooft, maar op wat er
 * daadwerkelijk uit komt — drie proefvragen na de download. De juiste lat voor
 * die proef ligt niet vast: de LiteRT-runtime is Early Preview en beweegt, dus
 * die afweging hoort hier te kunnen worden gemaakt zonder release.
 *
 * Wat hier NIET kan: de poort uitzetten. `minPassed` heeft een ondergrens van 1
 * (server-side afgedwongen door het zod-schema én door parseGateConfig).
 */

type ModelOption = { id: LocalModelId; label: string; bytes: number; blurb: string }

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function LocalAiGateBlock() {
  const [config, setConfig] = useState<LocalAiGateConfig>(DEFAULT_GATE_CONFIG)
  const [models, setModels] = useState<ModelOption[]>([])
  const [loading, setLoading] = useState(true)
  const [save, setSave] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/admin/local-ai-gate')
        if (!res.ok) throw new Error('laden mislukt')
        const data = (await res.json()) as { config?: unknown; models?: ModelOption[] }
        if (!active) return
        setConfig(parseGateConfig(data.config))
        setModels(data.models ?? [])
      } catch {
        if (active) setError('De instelling kon niet geladen worden.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const patch = useCallback((change: Partial<LocalAiGateConfig>) => {
    setSave('idle')
    setConfig((prev) => ({ ...prev, ...change }))
  }, [])

  const onSave = useCallback(async () => {
    setSave('saving')
    setError(null)
    try {
      const res = await fetch('/api/admin/local-ai-gate', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'opslaan mislukt')
      }
      setSave('saved')
    } catch (err) {
      setSave('error')
      setError(err instanceof Error ? err.message : 'Opslaan mislukt.')
    }
  }, [config])

  const timeoutSeconds = Math.round(config.timeoutMs / 1000)

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-5 py-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink)]">Toelating lokale AI</h3>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Een toestel mag lokaal draaien als het de uitvoer-toets haalt: {PROOF_TASK_COUNT} korte
            proefvragen ná de download. Niet de toestelklasse en niet de GPU-specificaties beslissen —
            die zeggen alleen of het model kán draaien, niet of er iets bruikbaars uit komt.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--ink-4)]">Laden…</p>
      ) : (
        <div className="space-y-5">
          {/* ── Model ── */}
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Model
            </legend>
            {models.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-start gap-3 py-1">
                <input
                  type="radio"
                  name="gate-model"
                  checked={config.modelId === m.id}
                  onChange={() => patch({ modelId: m.id })}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--module-active-500)]"
                />
                <span>
                  <span className="block text-sm text-[var(--ink)]">
                    {m.label} · {formatModelGb(m.bytes)} GB
                  </span>
                  <span className="block text-xs text-[var(--ink-4)]">{m.blurb}</span>
                </span>
              </label>
            ))}
            <label className="mt-2 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={config.allowUserModelChoice}
                onChange={(e) => patch({ allowUserModelChoice: e.target.checked })}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--module-active-500)]"
              />
              <span className="text-sm text-[var(--ink-2)]">
                Gebruikers mogen zelf een model kiezen
                <span className="block text-xs text-[var(--ink-4)]">
                  Uit: iedereen krijgt het model dat hierboven staat.
                </span>
              </span>
            </label>
          </fieldset>

          {/* ── Drempel ── */}
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Drempel
            </legend>
            <label className="flex flex-wrap items-center gap-2 text-sm text-[var(--ink-2)]">
              Minimaal goed van de {PROOF_TASK_COUNT} proefvragen:
              <select
                value={config.minPassed}
                onChange={(e) => patch({ minPassed: Number(e.target.value) })}
                className="min-h-9 border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 text-sm text-[var(--ink)]"
              >
                {Array.from({ length: PROOF_TASK_COUNT }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs leading-relaxed text-[var(--ink-4)]">
              {config.minPassed === PROOF_TASK_COUNT
                ? 'Strengste stand: alles goed. Dit is de aanbevolen waarde.'
                : `Soepeler: een toestel komt er ook door met ${PROOF_TASK_COUNT - config.minPassed} mislukte vraag/vragen. Doe dit alleen met een reden — een zakking betekent dat er onzin uit het model komt.`}
            </p>

            <label className="flex flex-wrap items-center gap-2 pt-2 text-sm text-[var(--ink-2)]">
              Maximale wachttijd per antwoord:
              <input
                type="number"
                min={Math.round(MIN_TIMEOUT_MS / 1000)}
                max={Math.round(MAX_TIMEOUT_MS / 1000)}
                value={timeoutSeconds}
                onChange={(e) => patch({ timeoutMs: Number(e.target.value) * 1000 })}
                className="min-h-9 w-20 border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 text-sm tabular-nums text-[var(--ink)]"
              />
              seconden
            </label>
            <p className="text-xs leading-relaxed text-[var(--ink-4)]">
              Daarboven telt het antwoord als vastgelopen. De meting zag naast corrupte uitvoer ook
              echte hangs, dus deze grens is geen luxe.
            </p>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={save === 'saving'}
              className="inline-flex min-h-11 items-center gap-2 bg-[var(--ink)] px-5 py-2 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {save === 'saving' ? 'Opslaan…' : 'Opslaan'}
            </button>
            {save === 'saved' && (
              <span className="inline-flex items-center gap-1.5 text-sm text-[var(--positive)]">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Opgeslagen
              </span>
            )}
            {error && (
              <span className="inline-flex items-center gap-1.5 text-sm text-[var(--negative)]">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {error}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
