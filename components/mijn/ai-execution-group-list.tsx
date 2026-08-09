'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, AlertTriangle, Info } from 'lucide-react'
import { Kicker } from '@/components/editorial'
import {
  AI_EXECUTION_GROUPS,
  type AiExecutionGroup,
  type AiExecutionMode,
} from '@/lib/ai/execution-groups'
import { notifyExecutionPrefsChanged } from '@/lib/ai/execution-prefs-signal'

/**
 * AiExecutionGroupList — de keuze "waar draait de AI?" PER FUNCTIONALITEIT.
 *
 * De zeven groepen komen uit lib/ai/execution-groups.ts (single source of truth).
 * Per groep toont deze lijst de opgeloste modus (`modes` uit de API: override ??
 * hoofdschakelaar), een keuze lokaal/cloud, en — bij `lokaal: 'gedeeltelijk'` —
 * ZICHTBAAR wat je inlevert.
 *
 * DIE BEPERKINGEN ZIJN DE KERN, GEEN DETAIL. De gekozen semantiek is: kan iets
 * lokaal niet, dan wordt het geblokkeerd en niet stilzwijgend via de cloud gedaan.
 * Een gebruiker mag dus nooit ontdekken dát iets niet meer werkt zonder dat het er
 * stond. Daarom staan de beperkingen niet achter een tooltip, en staat de
 * "wat je inlevert"-melding ook ZONDER uitklappen in beeld zodra een groep
 * daadwerkelijk lokaal draait.
 *
 * NIEUWS-INGEST IS GEEN SCHAKELAAR. Het verzamelen van bronartikelen is een
 * centrale dagelijkse taak (cron, service-role) die uitsluitend openbare
 * nieuwsbronnen leest en nooit gegevens van een gebruiker. Die per gebruiker
 * "blokkeren" zou schijnveiligheid zijn; hij wordt daarom wél benoemd (uitleg-regel
 * onder de groep Nieuws) maar niet schakelbaar gemaakt. Zie de kop van
 * lib/ai/execution-groups.ts.
 *
 * DATAPAD (ADR 0058): lezen én schrijven via /api/ai-execution-prefs — geen directe
 * supabase-client in dit bestand.
 */

type PrefsResponse = {
  privacyMode?: boolean
  prefs?: Partial<Record<AiExecutionGroup, AiExecutionMode>>
  modes?: Record<AiExecutionGroup, AiExecutionMode>
}

