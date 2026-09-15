'use client'

/**
 * VerspreidingSheet — wie krijgt deze vragenlijst, en hoe dringend? (ADR 0147)
 *
 * Het beheerscherm bij `lib/questionnaires/verspreiding.ts`. Drie secties in de
 * volgorde waarin je de vragen stelt: **wie** (doelgroep), **hoe opdringerig**
 * (popup) en **wat leverde het op** (bereik, read-only).
 *
 * TARGETING IS EEN VERSPREIDINGSVOORKEUR, GEEN BEVEILIGINGSGRENS — dat staat in
 * de contract-module en geldt hier onverkort: dit scherm schrijft regels en
 * instellingen, plus de handmatig gekozen personen die de route naar
 * `questionnaire_invitations` synchroniseert. De lijstrij zelf draagt nooit
 * gebruikers-id's.
 *
 * De helptekst bij elk popup-veld volgt de eigenaarsnorm **keuze · effect ·
 * waarom**, kort gehouden: wat je kiest, wat er dan gebeurt, en waarom die
 * standaard er staat.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { GebruikerZoeker, type GekozenGebruiker } from '@/components/app/beheer/gebruiker-zoeker'
import { RegelEditor, type StroomKeuze } from '@/components/app/beheer/vragenlijsten/regel-editor'
import {
  groepOmvang,
  SOORT_LABEL,
  type GroepSamenvatting,
} from '@/components/app/beheer/gebruikersgroepen/groep-types'
import {
  DOELGROEP_MODI,
  POPUP_STANDAARD,
  STANDAARD_VERSPREIDING,
  type DoelgroepModus,
  type Regel,
  type Verspreiding,
} from '@/lib/questionnaires/verspreiding'

interface HandmatigRij extends GekozenGebruiker {
  invited_at?: string
}

interface Statistiek {
  uitgenodigd: number
  gezien: number
  uitgesteld: number
  geweigerd: number
  gestart: number
  afgerond: number
}

const LEGE_STATISTIEK: Statistiek = {
  uitgenodigd: 0,
  gezien: 0,
  uitgesteld: 0,
  geweigerd: 0,
  gestart: 0,
  afgerond: 0,
}

const MODUS_LABEL: Record<DoelgroepModus, string> = {
  iedereen: 'Iedereen',
  regels: 'Op regels',
  handmatig: 'Handmatig gekozen personen',
  groepen: 'Groepen',
}

const MODUS_UITLEG: Record<DoelgroepModus, string> = {
  iedereen: 'Iedereen ziet de lijst zodra hij actief staat.',
  regels: 'Alleen wie aan alle regels voldoet.',
  handmatig: 'Alleen de personen die je hieronder kiest.',
  groepen: 'Alleen wie in minstens één van de gekozen groepen valt.',
}

const POPUP_VELDEN = [
  {
    sleutel: 'cooldown_dagen' as const,
    label: 'Cooldown (dagen)',
    uitleg:
      'Na een getoonde popup zoveel dagen stil. Hoger = minder vaak vragen; de standaard van 14 komt uit het onderzoek naar promptmoeheid.',
    min: 1,
    max: 90,
  },
  {
    sleutel: 'snooze_dagen' as const,
    label: '"Later" = uitstel (dagen)',
    uitleg:
      'Klikt iemand op Later, dan vragen we het zoveel dagen niet. Korter = eerder terug; 7 dagen is één gebruiksweek.',
    min: 1,
    max: 30,
  },
  {
    sleutel: 'max_weigeringen' as const,
    label: 'Max. keer uitstellen',
    uitleg:
      'Zo vaak mag iemand Later kiezen; daarna blijft de popup weg. Twee keer negeren is een antwoord.',
    min: 1,
    max: 5,
  },
]

const STAT_VELDEN: Array<{ sleutel: keyof Statistiek; label: string }> = [
  { sleutel: 'uitgenodigd', label: 'Uitgenodigd' },
  { sleutel: 'gezien', label: 'Gezien' },
  { sleutel: 'uitgesteld', label: 'Uitgesteld' },
  { sleutel: 'geweigerd', label: 'Geweigerd' },
  { sleutel: 'gestart', label: 'Gestart' },
  { sleutel: 'afgerond', label: 'Afgerond' },
]

const VELD_CLASS =
  'w-24 border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 font-mono text-xs tabular-nums text-[var(--ink)] focus:border-[var(--border-md)] focus:outline-none'

const KICKER_CLASS =
  'block font-mono text-[10px] uppercase tracking-[0.20em] text-[var(--ink-3)]'

export function VerspreidingSheet({
  questionnaireId,
  titel,
  onClose,
  onSaved,
}: {
  questionnaireId: string
  titel: string
  onClose: () => void
  onSaved: () => void
}) {
  const [verspreiding, setVerspreiding] = useState<Verspreiding>(() =>
    structuredClone(STANDAARD_VERSPREIDING),
  )
  const [handmatig, setHandmatig] = useState<HandmatigRij[]>([])
  const [statistiek, setStatistiek] = useState<Statistiek>(LEGE_STATISTIEK)
  const [laden, setLaden] = useState(true)
  const [opslaan, setOpslaan] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  // Fase 2/3: de keuzes voor de regel- en groepen-editor. `null` = (nog) niet
  // geladen of mislukt — dan valt de bijbehorende keuze stil terug, zonder de
  // hoofdmelding te vervuilen.
  const [groepen, setGroepen] = useState<GroepSamenvatting[] | null>(null)
  const [groepenFout, setGroepenFout] = useState<string | null>(null)
  const [stromen, setStromen] = useState<StroomKeuze[]>([])

  useEffect(() => {
    let afgebroken = false
    fetch(`/api/admin/questionnaires/${questionnaireId}/verspreiding`)
      .then(async (res) => {
        const data: unknown = await res.json().catch(() => null)
        if (afgebroken) return
        if (!res.ok) {
          setFout((data as { error?: string } | null)?.error ?? `Laden mislukt (HTTP ${res.status})`)
          return
        }
        const body = data as {
          verspreiding?: Verspreiding
          handmatig?: HandmatigRij[]
          statistiek?: Statistiek
        } | null
        if (body?.verspreiding) setVerspreiding(body.verspreiding)
        setHandmatig(Array.isArray(body?.handmatig) ? body.handmatig : [])
        setStatistiek(body?.statistiek ?? LEGE_STATISTIEK)
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
  }, [questionnaireId])

  useEffect(() => {
    let afgebroken = false
    fetch('/api/admin/user-groups')
      .then(async (res) => {
        const data: unknown = await res.json().catch(() => null)
        if (afgebroken) return
        if (!res.ok) {
          setGroepenFout((data as { error?: string } | null)?.error ?? `Groepen laden mislukt (HTTP ${res.status})`)
          return
        }
        const lijst = (data as { groepen?: GroepSamenvatting[] } | null)?.groepen
        setGroepen(Array.isArray(lijst) ? lijst : [])
      })
      .catch(() => {
        if (!afgebroken) setGroepenFout('Groepen laden mislukt — controleer je verbinding.')
      })

    fetch('/api/admin/waardestromen')
      .then(async (res) => {
        if (!res.ok || afgebroken) return
        const data = (await res.json().catch(() => null)) as {
          waardestromen?: { stromen?: StroomKeuze[] }
        } | null
        const lijst = data?.waardestromen?.stromen
        if (!afgebroken && Array.isArray(lijst)) setStromen(lijst.map((st) => ({ id: st.id, naam: st.naam })))
      })
      .catch(() => {
        /* zonder stromen is de stroomregel niet te kiezen — geen melding nodig */
      })
    return () => {
      afgebroken = true
    }
  }, [])

  const zetModus = (modus: DoelgroepModus) => {
    setVerspreiding((v) => ({ ...v, doelgroep: { ...v.doelgroep, modus } }))
  }

  const zetRegels = (regels: Regel[]) => {
    setVerspreiding((v) => ({ ...v, doelgroep: { ...v.doelgroep, regels } }))
  }

  const zetGroep = (id: string, aan: boolean) => {
    setVerspreiding((v) => {
      const huidig = v.doelgroep.groep_ids
      const groep_ids = aan ? (huidig.includes(id) ? huidig : [...huidig, id]) : huidig.filter((g) => g !== id)
      return { ...v, doelgroep: { ...v.doelgroep, groep_ids } }
    })
  }

  const zetPopup = <K extends keyof Verspreiding['popup']>(
    sleutel: K,
    waarde: Verspreiding['popup'][K],
  ) => {
    setVerspreiding((v) => ({ ...v, popup: { ...v.popup, [sleutel]: waarde } }))
  }

  const bewaar = async () => {
    const { doelgroep } = verspreiding
    // Een groep die intussen verwijderd is, zou de route met 400 laten afketsen;
    // alleen weglaten als de lijst écht geladen is.
    const groep_ids =
      groepen === null
        ? doelgroep.groep_ids
        : doelgroep.groep_ids.filter((id) => groepen.some((g) => g.id === id))
    if (doelgroep.modus === 'regels' && doelgroep.regels.length === 0) {
      setFout('Voeg minstens één regel toe — zonder regel ziet niemand de lijst.')
      return
    }
    if (doelgroep.modus === 'regels' && doelgroep.regels.some((r) => r.soort === 'dominante_stroom' && !r.stroom)) {
      setFout('Kies bij de regel ‘dominante waardestroom’ een stroom.')
      return
    }
    if (doelgroep.modus === 'groepen' && groep_ids.length === 0) {
      setFout('Kies minstens één groep — zonder groep ziet niemand de lijst.')
      return
    }
    setOpslaan(true)
    setFout(null)
    try {
      const res = await fetch(`/api/admin/questionnaires/${questionnaireId}/verspreiding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doelgroep: { ...doelgroep, groep_ids },
          popup: verspreiding.popup,
          handmatig: handmatig.map((r) => ({
            user_id: r.user_id,
            ...(r.email ? { email: r.email } : {}),
          })),
        }),
      })
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null)
        setFout((data as { error?: string } | null)?.error ?? `Opslaan mislukt (HTTP ${res.status})`)
        return
      }
      onSaved()
    } catch {
      setFout('Opslaan mislukt — controleer je verbinding.')
    } finally {
      setOpslaan(false)
    }
  }

  const modus = verspreiding.doelgroep.modus
  const regels = verspreiding.doelgroep.regels

  return (
    <ShellOverlay
      kind="sheet"
      size="lg"
      open
      onClose={onClose}
      title="Verspreiding"
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
          <p className="font-serif text-sm text-[var(--ink-3)]">
            Wie krijgt <span className="text-[var(--ink)]">{titel}</span> te zien, en hoe nadrukkelijk
            bieden we hem aan?
          </p>

          {fout && (
            <p role="alert" className="border border-[var(--negative)] px-3 py-2 text-xs text-[var(--negative)]">
              {fout}
            </p>
          )}

          {/* ── 1. Doelgroep ─────────────────────────────────────────────── */}
          <section aria-label="Doelgroep" className="space-y-3">
            <span className={KICKER_CLASS}>Doelgroep</span>

            <div className="space-y-2">
              {DOELGROEP_MODI.map((m) => (
                <label key={m} className="flex items-start gap-2 text-sm text-[var(--ink)]">
                  <input
                    type="radio"
                    name="doelgroep-modus"
                    value={m}
                    checked={modus === m}
                    onChange={() => zetModus(m)}
                    className="mt-0.5 h-4 w-4 accent-[var(--color-kern-500)]"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{MODUS_LABEL[m]}</span>
                    <span className="block text-xs text-[var(--ink-3)]">{MODUS_UITLEG[m]}</span>
                  </span>
                </label>
              ))}
            </div>

            {modus === 'regels' && (
              <div className="border-l-2 border-[var(--border-ed)] pl-3">
                <RegelEditor
                  regels={regels}
                  onChange={zetRegels}
                  stromen={stromen}
                  legeTekst="Nog geen regels — zonder regel ziet niemand de lijst."
                />
              </div>
            )}

            {modus === 'handmatig' && (
              <div className="border-l-2 border-[var(--border-ed)] pl-3">
                <GebruikerZoeker gekozen={handmatig} onChange={setHandmatig} />
              </div>
            )}

            {modus === 'groepen' && (
              <div className="space-y-2 border-l-2 border-[var(--border-ed)] pl-3">
                {groepenFout ? (
                  <p className="text-xs text-[var(--negative)]">{groepenFout}</p>
                ) : groepen === null ? (
                  <div className="h-16 animate-pulse bg-[var(--subtle)]" />
                ) : groepen.length === 0 ? (
                  <p className="text-xs text-[var(--ink-3)]">
                    Er zijn nog geen gebruikersgroepen.{' '}
                    <Link
                      href="/beheer/gebruikersgroepen"
                      className="text-[var(--ink-2)] underline underline-offset-2 hover:text-[var(--ink)]"
                    >
                      Maak eerst een groep aan
                    </Link>
                    .
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-[var(--ink-3)]">
                      Kies minstens één groep. Wie in een van de gekozen groepen valt, krijgt de lijst (of).
                    </p>
                    <ul className="space-y-1">
                      {groepen.map((g) => (
                        <li key={g.id}>
                          <label className="flex items-start gap-2 border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)]">
                            <input
                              type="checkbox"
                              checked={verspreiding.doelgroep.groep_ids.includes(g.id)}
                              onChange={(e) => zetGroep(g.id, e.target.checked)}
                              className="mt-0.5 h-4 w-4 accent-[var(--color-kern-500)]"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{g.naam}</span>
                              <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
                                {SOORT_LABEL[g.soort]} · <span className="tabular-nums">{groepOmvang(g)}</span>
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </section>

          {/* ── 2. Popup ─────────────────────────────────────────────────── */}
          <section aria-label="Popup" className="space-y-3">
            <span className={KICKER_CLASS}>Popup</span>

            <label className="flex items-start gap-2 text-sm text-[var(--ink)]">
              <input
                type="checkbox"
                checked={verspreiding.popup.aan}
                onChange={(e) => zetPopup('aan', e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--color-kern-500)]"
              />
              <span className="min-w-0">
                <span className="block font-medium">Toon een popup bij eerstvolgend gebruik</span>
                <span className="block text-xs text-[var(--ink-3)]">
                  Uit = de lijst staat alleen in Fins chat. Aan = hij vraagt er één keer actief om.
                </span>
              </span>
            </label>

            {verspreiding.popup.aan && (
              <div className="space-y-3 border-l-2 border-[var(--border-ed)] pl-3">
                {POPUP_VELDEN.map((veld) => (
                  <div key={veld.sleutel} className="space-y-1">
                    <label className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-2)]">
                      <span className="min-w-[10rem]">{veld.label}</span>
                      <input
                        type="number"
                        value={verspreiding.popup[veld.sleutel]}
                        min={veld.min}
                        max={veld.max}
                        onChange={(e) => zetPopup(veld.sleutel, Number(e.target.value))}
                        className={VELD_CLASS}
                      />
                      <span className="font-mono text-[10px] text-[var(--ink-4)]">
                        standaard {POPUP_STANDAARD[veld.sleutel]}
                      </span>
                    </label>
                    <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">{veld.uitleg}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── 3. Bereik (read-only) ────────────────────────────────────── */}
          <section aria-label="Bereik" className="space-y-3">
            <span className={KICKER_CLASS}>Bereik</span>
            <div className="grid grid-cols-3 border-t border-b border-[var(--ink)] sm:grid-cols-6">
              {STAT_VELDEN.map((veld, i) => (
                <div
                  key={veld.sleutel}
                  className={`border-r border-[var(--rule-soft)] p-3 last:border-r-0 ${i < 3 ? 'border-b sm:border-b-0' : ''}`}
                >
                  <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
                    {veld.label}
                  </span>
                  <span className="block font-mono text-lg leading-none tabular-nums text-[var(--ink)]">
                    {statistiek[veld.sleutel]}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </ShellOverlay>
  )
}
