'use client'

/**
 * Weergavenaam voor grenzenpotten — "Grenzenpot" (default) ⇄ "Schaamtepot".
 *
 * Eén profiel-brede voorkeur die uitsluitend de NAAM van het concept bepaalt.
 * Er verandert niets aan data, regels, berekeningen of historische periodes
 * (ADR 0089 besluit 1) — de teksten zelf staan in `lib/spend-limits/copy.ts`.
 *
 * SINGLE SOURCE OF TRUTH: elk reactief oppervlak leest `useSpendLimitCopy()`.
 * Server-samengestelde tekst (meldingen) roept `spendLimitCopy(alias)` aan met
 * de alias die op generatiemoment uit `profiles` is gelezen — een latere wissel
 * herschrijft de historie niet.
 *
 * Cross-device, server-side: de voorkeur staat op `profiles.spend_limit_alias`
 * en de provider wordt met `initialAlias` uit een SERVER-PROP geseed (zie
 * app/(app)/layout.tsx) zodat SSR en eerste client-render meteen kloppen.
 *
 * Persistentie = euro-view-stijl: optimistisch state zetten, dan een
 * fire-and-forget PUT naar /api/spend-limit-alias; bij een niet-ok response (of
 * netwerkfout) rolt de state terug naar de vorige waarde.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  DEFAULT_SPEND_LIMIT_ALIAS,
  spendLimitCopy,
  type SpendLimitAlias,
  type SpendLimitCopy,
} from '@/lib/spend-limits/copy'

export type { SpendLimitAlias }

interface SpendLimitAliasContextValue {
  /** Huidige profiel-brede weergavenaam. */
  alias: SpendLimitAlias
  /** Zet een alias (optimistisch + server-persist met rollback). */
  setAlias: (next: SpendLimitAlias) => void
}

const SpendLimitAliasContext = createContext<SpendLimitAliasContextValue | null>(null)

/**
 * Persisteer de alias naar de eigen profielrij. Fire-and-forget vanuit de
 * caller; geeft `true` bij succes zodat de caller bij falen kan terugrollen.
 */
async function persistAlias(alias: SpendLimitAlias): Promise<boolean> {
  try {
    const res = await fetch('/api/spend-limit-alias', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ alias }),
      keepalive: true,
    })
    return res.ok
  } catch {
    return false
  }
}

export function SpendLimitAliasProvider({
  initialAlias,
  children,
}: {
  initialAlias: SpendLimitAlias
  children: ReactNode
}) {
  // Seed uit de server-prop (NIET altijd-default) zodat SSR == client → geen flash.
  const [alias, setAliasState] = useState<SpendLimitAlias>(initialAlias)

  const setAlias = useCallback((next: SpendLimitAlias) => {
    setAliasState((prev) => {
      if (next === prev) return prev
      // Optimistisch zetten; bij een mislukte PUT terugrollen naar `prev`.
      void persistAlias(next).then((ok) => {
        if (!ok) setAliasState(prev)
      })
      return next
    })
  }, [])

  const value = useMemo<SpendLimitAliasContextValue>(
    () => ({ alias, setAlias }),
    [alias, setAlias],
  )

  return (
    <SpendLimitAliasContext.Provider value={value}>{children}</SpendLimitAliasContext.Provider>
  )
}

// Veilige fallback buiten een provider (unit-tests, storybook, dev-sandboxes):
// de default-alias + een no-op setter, zoals use-euro-view. Dit is bewust óók de
// regressiegarantie: bestaande component-tests draaien zonder provider en zien
// dus exact het huidige beeld.
const FALLBACK_CONTEXT: SpendLimitAliasContextValue = {
  alias: DEFAULT_SPEND_LIMIT_ALIAS,
  setAlias: () => {},
}

/** Access de huidige weergavenaam-keuze. Buiten een provider: de default + no-op. */
export function useSpendLimitAlias(): SpendLimitAliasContextValue {
  return useContext(SpendLimitAliasContext) ?? FALLBACK_CONTEXT
}

/**
 * De teksten die bij de huidige alias horen. Dit is wat UI-oppervlakken lezen —
 * nooit een eigen literal, nooit de niet-reactieve `SPEND_LIMIT_COPY`-constante.
 */
export function useSpendLimitCopy(): SpendLimitCopy {
  const { alias } = useSpendLimitAlias()
  return useMemo(() => spendLimitCopy(alias), [alias])
}
