'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { FireDeltaFooter, RegelOptionCard, fireFooterSleutel } from './regels/shared'
import { runRegelProjection, type RegelSimSnapshot } from '@/lib/future/regel-sim'
import type { RegelEditActionsState } from './regels/types'
import type { Box3Method } from '@/lib/bucket-projection'
import { BOX3_METHODS, BOX3_METHOD_LABELS } from '@/lib/box3-method'
import { EXCEL_HEFFINGVRIJ_INKOMEN_PP } from '@/lib/horizon-kernel/adapter/defaults'
import { PARAMETER_BANDS, bandError } from '@/lib/parameters-band'

/**
 * Uitleg per methode — beschrijft wát de kern doet (`lib/horizon-kernel/tables/bel.ts`),
 * nooit welke keuze "beter" is (Wft: inzicht, geen advies). Geëxporteerd zodat de
 * kaart-test dezelfde woorden kan toetsen als de sheet toont.
 */
export const BOX3_METHOD_UITLEG: Record<Box3Method, string> = {
  forfaitair:
    'De belasting wordt gerekend over een fictief (forfaitair) rendement op je spaargeld, ' +
    'beleggingen en schulden, boven het heffingvrije vermogen. Wat je bezittingen werkelijk ' +
    'opbrengen speelt geen rol. Zo heft Nederland Box 3 vandaag.',
  werkelijk:
    'De belasting wordt gerekend over wat je Box 3-bezittingen werkelijk opbrengen, min de ' +
    'rente op Box 3-schulden, boven een heffingvrij inkomen. Een maand met verlies telt als ' +
    'geen belasting (geen verliesverrekening). Een stelsel op werkelijk rendement is ' +
    'aangekondigd; de app kan het nu al doorrekenen.',
}

/**
 * Keuze · effect · waarom (eigenaarsnorm 13 sep 2026) — de intro boven de twee opties.
 * Effect uitgedrukt in vrijheidstijd: de heffing gaat elk jaar van het vermogen af en
 * verschuift daarmee het vrijheidsmoment.
 */
export const BOX3_METHOD_INTRO =
  'Je kiest hoe de app je Box 3-belasting in de toekomst rekent: over een fictief rendement ' +
  'of over het werkelijke rendement. Dat bepaalt hoeveel belasting er elk jaar van je vermogen ' +
  'afgaat in de tijdas-grafiek, en dus wanneer je vrij bent. Relevant omdat het verschil over ' +
  'tientallen jaren oploopt; welke methode het dichtst bij de werkelijkheid komt, hangt af van ' +
  'je vermogensmix en van de wet die dan geldt.'

/**
 * TPR-12 — uitleg bij het heffingvrij-inkomen-veld (kernel P!B91, alleen werkelijk-tak).
 * Wat de kern doet (`bel.ts` Bel!M): tarief × MAX(0, werkelijk maandrendement −
 * heffingvrij/12); met een fiscaal partner telt het bedrag twee keer (P!B92 = B91 × personen).
 */
export const HEFFINGVRIJ_INKOMEN_UITLEG =
  'Je kiest welk deel van het werkelijke rendement per jaar onbelast blijft, per persoon. ' +
  'De app trekt dit bedrag (gedeeld door twaalf) elke maand van het rendement af voordat het ' +
  'tarief erover gaat; met een fiscaal partner telt het twee keer. Een hoger bedrag verlaagt de ' +
  'jaarlijkse heffing en laat je vermogen dus sneller groeien. Relevant omdat de hoogte van dit ' +
  'bedrag in het aangekondigde stelsel nog kan wijzigen. Geldt alleen onder werkelijk rendement.'

const HEFFINGVRIJ_BAND = PARAMETER_BANDS.box3_heffingvrij_inkomen

/** Formulierwaarde → euro's of null (leeg = terug naar de kernel-default). */
function parseHeffingvrij(raw: string): number | null | 'ongeldig' {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(n) || n < HEFFINGVRIJ_BAND.min || n > HEFFINGVRIJ_BAND.max) return 'ongeldig'
  return n
}

