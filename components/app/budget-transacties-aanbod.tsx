'use client'

/**
 * BudgetTransactiesAanbod — het eenmalige aanbod op /overzicht/budget om je
 * transacties te categoriseren (ADR 0158).
 *
 * WOORDKEUZE (B-059). De handeling heet app-breed **categoriseren**; het
 * resultaat is **gecategoriseerd** en het restant **zonder categorie**. Het
 * woord "koppelen" is gereserveerd voor verbindingen naar buiten (bank,
 * broker, rekening) of tussen objecten (hypotheek↔woning, budget↔spaardoel).
 * Op déze pagina stond het er allebei — naast de buurman "Bank koppelen" — en
 * dat was precies de dubbelzinnigheid die een testgebruiker meldde. Interne
 * namen (de coachmark-id hieronder, `onKoppelen`) dragen nog de oude term; zie
 * daar waarom.
 *
 * WANNEER. Bij de eerste keer dat iemand de hefboom Budget opent én er staan
 * daadwerkelijk transacties zónder categorie. Dat tweede is de hele poort: wie
 * niets te categoriseren heeft krijgt niets te zien. Een popup die uitlegt wat
 * je kunt doen terwijl er niets te doen valt is ruis — zeker vlak na de
 * rondleiding.
 *
 * NIET TE VERWARREN MET `BudgetKoppelNudge`. Die buurman op dezelfde pagina
 * dekt de tegenovergestelde toestand: nul transacties, dus "koppel een bank of
 * importeer een bestand". Daar is "koppelen" wél het juiste woord. Ze sluiten
 * elkaar per constructie uit — zijn voorwaarde eist 0 transacties, deze eist er
 * minstens één zonder categorie.
 *
 * WAAROM EEN COACHMARK EN GEEN FEATURE-VISIT. De buurman gebruikt
 * `user_feature_visits`, maar die vorm vraagt een server-afgeleide
 * zichtbaarheid en dus een extra telling in de loader. Het aantal
 * ongecategoriseerde transacties heeft `BudgetsClient` al in handen; de
 * coachmark-route is
 * precies gebouwd voor "verschijnt exact één keer, cross-device" en levert
 * bovendien een uitkomst. `euro-view-badge.tsx` is het precedent voor deze
 * client-side leesronde.
 *
 * WAAROM DE ZICHTBAARHEID LATCHT. De overlay claimt via BottomSheet zelf het
 * overlay-signaal, dat `useAttentionQuiet` meeweegt. Zonder latch zou hij zich
 * dus onmiddellijk na het openen zelf weer stilleggen. `quiet` bewaakt daarom
 * alleen het OPENINGSMOMENT; daarna houdt `open` hem staan tot de keuze.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { useAttentionQuiet } from '@/lib/hooks/use-attention-quiet'

/**
 * Opgeslagen sleutel op de profielrij én lid van de dichte allowlist
 * `COACHMARK_IDS` in `app/api/coachmark/route.ts`. Draagt bewust nog de oude
 * term: hernoemen zou het aanbod opnieuw laten verschijnen bij iedereen die 'm
 * al had weggeklikt (B-059 — kopij hernoemd, sleutel niet).
 */
export const BUDGET_KOPPEL_COACHMARK_ID = 'budget-transacties-koppelen'

/**
 * `loading` — server-antwoord nog onbekend · `pending` — nog niet gezien (mag
 * verschijnen zodra het stil is) · `done` — keuze gemaakt en weggeschreven.
 */
type AanbodState = 'loading' | 'pending' | 'done'

export interface BudgetTransactiesAanbodProps {
  /**
   * Aantal transacties over álle tijden zonder categorie. `null` zolang de
   * telling laadt — dan gebeurt er niets, zodat het aanbod nooit met een leeg
   * of verkeerd aantal opent.
   */
  ongekoppeld: number | null
  /** Opent de bestaande categoriseerflow (AICategorizeSheet). */
  onKoppelen: () => void
}

