'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Settings2, Check, Loader2, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import {
  AI_EXECUTION_GROUPS,
  type AiExecutionGroup,
  type AiExecutionMode,
} from '@/lib/ai/execution-groups'
import {
  LOCAL_MODEL_CATALOG,
  formatModelGb,
  type LocalModelDescriptor,
  type LocalModelId,
} from '@/lib/ai/local/model-catalog'
import { getSelectedLocalModelId } from '@/lib/ai/local/selected-model'
import { selectLocalModel } from '@/lib/ai/local/model-manager'
import { DEFAULT_GATE_CONFIG, parseGateConfig, type LocalAiGateConfig } from '@/lib/ai/local/gate-config'
import { notifyExecutionPrefsChanged } from '@/lib/ai/execution-prefs-signal'

/**
 * Compacte instellingen ín het chatvenster, achter een discrete knop naast het
 * pin-icoon.
 *
 * Waarom hier en niet alleen op /mijn/privacy: het gesprek is precies de plek
 * waar je merkt dát je iets anders wilt — lokaal in plaats van cloud, of
 * andersom omdat het lokale antwoord tegenvalt. Daarvoor de chat verlaten,
 * instellen en terugkomen is een omweg die je in de praktijk niet neemt.
 *
 * GEEN TWEEDE WAARHEID. Alles loopt door dezelfde bronnen als het volledige
 * scherm: `/api/ai-execution-prefs` voor de keuze per functionaliteit,
 * `/api/local-ai-gate` voor wat beheer toestaat, en `selectLocalModel` voor het
 * model op dit toestel. Deze popover is een tweede BEDIENING, geen tweede
 * administratie.
 *
 * WAT HIER BEWUST NIET KAN: een model van 2 à 3 GB binnenhalen. Dat hoort bij de
 * consent-stap, de voortgangsbalk en de uitvoer-toets op /mijn/privacy — niet in
 * een popover van 300 pixels. Een model dat nog niet op dit toestel staat is
 * daarom zichtbaar maar niet kiesbaar, mét de weg ernaartoe.
 */

type PrefsResponse = {
  prefs?: Partial<Record<AiExecutionGroup, AiExecutionMode>>
  modes?: Record<AiExecutionGroup, AiExecutionMode>
}

/** De groep waar dit venster zelf op draait — die krijgt de ereplaats bovenaan. */
const CHAT_GROUP: AiExecutionGroup = 'gesprek'

const OTHER_GROUPS = AI_EXECUTION_GROUPS.filter((g) => g.id !== CHAT_GROUP)

