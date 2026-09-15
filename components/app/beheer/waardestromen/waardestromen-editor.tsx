'use client'

/**
 * WaardestromenEditor — welke app-delen samen één gebruikstype vormen
 * (ADR 0147, fase 2).
 *
 * Een waardestroom is een door beheer benoemde bundel app-delen. Verspreidings-
 * regels en dynamische groepen kunnen richten op "dominante waardestroom is …".
 * Dit scherm schrijft alleen die configuratie (`PUT /api/admin/waardestromen`);
 * de meting zelf (dagen per app-deel) loopt los ervan.
 *
 * STROOM-ID IS STABIEL: bij het aanmaken afgeleid van de naam
 * (`stroomIdVanNaam`), daarna onveranderlijk. Hernoemen breekt dus geen regel;
 * verwijderen laat regels achter die niemand meer matchen — vandaar de
 * bevestiging.
 */

import { useEffect, useMemo, useState } from 'react'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { foutUit } from '@/components/app/beheer/gebruikersgroepen/groep-types'
import { ACTIVITY_MODULES, MODULE_LABELS, type ActivityModule } from '@/lib/activity/modules'
import {
  DOMINANT_MIN_DAGEN,
  STANDAARD_WAARDESTROMEN,
  stroomIdVanNaam,
  WAARDESTROMEN_MAX,
  WAARDESTROMEN_MIN,
  type Waardestroom,
} from '@/lib/waardestromen'

interface GebruikRij {
  module: ActivityModule
  gebruikers: number
}

const KICKER_CLASS = 'block font-mono text-[10px] uppercase tracking-[0.20em] text-[var(--ink-3)]'

const KNOP_CLASS =
  'inline-flex items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 text-xs text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] disabled:cursor-not-allowed disabled:opacity-50'

/** Controleer wat de server ook zou weigeren, zodat de melding bij de invoer staat. */
function valideer(stromen: readonly Waardestroom[]): string | null {
  if (stromen.length < WAARDESTROMEN_MIN) return 'Houd minstens één waardestroom over.'
  if (stromen.length > WAARDESTROMEN_MAX) return `Hoogstens ${WAARDESTROMEN_MAX} waardestromen.`
  for (const [i, s] of stromen.entries()) {
    if (!s.naam.trim()) return `Stroom ${i + 1} heeft nog geen naam.`
    if (s.modules.length === 0) return `Kies minstens één app-deel voor ${s.naam.trim()}.`
  }
  return null
}

