'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, Check, ClipboardList, GripVertical, Loader2, Send } from 'lucide-react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'
import { FinDots } from '@/components/app/fin-dots'
import {
  ANDERS_LABEL,
  antwoordAlsTekst,
  JA,
  keuzesUitOpslag,
  NEE,
  OPEN_ANTWOORD_MAX,
  optiesVan,
  schaalBereik,
  type AntwoordInvoer as AntwoordInvoerData,
  type OpgeslagenAntwoord,
  type VraagDefinitie,
} from '@/lib/questionnaires/antwoord'
import type { ActieveVragenlijst } from './use-actieve-vragenlijsten'

/**
 * Vragenlijstmodus van het chatvenster: Fin stelt de vragen van een actieve
 * vragenlijst één voor één, jij antwoordt eronder. Elk antwoord gaat meteen
 * naar de server (per vraag), dus wie halverwege stopt gaat de volgende keer
 * verder bij de eerste open vraag.
 *
 * Bewust een eigen modus naast melden en de gids, en net als die twee BUITEN
 * de AI-gates: er draait hier geen model. Fin is de gespreksvorm, niet de
 * bron — de vragen komen letterlijk uit /beheer/vragenlijsten.
 */

interface Vraag extends VraagDefinitie {
  sort_order: number
}

interface AntwoordRij extends OpgeslagenAntwoord {
  question_id: string
}

interface SessieDetail {
  questionnaire: { id: string; title: string; description: string | null }
  questions: Vraag[]
  session: { id: string; answers: AntwoordRij[] } | null
}

interface VragenlijstViewProps {
  lijsten: ActieveVragenlijst[]
  onClose: () => void
  /** Na afronden: laat de container de lijst (en daarmee het icoon) verversen. */
  onVeranderd: () => void
  /**
   * Meteen ÉÉN specifieke lijst openen (ADR 0147): wie op "Nu invullen" in de
   * uitnodigings-popup klikt heeft zijn keuze al gemaakt en hoort niet alsnog
   * in een keuzescherm te landen. Staat de id niet (meer) in `lijsten` — lijst
   * ingetrokken, al afgerond — dan valt de view terug op het normale gedrag.
   */
  initieelId?: string | null
}

async function leesFout(res: Response, standaard: string): Promise<string> {
  const data: unknown = await res.json().catch(() => null)
  return data && typeof (data as { error?: unknown }).error === 'string'
    ? (data as { error: string }).error
    : standaard
}

export function VragenlijstView({ lijsten, onClose, onVeranderd, initieelId = null }: VragenlijstViewProps) {
  // Staat er precies één lijst open, dan meteen beginnen: een keuzescherm met
  // één optie is een extra tik zonder keuze. Een via de popup aangewezen lijst
  // (`initieelId`) gaat daar nog vóór — mits hij er nog is.
  const [gekozenId, setGekozenId] = useState<string | null>(() => {
    if (initieelId && lijsten.some((l) => l.id === initieelId)) return initieelId
    return lijsten.length === 1 && !lijsten[0].has_completed ? lijsten[0].id : null
  })

  return gekozenId ? (
    <Invullen
      key={gekozenId}
      questionnaireId={gekozenId}
      onTerug={lijsten.length > 1 ? () => { setGekozenId(null); onVeranderd() } : null}
      onClose={onClose}
      onVeranderd={onVeranderd}
    />
  ) : (
    <Keuze lijsten={lijsten} onKies={setGekozenId} onClose={onClose} />
  )
}

// ── Keuze uit de actieve lijsten ─────────────────────────────────────────────

