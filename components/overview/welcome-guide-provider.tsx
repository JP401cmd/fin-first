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
  getVisibleScreens,
  type GuideDerivedStates,
  type WelcomeGuideConfig,
  type WelcomeGuideState,
} from '@/lib/welcome-guide'

/**
 * WelcomeGuideProvider — de gedeelde bron voor de welkomstgids op /overzicht.
 *
 * ── Waarom een provider (S13, optie C) ──────────────────────────────────────
 * De gids volgt sinds 28-08-2026 de MELDINGEN-CONVENTIE uit CLAUDE.md: hij is
 * minimaliseerbaar tot een klein punt naast de pagina-'i' en blijft van daaruit
 * heropenbaar. Die conventie schrijft precies één architectuur voor: ÉÉN bron
 * die de payload ophaalt en zijn staat deelt met zowel de uitgeklapte banner
 * (`WelcomeGuideBanner`) als het geminimaliseerde punt (`WelcomeGuideDot`) —
 * beide pure consumers, géén tweede fetch-pad. Dit bestand is de gids-tweeling
 * van `components/app/page-status-provider.tsx`.
 *
 * De banner en het punt staan in verschillende blokken van /overzicht (de
 * banner in blok 1, ná de begroeting; het punt in de utility-cluster die met
 * blok 2 instroomt). Alleen een gedeelde context kan die twee synchroon houden.
 *
 * ── Wat "minimaliseren" hier betekent ───────────────────────────────────────
 * Drie uitgangen, bewust verschillend van elkaar:
 *  - **minimaliseren** (het kruisje) — de gids klapt in tot het punt. Server-
 *    side onthouden in de bestaande jsonb `profiles.module_guide_state`
 *    (`minimized`), dus cross-device; altijd heropenbaar.
 *  - **heropenen** (klik op het punt) — de gids staat weer uitgeklapt, op het
 *    scherm waar je was.
 *  - **voorgoed verbergen** (`dismiss`) — de gids komt nooit meer terug, ook
 *    het punt niet. Blijft een kleine secundaire link ín de gids (L11).
 *
 * De conventie kent ook "escalatie heropent automatisch". Dat deel is hier
 * bewust NIET van toepassing: de gids draagt geen ernst-niveau (het is geen
 * stoplicht-melding), dus er is niets dat kan verergeren. Dat is dezelfde
 * lezing als `MinimizedLevel = 'info'` in `lib/page-status/display.ts`, waar een
 * informatieve melding ingeklapt blijft tot de gebruiker 'm zelf opent.
 *
 * ── Server-seed ─────────────────────────────────────────────────────────────
 * /overzicht laadt de payload al server-side (`loadWelcomeGuideSeed`) en geeft
 * 'm als `seed` mee; dan vervalt de eerste client-fetch. Zonder seed fetcht de
 * provider zelf `/api/welcome-guide`. De route blijft daarmee het enige
 * mutatie- en her-fetch-pad; de seed is een voorsprong, geen tweede databron.
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

/** 'expanded' = volle gids · 'minimized' = alleen het punt · 'none' = niets. */
export type WelcomeGuideDisplay = 'expanded' | 'minimized' | 'none'

interface WelcomeGuideContextValue {
  /** De payload, of `null` zolang er niets (meer) te tonen is. */
  data: WelcomeGuidePayload | null
  display: WelcomeGuideDisplay
  /** Optimistische mutatie + server-sync via PUT /api/welcome-guide. */
  mutate: (
    body: Record<string, unknown>,
    optimistic: (prev: WelcomeGuideState) => WelcomeGuideState,
  ) => void
  /** Inklappen tot het punt naast de 'i' (cross-device onthouden). */
  minimize: () => void
  /** Weer uitklappen vanaf het punt. */
  restore: () => void
  /** Voorgoed verbergen — ook het punt verdwijnt. */
  dismissForever: () => void
}

const NULL_CONTEXT: WelcomeGuideContextValue = {
  data: null,
  display: 'none',
  mutate: () => {},
  minimize: () => {},
  restore: () => {},
  dismissForever: () => {},
}

const WelcomeGuideContext = createContext<WelcomeGuideContextValue | null>(null)

/**
 * Veilig buiten de provider: geeft een null-ish default terug zodat een banner
 * of punt dat per ongeluk zonder provider mount niets rendert i.p.v. crasht.
 */
export function useWelcomeGuide(): WelcomeGuideContextValue {
  return useContext(WelcomeGuideContext) ?? NULL_CONTEXT
}

export function WelcomeGuideProvider({
  seed,
  children,
}: {
  seed?: WelcomeGuidePayload | null
  children: React.ReactNode
}) {
  const [data, setData] = useState<WelcomeGuidePayload | null>(null)
  const [hidden, setHidden] = useState(false)

  // ── Mount: server-seed gebruiken (geen fetch) of config + staat ophalen.
  // Alleen de `cancelled`-flag gebruiken (geen fetchedRef-guard) zodat de dubbele
  // StrictMode-mount in dev de tweede fetch gewoon laat winnen — setState gebeurt
  // enkel async in callbacks. ──
  useEffect(() => {
    const applyPayload = (d: WelcomeGuidePayload) => {
      if (!d.config?.enabled || d.state?.status === 'dismissed') {
        setHidden(true)
        return
      }
      setData(d)
    }
    if (seed) {
      applyPayload(seed)
      return
    }
    let cancelled = false
    fetch('/api/welcome-guide')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WelcomeGuidePayload | null) => {
        if (cancelled || !d) return
        applyPayload(d)
      })
      .catch(() => {
        if (!cancelled) setHidden(true)
      })
    return () => {
      cancelled = true
    }
  }, [seed])

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

  const minimize = useCallback(
    () => mutate({ action: 'minimize' }, (s) => ({ ...s, minimized: true })),
    [mutate],
  )

  const restore = useCallback(
    () => mutate({ action: 'restore' }, (s) => ({ ...s, minimized: false })),
    [mutate],
  )

  const dismissForever = useCallback(() => {
    setHidden(true)
    mutate({ action: 'dismiss' }, (s) => ({ ...s, status: 'dismissed' }))
  }, [mutate])

  const display: WelcomeGuideDisplay = useMemo(() => {
    if (hidden || !data) return 'none'
    // Geen zichtbaar scherm → ook geen punt. Anders zou de gebruiker op een
    // punt kunnen klikken dat vervolgens niets opent.
    if (getVisibleScreens(data.config, data.state).length === 0) return 'none'
    return data.state.minimized ? 'minimized' : 'expanded'
  }, [hidden, data])

  const value = useMemo<WelcomeGuideContextValue>(
    () => ({ data, display, mutate, minimize, restore, dismissForever }),
    [data, display, mutate, minimize, restore, dismissForever],
  )

  return <WelcomeGuideContext.Provider value={value}>{children}</WelcomeGuideContext.Provider>
}