export function ChatSettingsPopover({ onChanged }: { onChanged?: () => void }) {
  const [open, setOpen] = useState(false)
  const [modes, setModes] = useState<Record<AiExecutionGroup, AiExecutionMode> | null>(null)
  const [saving, setSaving] = useState<AiExecutionGroup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [gate, setGate] = useState<LocalAiGateConfig>(DEFAULT_GATE_CONFIG)
  const [modelId, setModelId] = useState<LocalModelId>(getSelectedLocalModelId)
  /** Welke modellen staan er daadwerkelijk op dit toestel? */
  const [cached, setCached] = useState<Record<string, boolean>>({})

  const wrapRef = useRef<HTMLDivElement>(null)

  // Sluiten bij een klik buiten de popover en bij Escape — het gedrag dat een
  // gebruiker van een menu verwacht, zonder er een modal van te maken.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Verse lezing per opening: iemand kan op /mijn/privacy net iets hebben
  // omgezet, en een verouderde stand tonen over de bestemming van je gegevens is
  // erger dan een halve seconde wachten.
  useEffect(() => {
    if (!open) return
    let active = true
    ;(async () => {
      try {
        const [prefsRes, gateRes] = await Promise.all([
          fetch('/api/ai-execution-prefs'),
          fetch('/api/local-ai-gate'),
        ])
        if (!active) return
        if (prefsRes.ok) {
          const data = (await prefsRes.json()) as PrefsResponse
          if (active && data.modes) setModes(data.modes)
        } else {
          setError('Je keuzes konden niet geladen worden.')
        }
        if (gateRes.ok) {
          const data = (await gateRes.json()) as { config?: unknown }
          if (active) setGate(parseGateConfig(data.config))
        }
      } catch {
        if (active) setError('Je keuzes konden niet geladen worden.')
      }

      // Cache-stand per model: bepaalt of een keuze hier gemaakt mág worden.
      try {
        const { isModelCached } = await import('@/lib/ai/local/litert-runtime')
        const entries = await Promise.all(
          LOCAL_MODEL_CATALOG.map(async (m) => [m.id, await isModelCached(m.url)] as const),
        )
        if (active) setCached(Object.fromEntries(entries))
      } catch {
        /* geen cache-toegang → alles als "niet aanwezig" tonen, dus niet kiesbaar */
      }

      if (active) setModelId(getSelectedLocalModelId())
    })()
    return () => {
      active = false
    }
  }, [open])

  const setMode = useCallback(async (group: AiExecutionGroup, mode: AiExecutionMode) => {
    setSaving(group)
    setError(null)
    try {
      const res = await fetch('/api/ai-execution-prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group, mode }),
      })
      if (!res.ok) throw new Error('save failed')
      const data = (await res.json()) as PrefsResponse
      if (data.modes) setModes(data.modes)
      // Iedereen die de uitvoerkeuze leest, moet 'm opnieuw bepalen: de chat die
      // deze popover draagt (anders vertrekt de volgende vraag nog naar de oude
      // bestemming), maar net zo goed het waarschuwingsicoon op de Fin-knop en de
      // privacy-indicatoren elders op de pagina.
      notifyExecutionPrefsChanged()
      onChanged?.()
    } catch {
      setError('Deze keuze kon niet worden opgeslagen.')
    } finally {
      setSaving(null)
    }
  }, [onChanged])

  const onPickModel = useCallback(async (model: LocalModelDescriptor) => {
    if (!cached[model.id]) return
    setModelId(model.id)
    await selectLocalModel(model.id)
  }, [cached])

  const canPickModel = gate.allowUserModelChoice && LOCAL_MODEL_CATALOG.length > 1

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Instellingen voor dit gesprek"
        title="Instellingen"
        className="touch-target flex items-center justify-center rounded-lg text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]"
      >
        <Settings2 className="h-4 w-4" />
      </button>

      {open && (
        // Anker-popover binnen het chatvenster — bewust géén fixed overlay: dit
        // is een menu bij een knop, niet een laag over de app.
        <div
          role="dialog"
          aria-label="Instellingen voor dit gesprek"
          className="absolute right-0 top-full z-20 mt-2 max-h-[70vh] w-[300px] overflow-y-auto border border-[var(--border-ed)] bg-[var(--paper)] p-3 shadow-lg"
        >
          {/* ── Dit gesprek ── */}
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
            Dit gesprek
          </p>
          <ModeSwitch
            value={modes?.[CHAT_GROUP] ?? null}
            busy={saving === CHAT_GROUP}
            onChange={(mode) => setMode(CHAT_GROUP, mode)}
          />

          {/* ── Model ── */}
          {canPickModel && (
            <>
              <p className="mb-1.5 mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
                Lokaal model
              </p>
              <div className="space-y-1">
                {LOCAL_MODEL_CATALOG.map((m) => {
                  const available = cached[m.id] === true
                  const selected = m.id === modelId
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!available}
                      onClick={() => onPickModel(m)}
                      className={`flex w-full items-center justify-between gap-2 border px-2.5 py-1.5 text-left text-xs transition-colors ${
                        selected
                          ? 'border-[var(--ink)] bg-[var(--subtle)]'
                          : 'border-[var(--rule-soft)] hover:bg-[var(--subtle)]'
                      } disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[var(--ink)]">{m.label}</span>
                        <span className="block text-[10px] text-[var(--ink-4)]">
                          {available ? `${formatModelGb(m.bytes)} GB · staat klaar` : 'nog niet gedownload'}
                        </span>
                      </span>
                      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--ink)]" aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* ── Overige functies ── */}
          <p className="mb-1.5 mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
            Overige functies
          </p>
          <ul className="space-y-1.5">
            {OTHER_GROUPS.map((group) => (
              <li key={group.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--ink-2)]" title={group.label}>
                  {group.label}
                </span>
                <ModeSwitch
                  compact
                  value={modes?.[group.id] ?? null}
                  busy={saving === group.id}
                  onChange={(mode) => setMode(group.id, mode)}
                />
              </li>
            ))}
          </ul>

          {error && <p className="mt-3 text-[11px] text-[var(--negative)]">{error}</p>}

          <Link
            href="/mijn/privacy"
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
          >
            Alle instellingen, downloads en uitleg
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  )
}

/**
 * Twee knoppen, één keuze. Bewust geen driewegkeuze met "volg hoofdkeuze": in
 * een popover van deze omvang is dat een extra begrip zonder zichtbare winst —
 * wie de nuance wil, gaat naar /mijn/privacy (de link staat eronder).
 */
function ModeSwitch({
  value,
  busy,
  compact,
  onChange,
}: {
  value: AiExecutionMode | null
  busy: boolean
  compact?: boolean
  onChange: (mode: AiExecutionMode) => void
}) {
  const size = compact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-[11px]'
  return (
    <div className="inline-flex shrink-0 items-center gap-1">
      {busy && <Loader2 className="h-3 w-3 animate-spin text-[var(--ink-4)]" aria-hidden="true" />}
      {(['lokaal', 'cloud'] as const).map((mode) => {
        const active = value === mode
        return (
          <button
            key={mode}
            type="button"
            disabled={busy}
            aria-pressed={active}
            onClick={() => onChange(mode)}
            className={`border font-mono uppercase tracking-[0.10em] transition-colors ${size} ${
              active
                ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                : 'border-[var(--rule-soft)] text-[var(--ink-3)] hover:bg-[var(--subtle)]'
            } disabled:opacity-50`}
          >
            {mode === 'lokaal' ? 'Lokaal' : 'Cloud'}
          </button>
        )
      })}
    </div>
  )
}
