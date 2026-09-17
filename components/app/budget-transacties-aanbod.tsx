'use client'

/**
 * BudgetTransactiesAanbod — het eenmalige aanbod op /overzicht/budget om je
 * transacties aan budgetten te koppelen (ADR 0158).
 *
 * WANNEER. Bij de eerste keer dat iemand de hefboom Budget opent én er staan
 * daadwerkelijk transacties zónder budget. Dat tweede is de hele poort: wie
 * niets te koppelen heeft krijgt niets te zien. Een popup die uitlegt wat je
 * kunt doen terwijl er niets te doen valt is ruis — zeker vlak na de
 * rondleiding.
 *
 * NIET TE VERWARREN MET `BudgetKoppelNudge`. Die buurman op dezelfde pagina
 * dekt de tegenovergestelde toestand: nul transacties, dus "koppel een bank of
 * importeer een bestand". Ze sluiten elkaar per constructie uit — zijn
 * voorwaarde eist 0 transacties, deze eist er minstens één zonder budget.
 *
 * WAAROM EEN COACHMARK EN GEEN FEATURE-VISIT. De buurman gebruikt
 * `user_feature_visits`, maar die vorm vraagt een server-afgeleide
 * zichtbaarheid en dus een extra telling in de loader. Het aantal ongekoppelde
 * transacties heeft `BudgetsClient` al in handen; de coachmark-route is
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

export const BUDGET_KOPPEL_COACHMARK_ID = 'budget-transacties-koppelen'

/**
 * `loading` — server-antwoord nog onbekend · `pending` — nog niet gezien (mag
 * verschijnen zodra het stil is) · `done` — keuze gemaakt en weggeschreven.
 */
type AanbodState = 'loading' | 'pending' | 'done'

export interface BudgetTransactiesAanbodProps {
  /**
   * Aantal transacties over álle tijden zonder budget. `null` zolang de
   * telling laadt — dan gebeurt er niets, zodat het aanbod nooit met een leeg
   * of verkeerd aantal opent.
   */
  ongekoppeld: number | null
  /** Opent de bestaande koppelflow (AICategorizeSheet). */
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

  // Staat ophalen — pas als er iets te koppelen valt én het stil is. Geen
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
  // de koppelflow (`quiet` waar, dus nog niet openen), koppelt alles weg, en
  // ná het sluiten van die sheet vuurt dit effect alsnog — met een popup die
  // "Er staan 0 transacties zonder budget" zegt, vlak nadat hij klaar was.
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
  // koppelde ze elders weg), dan verdwijnt het aanbod zonder de keuze weg te
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
  // en juist "Nu koppelen" heeft die animatie nodig: de `AICategorizeSheet`
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
      title="Je uitgaven aan je budget hangen"
      footer={
        <ModalFooter
          align="end"
          primary={{ label: 'Nu koppelen', onClick: nu }}
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
          {aantal === 1 ? 'transactie' : 'transacties'} zonder budget. De rest kreeg er
          automatisch een.
        </p>
        <p>
          Een budget vult zich pas als je uitgaven eraan hangen. Zolang dat niet is gebeurd,
          zie je niet waar je geld heen gaat — en dus ook niet hoeveel vrijheid het je kost.
        </p>
        <p className="text-[var(--ink-3)]">
          Liever later? Geen probleem. De knop{' '}
          <span className="whitespace-nowrap font-medium text-[var(--ink-2)]">
            Transacties koppelen
          </span>{' '}
          staat altijd boven je budgetten.
        </p>
      </div>
    </ShellOverlay>
  )
}
