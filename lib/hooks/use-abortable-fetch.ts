'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * useAbortableFetch — één licht fetch-hulpje met abort-on-unmount.
 *
 * Elke `abortableFetch(...)` krijgt zijn eigen `AbortController`; alle nog-lopende
 * requests worden afgebroken zodra de component unmount. Zo voorkomen we
 * verspilde egress (de server rondt een verzoek af dat niemand meer leest) én
 * setState-na-unmount op de zwaar-genavigeerde routes (holdings, vaste lasten).
 *
 * Bewust NIET combineren met de gedeelde `inflight`-dedupe (use-page-status,
 * use-news-unread): daar delen meerdere mounts één promise, en één `abort()` zou
 * die promise voor de andere mounts breken. Die hooks houden hun eigen
 * `cancelled`-vlag; die dekt correctheid al af (geen setState-na-unmount,
 * out-of-order onderdrukt) — alleen de netwerk-request breken ze niet af.
 *
 * `isMounted()` blijft na afbreken/unmount `false`, zodat callers hun setState
 * kunnen overslaan. Gebruik `isAbortError(e)` om een afgebroken fetch stil te
 * negeren (geen foutmelding tonen).
 */
export function useAbortableFetch() {
  const controllersRef = useRef<Set<AbortController>>(new Set())
  const mountedRef = useRef(true)

  useEffect(() => {
    // (Her)mount — bv. na StrictMode-dubbelmount: markeer weer als gemount.
    mountedRef.current = true
    const controllers = controllersRef.current
    return () => {
      mountedRef.current = false
      for (const controller of controllers) controller.abort()
      controllers.clear()
    }
  }, [])

  const abortableFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const controller = new AbortController()
      controllersRef.current.add(controller)
      try {
        return await fetch(input, { ...init, signal: controller.signal })
      } finally {
        controllersRef.current.delete(controller)
      }
    },
    [],
  )

  const isMounted = useCallback(() => mountedRef.current, [])

  return { abortableFetch, isMounted }
}

/** True als `e` een afgebroken fetch is (abort-on-unmount / abort-on-refetch). */
export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}
