'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  countScreenProgress,
  getVisibleScreens,
  type GuideDerivedStates,
  type WelcomeGuideConfig,
  type WelcomeGuideState,
} from '@/lib/welcome-guide'

/**
 * WelcomeGuideProvider — de gedeelde bron voor de welkomstgids.
 *
 * ── Waarom een provider, en waarom hier ─────────────────────────────────────
 * De gids woonde tot ADR 0130 als banner op /overzicht, met een geminimaliseerd
 * punt naast de pagina-'i'. Sinds dat besluit heeft hij één thuis: de
 * GIDSWEERGAVE IN FIN — een vierde icoon in de chat-kop, naar analogie van de
 * meldmodus. /overzicht opent daarmee weer met de begroeting en de cijfers, en
 * de takenlijst staat waar de hulp woont.
 *
 * De provider mount daarom in `app/(app)/layout.tsx` (binnen `FinSlotProvider`,
 * om het app-root-div), zodat zowel `ChatPanelLazy` (de gidsweergave) als
 * `FinHome` (fase 2: de proactieve gids-bubbel) dezelfde bron delen. Eén
 * fetch-pad, geen tweede databron.
 *
 * ── Drie zichtbare toestanden ───────────────────────────────────────────────
 *  - 'available' — er is een gids met minstens één zichtbaar scherm. Het
 *    gids-icoon staat in de chat-kop; de weergave toont de schermen.
 *  - 'dismissed' — de gebruiker is klaar met de gids (`dismissForever`). Het
 *    icoon blijft staan, maar de weergave toont de lege staat met één knop:
 *    "Gids opnieuw tonen" (`reactivate`). Voorheen was dit een eenrichtings-
 *    uitgang; met een eigen weergave in Fin is er een natuurlijke terugweg.
 *  - 'none' — er valt niets te tonen (gids uit voor iedereen, of geen zichtbaar
 *    scherm). Dan verschijnt ook het icoon niet.
 *
 * `minimize`/`restore` bestaan hier NIET meer: minimaliseren was de uitgang van
 * de banner naar het punt, en beide zijn weg. Het jsonb-veld `minimized` blijft
 * in de server-state staan (de route kent de acties nog) maar wordt genegeerd.
 *
 * ── Server-seed ─────────────────────────────────────────────────────────────
 * De layout laadt de payload al server-side (`loadWelcomeGuideSeed`) en geeft
 * 'm als `seed` mee; dan vervalt de eerste client-fetch. Is de gids afgesloten,
 * dan laadt de layout geen seed maar zet hij `dismissed` — de lege staat heeft
 * geen config nodig, dus dat scheelt een query én een fetch. Zonder seed én
 * zonder dat vlaggetje fetcht de provider zelf `/api/welcome-guide` (de
 * fallback als de seed-query faalt). De route blijft het enige mutatie- en
 * her-fetch-pad; de seed is een voorsprong, geen tweede databron.
 */

export type WelcomeGuidePayload = {
  config: WelcomeGuideConfig
  state: WelcomeGuideState
  /**
   * Wat de app al wéét (M1): stap-id → 'done' | 'open' | 'nvt', server-side
   * afgeleid uit de accountstatus. Ontbreekt bij een oudere payload → de gids
   * gedraagt zich exact als voorheen (alles handmatig).
   */
  derived?: GuideDerivedStates
}

/** 'available' = gids te tonen · 'dismissed' = afgesloten, heropenbaar · 'none' = niets. */
export type WelcomeGuideDisplay = 'available' | 'dismissed' | 'none'

interface WelcomeGuideContextValue {
  /** De payload, of `null` zolang er niets (meer) te tonen is. */
  data: WelcomeGuidePayload | null
  display: WelcomeGuideDisplay
  /** Optimistische mutatie + server-sync via PUT /api/welcome-guide. */
  mutate: (
    body: Record<string, unknown>,
    optimistic: (prev: WelcomeGuideState) => WelcomeGuideState,
  ) => void
  /** Verse payload ophalen (GET). De gidsweergave doet dit bij openen. */
  refresh: () => void
  /** Klaar met de gids — de weergave valt terug op de lege staat. */
  dismissForever: () => void
  /** Vanuit de lege staat de gids weer aanzetten. */
  reactivate: () => void
}

const NULL_CONTEXT: WelcomeGuideContextValue = {
  data: null,
  display: 'none',
  mutate: () => {},
  refresh: () => {},
  dismissForever: () => {},
  reactivate: () => {},
}

const WelcomeGuideContext = createContext<WelcomeGuideContextValue | null>(null)

/**
 * Veilig buiten de provider: geeft een null-ish default terug zodat een
 * consument die per ongeluk zonder provider mount niets rendert i.p.v. crasht.
 */
export function useWelcomeGuide(): WelcomeGuideContextValue {
  return useContext(WelcomeGuideContext) ?? NULL_CONTEXT
}