function Keuze({ lijsten, onKies, onClose }: {
  lijsten: ActieveVragenlijst[]
  onKies: (id: string) => void
  onClose: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="vragenlijst-keuze">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <FinBubbel>
          {lijsten.length === 0
            ? 'Er staat op dit moment geen vragenlijst voor je klaar.'
            : 'We horen graag wat je van de app vindt. Kies een vragenlijst en ik stel de vragen één voor één. Dit is geen gesprek met de AI: je antwoorden gaan rechtstreeks naar het TriFinity-team. Elk antwoord wordt meteen bewaard, dus je kunt altijd stoppen en later verdergaan.'}
        </FinBubbel>

        <ul className="mt-4 space-y-2">
          {lijsten.map((l) => {
            // Deels ingevuld = een open sessie met minstens één antwoord. Een open
            // sessie zonder antwoorden (alleen geopend) is voor de invuller nog "nieuw".
            const deels = l.has_open_session && l.answered_count > 0
            const beantwoord = Math.min(l.answered_count, l.question_count)
            const status = deels
              ? `${beantwoord} van ${l.question_count} beantwoord · verder waar je was`
              : l.has_completed
                ? 'Ingevuld — je kunt opnieuw beginnen'
                : `${l.question_count} ${l.question_count === 1 ? 'vraag' : 'vragen'}`
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => onKies(l.id)}
                  className="flex w-full items-start gap-3 border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-3 text-left transition-colors hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fin-500"
                >
                  <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-fin-700" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[var(--ink)]">{l.title}</span>
                    {l.description && (
                      <span className="mt-0.5 block text-xs leading-relaxed text-[var(--ink-3)]">{l.description}</span>
                    )}
                    {deels && (
                      <span
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={l.question_count}
                        aria-valuenow={beantwoord}
                        aria-label={`${beantwoord} van ${l.question_count} vragen beantwoord`}
                        className="mt-2 block h-1 w-full bg-[var(--subtle)]"
                      >
                        <span
                          className="block h-full bg-fin-500"
                          style={{ width: `${l.question_count > 0 ? (beantwoord / l.question_count) * 100 : 0}%` }}
                        />
                      </span>
                    )}
                    <span className={`mt-1 block font-mono text-[10px] uppercase tracking-[0.08em] ${deels ? 'text-fin-700' : 'text-[var(--ink-4)]'}`}>
                      {status}
                    </span>
                  </span>
                  {l.has_completed && !l.has_open_session && (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-4)]" aria-hidden="true" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      <Voet>
        <TerugNaarChat onClose={onClose} />
      </Voet>
    </div>
  )
}

// ── Invullen: het gesprek ────────────────────────────────────────────────────

type Fase = 'laden' | 'vragen' | 'afronden' | 'klaar' | 'fout'

function Invullen({ questionnaireId, onTerug, onClose, onVeranderd }: {
  questionnaireId: string
  onTerug: (() => void) | null
  onClose: () => void
  onVeranderd: () => void
}) {
  const [fase, setFase] = useState<Fase>('laden')
  const [laadFout, setLaadFout] = useState<string | null>(null)
  const [titel, setTitel] = useState('')
  const [vragen, setVragen] = useState<Vraag[]>([])
  const [sessieId, setSessieId] = useState<string | null>(null)
  const [antwoorden, setAntwoorden] = useState<Record<string, OpgeslagenAntwoord>>({})
  // Overgeslagen niet-verplichte vragen. Alleen lokaal: overslaan bewaart niets.
  const [overgeslagen, setOvergeslagen] = useState<Set<string>>(new Set())
  const [wijzigId, setWijzigId] = useState<string | null>(null)
  // Hoeveel vragen waren al beantwoord toen je deze lijst opende? > 0 = hervat.
  const [alBeantwoordBijOpenen, setAlBeantwoordBijOpenen] = useState(0)
  // Iets beantwoord of overgeslagen in déze sessie? Dan is "welkom terug" voorbij.
  const [verderGegaan, setVerderGegaan] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  // Via een ref, zodat het laad-effect niet opnieuw draait als de container
  // een nieuwe callback meegeeft.
  const onVeranderdRef = useRef(onVeranderd)
  useEffect(() => {
    onVeranderdRef.current = onVeranderd
  }, [onVeranderd])

  // Laden: vragenlijst + open sessie; is er geen sessie, dan maken we er één.
  useEffect(() => {
    let afgebroken = false
    async function laad() {
      try {
        const res = await fetch(`/api/questionnaires/${questionnaireId}/session`)
        if (!res.ok) throw new Error(await leesFout(res, 'De vragenlijst kon niet geladen worden.'))
        const detail = (await res.json()) as SessieDetail
        // Afgebroken vóór de POST stoppen: anders maakt een dubbel gedraaid
        // effect (StrictMode, snel openen-sluiten) twee open sessies aan.
        if (afgebroken) return

        let sessie = detail.session
        if (!sessie) {
          const maak = await fetch(`/api/questionnaires/${questionnaireId}/session`, { method: 'POST' })
          if (!maak.ok) throw new Error(await leesFout(maak, 'De vragenlijst kon niet gestart worden.'))
          sessie = ((await maak.json()) as { session: SessieDetail['session'] }).session
        }
        if (afgebroken || !sessie) return
        if (detail.questions.length === 0) {
          setLaadFout('Deze vragenlijst heeft (nog) geen vragen.')
          setFase('fout')
          onVeranderdRef.current()
          return
        }

        setTitel(detail.questionnaire.title)
        setVragen(detail.questions)
        setSessieId(sessie.id)
        const vraagIds = new Set(detail.questions.map((q) => q.id))
        setAlBeantwoordBijOpenen(sessie.answers.filter((a) => vraagIds.has(a.question_id)).length)
        setAntwoorden(
          Object.fromEntries(
            sessie.answers.map((a) => [
              a.question_id,
              { answer_text: a.answer_text, answer_scale: a.answer_scale, answer_choice: a.answer_choice },
            ]),
          ),
        )
        setFase('vragen')
      } catch (err) {
        if (afgebroken) return
        setLaadFout(err instanceof Error ? err.message : 'De vragenlijst kon niet geladen worden.')
        setFase('fout')
      }
    }
    void laad()
    return () => {
      afgebroken = true
    }
  }, [questionnaireId])

  // De vraag die nu aan de beurt is: de vraag die je wijzigt, anders de eerste
  // die nog geen antwoord heeft en niet is overgeslagen.
  const huidige = useMemo(() => {
    if (wijzigId) return vragen.find((v) => v.id === wijzigId) ?? null
    return vragen.find((v) => !antwoorden[v.id] && !overgeslagen.has(v.id)) ?? null
  }, [vragen, antwoorden, overgeslagen, wijzigId])

  const huidigeIndex = huidige ? vragen.findIndex((v) => v.id === huidige.id) : vragen.length
  // Het gesprek tot nu toe: alle vragen vóór de huidige (bij wijzigen: alles
  // wat al beantwoord was, zodat de context niet wegvalt).
  const verloop = wijzigId
    ? vragen.filter((v) => v.id !== wijzigId && (antwoorden[v.id] || overgeslagen.has(v.id)))
    : vragen.slice(0, huidigeIndex)

  const afronden = useCallback(async () => {
    if (!sessieId) return
    setFase('afronden')
    setFout(null)
    try {
      const res = await fetch(`/api/questionnaires/${questionnaireId}/respond`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessieId }),
      })
      if (!res.ok) {
        setFout(await leesFout(res, 'Afronden is niet gelukt. Probeer het zo nog een keer.'))
        setFase('vragen')
        return
      }
      setFase('klaar')
      onVeranderd()
    } catch {
      setFout('Afronden is niet gelukt. Controleer je verbinding en probeer het opnieuw.')
      setFase('vragen')
    }
  }, [questionnaireId, sessieId, onVeranderd])

  // Geen vraag meer aan de beurt → automatisch afronden. Eén keer per
  // doorloop: bij een fout blijft de fase op 'vragen' met een knop om opnieuw
  // te proberen, niet een lus van PATCH-verzoeken.
  const autoAfgerondRef = useRef(false)
  useEffect(() => {
    // Staat er weer een vraag open (bv. gewijzigd na een mislukte afronding),
    // dan hoort de volgende keer dat alles beantwoord is wéér een poging.
    if (huidige) autoAfgerondRef.current = false
    if (fase !== 'vragen' || huidige || vragen.length === 0 || autoAfgerondRef.current) return
    autoAfgerondRef.current = true
    void afronden()
  }, [fase, huidige, vragen.length, afronden])

  useEffect(() => {
    const el = scrollRef.current
    if (el && typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight })
  }, [huidige, fase, antwoorden])

  const verstuur = useCallback(
    async (invoer: AntwoordInvoerData) => {
      if (!huidige || !sessieId || bezig) return
      setBezig(true)
      setFout(null)
      try {
        const res = await fetch(`/api/questionnaires/${questionnaireId}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessieId, question_id: huidige.id, ...invoer }),
        })
        if (!res.ok) {
          const melding = await leesFout(res, 'Je antwoord is niet opgeslagen. Probeer het nog een keer.')
          if (res.status === 404) {
            // Beheer zette de lijst offline terwijl je invulde: eindtoestand,
            // geen eindeloze herhaalpogingen, en het icoon mag weg.
            setLaadFout(melding)
            setFase('fout')
            onVeranderd()
            return
          }
          setFout(melding)
          return
        }
        const data = (await res.json()) as { answer: AntwoordRij }
        setAntwoorden((prev) => ({
          ...prev,
          [huidige.id]: {
            answer_text: data.answer.answer_text,
            answer_scale: data.answer.answer_scale,
            answer_choice: data.answer.answer_choice,
          },
        }))
        setOvergeslagen((prev) => {
          if (!prev.has(huidige.id)) return prev
          const next = new Set(prev)
          next.delete(huidige.id)
          return next
        })
        setWijzigId(null)
        setVerderGegaan(true)
      } catch {
        setFout('Je antwoord is niet opgeslagen. Controleer je verbinding en probeer het opnieuw.')
      } finally {
        setBezig(false)
      }
    },
    [huidige, sessieId, bezig, questionnaireId, onVeranderd],
  )

  const slaOver = useCallback(() => {
    if (!huidige || huidige.is_required) return
    setFout(null)
    setOvergeslagen((prev) => new Set(prev).add(huidige.id))
    setWijzigId(null)
    setVerderGegaan(true)
  }, [huidige])

  const wijzig = useCallback((id: string) => {
    setFout(null)
    setWijzigId(id)
  }, [])

  const annuleerWijzigen = useCallback(() => {
    setFout(null)
    setWijzigId(null)
  }, [])
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="vragenlijst-invullen">
      {/* Permanent gemounte live-regio (meldingen-conventie): alleen de inhoud wisselt. */}
      <div aria-live="polite" className="sr-only">
        {fase === 'klaar'
          ? 'De vragenlijst is afgerond. Bedankt voor je antwoorden.'
          : huidige
            ? `Vraag ${huidigeIndex + 1} van ${vragen.length}: ${huidige.question_text}`
            : ''}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {fase === 'laden' && (
          <div className="flex items-center gap-2 text-sm text-[var(--ink-3)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Vragenlijst laden…
          </div>
        )}

        {fase === 'fout' && <FinBubbel>{laadFout}</FinBubbel>}

        {fase !== 'laden' && fase !== 'fout' && (
          <>
            <p className="mb-3 flex items-center font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
              <span className="mr-2.5 inline-block h-px w-7 bg-fin-500 align-middle" aria-hidden="true" />
              {titel}
            </p>
            {fase === 'vragen' && (
              <p className="-mt-1 mb-3 text-[11px] leading-relaxed text-[var(--ink-3)]">
                {/* Feitelijk getoetst: vragenlijstantwoorden komen in geen AI-context,
                    prompt of gespreksgeschiedenis — alleen in de vragenlijst-API,
                    beheer, de AVG-export en de accountverwijdering. Verandert dat
                    ooit, dan klopt deze zin niet meer. */}
                <strong className="font-medium text-[var(--ink-2)]">Je antwoorden gaan naar het TriFinity-team, niet naar de AI.</strong>{' '}
                Elk antwoord wordt meteen bewaard. Je kunt stoppen wanneer je wilt en later verdergaan waar je was.
              </p>
            )}

            {verloop.map((v) => (
              <div key={v.id}>
                <FinBubbel>{v.question_text}</FinBubbel>
                <JijBubbel
                  tekst={antwoorden[v.id] ? antwoordAlsTekst(antwoorden[v.id], v) : 'Overgeslagen'}
                  gedempt={!antwoorden[v.id]}
                  vraag={v.question_text}
                  onWijzig={fase === 'vragen' && !bezig ? () => wijzig(v.id) : undefined}
                />
              </div>
            ))}

            {/* Hervat: één keer, direct boven de vraag waar je verdergaat. Verdwijnt
                zodra je iets nieuws beantwoordt — dan is "welkom terug" voorbij. */}
            {huidige && fase === 'vragen' && !wijzigId && alBeantwoordBijOpenen > 0 && !verderGegaan && (
              <FinBubbel>
                Welkom terug! Je had al {alBeantwoordBijOpenen} van de {vragen.length} vragen beantwoord.
                We gaan verder waar je gebleven was.
              </FinBubbel>
            )}

            {huidige && fase === 'vragen' && (
              <FinBubbel>
                <span
                  data-testid="vraag-voortgang"
                  className="mb-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]"
                >
                  Vraag {huidigeIndex + 1} van {vragen.length}
                  {!huidige.is_required && ' · mag je overslaan'}
                </span>
                {huidige.question_text}
              </FinBubbel>
            )}

            {(fase === 'afronden' || (fase === 'vragen' && !huidige)) && !fout && (
              <div className="flex items-center gap-2 text-sm text-[var(--ink-3)]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Afronden…
              </div>
            )}

            {fase === 'klaar' && (
              <FinBubbel>
                Dank je wel! Je antwoorden zijn bewaard en gaan naar het TriFinity-team, niet naar de AI. Hier doen we echt iets mee.
              </FinBubbel>
            )}
          </>
        )}
      </div>

      <Voet>
        {fout && (
          <p role="alert" className="mb-2 text-xs text-negative">
            {fout}
          </p>
        )}

        {fase === 'vragen' && huidige && (
          <AntwoordInvoer
            key={huidige.id}
            vraag={huidige}
            vorig={antwoorden[huidige.id] ?? null}
            bezig={bezig}
            onVerstuur={verstuur}
            // Bij wijzigen is "terug zonder te veranderen" de uitweg, ook bij
            // een verplichte vraag; anders mag alleen een niet-verplichte vraag
            // worden overgeslagen.
            onSlaOver={wijzigId ? annuleerWijzigen : huidige.is_required ? null : slaOver}
            slaOverLabel={wijzigId ? 'Annuleren' : 'Overslaan'}
          />
        )}

        {fase === 'vragen' && !huidige && fout && (
          <button
            type="button"
            onClick={() => void afronden()}
            className="mb-2 w-full bg-fin-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-fin-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fin-500"
          >
            Opnieuw proberen
          </button>
        )}

        <div className="flex items-center justify-between gap-2">
          {onTerug ? (
            <button
              type="button"
              onClick={onTerug}
              disabled={bezig}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fin-500"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Andere vragenlijst
            </button>
          ) : (
            <span />
          )}
          {/* Tijdens het invullen zegt de knop wat hij doet: je stopt, niets gaat verloren. */}
          <TerugNaarChat
            onClose={onClose}
            disabled={bezig}
            label={fase === 'vragen' && huidige ? 'Later afmaken' : 'Terug naar de chat'}
          />
        </div>
      </Voet>
    </div>
  )
}

// ── Invoer per vraagtype ─────────────────────────────────────────────────────

function AntwoordInvoer({ vraag, vorig, bezig, onVerstuur, onSlaOver, slaOverLabel }: {
  vraag: Vraag
  vorig: OpgeslagenAntwoord | null
  bezig: boolean
  onVerstuur: (invoer: AntwoordInvoerData) => void
  onSlaOver: (() => void) | null
  slaOverLabel: string
}) {
  const opties = optiesVan(vraag)
  const eerdereKeuzes = keuzesUitOpslag(vorig?.answer_choice ?? null)
  // Bij meerkeuze met "Anders" draagt answer_text de eigen tekst; bij open de hele tekst.
  const [tekst, setTekst] = useState(vorig?.answer_text ?? '')
  const [keuzes, setKeuzes] = useState<string[]>(eerdereKeuzes)
  // Rangschikken: een eerder antwoord als startvolgorde, anders de volgorde uit beheer.
  const [volgorde, setVolgorde] = useState<string[]>(() =>
    vraag.type === 'ranking' && eerdereKeuzes.length === opties.length && eerdereKeuzes.every((k) => opties.includes(k))
      ? eerdereKeuzes
      : opties,
  )

  // Slepen bij rangschikken (zelfde aanpak als de budgetplan-editor): pas na een
  // paar pixels beweging, zodat een tik of een scroll geen sleep start. Hooks
  // staan hier bovenaan omdat de typen hieronder vroeg terugkeren.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Focus volgt de beurt (spiegel van MeldingView): elke vraag mount met een
  // eigen key, dus de zojuist gebruikte knop verdwijnt en de focus zou anders
  // op <body> terugvallen. Hier gaat hij naar de invoer van de nieuwe vraag.
  const invoerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Een tekstveld eerst (open vraag, of een hervat "Anders"-antwoord), anders de eerste knop.
    const el = invoerRef.current
    ;(el?.querySelector<HTMLElement>('textarea, input') ?? el?.querySelector<HTMLElement>('button:not([disabled])'))?.focus()
  }, [])

  const knopKlasse =
    'border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] transition-colors hover:bg-fin-50 hover:text-fin-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fin-500'
  const actiefKlasse = 'border-fin-500 bg-fin-50 text-fin-700'

  const overslaan = onSlaOver && (
    <button
      type="button"
      onClick={onSlaOver}
      disabled={bezig}
      className="text-xs text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink-2)] hover:underline disabled:opacity-50"
    >
      {slaOverLabel}
    </button>
  )

  const verstuurKnop = (label: string, disabled: boolean, onClick: () => void) => (
    <button
      type="button"
      disabled={bezig || disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 bg-fin-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-fin-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fin-500"
    >
      {bezig ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
      {label}
    </button>
  )

  if (vraag.type === 'yes_no') {
    return (
      <div ref={invoerRef} className="mb-3">
        <div role="group" aria-label={vraag.question_text} className="flex gap-2">
          {[JA, NEE].map((keuze) => (
            <button
              key={keuze}
              type="button"
              disabled={bezig}
              aria-pressed={vorig?.answer_choice === keuze}
              onClick={() => onVerstuur({ answer_choices: [keuze] })}
              className={`h-10 flex-1 text-sm font-medium ${knopKlasse} ${vorig?.answer_choice === keuze ? actiefKlasse : ''}`}
            >
              {keuze}
            </button>
          ))}
        </div>
        {overslaan && <div className="mt-2">{overslaan}</div>}
      </div>
    )
  }

  if (vraag.type === 'ranking') {
    const verplaats = (index: number, richting: -1 | 1) => {
      const doel = index + richting
      if (doel < 0 || doel >= volgorde.length) return
      const optie = volgorde[index]
      setVolgorde((prev) => {
        const next = [...prev]
        ;[next[index], next[doel]] = [next[doel], next[index]]
        return next
      })
      // Focus met de optie mee. Staat hij nu bovenaan of onderaan, dan is die
      // pijl uitgeschakeld en valt de focus weg — spring dan naar de andere pijl.
      requestAnimationFrame(() => {
        const knoppen = invoerRef.current?.querySelectorAll<HTMLButtonElement>(
          `button[data-optie="${CSS.escape(optie)}"]`,
        )
        const zelfde = [...(knoppen ?? [])].find((b) => b.dataset.richting === String(richting) && !b.disabled)
        ;(zelfde ?? [...(knoppen ?? [])].find((b) => !b.disabled))?.focus()
      })
    }
    const naSlepen = ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return
      setVolgorde((prev) => {
        const van = prev.indexOf(String(active.id))
        const naar = prev.indexOf(String(over.id))
        return van < 0 || naar < 0 ? prev : arrayMove(prev, van, naar)
      })
    }
    return (
      <div ref={invoerRef} className="mb-3">
        <p className="mb-1 text-[11px] text-[var(--ink-3)]">Sleep of gebruik de pijlen: zet bovenaan wat voor jou het belangrijkst is.</p>
        {/* Twee wegen naar dezelfde volgorde: slepen (muis/duim) en de pijlknoppen
            (toetsenbord, schermlezer, of wie niet wil slepen). Compacte rijen en
            een lage hoogtegrens: het chatvenster is op mobiel vaak lager dan het
            scherm, en het gesprek moet zichtbaar blijven. */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={naSlepen}>
          <SortableContext items={volgorde} strategy={verticalListSortingStrategy}>
            <ol aria-label={vraag.question_text} className="max-h-[28vh] space-y-0.5 overflow-y-auto">
              {volgorde.map((optie, i) => (
                <RangRij
                  key={optie}
                  optie={optie}
                  positie={i + 1}
                  bezig={bezig}
                  isEerste={i === 0}
                  isLaatste={i === volgorde.length - 1}
                  onOmhoog={() => verplaats(i, -1)}
                  onOmlaag={() => verplaats(i, 1)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
        <div className="mt-2 flex items-center justify-between gap-2">
          {overslaan ?? <span />}
          {verstuurKnop('Volgorde versturen', volgorde.length === 0, () => onVerstuur({ answer_choices: volgorde }))}
        </div>
      </div>
    )
  }

  if (vraag.type === 'scale') {
    const { min, max } = schaalBereik(vraag)
    return (
      <div ref={invoerRef} className="mb-3">
        {/* Altijd één rij: twee rijen vraagt op mobiel te veel hoogte van het
            chatvenster. Ook bij 0–10 (elf knoppen) blijft elk tikvlak op 360px
            ~26px breed, boven de 24px-ondergrens van WCAG 2.2 (2.5.8). */}
        <div role="group" aria-label={`Kies een cijfer van ${min} tot ${max}: ${vraag.question_text}`} className="flex gap-1">
          {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
            <button
              key={n}
              type="button"
              disabled={bezig}
              onClick={() => onVerstuur({ answer_scale: n })}
              aria-pressed={vorig?.answer_scale === n}
              className={`h-9 min-w-0 flex-1 font-mono text-sm tabular-nums ${knopKlasse} ${vorig?.answer_scale === n ? actiefKlasse : ''}`}
            >
              {n}
            </button>
          ))}
        </div>
        {(vraag.scale_min_label || vraag.scale_max_label) && (
          <div className="mt-1 flex justify-between text-[10px] text-[var(--ink-4)]">
            <span>{vraag.scale_min_label ? `${min} · ${vraag.scale_min_label}` : ''}</span>
            <span>{vraag.scale_max_label ? `${vraag.scale_max_label} · ${max}` : ''}</span>
          </div>
        )}
        {overslaan && <div className="mt-2">{overslaan}</div>}
      </div>
    )
  }

  if (vraag.type === 'multiple_choice') {
    const knoppen = vraag.allow_other ? [...opties, ANDERS_LABEL] : opties
    const andersGekozen = keuzes.includes(ANDERS_LABEL)
    // Eén keuze verstuurt direct — behalve "Anders": die heeft eerst je tekst nodig.
    const directVersturen = !vraag.is_multi_select
    const verstuurKeuzes = () =>
      onVerstuur({ answer_choices: keuzes, ...(andersGekozen ? { answer_other: tekst.trim() } : {}) })
    return (
      <div ref={invoerRef} className="mb-3">
        {vraag.is_multi_select && (
          <p className="mb-1.5 text-[11px] text-[var(--ink-3)]">Je kunt meerdere antwoorden kiezen.</p>
        )}
        {/* Hoogtegrens: met veel of lange opties duwt de invoer anders de vraag
            én de verstuurknop uit beeld (zelfde grens als bij rangschikken). */}
        <div role="group" aria-label={vraag.question_text} className="flex max-h-[28vh] flex-wrap gap-1.5 overflow-y-auto">
          {knoppen.map((optie) => {
            const gekozen = keuzes.includes(optie)
            return (
              <button
                key={optie}
                type="button"
                disabled={bezig}
                aria-pressed={gekozen}
                onClick={() => {
                  if (directVersturen) {
                    if (optie === ANDERS_LABEL) {
                      setKeuzes([ANDERS_LABEL])
                      return
                    }
                    onVerstuur({ answer_choices: [optie] })
                    return
                  }
                  setKeuzes((prev) => (prev.includes(optie) ? prev.filter((k) => k !== optie) : [...prev, optie]))
                }}
                className={`px-3 py-1.5 text-left text-xs ${knopKlasse} ${gekozen ? actiefKlasse : ''} ${optie === ANDERS_LABEL ? 'italic' : ''}`}
              >
                {optie === ANDERS_LABEL ? `${ANDERS_LABEL}…` : optie}
              </button>
            )
          })}
        </div>
        {andersGekozen && (
          <input
            type="text"
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && tekst.trim()) {
                e.preventDefault()
                verstuurKeuzes()
              }
            }}
            maxLength={OPEN_ANTWOORD_MAX}
            disabled={bezig}
            // Direct na het kiezen van "Anders" wil je typen.
            autoFocus
            aria-label={`Anders, namelijk: ${vraag.question_text}`}
            placeholder="Wat bedoel je?"
            className="mt-2 w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-fin-500 focus:outline-none disabled:opacity-60"
          />
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          {overslaan ?? <span />}
          {(vraag.is_multi_select || andersGekozen) &&
            verstuurKnop('Verstuur', keuzes.length === 0 || (andersGekozen && !tekst.trim()), verstuurKeuzes)}
        </div>
      </div>
    )
  }

  const verstuurTekst = () => {
    if (tekst.trim()) onVerstuur({ answer_text: tekst.trim() })
  }

  return (
    <div ref={invoerRef} className="mb-3">
      <div className="flex items-end gap-2">
        <textarea
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              verstuurTekst()
            }
          }}
          rows={2}
          maxLength={OPEN_ANTWOORD_MAX}
          disabled={bezig}
          aria-label={`Je antwoord: ${vraag.question_text}`}
          placeholder="Typ je antwoord…"
          className="min-h-[44px] flex-1 resize-none border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-fin-500 focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={verstuurTekst}
          disabled={bezig || !tekst.trim()}
          aria-label="Antwoord versturen"
          className="touch-target flex items-center justify-center bg-fin-600 text-white transition-colors hover:bg-fin-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fin-500"
        >
          {bezig ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      {overslaan && <div className="mt-2">{overslaan}</div>}
    </div>
  )
}

/**
 * Eén sleepbare rij bij rangschikken. Alleen de greep + de optietekst starten een
 * sleep (`touch-none` alleen dáár): zo blijft een lange lijst op mobiel scrollbaar
 * via het nummer en de randen, en tikken de pijlknoppen gewoon. De sleep-attributen
 * van dnd-kit (role/tabIndex) spreiden we bewust níet: toetsenbord en schermlezer
 * lopen via de pijlknoppen, en een extra tab-stop per rij voegt dan niets toe.
 */
function RangRij({ optie, positie, bezig, isEerste, isLaatste, onOmhoog, onOmlaag }: {
  optie: string
  positie: number
  bezig: boolean
  isEerste: boolean
  isLaatste: boolean
  onOmhoog: () => void
  onOmlaag: () => void
}) {
  const { listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: optie,
    disabled: bezig,
  })
  const pijlKlasse =
    'flex h-6 w-6 items-center justify-center text-[var(--ink-3)] hover:bg-fin-50 hover:text-fin-700 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-fin-500'

  return (
    <li
      ref={setNodeRef}
      style={{ transform: DndCSS.Transform.toString(transform), transition }}
      data-testid="rang-rij"
      className={`flex items-center gap-2 border bg-[var(--paper)] py-0.5 pl-2 pr-0.5 text-xs text-[var(--ink-2)] ${
        isDragging ? 'relative z-10 border-fin-500 shadow-[var(--s2)]' : 'border-[var(--border-ed)]'
      }`}
    >
      <span className="w-4 shrink-0 font-mono tabular-nums text-[var(--ink-4)]">{positie}</span>
      <span
        ref={setActivatorNodeRef}
        {...listeners}
        className="flex min-w-0 flex-1 cursor-grab touch-none items-center gap-1.5 active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-[var(--ink-4)]" aria-hidden="true" />
        <span className="min-w-0 flex-1">{optie}</span>
      </span>
      <button
        type="button"
        disabled={bezig || isEerste}
        onClick={onOmhoog}
        aria-label={`${optie} omhoog`}
        data-optie={optie}
        data-richting="-1"
        className={pijlKlasse}
      >
        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={bezig || isLaatste}
        onClick={onOmlaag}
        aria-label={`${optie} omlaag`}
        data-optie={optie}
        data-richting="1"
        className={pijlKlasse}
      >
        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </li>
  )
}

// ── Bouwstenen ───────────────────────────────────────────────────────────────

function FinBubbel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex justify-start">
      <div className="mr-2 mt-1 shrink-0">
        <FinDots size={28} state="idle" />
      </div>
      <div className="max-w-[85%] whitespace-pre-line rounded-[var(--r-lg)] bg-fin-50 px-3 py-2 text-sm leading-relaxed text-[var(--ink-2)]">
        {children}
      </div>
    </div>
  )
}

function JijBubbel({ tekst, gedempt, vraag, onWijzig }: { tekst: string; gedempt: boolean; vraag: string; onWijzig?: () => void }) {
  return (
    <div className="mb-3 flex flex-col items-end">
      <div
        className={`max-w-[80%] whitespace-pre-line rounded-[var(--r-lg)] px-3 py-2 text-sm leading-relaxed ${
          gedempt ? 'bg-[var(--subtle)] italic text-[var(--ink-4)]' : 'bg-zinc-100 text-zinc-800'
        }`}
      >
        {tekst}
      </div>
      {onWijzig && (
        <button
          type="button"
          onClick={onWijzig}
          aria-label={`Wijzig je antwoord op: ${vraag}`}
          className="mt-0.5 text-[10px] text-[var(--ink-4)] underline-offset-2 hover:text-[var(--ink-2)] hover:underline"
        >
          Wijzig
        </button>
      )}
    </div>
  )
}

function Voet({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="border-t border-[var(--border-ed)] px-4 pt-3"
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
    >
      {children}
    </div>
  )
}

function TerugNaarChat({ onClose, disabled = false, label = 'Terug naar de chat' }: {
  onClose: () => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fin-500"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  )
}
