'use client'

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useChatContext } from '@/components/app/chat/chat-provider'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useIsLgUp } from '@/lib/hooks/use-media-query'
import {
  RONDLEIDING_COACHMARK_ID,
  RONDLEIDING_QUERY_PARAM,
  RONDLEIDING_ROUTE,
  clearRondleidingRequest,
  setRondleidingActive,
  useRondleidingRequested,
} from '@/lib/rondleiding/signal'
import type { RondleidingSeed } from '@/lib/rondleiding/seed'
import {
  resolveRondleidingStappen,
  type RondleidingData,
  type RondleidingPlatform,
} from '@/lib/rondleiding/steps'
import { RondleidingOverlay } from './rondleiding-overlay'

/**
 * RondleidingProvider — de motor achter de rondleiding op /overzicht
 * (ADR 0130, fase 3b).
 *
 * ══ Wat hij doet ══════════════════════════════════════════════════════════
 *
 *  - **Houdt de data bij elkaar.** Blok 1 van /overzicht levert de cijfers als
 *    prop; de vrijheidsleeftijd komt uit het GESTREAMDE blok 2 en meldt zich
 *    later aan via `<RondleidingDataSeed>` (patroon van `<PageStatusSeed>`).
 *    Geen extra fetch, geen herberekening — de rondleiding leest wat de pagina
 *    toch al laadt.
 *  - **Beslist wanneer hij start.** Automatisch alleen bij een vers account
 *    (`pending && !seen`), ~400 ms na mount en pas als het eerste doelwit in de
 *    DOM staat. Handmatig via het signaal (gidsweergave in Fin, pagina-`i`) of
 *    via `?rondleiding=start` bij een herstart vanaf een andere route.
 *  - **Schrijft de afloop weg.** Precies één `PUT /api/coachmark` per sessie,
 *    `keepalive` en fire-and-forget: `voltooid`, `overgeslagen` of
 *    `onderbroken`. Die uitkomst labelt later de knop in de gidsweergave.
 *
 * ══ Waarom géén query-param voor de eerste start ═════════════════════════
 *
 * Een query-param overleeft geen reload en lekt in bladwijzers en gedeelde
 * links. De eerste start hangt daarom aan server-state
 * (`module_guide_state['rondleiding:pending']`, gezet in dezelfde update als
 * `onboarding_completed`). De param bestaat alléén voor een herstart vanaf een
 * andere route, wordt één keer gelezen en meteen gestript.
 *
 * ══ Reload mid-tour start 'm opnieuw ═════════════════════════════════════
 *
 * Bewust: de status wordt pas ná afloop geschreven. Wie halverwege ververst,
 * is nog steeds de nieuwe gebruiker die de rondleiding niet af heeft.
 */

// ── Seed-kanaal voor blok 2 ────────────────────────────────────────────────

type VrijheidSeed = NonNullable<RondleidingData['vrijheid']>

const VrijheidSeedContext = createContext<((seed: VrijheidSeed) => void) | null>(null)

/**
 * RondleidingDataSeed — onzichtbaar component dat de vrijheidsleeftijd uit het
 * gestreamde blok 2 bij de provider registreert. Rendert `null`.
 *
 * Zonder dit kanaal zou de grafiekstap zijn duidingszin missen (die leeft in
 * `resolveFreedomAgeView`, achter `loadDashboardData`) of zou blok 1 op die
 * zware loader moeten wachten — precies wat de streaming-opzet van /overzicht
 * vermijdt. Komt de seed niet op tijd, dan laat de kaart de zin gewoon weg.
 */
export function RondleidingDataSeed({ vrijheid }: { vrijheid: VrijheidSeed }) {
  const registreer = useContext(VrijheidSeedContext)
  const { fireAgeDisplay, framing, dataIssue, ankerReach, ankerStop } = vrijheid
  useEffect(() => {
    registreer?.({ fireAgeDisplay, framing, dataIssue, ankerReach, ankerStop })
  }, [registreer, fireAgeDisplay, framing, dataIssue, ankerReach, ankerStop])
  return null
}

// ── Provider ───────────────────────────────────────────────────────────────