export interface Box3MethodeBodyProps {
  /** De nu opgeslagen methode (zoals `resolveFireParams` 'm leest). */
  current: Box3Method
  /** Opgeslagen heffingvrij inkomen (euro p.p. per jaar); null = kernel-default. */
  currentHeffingvrijInkomen?: number | null
  /** Kopniveau van de titel: 'h2' in de sheet, 'h5' in de plan-review (pane h3 → scherm h4). */
  kop?: 'h2' | 'h5'
  /**
   * TPR-15 — met een snapshot draait het effect live mee (`runRegelProjection` met de
   * `parameters`-override) en publiceert de body een FIRE-delta als footer-info.
   */
  snapshot?: RegelSimSnapshot | null
  /** Host-contract (`RegelEditActionsState`): de host rendert de opslaanknop. */
  onActionsChange: (s: RegelEditActionsState) => void
  /** Opslaan zonder wijziging (formulier-submit): de host sluit. */
  onClose: () => void
  /** Na een geslaagde write via `PUT /api/parameters`. */
  onSaved: () => void
}

/**
 * Box3MethodeBody — de editor voor `profiles.box3_method` (TPR-10) en, onder werkelijk
 * rendement, `profiles.box3_heffingvrij_inkomen` (TPR-12), zonder overlay. Gerenderd door
 * `Box3MethodeSheet` (/toekomst/voorkeuren) en door de plan-review (TPR-15, laag 2).
 *
 * Spiegelt VoorkeurBewerkenBody: persist via `PUT /api/parameters` met ALLEEN de
 * gewijzigde velden in de body (de route patcht partieel en valideert enum + band met
 * zod), platte `{ error }`-envelope terug naar de UI. Geen client-direct schrijfpad naar
 * `profiles` (ADR 0058).
 */