/**
 * Aantal nog OPEN stappen over alle zichtbare schermen — de "N" in de
 * kop-subtitel "Welkomstgids · N open". Telt via de canonieke helpers uit
 * `lib/welcome-guide.ts`, zodat afgeleide vinkjes (M1) meetellen en
 * niet-van-toepassing-stappen buiten de noemer vallen. Bewust hier en niet in
 * de chat-kop: één definitie, ook voor latere consumenten.
 */
export function countOpenGuideSteps(data: WelcomeGuidePayload | null): number {
  if (!data) return 0
  return getVisibleScreens(data.config, data.state).reduce((sum, screen) => {
    const progress = countScreenProgress(screen, data.state.completedStepIds, data.derived)
    return sum + Math.max(0, progress.total - progress.done)
  }, 0)
}

export function WelcomeGuideProvider({
  seed,
  dismissed: initialDismissed = false,
  children,
}: {
  seed?: WelcomeGuidePayload | null
  /**
   * De gids is al afgesloten (server-side gelezen uit
   * `profiles.module_guide_state['welcome:guide'].status`). Dan laadt de layout
   * geen seed en fetcht de provider ook niet: de lege staat spreekt voor zich.
   */
  dismissed?: boolean
  children: React.ReactNode
}) {
  const [data, setData] = useState<WelcomeGuidePayload | null>(null)
  const [dismissed, setDismissed] = useState(initialDismissed)
  /** Gids staat voor iedereen uit, of de payload kwam niet binnen. */
  const [unavailable, setUnavailable] = useState(false)

  const applyPayload = useCallback((d: WelcomeGuidePayload) => {
    if (!d.config?.enabled) {
      setUnavailable(true)
      return
    }
    setUnavailable(false)
    setData(d)
    setDismissed(d.state?.status === 'dismissed')
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/welcome-guide')
      if (!res.ok) return
      const d = (await res.json()) as WelcomeGuidePayload | null
      if (d) applyPayload(d)
    } catch {
      /* stil: de bestaande staat blijft staan */
    }
  }, [applyPayload])

  // ── Mount: server-seed gebruiken (geen fetch), of zelf ophalen.
  // Alleen de `cancelled`-flag gebruiken (geen fetchedRef-guard) zodat de dubbele
  // StrictMode-mount in dev de tweede fetch gewoon laat winnen — setState gebeurt
  // enkel async in callbacks. ──
  useEffect(() => {
    if (seed) {
      applyPayload(seed)
      return
    }
    // Afgesloten gids: niets te laden. De lege staat heeft geen config nodig en
    // een fetch per harde shell-render voor wie de gids niet meer gebruikt is
    // precies het verkeer dat ADR 0130 wilde besparen.
    if (initialDismissed) return
    let cancelled = false
    fetch('/api/welcome-guide')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WelcomeGuidePayload | null) => {
        if (cancelled || !d) return
        applyPayload(d)
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true)
      })
    return () => {
      cancelled = true
    }
  }, [seed, initialDismissed, applyPayload])

  const mutate = useCallback(
    (
      body: Record<string, unknown>,
      optimistic: (prev: WelcomeGuideState) => WelcomeGuideState,
    ) => {
      setData((prev) => (prev ? { ...prev, state: optimistic(prev.state) } : prev))
      void (async () => {
        try {
          const res = await fetch('/api/welcome-guide', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          if (res.ok) {
            const json = (await res.json()) as { state: WelcomeGuideState }
            setData((prev) => (prev ? { ...prev, state: json.state } : prev))
          }
        } catch {
          /* stil: optimistische staat blijft staan; volgende load corrigeert */
        }
      })()
    },
    [],
  )

  const refresh = useCallback(() => {
    void load()
  }, [load])

  const dismissForever = useCallback(() => {
    setDismissed(true)
    mutate({ action: 'dismiss' }, (s) => ({ ...s, status: 'dismissed' }))
  }, [mutate])

  const reactivate = useCallback(() => {
    setDismissed(false)
    setUnavailable(false)
    void (async () => {
      try {
        const res = await fetch('/api/welcome-guide', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reactivate' }),
        })
        if (!res.ok) return
      } catch {
        return
      }
      // Wie de gids ooit afsloot heeft mogelijk nooit een payload gehad (de
      // layout seedt die dan niet) — dus ná de PUT altijd één verse GET.
      await load()
    })()
  }, [load])

  const display: WelcomeGuideDisplay = useMemo(() => {
    // Gids staat voor iedereen uit → ook de lege staat heeft geen zin.
    if (unavailable) return 'none'
    if (dismissed) return 'dismissed'
    if (!data) return 'none'
    // Geen zichtbaar scherm → ook geen icoon. Anders opent de gebruiker een
    // weergave waar niets in staat.
    if (getVisibleScreens(data.config, data.state).length === 0) return 'none'
    return 'available'
  }, [dismissed, unavailable, data])

  const value = useMemo<WelcomeGuideContextValue>(
    () => ({ data, display, mutate, refresh, dismissForever, reactivate }),
    [data, display, mutate, refresh, dismissForever, reactivate],
  )

  return <WelcomeGuideContext.Provider value={value}>{children}</WelcomeGuideContext.Provider>
}