/** Wachttijd ná mount vóór de automatische start. */
const AUTOSTART_MS = 400
/** Selector die er moet staan voordat de rondleiding zichzelf opent. */
const EERSTE_TARGET = '[data-tour="hefboom-bezittingen"]'
/** Hoe lang de autostart op dat element wacht voordat hij het opgeeft. */
const AUTOSTART_MAX_MS = 4000
/** Duur van de slotanimatie (kaart glijdt naar Fins knop). */
const AFSCHEID_MS = 400

type Uitkomst = 'voltooid' | 'overgeslagen' | 'onderbroken'

export function RondleidingProvider({
  seed,
  data,
  children,
}: {
  seed: RondleidingSeed
  data: Omit<RondleidingData, 'vrijheid'>
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { openGids } = useChatContext()
  const { masked } = useMaskedAmounts()
  const isLgUp = useIsLgUp()
  const platform: RondleidingPlatform = isLgUp ? 'desktop' : 'mobiel'

  const [vrijheid, setVrijheid] = useState<VrijheidSeed | null>(null)
  const registreerVrijheid = useCallback((s: VrijheidSeed) => setVrijheid(s), [])

  const [index, setIndex] = useState<number | null>(null)
  const [afscheid, setAfscheid] = useState(false)
  const actief = index != null

  // Al gestart in deze sessie? Voorkomt dat de autostart opnieuw vuurt nadat de
  // gebruiker 'm heeft overgeslagen (de server-seed is dan nog `pending`).
  const gestartRef = useRef(false)
  const gemeldRef = useRef(false)
  const actiefRef = useRef(false)
  useEffect(() => {
    actiefRef.current = actief
  }, [actief])

  const stappen = useMemo(() => resolveRondleidingStappen(platform), [platform])

  // ── Het signaal naar Fin ─────────────────────────────────────────────────
  useEffect(() => {
    setRondleidingActive(actief)
    return () => setRondleidingActive(false)
  }, [actief])

  // ── Afloop wegschrijven ──────────────────────────────────────────────────
  //
  // Eén PUT per sessie: bij een `onderbroken` die door een klik op een tegel
  // wordt veroorzaakt, vertrekt het verzoek terwijl de pagina al navigeert —
  // vandaar `keepalive`. Fire-and-forget: mislukt hij, dan verschijnt de
  // rondleiding hoogstens nog één keer, en dat is minder erg dan een
  // navigatie die op een fetch wacht.
  const meldAfloop = useCallback((outcome: Uitkomst) => {
    if (gemeldRef.current) return
    gemeldRef.current = true
    try {
      void fetch('/api/coachmark', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: RONDLEIDING_COACHMARK_ID, outcome }),
        keepalive: true,
      }).catch(() => {})
    } catch {
      /* nooit de UI ophouden voor een statusschrijf */
    }
  }, [])

  const start = useCallback(() => {
    if (gestartRef.current) return
    gestartRef.current = true
    setAfscheid(false)
    setIndex(0)
  }, [])

  const beeindig = useCallback(
    (outcome: Uitkomst, opties: { metAfscheid?: boolean; daarna?: () => void } = {}) => {
      if (!actiefRef.current) return
      meldAfloop(outcome)
      const reduced =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (opties.metAfscheid && !reduced) {
        setAfscheid(true)
        window.setTimeout(() => {
          setIndex(null)
          setAfscheid(false)
          opties.daarna?.()
        }, AFSCHEID_MS)
        return
      }
      setIndex(null)
      setAfscheid(false)
      opties.daarna?.()
    },
    [meldAfloop],
  )

  // ── Autostart (alleen een vers account) ──────────────────────────────────
  useEffect(() => {
    if (!seed.pending || seed.seen || gestartRef.current) return
    let opgegeven = false
    const begonnen = Date.now()
    let timer: ReturnType<typeof setTimeout>

    const probeer = () => {
      if (opgegeven) return
      if (document.querySelector(EERSTE_TARGET)) {
        start()
        return
      }
      if (Date.now() - begonnen > AUTOSTART_MAX_MS) return
      timer = setTimeout(probeer, 200)
    }

    timer = setTimeout(probeer, AUTOSTART_MS)
    return () => {
      opgegeven = true
      clearTimeout(timer)
    }
  }, [seed.pending, seed.seen, start])

  // ── Handmatige start via het signaal (gidsweergave in Fin, pagina-`i`) ────
  const verzocht = useRondleidingRequested()
  useEffect(() => {
    if (!verzocht) return
    clearRondleidingRequest()
    // Een herstart mag altijd — ook als de tour deze sessie al liep.
    gestartRef.current = false
    gemeldRef.current = false
    start()
  }, [verzocht, start])

  // ── Route-wissel → onderbroken ───────────────────────────────────────────
  useEffect(() => {
    if (actief && pathname !== RONDLEIDING_ROUTE) {
      beeindig('onderbroken')
    }
  }, [actief, pathname, beeindig])

  // Unmount (klik op een hefboomtegel navigeert weg) telt óók als onderbreking.
  useEffect(() => {
    return () => {
      if (actiefRef.current) meldAfloop('onderbroken')
    }
  }, [meldAfloop])

  // ── Navigatie binnen de tour ─────────────────────────────────────────────
  const volgende = useCallback(() => {
    setIndex((i) => {
      if (i == null) return i
      if (i >= stappen.length - 1) return i
      return i + 1
    })
  }, [stappen.length])

  const vorige = useCallback(() => {
    setIndex((i) => (i == null ? i : Math.max(0, i - 1)))
  }, [])

  const overslaan = useCallback(() => beeindig('overgeslagen'), [beeindig])

  const afronden = useCallback(
    (metGids: boolean) =>
      beeindig('voltooid', {
        metAfscheid: true,
        daarna: metGids ? openGids : undefined,
      }),
    [beeindig, openGids],
  )

  // Een ontbrekend doelwit slaat de stap over; is het de laatste, dan is de
  // rondleiding daarmee klaar (niet "overgeslagen" — hij is uitgelopen).
  const targetOntbreekt = useCallback(() => {
    setIndex((i) => {
      if (i == null) return i
      if (i >= stappen.length - 1) {
        // Buiten de updater afronden zou een setState-in-render geven; de
        // microtask houdt 'm netjes ná de commit.
        queueMicrotask(() => beeindig('voltooid'))
        return i
      }
      return i + 1
    })
  }, [stappen.length, beeindig])

  const volledigeData: RondleidingData = useMemo(
    () => ({ ...data, vrijheid }),
    [data, vrijheid],
  )

  // Geklemd op de laatste stap: wisselt het platform mid-tour (venster over de
  // lg-grens gesleept), dan heeft mobiel één stap minder dan desktop en zou
  // index 8 in het niets wijzen — de tour bleef dan 'actief' zonder kaart, en
  // Fin zweeg voorgoed. Op de laatste stap blijven staan is het eerlijke antwoord.
  const stapIndex = index != null ? Math.min(index, stappen.length - 1) : null
  const stap = stapIndex != null ? stappen[stapIndex] : null
  const body = stap ? stap.body(volledigeData, { platform, masked }) : null

  return (
    <VrijheidSeedContext.Provider value={registreerVrijheid}>
      {children}
      <Suspense fallback={null}>
        <RondleidingQueryStart onStart={start} router={router} pathname={pathname} />
      </Suspense>
      {stap && body && stapIndex != null && (
        <RondleidingOverlay
          stap={stap}
          body={body}
          index={stapIndex}
          totaal={stappen.length}
          platform={platform}
          afscheid={afscheid}
          onVorige={vorige}
          onVolgende={stapIndex >= stappen.length - 1 ? () => afronden(false) : volgende}
          onOverslaan={overslaan}
          onEersteStap={() => afronden(true)}
          onRondkijken={() => afronden(false)}
          onStart={volgende}
          onTargetOntbreekt={targetOntbreekt}
        />
      )}
    </VrijheidSeedContext.Provider>
  )
}

/**
 * Leest `?rondleiding=start` één keer en strípt 'm meteen. In een eigen
 * `<Suspense>`-grens omdat `useSearchParams()` de hele boom eronder anders
 * client-side laat renderen (Next 16) — hier is dat één `null`-renderend
 * component.
 */
function RondleidingQueryStart({
  onStart,
  router,
  pathname,
}: {
  onStart: () => void
  router: ReturnType<typeof useRouter>
  pathname: string
}) {
  const params = useSearchParams()
  const waarde = params.get(RONDLEIDING_QUERY_PARAM)

  useEffect(() => {
    if (waarde !== 'start') return
    const rest = new URLSearchParams(params.toString())
    rest.delete(RONDLEIDING_QUERY_PARAM)
    const query = rest.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    onStart()
  }, [waarde, params, router, pathname, onStart])

  return null
}
