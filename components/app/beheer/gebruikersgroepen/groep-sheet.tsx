'use client'

/**
 * GroepSheet — een gebruikersgroep aanmaken of bewerken (ADR 0147, fase 3).
 *
 * Twee soorten, met een bewust verschillende betekenis:
 *  - **statisch**: een vaste ledenlijst die beheer samenstelt. Blijft zoals je
 *    hem maakt (interviewwerving, een beta-cohort).
 *  - **dynamisch**: een regelset (én), telkens opnieuw bekeken bij het lezen —
 *    geen ledenlijst, dus altijd actueel.
 *
 * De soort ligt vast na het aanmaken (de route weigert een wissel): een
 * ledenlijst en een regelset zijn geen twee standen van hetzelfde ding.
 *
 * Opslaan = eerst de groep (POST of PUT), daarna — alleen statisch — de volledige
 * ledenlijst. Lukt de groep wel en de leden niet, dan blijft de sheet open in
 * bewerkmodus, zodat nogmaals opslaan alleen de leden opnieuw probeert.
 */

import { useEffect, useState } from 'react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { GebruikerZoeker, type GekozenGebruiker } from '@/components/app/beheer/gebruiker-zoeker'
import { RegelEditor, type StroomKeuze } from '@/components/app/beheer/vragenlijsten/regel-editor'
import {
  GROEP_NAAM_MAX,
  GROEP_OMSCHRIJVING_MAX,
  GROEP_SOORTEN,
  type GroepSoort,
} from '@/lib/gebruikersgroepen'
import type { Regel } from '@/lib/questionnaires/verspreiding'
import { foutUit, SOORT_LABEL, type GroepSamenvatting } from './groep-types'

const KICKER_CLASS = 'block font-mono text-[10px] uppercase tracking-[0.20em] text-[var(--ink-3)]'

/** Keuze · effect · waarom, per soort. */
const SOORT_UITLEG: Record<GroepSoort, string> = {
  statisch:
    'Een vaste lijst mensen die je zelf kiest. Hij blijft zoals je hem maakt: wie je toevoegt zit erin, tot je hem weghaalt. Handig voor interviewwerving of een beta-cohort.',
  dynamisch:
    'Regels in plaats van namen. Bij elk bezoek bekijken we opnieuw wie eraan voldoet, dus de groep is altijd actueel en je hoeft niemand bij te houden.',
}

