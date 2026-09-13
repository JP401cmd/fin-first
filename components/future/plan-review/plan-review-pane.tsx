'use client'

/**
 * PlanReviewPane — de vijf stappen van de plan-review Toekomst (TPR-01, ADR 0142).
 *
 * Eén stap tegelijk, elk met drie zichtbare blokken (eigenaarsnorm formulier-uitleg):
 *  - "De app rekent nu met …"  — de keuze zoals de kern er nu mee rekent (A3);
 *  - "Wat het doet"            — de uitkomst in leeftijd, met een vergelijking (A4);
 *  - "Waarom dit ertoe doet".
 *
 * Inhoud komt per stap van `GET /api/plan-review?stap=` (server bouwt 'm uit de
 * canonieke kernel-run; hier wordt niets gerekend). "Bevestigen" schrijft eerst de
 * huidige (of gekozen) waarde via de bestaande domeinroute en zet daarna de markering
 * via `PUT /api/plan-review` (A5). "Overslaan" gaat door zonder te bevestigen; de pane
 * is op elk moment te sluiten en bevestigde stappen blijven bevestigd (A6).
 *
 * BEWERKSTAND (TPR-15). Heeft een stap een editor in `PLAN_REVIEW_EDITORS`, dan klapt
 * "Aanpassen" die bestaande editor-body ín de stap uit — geen navigatie, geen geneste
 * overlay. De body schrijft via zijn eigen, bestaande route; de footer wordt "Opslaan en
 * bevestigen" (besluit eigenaar 13 sep 2026: opslaan = bevestigen) en na de write zet de
 * pane de markering en gaat door. "Annuleren" sluit alleen de bewerkstand; er is dan
 * niets geschreven. Wat de editors nodig hebben (snapshot, plan) wordt pas bij de eerste
 * bewerkstand gelezen (`GET /api/plan-review/editor-context`). Stappen zonder editor
 * verwijzen nog naar het bestaande scherm.
 *
 * Na de laatste stap: het afsluitscherm "Voor wie wil" met verwijzingen naar de
 * bestaande Voorkeuren-kaarten en het bezittingenoverzicht (laag 2, alleen doorverwijzen).
 *
 * Overlay via `ShellOverlay kind="pane"` (z-[70]); de Tijdas blijft op desktop zichtbaar
 * naast de pane (A12). Kopniveau: de pane-titel is h3, de stapnaam h4.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Circle, Minus } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import type { RegelEditActionsState } from '@/components/future/regels/types'
import { PLAN_REVIEW_EDITOR_CONTEXT_URL, type PlanReviewEditorContext } from '@/lib/plan-review/editor-context'
import { PLAN_REVIEW_EDITORS } from './editors'
import { noteOverlayNavigation } from '@/lib/overlay-history'
import { derivePlanReviewProgress } from '@/lib/plan-review/progress'
import {
  PLAN_REVIEW_LAAG2,
  PLAN_REVIEW_STAPPEN,
  PLAN_REVIEW_STAP_TITELS,
  parsePlanReviewState,
  type PlanReviewFacts,
  type PlanReviewOpenReden,
  PLAN_REVIEW_NAAM,
  type PlanReviewProgress,
  type PlanReviewStap,
  type PlanReviewStapStatus,
} from '@/lib/plan-review/types'
import type { PlanReviewSchrijfActie, PlanReviewStapOverzicht } from '@/lib/plan-review/overzicht'

type Scherm = PlanReviewStap | 'afsluiten'

/** Waarom een stap open blijft ondanks een markering (`derivePlanReviewProgress`). */
const OPEN_REDEN_TEKST: Record<Exclude<PlanReviewOpenReden, null>, string> = {
  woning_zonder_strategie: 'Deze stap blijft open tot er een woonstrategie voor je huis is opgeslagen.',
  aow_ontbreekt: 'Deze stap blijft open tot er AOW-gegevens zijn.',
}

interface StapAntwoord {
  overzicht: PlanReviewStapOverzicht
  progress: PlanReviewProgress
  facts: PlanReviewFacts
}

