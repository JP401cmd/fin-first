'use client'

// Resultaatinvoer voor één subscenario × platform (Deel 3 §3.3). Statusknoppen
// (stoplicht), verplichte faalstap + severity bij 'gefaald' (spiegelt de 400 van
// de route), optionele opmerking en een apart frictie/UX-veld dat óók bij
// 'geslaagd' invulbaar is. Opslaan = POST /api/admin/uat/results; 409 → read-only.

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { UAT_STATUS_VISUAL, type UatResultRow, type UatResultStatus } from '@/lib/uat/status'

const SEVERITIES = ['S0', 'S1', 'S2', 'S3'] as const
type Severity = (typeof SEVERITIES)[number]

const STATUS_OPTIONS: { value: UatResultStatus; label: string; visual: keyof typeof UAT_STATUS_VISUAL }[] = [
  { value: 'geslaagd', label: 'Geslaagd', visual: 'groen' },
  { value: 'gefaald', label: 'Gefaald', visual: 'rood' },
  { value: 'geblokkeerd', label: 'Geblokkeerd', visual: 'oranje' },
]

const SEVERITY_HINT: Record<Severity, string> = {
  S0: 'Blokkerend — app onbruikbaar / dataverlies',
  S1: 'Ernstig — kernpad stuk, geen workaround',
  S2: 'Matig — hindert, workaround bestaat',
  S3: 'Klein — cosmetisch / marginaal',
}

interface Props {
  roundId: string
  scenarioId: string
  sub: string
  platform: string
  existing: UatResultRow | undefined
  onSaved: (row: UatResultRow) => void
  onRoundClosed: () => void
}

function formatTested(iso?: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString('nl-NL', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function UatResultForm({
  roundId,
  scenarioId,
  sub,
  platform,
  existing,
  onSaved,
  onRoundClosed,
}: Props) {
  const [status, setStatus] = useState<UatResultStatus | null>(
    (existing?.status as UatResultStatus) ?? null,
  )
  const [faalstap, setFaalstap] = useState(existing?.faalstap ?? '')
  const [severity, setSeverity] = useState<Severity | null>((existing?.severity as Severity) ?? null)
  const [opmerking, setOpmerking] = useState(existing?.opmerking ?? '')
  const [frictie, setFrictie] = useState(existing?.frictie ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedTick, setSavedTick] = useState(false)

  const needsFail = status === 'gefaald'
  const failIncomplete = needsFail && (!faalstap.trim() || !severity)
  const canSave = !saving && status !== null && !failIncomplete

  const testedAt = formatTested(existing?.tested_at)
  const fieldBase =
    'w-full rounded-md border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] outline-none focus:border-[var(--ink-3)] disabled:opacity-60'

  async function save() {
    if (!canSave || status === null) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/uat/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          round_id: roundId,
          scenario_id: scenarioId,
          sub,
          platform,
          status,
          faalstap: needsFail ? faalstap.trim() : faalstap.trim() || null,
          severity: needsFail ? severity : null,
          opmerking: opmerking.trim() || null,
          frictie: frictie.trim() || null,
        }),
      })
      if (res.status === 409) {
        setError('Ronde gesloten — heropen om te bewerken.')
        onRoundClosed()
        return
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(j?.error ?? `Opslaan mislukte (${res.status})`)
      }
      const j = (await res.json()) as { result: UatResultRow }
      onSaved(j.result)
      setSavedTick(true)
      setTimeout(() => setSavedTick(false), 1600)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Onbekende fout')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-md border border-[var(--border-ed)] bg-[var(--subtle,transparent)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-2)]">
          {sub}
          <span className="mx-1.5 text-[var(--ink-4)]">·</span>
          {platform}
        </p>
        {testedAt && <span className="text-[10px] text-[var(--ink-4)]">laatst: {testedAt}</span>}
      </div>

      {/* Statusknoppen (stoplicht) */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Status voor ${sub} ${platform}`}>
        {STATUS_OPTIONS.map((opt) => {
          const active = status === opt.value
          const v = UAT_STATUS_VISUAL[opt.visual]
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatus(opt.value)}
              aria-pressed={active}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={
                active
                  ? { backgroundColor: v.fill, borderColor: v.stroke, color: '#fff' }
                  : { borderColor: 'var(--border-ed)', color: 'var(--ink-2)' }
              }
            >
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: active ? '#fff' : v.fill }}
              />
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Faalstap + severity (verplicht bij Gefaald) */}
      {needsFail && (
        <div className="mt-2.5 space-y-2 rounded-md border border-[var(--negative)] bg-[var(--paper)] p-2.5">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--ink-2)]">
              Faalstap <span className="text-[var(--negative)]">*</span>
            </label>
            <input
              type="text"
              value={faalstap}
              onChange={(e) => setFaalstap(e.target.value)}
              placeholder="bv. stap 4 — bedrag klopt niet"
              className={fieldBase}
              aria-invalid={needsFail && !faalstap.trim()}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--ink-2)]">
              Severity <span className="text-[var(--negative)]">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  aria-pressed={severity === s}
                  title={SEVERITY_HINT[s]}
                  className={`rounded-md border px-2.5 py-1 text-xs font-semibold disabled:opacity-60 ${
                    severity === s
                      ? 'border-[var(--negative)] bg-[var(--negative)] text-white'
                      : 'border-[var(--border-ed)] text-[var(--ink-2)]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {severity && <p className="mt-1 text-[10px] text-[var(--ink-3)]">{SEVERITY_HINT[severity]}</p>}
          </div>
        </div>
      )}

      {/* Opmerking */}
      <div className="mt-2.5">
        <label className="mb-1 block text-[11px] font-medium text-[var(--ink-2)]">Opmerking (optioneel)</label>
        <textarea
          value={opmerking}
          onChange={(e) => setOpmerking(e.target.value)}
          rows={2}
          placeholder="Context bij de registratie"
          className={`${fieldBase} resize-y`}
        />
      </div>

      {/* Frictie / UX-observatie — óók bij Geslaagd */}
      <div className="mt-2">
        <label className="mb-1 block text-[11px] font-medium text-[var(--ink-2)]">
          Frictie / UX-observatie (optioneel)
        </label>
        <textarea
          value={frictie}
          onChange={(e) => setFrictie(e.target.value)}
          rows={2}
          placeholder="Technisch werkt het, maar het wringt omdat…"
          className={`${fieldBase} resize-y`}
        />
        <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
          Bewust geen bug-registratie — werkt-maar-wringt.
        </p>
      </div>

      {error && <p className="mt-2 text-xs text-[var(--negative)]">{error}</p>}

      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--ink)] px-3 py-1.5 text-xs font-semibold text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedTick ? <Check className="h-3.5 w-3.5" /> : null}
          {savedTick ? 'Opgeslagen' : existing ? 'Bijwerken' : 'Opslaan'}
        </button>
        {failIncomplete && (
          <span className="text-[10px] text-[var(--ink-3)]">Vul faalstap én severity in om op te slaan.</span>
        )}
      </div>
    </div>
  )
}