export function WaardestromenEditor() {
  const [stromen, setStromen] = useState<Waardestroom[]>([])
  const [gebruik, setGebruik] = useState<Map<ActivityModule, number> | null>(null)
  const [laden, setLaden] = useState(true)
  const [laadFout, setLaadFout] = useState<string | null>(null)
  const [opslaan, setOpslaan] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [bewaard, setBewaard] = useState(false)
  const [gewijzigd, setGewijzigd] = useState(false)
  const [nieuweNaam, setNieuweNaam] = useState('')
  const [teVerwijderen, setTeVerwijderen] = useState<number | null>(null)
  const [terugzettenVragen, setTerugzettenVragen] = useState(false)

  useEffect(() => {
    let afgebroken = false
    fetch('/api/admin/waardestromen')
      .then(async (res) => {
        if (!res.ok) {
          const melding = await foutUit(res, 'Laden')
          if (!afgebroken) setLaadFout(melding)
          return
        }
        const data = (await res.json().catch(() => null)) as {
          waardestromen?: { stromen?: Waardestroom[] }
          gebruik?: GebruikRij[] | null
        } | null
        if (afgebroken) return
        setStromen(
          Array.isArray(data?.waardestromen?.stromen)
            ? data.waardestromen.stromen
            : structuredClone(STANDAARD_WAARDESTROMEN.stromen),
        )
        setGebruik(
          Array.isArray(data?.gebruik) ? new Map(data.gebruik.map((r) => [r.module, r.gebruikers])) : null,
        )
      })
      .catch(() => {
        if (!afgebroken) setLaadFout('Laden mislukt — controleer je verbinding.')
      })
      .finally(() => {
        if (!afgebroken) setLaden(false)
      })
    return () => {
      afgebroken = true
    }
  }, [])

  const wijzig = (maak: (s: Waardestroom[]) => Waardestroom[]) => {
    setStromen(maak)
    setGewijzigd(true)
    setBewaard(false)
    setFout(null)
  }

  const zetNaam = (i: number, naam: string) =>
    wijzig((ss) => ss.map((s, j) => (j === i ? { ...s, naam } : s)))

  const zetModule = (i: number, module: ActivityModule, aan: boolean) =>
    wijzig((ss) =>
      ss.map((s, j) => {
        if (j !== i) return s
        const modules = aan
          ? ACTIVITY_MODULES.filter((m) => m === module || s.modules.includes(m))
          : s.modules.filter((m) => m !== module)
        return { ...s, modules }
      }),
    )

  const voegToe = () => {
    const naam = nieuweNaam.trim()
    if (!naam || stromen.length >= WAARDESTROMEN_MAX) return
    const id = stroomIdVanNaam(
      naam,
      stromen.map((s) => s.id),
    )
    wijzig((ss) => [...ss, { id, naam, modules: [] }])
    setNieuweNaam('')
  }

  const verwijder = (i: number) => {
    wijzig((ss) => ss.filter((_, j) => j !== i))
    setTeVerwijderen(null)
  }

  const standaard = () => {
    wijzig(() => structuredClone(STANDAARD_WAARDESTROMEN.stromen))
    setTerugzettenVragen(false)
  }

  const bewaar = async () => {
    const opgeschoond = stromen.map((s) => ({ ...s, naam: s.naam.trim() }))
    const melding = valideer(opgeschoond)
    if (melding) {
      setFout(melding)
      return
    }
    setOpslaan(true)
    setFout(null)
    try {
      const res = await fetch('/api/admin/waardestromen', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stromen: opgeschoond }),
      })
      if (!res.ok) {
        setFout(await foutUit(res, 'Opslaan'))
        return
      }
      const data = (await res.json().catch(() => null)) as {
        waardestromen?: { stromen?: Waardestroom[] }
      } | null
      if (Array.isArray(data?.waardestromen?.stromen)) setStromen(data.waardestromen.stromen)
      setGewijzigd(false)
      setBewaard(true)
    } catch {
      setFout('Opslaan mislukt — controleer je verbinding.')
    } finally {
      setOpslaan(false)
    }
  }

  // Signalen: app-delen die nergens meetellen, en app-delen in meer dan één stroom.
  const { nergens, dubbel } = useMemo(() => {
    const perModule = new Map<ActivityModule, string[]>()
    for (const s of stromen) {
      for (const m of s.modules) perModule.set(m, [...(perModule.get(m) ?? []), s.naam.trim() || s.id])
    }
    return {
      nergens: ACTIVITY_MODULES.filter((m) => !perModule.has(m)),
      dubbel: ACTIVITY_MODULES.filter((m) => (perModule.get(m)?.length ?? 0) > 1).map((m) => ({
        module: m,
        stromen: perModule.get(m) ?? [],
      })),
    }
  }, [stromen])

  const stroomVoorBevestiging = teVerwijderen === null ? null : stromen[teVerwijderen]

  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-[var(--ink)]">Waardestromen</h2>

      {/* Uitleg — keuze · effect · waarom */}
      <div className="mt-3 max-w-2xl space-y-2 font-serif text-sm leading-relaxed text-[var(--ink-2)]">
        <p>
          <span className="font-semibold text-[var(--ink)]">Wat je kiest.</span> Een waardestroom is een bundel
          app-delen die samen één manier van gebruiken vormen — bijvoorbeeld Vermogen (overzicht, bezittingen,
          schulden) tegenover Toekomst.
        </p>
        <p>
          <span className="font-semibold text-[var(--ink)]">Wat er dan gebeurt.</span> Iemands dominante stroom is
          de stroom met de meeste actieve <em>dagen</em> in de laatste 30 dagen, mits minstens{' '}
          {DOMINANT_MIN_DAGEN}. Bij een gelijke stand is er geen dominante stroom. Vragenlijsten en dynamische
          groepen kunnen daarop richten.
        </p>
        <p>
          <span className="font-semibold text-[var(--ink)]">Waarom zo.</span> We meten alleen óp welke dag iemand
          een app-deel gebruikte — geen kliks, geen tijd, geen inhoud. Precies fijn genoeg om gebruikstypen te
          onderscheiden, en niet fijner.
        </p>
      </div>

      {laden ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 animate-pulse border border-[var(--border-ed)] bg-[var(--subtle)]" />
          ))}
        </div>
      ) : laadFout ? (
        <p role="alert" className="mt-6 border border-[var(--negative)] px-3 py-2 text-sm text-[var(--negative)]">
          {laadFout}
        </p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <span className={KICKER_CLASS}>
              {stromen.length} van {WAARDESTROMEN_MAX} stromen
            </span>
            <button type="button" onClick={() => setTerugzettenVragen(true)} className={KNOP_CLASS}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Standaard terugzetten
            </button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {stromen.map((stroom, i) => (
              <fieldset key={stroom.id} className="min-w-0 border border-[var(--border-ed)] bg-[var(--paper)] p-4">
                <legend className="sr-only">Stroom {i + 1}</legend>
                <div className="flex items-start gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Naam van stroom {i + 1}</span>
                    <input
                      type="text"
                      value={stroom.naam}
                      maxLength={40}
                      onChange={(e) => zetNaam(i, e.target.value)}
                      placeholder="Naam van de stroom"
                      className="w-full border-b border-[var(--border-ed)] bg-transparent pb-1 font-display text-base font-semibold text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-[var(--border-md)] focus:outline-none"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setTeVerwijderen(i)}
                    disabled={stromen.length <= WAARDESTROMEN_MIN}
                    aria-label={`Stroom ${stroom.naam.trim() || i + 1} verwijderen`}
                    className="p-1 text-[var(--ink-3)] transition-colors hover:text-[var(--negative)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 font-mono text-[10px] text-[var(--ink-4)]">id: {stroom.id}</p>

                <ul className="mt-3 space-y-1">
                  {ACTIVITY_MODULES.map((m) => {
                    const aantal = gebruik?.get(m) ?? 0
                    return (
                      <li key={m}>
                        <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
                          <input
                            type="checkbox"
                            checked={stroom.modules.includes(m)}
                            onChange={(e) => zetModule(i, m, e.target.checked)}
                            className="h-4 w-4 accent-[var(--color-kern-500)]"
                          />
                          <span className="min-w-0 flex-1 truncate">{MODULE_LABELS[m]}</span>
                          {gebruik && (
                            <span className="font-mono text-[11px] tabular-nums text-[var(--ink-4)]">
                              {aantal} {aantal === 1 ? 'gebruiker' : 'gebruikers'}
                            </span>
                          )}
                        </label>
                      </li>
                    )
                  })}
                </ul>
                {!gebruik && (
                  <p className="mt-2 font-mono text-[10px] text-[var(--ink-4)]">
                    Gebruik per app-deel: nog niet gemeten
                  </p>
                )}
              </fieldset>
            ))}
          </div>

          {stromen.length < WAARDESTROMEN_MAX && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                aria-label="Naam van de nieuwe stroom"
                value={nieuweNaam}
                maxLength={40}
                onChange={(e) => setNieuweNaam(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    voegToe()
                  }
                }}
                placeholder="Naam nieuwe stroom"
                className="min-w-0 flex-1 border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-[var(--border-md)] focus:outline-none sm:max-w-xs"
              />
              <button type="button" onClick={voegToe} disabled={!nieuweNaam.trim()} className={KNOP_CLASS}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Stroom
              </button>
            </div>
          )}

          {/* Signalen */}
          {(nergens.length > 0 || dubbel.length > 0) && (
            <section aria-label="Signalen" className="mt-6 space-y-2 border-t border-[var(--border-ed)] pt-4">
              <span className={KICKER_CLASS}>Signalen</span>
              {nergens.length > 0 && (
                <p className="text-xs text-[var(--ink-2)]">
                  <span className="font-semibold">Telt nergens mee:</span>{' '}
                  {nergens.map((m) => MODULE_LABELS[m]).join(', ')}.{' '}
                  <span className="text-[var(--ink-3)]">
                    Dagen in deze app-delen tellen voor geen enkele stroom.
                  </span>
                </p>
              )}
              {dubbel.length > 0 && (
                <p className="text-xs text-[var(--ink-2)]">
                  <span className="font-semibold">In meer dan één stroom:</span>{' '}
                  {dubbel.map((d) => `${MODULE_LABELS[d.module]} (${d.stromen.join(', ')})`).join('; ')}.{' '}
                  <span className="text-[var(--ink-3)]">
                    Zo’n dag telt voor elk van die stromen, wat sneller een gelijke stand geeft.
                  </span>
                </p>
              )}
            </section>
          )}

          {/* Sticky opslaan-balk */}
          <div className="sticky bottom-0 z-10 mt-6 border-t border-[var(--border-ed)] bg-[var(--bg)] pt-3 pb-[calc(0.75rem_+_var(--mobile-nav-clearance,0px))]">
            {fout && (
              <p role="alert" className="mb-2 border border-[var(--negative)] px-3 py-2 text-xs text-[var(--negative)]">
                {fout}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <ModalFooter primary={{ label: 'Opslaan', onClick: bewaar, loading: opslaan, disabled: !gewijzigd }} />
              <span aria-live="polite" className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-4)]">
                {bewaard ? 'Opgeslagen' : gewijzigd ? 'Niet opgeslagen wijzigingen' : ''}
              </span>
            </div>
          </div>
        </>
      )}

      <ShellOverlay
        kind="confirm"
        destructive
        open={stroomVoorBevestiging !== null}
        onClose={() => setTeVerwijderen(null)}
        title="Stroom verwijderen?"
        footer={
          <ModalFooter
            layout="stacked"
            primary={{ label: 'Verwijderen', onClick: () => teVerwijderen !== null && verwijder(teVerwijderen) }}
            secondary={{ label: 'Annuleren', onClick: () => setTeVerwijderen(null) }}
          />
        }
      >
        <div className="space-y-2 p-6 text-sm text-[var(--ink-2)]">
          <p>
            Je verwijdert <span className="font-semibold text-[var(--ink)]">{stroomVoorBevestiging?.naam}</span>{' '}
            <span className="font-mono text-xs text-[var(--ink-4)]">({stroomVoorBevestiging?.id})</span>.
          </p>
          <p>
            Regels die op deze stroom richten matchen daarna niemand meer. Pas na Opslaan is het definitief.
          </p>
        </div>
      </ShellOverlay>

      <ShellOverlay
        kind="confirm"
        destructive
        open={terugzettenVragen}
        onClose={() => setTerugzettenVragen(false)}
        title="Standaardindeling terugzetten?"
        footer={
          <ModalFooter
            layout="stacked"
            primary={{ label: 'Terugzetten', onClick: standaard }}
            secondary={{ label: 'Annuleren', onClick: () => setTerugzettenVragen(false) }}
          />
        }
      >
        <div className="space-y-2 p-6 text-sm text-[var(--ink-2)]">
          <p>
            De stromen worden weer Vermogen, Budget, Toekomst en Fin. Eigen stromen verdwijnen, en regels die
            daarop richten matchen daarna niemand meer.
          </p>
          <p>Pas na Opslaan is het definitief.</p>
        </div>
      </ShellOverlay>
    </div>
  )
}