/** De volgende stap die meetelt, ná `huidig`; `'afsluiten'` wanneer er geen meer is. */
export function volgendScherm(progress: PlanReviewProgress, huidig: PlanReviewStap): Scherm {
  const idx = PLAN_REVIEW_STAPPEN.indexOf(huidig)
  const volgende = progress.stappen.slice(idx + 1).find((s) => s.status !== 'nvt')
  return volgende?.stap ?? 'afsluiten'
}

async function schrijf(actie: PlanReviewSchrijfActie): Promise<string | null> {
  const res = await fetch(actie.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(actie.body),
  })
  if (res.ok) return null
  const data = (await res.json().catch(() => ({}))) as { error?: unknown }
  return typeof data.error === 'string' ? data.error : 'Opslaan is niet gelukt.'
}

export function PlanReviewPane({
  open,
  startStap,
  initialProgress,
  onClose,
  onChanged,
}: {
  open: boolean
  startStap: PlanReviewStap
  initialProgress: PlanReviewProgress
  onClose: () => void
  /** Na een geslaagde bevestiging — de page ververst grafiek en kaart. */
  onChanged: () => void
}) {
  const router = useRouter()
  const [scherm, setScherm] = useState<Scherm>(startStap)
  const [progress, setProgress] = useState<PlanReviewProgress>(initialProgress)
  const [cache, setCache] = useState<Partial<Record<PlanReviewStap, StapAntwoord>>>({})
  const [laadFout, setLaadFout] = useState<string | null>(null)
  const [keuzeId, setKeuzeId] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [opslaanFout, setOpslaanFout] = useState<string | null>(null)
  // TPR-15 — bewerkstand van de huidige stap.
  const [bewerken, setBewerken] = useState(false)
  const [editorContext, setEditorContext] = useState<PlanReviewEditorContext | null>(null)
  const [editorLaadFout, setEditorLaadFout] = useState<string | null>(null)
  const [editorActions, setEditorActions] = useState<RegelEditActionsState | null>(null)
  /** Fout van een markering ná een geslaagde editor-write; overleeft de herlezing van de stap. */
  const [markeerFout, setMarkeerFout] = useState<string | null>(null)
  /** Opgeslagen via de editor, maar de stap blijft open (met de reden); overleeft de herlezing. */
  const [openMelding, setOpenMelding] = useState<string | null>(null)
  /** De stap waarin de bewerkstand geopend werd — daar hoort een editor-write bij. */
  const bewerkStapRef = useRef<PlanReviewStap | null>(null)

  const huidigAntwoord = scherm === 'afsluiten' ? null : cache[scherm]

  // Een trage lezing van een stap die de gebruiker al verliet mag de huidige stap
  // niet overschrijven (voortgang, foutregel): alleen de laatste lezing voor het
  // scherm dat nú open staat telt. Het antwoord zelf mag wel in de cache (per stap).
  const schermRef = useRef<Scherm>(scherm)
  const laadIdRef = useRef(0)
  useEffect(() => {
    schermRef.current = scherm
  }, [scherm])

  const laad = useCallback(async (stap: PlanReviewStap) => {
    const id = ++laadIdRef.current
    const actueel = () => id === laadIdRef.current && schermRef.current === stap
    setLaadFout(null)
    try {
      const res = await fetch(`/api/plan-review?stap=${stap}`)
      const data = (await res.json().catch(() => ({}))) as Partial<StapAntwoord> & { error?: string }
      if (!res.ok || !data.overzicht || !data.progress || !data.facts) {
        if (actueel()) setLaadFout(typeof data.error === 'string' ? data.error : 'Deze stap kon niet geladen worden.')
        return
      }
      setCache((c) => ({ ...c, [stap]: data as StapAntwoord }))
      if (actueel()) setProgress(data.progress)
    } catch {
      if (actueel()) setLaadFout('Deze stap kon niet geladen worden.')
    }
  }, [])

  useEffect(() => {
    if (!open || scherm === 'afsluiten' || cache[scherm]) return
    void laad(scherm)
  }, [open, scherm, cache, laad])

  // Keuze volgt de stap: bij binnenkomst de huidige optie (als die er is). Bewust
  // alleen op het antwoord van DEZE stap: een lezing van een andere stap mag een
  // gemaakte keuze niet wissen.
  useEffect(() => {
    setOpslaanFout(null)
    setKeuzeId(huidigAntwoord?.overzicht.keuzes.find((k) => k.huidig)?.id ?? null)
  }, [scherm, huidigAntwoord])

  // De bewerkstand hoort bij één stap: een andere stap openen sluit hem (zonder te schrijven).
  useEffect(() => {
    setBewerken(false)
    setEditorActions(null)
    setEditorLaadFout(null)
    setMarkeerFout(null)
    setOpenMelding(null)
  }, [scherm])

  const gaNaar = (s: Scherm) => setScherm(s)

  /**
   * Zet de markering voor de huidige stap en gaat door. `geschreven` = er is zojuist via
   * een domeinroute geschreven: dan kunnen andere stappen en de editor-context verschoven
   * zijn, dus die worden opnieuw gelezen. `woonstrategieGeschreven` is het enige feit dat
   * een review-write zelf verandert; zonder die bijwerking bleef de woningstap lokaal
   * 'open' tot de volgende lezing.
   */
  async function markeerEnGaDoor(
    stap: PlanReviewStap,
    facts: PlanReviewFacts,
    opties: { geschreven: boolean; woonstrategieGeschreven: boolean; blijfBijOpenStap?: boolean },
  ): Promise<string | null> {
    // Is er geschreven, dan zijn andere stappen en de editor-context verouderd — ook als
    // de markering hierna faalt (anders neemt een volgende bewerkstand het oude plan
    // als "opgeslagen" en schrijft een tweede edit de eerste deels terug).
    if (opties.geschreven) setEditorContext(null)
    const res = await fetch('/api/plan-review', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stap, bevestigd: true }),
    })
    const data = (await res.json().catch(() => ({}))) as { plan_review_state?: unknown; error?: unknown }
    if (!res.ok) {
      return typeof data.error === 'string' ? data.error : 'Bevestigen is niet gelukt.'
    }
    const nieuweFacts: PlanReviewFacts = opties.woonstrategieGeschreven ? { ...facts, housingConfigured: true } : facts
    const nieuw = derivePlanReviewProgress(parsePlanReviewState(data.plan_review_state), nieuweFacts)
    setProgress(nieuw)
    if (opties.geschreven) setCache({})
    onChanged()
    // TPR-15 — een editor-save die de stap níet bevestigd maakt (bv. een verkoopinstelling
    // terwijl het huis nog geen woonstrategie heeft, A10): niet stil doorgaan, maar in de
    // stap blijven en zeggen waarom hij open blijft.
    const reden = nieuw.stappen.find((s) => s.stap === stap)?.reden ?? null
    if (opties.blijfBijOpenStap && reden) {
      setBewerken(false)
      setEditorActions(null)
      setOpenMelding(`Je instelling is opgeslagen. ${OPEN_REDEN_TEKST[reden]}`)
      return null
    }
    gaNaar(volgendScherm(nieuw, stap))
    return null
  }

  async function bevestig() {
    if (scherm === 'afsluiten' || !huidigAntwoord) return
    const { overzicht, facts } = huidigAntwoord
    const keuze = overzicht.keuzes.find((k) => k.id === keuzeId)
    const acties = keuze ? keuze.schrijf : overzicht.schrijf
    setBezig(true)
    setOpslaanFout(null)
    setMarkeerFout(null)
    try {
      for (const actie of acties) {
        const fout = await schrijf(actie)
        if (fout) {
          setOpslaanFout(fout)
          return
        }
      }
      const fout = await markeerEnGaDoor(scherm, facts, {
        geschreven: acties.length > 0,
        woonstrategieGeschreven: acties.some((a) => a.url === '/api/housing-strategy'),
      })
      if (fout) setOpslaanFout(fout)
    } catch {
      setOpslaanFout('Bevestigen is niet gelukt.')
    } finally {
      setBezig(false)
    }
  }

  async function laadEditorContext() {
    setEditorLaadFout(null)
    try {
      const res = await fetch(PLAN_REVIEW_EDITOR_CONTEXT_URL)
      const data = (await res.json().catch(() => ({}))) as Partial<PlanReviewEditorContext> & { error?: unknown }
      if (!res.ok || !('snapshot' in data)) {
        setEditorLaadFout(typeof data.error === 'string' ? data.error : 'Aanpassen kon niet geladen worden.')
        return
      }
      setEditorContext({
        snapshot: data.snapshot ?? null,
        firePlan: data.firePlan ?? null,
        potRules: data.potRules ?? null,
        potBalances: data.potBalances ?? null,
        woning: data.woning ?? null,
      })
    } catch {
      setEditorLaadFout('Aanpassen kon niet geladen worden.')
    }
  }

  function startBewerken() {
    if (scherm === 'afsluiten') return
    setOpslaanFout(null)
    setMarkeerFout(null)
    setEditorActions(null)
    bewerkStapRef.current = scherm
    setOpenMelding(null)
    setBewerken(true)
    if (!editorContext) void laadEditorContext()
  }

  function stopBewerken() {
    setBewerken(false)
    setEditorActions(null)
  }

  // Stabiele identiteit: de body publiceert in een effect dat hierop leunt.
  const handleEditorActions = useCallback((next: RegelEditActionsState) => {
    setEditorActions(next)
  }, [])

  // Ook `onSaved` krijgt een stabiele identiteit (via een ref naar de laatste closure): een
  // body die hem in een publiceer-effect meeneemt, zou anders elke render opnieuw
  // publiceren → state-update → render → eindeloze lus.
  type OpslaanInfo = { woonstrategieGeschreven?: boolean }
  const naOpslaanRef = useRef<(info?: OpslaanInfo) => void>(() => {})
  useEffect(() => {
    naOpslaanRef.current = (info) => void naOpslaanInEditor(info)
  })
  const handleEditorSaved = useCallback((info?: OpslaanInfo) => naOpslaanRef.current(info), [])

  /**
   * De body heeft via zijn bestaande route geschreven: opslaan = bevestigen. De markering
   * gaat naar de stap waarin de bewerkstand geopend werd (`bewerkStapRef`), nooit naar
   * een stap die intussen open staat.
   */
  async function naOpslaanInEditor(info?: { woonstrategieGeschreven?: boolean }) {
    const stap = bewerkStapRef.current
    const antwoord = stap ? cache[stap] : undefined
    if (!stap || stap !== schermRef.current || !antwoord) {
      // Geschreven, maar de gebruiker staat niet meer in die stap: niet bevestigen, wel
      // alles wat op de oude waarde leunt opnieuw laten lezen.
      setEditorContext(null)
      setCache({})
      onChanged()
      return
    }
    setBezig(true)
    setOpslaanFout(null)
    setMarkeerFout(null)
    try {
      const fout = await markeerEnGaDoor(stap, antwoord.facts, {
        geschreven: true,
        woonstrategieGeschreven: info?.woonstrategieGeschreven ?? stap === 'woning',
        blijfBijOpenStap: true,
      })
      if (fout) {
        // De instelling staat opgeslagen, alleen de markering niet: terug naar het overzicht
        // van de stap (herlezen), zodat "Bevestigen" het opnieuw kan proberen zonder nog eens
        // te schrijven. Eigen foutregel: `opslaanFout` wist mee met de herlezing.
        setMarkeerFout(`Je instelling is opgeslagen, maar bevestigen is niet gelukt: ${fout}`)
        setBewerken(false)
        setCache({})
        onChanged()
      }
    } catch {
      setMarkeerFout('Je instelling is opgeslagen, maar bevestigen is niet gelukt.')
      setEditorContext(null)
      setBewerken(false)
      setCache({})
    } finally {
      setBezig(false)
    }
  }

  function naarAanpassen(href: string) {
    // Programmatische navigatie uit een overlay: meld het vóór het sluiten, anders
    // breekt de history-release de lopende navigatie af (vijfde sluitroute).
    noteOverlayNavigation()
    onClose()
    router.push(href)
  }

  const overzicht = huidigAntwoord?.overzicht ?? null
  const kanBevestigen =
    !!overzicht && !bezig && overzicht.blokkade == null && !(overzicht.keuzeVerplicht && keuzeId == null)

  const isAfsluiten = scherm === 'afsluiten'
  const stapStatus = (stap: PlanReviewStap): PlanReviewStapStatus =>
    progress.stappen.find((s) => s.stap === stap)?.status ?? 'open'

  const Editor = isAfsluiten ? null : PLAN_REVIEW_EDITORS[scherm]
  const inBewerkstand = bewerken && Editor != null
  const editorBezig = bezig || (editorActions?.saving ?? false)

  let editorSlot: ReactNode = null
  if (inBewerkstand) {
    editorSlot = editorLaadFout ? (
      <div className="space-y-2">
        <p role="alert" className="text-negative">{editorLaadFout}</p>
        <button
          type="button"
          onClick={() => void laadEditorContext()}
          className="inline-flex min-h-[44px] items-center text-xs font-semibold text-[var(--ink-2)] underline hover:text-[var(--ink)]"
        >
          Opnieuw proberen
        </button>
      </div>
    ) : !editorContext ? (
      <p className="text-[var(--ink-3)]" aria-live="polite">
        Je instellingen worden geladen…
      </p>
    ) : (
      <Editor context={editorContext} onActionsChange={handleEditorActions} onSaved={handleEditorSaved} />
    )
  }

  return (
    <ShellOverlay
      open={open}
      onClose={onClose}
      kind="pane"
      title={PLAN_REVIEW_NAAM}
      mobileBackCloses
      primaryAction={
        isAfsluiten
          ? { label: 'Sluiten', onClick: onClose }
          : inBewerkstand && editorActions?.changed !== false
            ? {
                label: 'Opslaan en bevestigen',
                onClick: () => editorActions?.save(),
                disabled: !editorActions?.canSave || editorBezig,
                loading: editorBezig,
              }
            : { label: 'Bevestigen', onClick: () => void bevestig(), disabled: !kanBevestigen, loading: bezig }
      }
      secondaryAction={
        isAfsluiten
          ? undefined
          : inBewerkstand
            ? { label: 'Annuleren', onClick: stopBewerken, disabled: editorBezig }
            : { label: 'Overslaan', onClick: () => gaNaar(volgendScherm(progress, scherm)), disabled: bezig }
      }
      footerInfo={
        inBewerkstand && editorActions?.footerInfo ? (
          editorActions.footerInfo
        ) : (
          <span className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
            {progress.bevestigd} van {progress.totaal} bevestigd
          </span>
        )
      }
    >
      <div className="space-y-5 px-4 py-4 sm:px-6">
        <ol aria-label="Stappen" className="flex flex-wrap gap-1.5">
          {PLAN_REVIEW_STAPPEN.map((stap, i) => {
            const status = stapStatus(stap)
            const actief = stap === scherm
            const Icon = status === 'bevestigd' ? Check : status === 'nvt' ? Minus : Circle
            return (
              <li key={stap}>
                <button
                  type="button"
                  onClick={() => gaNaar(stap)}
                  disabled={status === 'nvt' || editorBezig}
                  aria-current={actief ? 'step' : undefined}
                  className={`inline-flex min-h-[32px] items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                    actief
                      ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:text-[var(--ink)]'
                  }`}
                >
                  <Icon className="h-3 w-3" aria-hidden="true" />
                  <span>
                    {i + 1}. {PLAN_REVIEW_STAP_TITELS[stap]}
                  </span>
                  <span className="sr-only">
                    {status === 'bevestigd' ? ' (bevestigd)' : status === 'nvt' ? ' (niet van toepassing)' : ' (open)'}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        {isAfsluiten ? (
          <VoorWieWil progress={progress} />
        ) : laadFout ? (
          <div className="space-y-2 text-sm text-[var(--ink-2)]">
            <p role="alert" className="text-negative">{laadFout}</p>
            <button
              type="button"
              onClick={() => void laad(scherm)}
              className="text-xs font-semibold text-[var(--ink-2)] underline hover:text-[var(--ink)]"
            >
              Opnieuw proberen
            </button>
          </div>
        ) : !overzicht ? (
          <p className="text-sm text-[var(--ink-3)]" aria-live="polite">
            De app rekent deze stap door…
          </p>
        ) : (
          <StapInhoud
            overzicht={overzicht}
            index={PLAN_REVIEW_STAPPEN.indexOf(overzicht.stap)}
            keuzeId={keuzeId}
            onKeuze={setKeuzeId}
            onAanpassen={naarAanpassen}
            bezig={editorBezig}
            heeftEditor={Editor != null}
            onBewerken={startBewerken}
            editorSlot={inBewerkstand ? editorSlot : null}
          />
        )}

        {openMelding && (
          <p role="status" className="text-sm text-[var(--ink)]">
            {openMelding}
          </p>
        )}
        {markeerFout && (
          <p role="alert" className="text-sm text-negative">
            {markeerFout}
          </p>
        )}
        {opslaanFout && (
          <p role="alert" className="text-sm text-negative">
            {opslaanFout}
          </p>
        )}
      </div>
    </ShellOverlay>
  )
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">{children}</p>
  )
}

function StapInhoud({
  overzicht,
  index,
  keuzeId,
  onKeuze,
  onAanpassen,
  bezig,
  heeftEditor,
  onBewerken,
  editorSlot,
}: {
  overzicht: PlanReviewStapOverzicht
  index: number
  keuzeId: string | null
  onKeuze: (id: string) => void
  onAanpassen: (href: string) => void
  bezig: boolean
  /** TPR-15 — de stap heeft een inline editor: "Aanpassen" opent die in plaats van te navigeren. */
  heeftEditor: boolean
  onBewerken: () => void
  /** Niet-null = bewerkstand; vervangt effect/vergelijking/keuzes door de editor-body. */
  editorSlot: ReactNode
}) {
  const inBewerkstand = editorSlot != null
  return (
    <article className="space-y-5 text-sm leading-relaxed text-[var(--ink-2)]">
      <header>
        <Kicker>
          Stap {index + 1} van {PLAN_REVIEW_STAPPEN.length}
        </Kicker>
        <h4 className="mt-1 font-serif text-xl text-[var(--ink)]">{overzicht.titel}</h4>
      </header>

      {/* KEUZE */}
      <section aria-label="Waar de app nu mee rekent" className="space-y-2">
        <Kicker>Waar de app nu mee rekent</Kicker>
        <p className="text-[var(--ink)]">{overzicht.rekentNu}</p>
        {overzicht.details.length > 0 && (
          <dl className="divide-y divide-[var(--border-ed)] border-y border-[var(--border-ed)]">
            {overzicht.details.map((d) => (
              <div key={d.label} className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="text-xs text-[var(--ink-3)]">{d.label}</dt>
                <dd className="text-right font-mono text-xs tabular-nums text-[var(--ink)]">{d.waarde}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {inBewerkstand ? (
        /* AANPASSEN — de bestaande editor-body; keuze en live effect staan daarin. */
        <section aria-label="Aanpassen" className="space-y-2">
          <Kicker>Aanpassen</Kicker>
          <p className="text-xs text-[var(--ink-3)]">
            Je wijzigt hier dezelfde instelling als op het gewone scherm. Het effect zie je direct; opslaan
            bevestigt deze stap.
          </p>
          {editorSlot}
        </section>
      ) : (
        <StapEffect overzicht={overzicht} keuzeId={keuzeId} onKeuze={onKeuze} bezig={bezig} />
      )}

      {/* WAAROM */}
      <section aria-label="Waarom dit ertoe doet" className="space-y-2">
        <Kicker>Waarom dit ertoe doet</Kicker>
        <p>{overzicht.waarom}</p>
      </section>

      {!inBewerkstand && overzicht.beperking && (
        <p className="text-xs italic text-[var(--ink-3)]">{overzicht.beperking}</p>
      )}
      {!inBewerkstand && overzicht.blokkade && (
        <p className="text-xs font-semibold text-[var(--ink)]">{overzicht.blokkade}</p>
      )}

      {!inBewerkstand && (heeftEditor || overzicht.aanpassen.length > 0) && (
        <div className="flex flex-wrap gap-x-4 border-t border-[var(--border-ed)] pt-1">
          {heeftEditor ? (
            <button
              type="button"
              onClick={onBewerken}
              disabled={bezig}
              className="inline-flex min-h-[44px] items-center text-xs font-semibold text-[var(--ink-2)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
            >
              {overzicht.aanpassen[0]?.label ?? 'Aanpassen'}
            </button>
          ) : (
            overzicht.aanpassen.map((a) => (
              <button
                key={a.href}
                type="button"
                onClick={() => onAanpassen(a.href)}
                disabled={bezig}
                className="inline-flex min-h-[44px] items-center text-xs font-semibold text-[var(--ink-2)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
              >
                {a.label} →
              </button>
            ))
          )}
        </div>
      )}
    </article>
  )
}

/** EFFECT — de uitkomst, de vergelijking en (stap 4) de keuzes naast elkaar. */
function StapEffect({
  overzicht,
  keuzeId,
  onKeuze,
  bezig,
}: {
  overzicht: PlanReviewStapOverzicht
  keuzeId: string | null
  onKeuze: (id: string) => void
  bezig: boolean
}) {
  return (
    <>
      {/* EFFECT */}
      <section aria-label="Wat het doet" className="space-y-2">
        <Kicker>Wat het doet</Kicker>
        {overzicht.effect.map((zin) => (
          <p key={zin}>{zin}</p>
        ))}
        {overzicht.vergelijking.length > 0 && (
          <dl className="divide-y divide-[var(--border-ed)] border-y border-[var(--border-ed)]">
            {overzicht.vergelijking.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="text-xs text-[var(--ink-3)]">{r.label}</dt>
                <dd className="text-right font-mono text-xs tabular-nums text-[var(--ink)]">{r.waarde}</dd>
              </div>
            ))}
          </dl>
        )}
        {overzicht.keuzes.length > 0 && (
          <fieldset className="space-y-2" disabled={bezig}>
            <legend className="mb-1 text-xs text-[var(--ink-3)]">
              {overzicht.keuzeVerplicht ? 'Kies waarmee de app rekent:' : 'De keuzes naast elkaar:'}
            </legend>
            {overzicht.keuzes.map((k) => (
              <label
                key={k.id}
                className={`flex cursor-pointer gap-3 border p-3 transition-colors ${
                  keuzeId === k.id
                    ? 'border-[var(--ink)] bg-[var(--subtle)]'
                    : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--ink-3)]'
                }`}
              >
                <input
                  type="radio"
                  name={`plan-review-${overzicht.stap}`}
                  value={k.id}
                  checked={keuzeId === k.id}
                  onChange={() => onKeuze(k.id)}
                  className="mt-1"
                />
                <span className="min-w-0 space-y-1">
                  <span className="block font-semibold text-[var(--ink)]">
                    {k.label}
                    {k.huidig && <span className="ml-2 text-[11px] font-normal text-[var(--ink-3)]">nu</span>}
                  </span>
                  <span className="block text-xs">{k.beschrijving}</span>
                  <span className="block font-mono text-xs tabular-nums text-[var(--ink)]">{k.uitkomst}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
      </section>
    </>
  )
}

function VoorWieWil({ progress }: { progress: PlanReviewProgress }) {
  return (
    <article className="space-y-4 text-sm leading-relaxed text-[var(--ink-2)]">
      <header>
        <Kicker>
          {progress.bevestigd} van {progress.totaal} stappen bevestigd
        </Kicker>
        <h4 className="mt-1 font-serif text-xl text-[var(--ink)]">Voor wie wil</h4>
      </header>
      <p>
        {progress.voltooid
          ? 'Je hebt alle keuzes van je plan nagelopen. '
          : 'Stappen die je oversloeg blijven open; je kunt ze later afmaken via de Voorkeuren-kaart. '}
        Wie verder wil kijken, vindt de aannames onder je plan op deze plekken. De review past ze niet aan.
      </p>
      <ul className="divide-y divide-[var(--border-ed)] border-y border-[var(--border-ed)]">
        {PLAN_REVIEW_LAAG2.map((l) => (
          <li key={l.label} className="py-2">
            <Link href={l.href} className="font-semibold text-[var(--ink)] hover:underline">
              {l.label}
            </Link>
            <p className="text-xs text-[var(--ink-3)]">{l.uitleg}</p>
          </li>
        ))}
      </ul>
    </article>
  )
}