export function GroepSheet({
  groepId: initieelId,
  onClose,
  onSaved,
}: {
  /** `null` = nieuwe groep. */
  groepId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [groepId, setGroepId] = useState<string | null>(initieelId)
  const [naam, setNaam] = useState('')
  const [omschrijving, setOmschrijving] = useState('')
  const [soort, setSoort] = useState<GroepSoort>('statisch')
  const [regels, setRegels] = useState<Regel[]>([])
  const [leden, setLeden] = useState<GekozenGebruiker[]>([])
  const [stromen, setStromen] = useState<StroomKeuze[]>([])
  const [laden, setLaden] = useState(initieelId !== null)
  const [opslaan, setOpslaan] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const bewerken = groepId !== null

  useEffect(() => {
    if (initieelId === null) return
    let afgebroken = false
    fetch(`/api/admin/user-groups/${initieelId}`)
      .then(async (res) => {
        if (!res.ok) {
          const melding = await foutUit(res, 'Laden')
          if (!afgebroken) setFout(melding)
          return
        }
        const data = (await res.json().catch(() => null)) as {
          groep?: GroepSamenvatting
          leden?: Array<{ user_id: string; email: string | null }>
        } | null
        if (afgebroken || !data?.groep) return
        setNaam(data.groep.naam)
        setOmschrijving(data.groep.omschrijving ?? '')
        setSoort(data.groep.soort)
        setRegels(data.groep.regels ?? [])
        setLeden((data.leden ?? []).map((l) => ({ user_id: l.user_id, email: l.email })))
      })
      .catch(() => {
        if (!afgebroken) setFout('Laden mislukt — controleer je verbinding.')
      })
      .finally(() => {
        if (!afgebroken) setLaden(false)
      })
    return () => {
      afgebroken = true
    }
  }, [initieelId])

  useEffect(() => {
    let afgebroken = false
    fetch('/api/admin/waardestromen')
      .then(async (res) => {
        if (!res.ok || afgebroken) return
        const data = (await res.json().catch(() => null)) as {
          waardestromen?: { stromen?: StroomKeuze[] }
        } | null
        const lijst = data?.waardestromen?.stromen
        if (!afgebroken && Array.isArray(lijst)) setStromen(lijst.map((s) => ({ id: s.id, naam: s.naam })))
      })
      .catch(() => {
        /* zonder stromen is de stroomregel niet te kiezen */
      })
    return () => {
      afgebroken = true
    }
  }, [])

  const bewaar = async () => {
    const schoneNaam = naam.trim()
    if (!schoneNaam) {
      setFout('Geef de groep een naam.')
      return
    }
    if (soort === 'dynamisch' && regels.length === 0) {
      setFout('Een dynamische groep heeft minstens één regel.')
      return
    }
    if (regels.some((r) => r.soort === 'dominante_stroom' && !r.stroom)) {
      setFout('Kies bij de regel ‘dominante waardestroom’ een stroom.')
      return
    }

    setOpslaan(true)
    setFout(null)
    try {
      let id = groepId
      const invoer = {
        naam: schoneNaam,
        omschrijving: omschrijving.trim() || null,
        soort,
        regels: soort === 'dynamisch' ? regels : [],
      }
      const res = await fetch(id ? `/api/admin/user-groups/${id}` : '/api/admin/user-groups', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoer),
      })
      if (!res.ok) {
        setFout(await foutUit(res, 'Opslaan'))
        return
      }
      if (!id) {
        const data = (await res.json().catch(() => null)) as { groep?: { id?: string } } | null
        id = data?.groep?.id ?? null
        if (!id) {
          setFout('Opslaan mislukt — de server gaf geen groep terug.')
          return
        }
        setGroepId(id)
      }

      if (soort === 'statisch') {
        const ledenRes = await fetch(`/api/admin/user-groups/${id}/leden`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_ids: leden.map((l) => l.user_id) }),
        })
        if (!ledenRes.ok) {
          setFout(`De groep is bewaard, de leden nog niet: ${await foutUit(ledenRes, 'Leden opslaan')}`)
          return
        }
      }
      onSaved()
    } catch {
      setFout('Opslaan mislukt — controleer je verbinding.')
    } finally {
      setOpslaan(false)
    }
  }

  return (
    <ShellOverlay
      kind="sheet"
      size="lg"
      open
      onClose={onClose}
      title={bewerken ? 'Groep bewerken' : 'Nieuwe groep'}
      footer={
        <ModalFooter
          primary={{ label: 'Opslaan', onClick: bewaar, loading: opslaan, disabled: laden }}
          secondary={{ label: 'Annuleren', onClick: onClose }}
        />
      }
    >
      {laden ? (
        <div className="p-6">
          <div className="h-40 animate-pulse bg-[var(--subtle)]" />
        </div>
      ) : (
        <div className="space-y-8 p-6">
          {fout && (
            <p role="alert" className="border border-[var(--negative)] px-3 py-2 text-xs text-[var(--negative)]">
              {fout}
            </p>
          )}

          <div className="space-y-3">
            <label className="block">
              <span className="sr-only">Naam van de groep</span>
              <input
                type="text"
                value={naam}
                maxLength={GROEP_NAAM_MAX}
                onChange={(e) => setNaam(e.target.value)}
                placeholder="Naam van de groep"
                className="w-full border-b border-[var(--border-ed)] bg-transparent pb-2 font-display text-lg font-semibold text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-[var(--border-md)] focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="sr-only">Omschrijving</span>
              <textarea
                value={omschrijving}
                maxLength={GROEP_OMSCHRIJVING_MAX}
                onChange={(e) => setOmschrijving(e.target.value)}
                placeholder="Optionele omschrijving — alleen voor beheer zichtbaar"
                rows={2}
                className="w-full resize-none border-b border-[var(--border-ed)] bg-transparent pb-2 font-serif text-sm text-[var(--ink-2)] placeholder:text-[var(--ink-4)] focus:border-[var(--border-md)] focus:outline-none"
              />
            </label>
          </div>

          <section aria-label="Soort" className="space-y-3">
            <span className={KICKER_CLASS}>Soort</span>
            <div className="space-y-2">
              {GROEP_SOORTEN.map((s) => (
                <label
                  key={s}
                  className={`flex items-start gap-2 text-sm ${bewerken && soort !== s ? 'text-[var(--ink-4)]' : 'text-[var(--ink)]'}`}
                >
                  <input
                    type="radio"
                    name="groep-soort"
                    value={s}
                    checked={soort === s}
                    disabled={bewerken}
                    onChange={() => setSoort(s)}
                    className="mt-0.5 h-4 w-4 accent-[var(--color-kern-500)]"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{SOORT_LABEL[s]}</span>
                    <span className="block text-xs leading-relaxed text-[var(--ink-3)]">{SOORT_UITLEG[s]}</span>
                  </span>
                </label>
              ))}
            </div>
            {bewerken && (
              <p className="text-[11px] leading-relaxed text-[var(--ink-4)]">
                De soort ligt vast na het aanmaken: een ledenlijst en een regelset zijn verschillende dingen. Wil je
                wisselen, maak dan een nieuwe groep.
              </p>
            )}
          </section>

          {soort === 'dynamisch' ? (
            <section aria-label="Regels" className="space-y-3">
              <span className={KICKER_CLASS}>Regels</span>
              <RegelEditor
                regels={regels}
                onChange={setRegels}
                stromen={stromen}
                legeTekst="Nog geen regels — een dynamische groep heeft er minstens één nodig."
              />
            </section>
          ) : (
            <section aria-label="Leden" className="space-y-3">
              <span className={KICKER_CLASS}>Leden</span>
              <GebruikerZoeker gekozen={leden} onChange={setLeden} eenheid={{ een: 'lid', meer: 'leden' }} />
            </section>
          )}
        </div>
      )}
    </ShellOverlay>
  )
}