function ModeChip({ mode }: { mode: AiExecutionMode | null }) {
  if (mode === null) {
    return (
      <span className="inline-flex items-center border border-[var(--rule-soft)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
        …
      </span>
    )
  }
  const isLocal = mode === 'lokaal'
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
        isLocal
          ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
          : 'border-[var(--rule-soft)] text-[var(--ink-3)]'
      }`}
    >
      {isLocal ? 'Lokaal' : 'Cloud'}
    </span>
  )
}

export function AiExecutionGroupList({
  privacyMode,
  canChooseLocal,
  localBlockedReason,
  hideHeading = false,
}: {
  /** De hoofdschakelaar. Verandert die, dan halen we de opgeloste modi opnieuw op. */
  privacyMode: boolean
  /** Mag deze gebruiker op dit toestel überhaupt lokaal kiezen? (tier + desktop) */
  canChooseLocal: boolean
  /** Korte uitleg wanneer `canChooseLocal` false is. */
  localBlockedReason?: string
  /**
   * Laat de eigen kicker + kop + intro én de kaartrand weg. Gebruikt wanneer de
   * lijst al ín een `DepthSection` hangt (MIJN-4): die draagt daar zelf de titel
   * en de rand, en twee koppen boven elkaar zouden lezen als twee lijsten.
   */
  hideHeading?: boolean
}) {
  const [modes, setModes] = useState<Record<AiExecutionGroup, AiExecutionMode> | null>(null)
  const [prefs, setPrefs] = useState<Partial<Record<AiExecutionGroup, AiExecutionMode>>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openGroup, setOpenGroup] = useState<AiExecutionGroup | null>(null)
  const [savingGroup, setSavingGroup] = useState<AiExecutionGroup | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const applyResponse = useCallback((data: PrefsResponse) => {
    if (data.modes) setModes(data.modes)
    setPrefs(data.prefs ?? {})
  }, [])

  // Verse lezing bij mount én zodra de hoofdschakelaar wijzigt: groepen zonder
  // eigen keuze volgen die schakelaar, dus hun getoonde modus verandert mee.
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/ai-execution-prefs')
        if (!res.ok) throw new Error('load failed')
        const data = (await res.json()) as PrefsResponse
        if (!active) return
        setLoadError(null)
        applyResponse(data)
      } catch {
        if (active) setLoadError('Je keuzes per functie konden niet worden geladen. Ververs de pagina.')
      }
    })()
    return () => {
      active = false
    }
  }, [applyResponse, privacyMode])

  const setMode = useCallback(
    async (group: AiExecutionGroup, mode: AiExecutionMode | null) => {
      setSavingGroup(group)
      setSaveError(null)
      try {
        const res = await fetch('/api/ai-execution-prefs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ group, mode }),
        })
        if (!res.ok) throw new Error('save failed')
        const data = (await res.json()) as PrefsResponse
        applyResponse(data)
        // Lezers elders (de chat, het waarschuwingsicoon op de Fin-knop, de
        // privacy-indicatoren) bepalen hierop opnieuw — zie execution-prefs-signal.
        notifyExecutionPrefsChanged()
      } catch {
        setSaveError('Deze keuze kon niet worden opgeslagen. Probeer het zo nog eens.')
      } finally {
        setSavingGroup(null)
      }
    },
    [applyResponse],
  )

  return (
    <section
      className={hideHeading ? '' : 'border border-[var(--border-ed)] bg-[var(--paper)]'}
    >
      <div className={hideHeading ? 'space-y-4' : 'space-y-4 px-4 py-6 sm:px-6'}>
        {!hideHeading && (
          <div className="space-y-2">
            <Kicker>Per functionaliteit</Kicker>
            <h2
              className="text-[20px] font-bold leading-tight tracking-[-0.01em] text-[var(--ink)] sm:text-[24px]"
              style={{ fontFamily: 'var(--font-playfair, serif)' }}
            >
              Liever per{' '}
              <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
                onderdeel
              </em>{' '}
              kiezen?
            </h2>
            <p className="text-sm leading-relaxed text-[var(--ink-2)]">
              Elk onderdeel volgt je hoofdkeuze, tenzij je het hier anders zet. Klap een onderdeel open om te
              zien wat er lokaal wél en niet kan.
            </p>
          </div>
        )}

        {loadError && (
          <p role="alert" className="text-sm text-negative">
            {loadError}
          </p>
        )}

        {saveError && (
          <p role="alert" className="text-sm text-negative">
            {saveError}
          </p>
        )}

        {!canChooseLocal && localBlockedReason && (
          <p className="flex items-start gap-2 bg-[var(--subtle)] p-3 text-xs leading-relaxed text-[var(--ink-2)]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
            <span>{localBlockedReason}</span>
          </p>
        )}

        <ul className="border-t border-[var(--border-ed)]">
          {AI_EXECUTION_GROUPS.map((group) => {
            const mode = modes ? modes[group.id] : null
            const heeftEigenKeuze = prefs[group.id] != null
            const isOpen = openGroup === group.id
            const panelId = `ai-groep-${group.id}-paneel`
            const saving = savingGroup === group.id
            const toontVerlies = mode === 'lokaal' && group.beperkingen.length > 0

            return (
              <li key={group.id} className="border-b border-[var(--border-ed)]">
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenGroup(isOpen ? null : group.id)}
                    className="flex w-full items-start justify-between gap-3 px-1 py-4 text-left transition-colors hover:bg-[var(--subtle)]"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--ink)]">{group.label}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-[var(--ink-3)]">
                        {group.omschrijving}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <ModeChip mode={mode} />
                      <ChevronDown
                        aria-hidden="true"
                        className={`h-4 w-4 text-[var(--ink-3)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </span>
                  </button>
                </h3>

                {/* Altijd zichtbaar zodra deze groep écht lokaal draait: wat je
                    inlevert. Niet achter het uitklappen — precies de melding die
                    een gebruiker niet mag missen. */}
                {toontVerlies && (
                  <div className="mb-4 border-l-2 border-warning/60 bg-warning-bg px-3 py-2.5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-2)]">
                      Wat je hierbij inlevert
                    </p>
                    <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-[var(--ink-2)]">
                      {group.beperkingen.map((b) => (
                        <li key={b} className="flex items-start gap-2">
                          <AlertTriangle
                            className="mt-0.5 h-3 w-3 shrink-0 text-warning"
                            aria-hidden="true"
                          />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {isOpen && (
                  <div id={panelId} className="space-y-3 px-1 pb-4">
                    {/* Wat kan lokaal wel/niet — als VOORUITBLIK, dus alleen zolang
                        de groep nog op cloud staat: dan weet je wat je inlevert
                        vóór je omzet. Draait de groep al lokaal, dan staat die
                        opsomming hierboven al permanent in beeld ("Wat je hierbij
                        inlevert") en zou hem hier herhalen de uitgeklapte staat
                        alleen maar rommelig maken. */}
                    {group.lokaal === 'gedeeltelijk' ? (
                      toontVerlies ? null : (
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                            Wat kan er lokaal niet?
                          </p>
                          <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-[var(--ink-2)]">
                            {group.beperkingen.map((b) => (
                              <li key={b} className="flex items-start gap-2">
                                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" />
                                <span>{b}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    ) : (
                      <p className="text-xs leading-relaxed text-[var(--ink-2)]">
                        Dit onderdeel werkt volledig lokaal — je levert er niets voor in, behalve dat het
                        wat langer duurt.
                      </p>
                    )}

                    <div
                      role="radiogroup"
                      aria-label={`Waar draait ${group.label}?`}
                      className="flex flex-wrap gap-2"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={mode === 'cloud'}
                        disabled={saving || mode === null}
                        onClick={() => setMode(group.id, 'cloud')}
                        className={`min-h-11 border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          mode === 'cloud'
                            ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                            : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--subtle)]'
                        }`}
                      >
                        Cloud-AI
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={mode === 'lokaal'}
                        disabled={saving || mode === null || !canChooseLocal}
                        onClick={() => setMode(group.id, 'lokaal')}
                        className={`min-h-11 border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          mode === 'lokaal'
                            ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                            : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--subtle)]'
                        }`}
                      >
                        Lokaal op je apparaat
                      </button>
                    </div>

                    {heeftEigenKeuze && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setMode(group.id, null)}
                        className="text-xs font-medium text-[var(--ink-3)] underline underline-offset-2 transition-colors hover:text-[var(--ink)] disabled:opacity-50"
                      >
                        Eigen keuze — volg weer de hoofdkeuze
                      </button>
                    )}
                  </div>
                )}

                {/* Nieuws: de centrale bronverzameling is geen gebruikerskeuze.
                    Wél benoemen, zodat de lijst eerlijk volledig is. */}
                {group.id === 'nieuws' && (
                  <p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-[var(--ink-3)]">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      Het verzamelen van nieuwsbronnen gebeurt centraal en verwerkt alleen openbare bronnen
                      — nooit jouw gegevens.
                    </span>
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
