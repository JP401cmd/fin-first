'use client'

/**
 * GebruikersgroepenBeheer — herbruikbare doelgroepen voor vragenlijsten
 * (ADR 0147, fase 3). Lijst + aanmaken/bewerken (GroepSheet) + verwijderen.
 *
 * Een groep is een verspreidingsvoorkeur, geen beveiligingsgrens: hij bepaalt
 * wie een vragenlijst aangeboden krijgt. De lidmaatschappen van statische
 * groepen schrijft de route met de service-role; dit scherm leest alleen
 * tellingen en, in de sheet, de e-mailadressen die beheer er zelf in zette.
 */

import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { GroepSheet } from './groep-sheet'
import { foutUit, groepOmvang, SOORT_LABEL, type GroepSamenvatting } from './groep-types'

export function GebruikersgroepenBeheer() {
  const [groepen, setGroepen] = useState<GroepSamenvatting[]>([])
  const [laden, setLaden] = useState(true)
  const [laadFout, setLaadFout] = useState<string | null>(null)
  /** `undefined` = dicht, `null` = nieuwe groep, string = bewerken. */
  const [sheetVoor, setSheetVoor] = useState<string | null | undefined>(undefined)
  const [teVerwijderen, setTeVerwijderen] = useState<GroepSamenvatting | null>(null)
  const [verwijderen, setVerwijderen] = useState(false)
  const [verwijderFout, setVerwijderFout] = useState<string | null>(null)

  const laadLijst = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/user-groups')
      if (!res.ok) {
        setLaadFout(await foutUit(res, 'Laden'))
        return
      }
      const data = (await res.json().catch(() => null)) as { groepen?: GroepSamenvatting[] } | null
      setGroepen(Array.isArray(data?.groepen) ? data.groepen : [])
      setLaadFout(null)
    } catch {
      setLaadFout('Laden mislukt — controleer je verbinding.')
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => {
    void laadLijst()
  }, [laadLijst])

  const bevestigVerwijderen = async () => {
    if (!teVerwijderen) return
    setVerwijderen(true)
    setVerwijderFout(null)
    try {
      const res = await fetch(`/api/admin/user-groups/${teVerwijderen.id}`, { method: 'DELETE' })
      if (!res.ok) {
        setVerwijderFout(await foutUit(res, 'Verwijderen'))
        return
      }
      setTeVerwijderen(null)
      void laadLijst()
    } catch {
      setVerwijderFout('Verwijderen mislukt — controleer je verbinding.')
    } finally {
      setVerwijderen(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-[var(--ink)]">Gebruikersgroepen</h2>
        <button
          type="button"
          onClick={() => setSheetVoor(null)}
          className="inline-flex items-center gap-1.5 border border-[var(--border-md)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Nieuwe groep
        </button>
      </div>
      <p className="mt-2 max-w-2xl font-serif text-sm leading-relaxed text-[var(--ink-3)]">
        Vaste of regelgebaseerde doelgroepen. Kies ze bij een vragenlijst onder Verspreiding → Groepen; wie in
        minstens één gekozen groep valt, krijgt de lijst.
      </p>

      {laden ? (
        <div className="mt-6 space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse border border-[var(--border-ed)] bg-[var(--subtle)]" />
          ))}
        </div>
      ) : laadFout ? (
        <p role="alert" className="mt-6 border border-[var(--negative)] px-3 py-2 text-sm text-[var(--negative)]">
          {laadFout}
        </p>
      ) : groepen.length === 0 ? (
        <div className="mt-6 border border-dashed border-[var(--border-ed)] px-4 py-8 text-center">
          <p className="font-serif text-sm text-[var(--ink-2)]">Nog geen gebruikersgroepen.</p>
          <p className="mt-1 text-xs text-[var(--ink-4)]">
            Maak een statische groep voor een vaste lijst mensen, of een dynamische op regels.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {groepen.map((g) => (
            <li
              key={g.id}
              className="flex items-center gap-3 border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">{g.naam}</p>
                  <span className="bg-[var(--subtle)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                    {SOORT_LABEL[g.soort]}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-[var(--ink-4)]">{groepOmvang(g)}</span>
                </div>
                {g.omschrijving && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-[var(--ink-3)]">{g.omschrijving}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSheetVoor(g.id)}
                aria-label={`${g.naam} bewerken`}
                className="p-1 text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setVerwijderFout(null)
                  setTeVerwijderen(g)
                }}
                aria-label={`${g.naam} verwijderen`}
                className="p-1 text-[var(--ink-3)] transition-colors hover:text-[var(--negative)]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {sheetVoor !== undefined && (
        <GroepSheet
          groepId={sheetVoor}
          // Ook bij Annuleren verversen: na een half gelukte opslag (groep wel,
          // leden niet) staat de nieuwe groep al in de database, en zonder
          // verversen maak je 'm per ongeluk nog een keer aan.
          onClose={() => {
            setSheetVoor(undefined)
            void laadLijst()
          }}
          onSaved={() => {
            setSheetVoor(undefined)
            void laadLijst()
          }}
        />
      )}

      <ShellOverlay
        kind="confirm"
        destructive
        open={teVerwijderen !== null}
        onClose={() => setTeVerwijderen(null)}
        title="Groep verwijderen?"
        footer={
          <ModalFooter
            layout="stacked"
            primary={{ label: 'Verwijderen', onClick: bevestigVerwijderen, loading: verwijderen }}
            secondary={{ label: 'Annuleren', onClick: () => setTeVerwijderen(null) }}
          />
        }
      >
        <div className="space-y-2 p-6 text-sm text-[var(--ink-2)]">
          {verwijderFout && (
            <p role="alert" className="border border-[var(--negative)] px-3 py-2 text-xs text-[var(--negative)]">
              {verwijderFout}
            </p>
          )}
          <p>
            Je verwijdert <span className="font-semibold text-[var(--ink)]">{teVerwijderen?.naam}</span>.
          </p>
          <p>Vragenlijsten die deze groep gebruiken bereiken deze mensen daarna niet meer.</p>
        </div>
      </ShellOverlay>
    </div>
  )
}