export function Box3MethodeBody({
  current,
  currentHeffingvrijInkomen = null,
  kop = 'h2',
  snapshot = null,
  onActionsChange,
  onClose,
  onSaved,
}: Box3MethodeBodyProps) {
  const [method, setMethod] = useState<Box3Method>(current)
  const [heffingvrij, setHeffingvrij] = useState(
    currentHeffingvrijInkomen == null ? '' : String(currentHeffingvrijInkomen),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedHeffingvrij = parseHeffingvrij(heffingvrij)
  const heffingvrijValid = parsedHeffingvrij !== 'ongeldig'
  const methodChanged = method !== current
  // Het veld telt alleen onder werkelijk rendement; onder forfaitair blijft de kolom staan.
  const heffingvrijChanged =
    method === 'werkelijk' && heffingvrijValid && parsedHeffingvrij !== currentHeffingvrijInkomen
  const changed = methodChanged || heffingvrijChanged
  // Een ongeldig bedrag onder werkelijk rendement houdt "Opslaan" dicht (de tekst staat bij het veld).
  const invoerGeldig = method !== 'werkelijk' || heffingvrijValid

  // Live effect: dezelfde kern-run als de Tijdas, met alleen de Box 3-kolommen vervangen.
  const concept = useMemo(
    () => ({
      box3_method: method,
      ...(method === 'werkelijk' && heffingvrijValid ? { box3_heffingvrij_inkomen: parsedHeffingvrij } : {}),
    }),
    [method, heffingvrijValid, parsedHeffingvrij],
  )
  const deferredConcept = useDeferredValue(concept)
  // Kernel-runs pas zodra er iets gewijzigd is: zonder wijziging toont de footer geen effect.
  const baseline = useMemo(() => (snapshot && changed ? runRegelProjection(snapshot) : null), [snapshot, changed])
  const draftProj = useMemo(
    () => (snapshot && changed ? runRegelProjection(snapshot, { parameters: deferredConcept }) : null),
    [snapshot, changed, deferredConcept],
  )
  const footerSleutel = baseline && draftProj ? fireFooterSleutel(baseline, draftProj) : null

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!changed) {
      onClose()
      return
    }
    if (method === 'werkelijk' && !heffingvrijValid) {
      setError(bandError('box3_heffingvrij_inkomen'))
      return
    }
    setSaving(true)
    setError(null)
    const body: Record<string, unknown> = {}
    if (methodChanged) body.box3_method = method
    if (heffingvrijChanged) body.box3_heffingvrij_inkomen = parsedHeffingvrij
    try {
      const res = await fetch('/api/parameters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const message =
          data && typeof data.error === 'string' ? data.error : 'Opslaan mislukt. Probeer het opnieuw.'
        setError(message)
        setSaving(false)
        return
      }
      // Review M3 — de route echoot alleen wat écht is weggeschreven. Ontbreekt de kolom nog
      // (migratie niet toegepast), dan valt het bedrag in de retry weg: dat niet als "opgeslagen" melden.
      if (heffingvrijChanged) {
        const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
        if (!data || !('box3_heffingvrij_inkomen' in data)) {
          setError(
            methodChanged
              ? 'De methode is opgeslagen, maar het heffingvrije inkomen niet. Probeer het later opnieuw.'
              : 'Het heffingvrije inkomen kon niet worden opgeslagen. Probeer het later opnieuw.',
          )
          setSaving(false)
          return
        }
      }
    } catch {
      setError('Opslaan mislukt. Controleer je verbinding en probeer het opnieuw.')
      setSaving(false)
      return
    }
    setSaving(false)
    onSaved()
  }

  // Save via ref tegen stale closures (zelfde patroon als de regel-bodies).
  const saveRef = useRef(handleSubmit)
  useEffect(() => {
    saveRef.current = handleSubmit
  })

  useEffect(() => {
    onActionsChange({
      canSave: changed && !saving && invoerGeldig,
      saving,
      save: () => void saveRef.current(),
      changed,
      footerInfo: changed && baseline && draftProj ? <FireDeltaFooter baseline={baseline} draft={draftProj} /> : undefined,
    })
    // baseline/draftProj zijn useMemo-stabiel; footerSleutel bewaakt republish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onActionsChange, changed, saving, invoerGeldig, footerSleutel])

  const Kop = kop

  return (
    <form onSubmit={handleSubmit} className={kop === 'h2' ? 'p-5 sm:p-6' : ''}>
      <Kop className="font-serif text-lg text-[var(--ink)] mb-2">Box 3-methode</Kop>
      <p className="mb-4 text-[11px] text-[var(--ink-3)] italic leading-snug">{BOX3_METHOD_INTRO}</p>

      {error && (
        <div
          role="alert"
          className="mb-3 border border-[var(--border-ed)] border-l-4 border-l-[var(--negative)] bg-[var(--paper)] px-3 py-2 text-xs text-negative"
        >
          {error}
        </div>
      )}

      <div className="space-y-2" role="radiogroup" aria-label="Box 3-methode">
        {BOX3_METHODS.map((m) => (
          <RegelOptionCard
            key={m}
            active={method === m}
            title={BOX3_METHOD_LABELS[m]}
            description={BOX3_METHOD_UITLEG[m]}
            onSelect={() => setMethod(m)}
          />
        ))}
      </div>

      {/* TPR-12 — heffingvrij inkomen, alleen betekenisvol onder werkelijk rendement. */}
      {method === 'werkelijk' && (
        <label className="mt-5 block">
          <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
            Heffingvrij inkomen (per persoon, per jaar)
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--ink-3)]">€</span>
            <input
              type="number"
              inputMode="decimal"
              min={HEFFINGVRIJ_BAND.min}
              max={HEFFINGVRIJ_BAND.max}
              step={100}
              value={heffingvrij}
              onChange={(e) => setHeffingvrij(e.target.value)}
              placeholder={String(EXCEL_HEFFINGVRIJ_INKOMEN_PP)}
              aria-label="Heffingvrij inkomen in euro per persoon per jaar"
              aria-invalid={heffingvrijValid ? undefined : true}
              className="flex-1 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-[var(--ink-3)]"
            />
          </div>
          {!heffingvrijValid && (
            <p className="mt-1 text-[11px] text-negative">{bandError('box3_heffingvrij_inkomen')}</p>
          )}
          <p className="mt-1.5 text-[11px] text-[var(--ink-3)] italic leading-snug">
            {HEFFINGVRIJ_INKOMEN_UITLEG} Leeg = de standaard van het rekenmodel
            (€&nbsp;{EXCEL_HEFFINGVRIJ_INKOMEN_PP.toLocaleString('nl-NL')}).
          </p>
        </label>
      )}
    </form>
  )
}