export function BudgetTransactiesAanbod({
  ongekoppeld,
  onKoppelen,
}: BudgetTransactiesAanbodProps) {
  const [state, setState] = useState<AanbodState>('loading')
  const [open, setOpen] = useState(false)
  const quiet = useAttentionQuiet()

  const teKoppelen = ongekoppeld != null && ongekoppeld > 0

  // Staat ophalen — pas als er iets te categoriseren valt én het stil is. Geen
  // netwerkverkeer zonder zichtbaarheid (dezelfde M15-regel als de euro-view-
  // coachmark). Bij een fout: behandelen als "al gezien", zodat een hapering
  // het aanbod niet bij elk bezoek opnieuw laat opduiken.
  useEffect(() => {
    if (!teKoppelen || quiet || state !== 'loading') return
    let alive = true
    void fetch('/api/coachmark')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => json?.dismissed?.[BUDGET_KOPPEL_COACHMARK_ID] !== false)
      .catch(() => true)
      .then((gezien) => {
        if (alive) setState(gezien ? 'done' : 'pending')
      })
    return () => {
      alive = false
    }
  }, [teKoppelen, quiet, state])

  // Openen: één keer, zodra het stil is. Daarna latcht `open` (zie kop).
  //
  // `teKoppelen` hoort hier expliciet bij, niet alleen bij de leesronde
  // hierboven. Zonder die tweede toets kan dit gebeuren: de coachmark-GET lost
  // op terwijl het stil is (`state` wordt 'pending'), de gebruiker opent zelf
  // de categoriseerflow (`quiet` waar, dus nog niet openen), categoriseert
  // alles weg, en ná het sluiten van die sheet vuurt dit effect alsnog — met
  // een popup die "Er staan 0 transacties zonder categorie" zegt, vlak nadat
  // hij klaar was.
  const geopendRef = useRef(false)
  const [ooitGeopend, setOoitGeopend] = useState(false)
  // Het getoonde aantal wordt bij het openen BEVROREN. Anders zou de tekst
  // tijdens de sluitanimatie nog naar een bijgewerkt (of nul) aantal springen.
  const [getoondAantal, setGetoondAantal] = useState(0)
  useEffect(() => {
    if (!teKoppelen || state !== 'pending' || quiet || geopendRef.current) return
    geopendRef.current = true
    setGetoondAantal(ongekoppeld ?? 0)
    setOoitGeopend(true)
    setOpen(true)
  }, [teKoppelen, state, quiet, ongekoppeld])

  // Valt het aantal alsnog naar nul terwijl hij openstaat (de gebruiker
  // categoriseerde ze elders), dan verdwijnt het aanbod zonder de keuze weg te
  // schrijven: er ís niets meer te kiezen.
  useEffect(() => {
    if (open && ongekoppeld === 0) setOpen(false)
  }, [open, ongekoppeld])

  const sluit = useCallback(
    (outcome: 'voltooid' | 'overgeslagen') => {
      setOpen(false)
      setState('done')
      void fetch('/api/coachmark', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: BUDGET_KOPPEL_COACHMARK_ID, outcome }),
        keepalive: true,
      }).catch(() => {
        // Stil falen: het aanbod is deze sessie hoe dan ook weg. Komt het door
        // een mislukte schrijfactie één keer terug, dan is dat hinderlijk maar
        // niet schadelijk — een blokkerende foutmelding zou dat wél zijn.
      })
    },
    [],
  )

  const nu = useCallback(() => {
    sluit('voltooid')
    onKoppelen()
  }, [sluit, onKoppelen])

  const later = useCallback(() => sluit('overgeslagen'), [sluit])

  // Bewust GEEN `if (!open) return null`. Die kortsluiting zou de overlay
  // meteen unmounten en daarmee de sluitanimatie van BottomSheet overslaan —
  // en juist "Nu categoriseren" heeft die animatie nodig: de `AICategorizeSheet`
  // wordt lazy geladen en is op dat moment nog nooit opgehaald, dus zonder de
  // uitloop kijkt de gebruiker op een trage verbinding eerst een paar honderd
  // milliseconden naar een kale budgetpagina. Vóór de eerste opening rendert
  // hij wél niets.
  if (!ooitGeopend) return null

  const aantal = getoondAantal

  return (
    <ShellOverlay
      open={open}
      onClose={later}
      kind="sheet"
      size="sm"
      title="Je transacties categoriseren"
      footer={
        <ModalFooter
          align="end"
          primary={{ label: 'Nu categoriseren', onClick: nu }}
          secondary={{ label: 'Later', onClick: later }}
        />
      }
    >
      <div className="space-y-3 p-6 font-sans text-sm leading-relaxed text-[var(--ink-2)]">
        <p>
          Er {aantal === 1 ? 'staat' : 'staan'}{' '}
          <strong className="font-mono font-semibold tabular-nums text-[var(--ink)]">
            {aantal}
          </strong>{' '}
          {aantal === 1 ? 'transactie' : 'transacties'} zonder categorie. De rest kreeg er
          automatisch een.
        </p>
        <p>
          Categoriseren is elke transactie bij het juiste budget zetten. Daarmee zie je per
          budget wat erin en eruit gaat — waar je geld binnenkomt, waar het heen gaat en
          hoeveel vrijheid dat kost. Een transactie zonder categorie telt nergens mee.
        </p>
        <p className="text-[var(--ink-3)]">
          Liever later? Geen probleem. De knop{' '}
          <span className="whitespace-nowrap font-medium text-[var(--ink-2)]">
            Transacties categoriseren
          </span>{' '}
          staat altijd boven je budgetten.
        </p>
      </div>
    </ShellOverlay>
  )
}
