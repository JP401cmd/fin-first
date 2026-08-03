'use client'

// ── On-device rapport-inleiding als progressive enhancement ──────────────────
//
// Staat de groep 'rapporten' op lokaal, dan levert `/api/report` het volledige
// rapport ZONDER AI-inleiding (server-side `useAi = false`; zie de privé-modus-
// toelichting in app/api/report/route.ts). Deze hook schrijft die inleiding
// daarna in de browser en geeft 'm terug zodra hij klaar én geverifieerd is.
//
// DRIE HARDE EIGENSCHAPPEN:
//
//  1. FAIL-CLOSED. Er vertrekt nooit iets naar de cloud. In 'resolving' en
//     'blocked' gebeurt er niets; in 'cloud' doet deze hook helemaal niets (de
//     server heeft de inleiding dan al geschreven). We gebruiken bewust
//     `canUseLocal` in plaats van een eigen `=== 'lokaal'`-vergelijking.
//  2. NOOIT DE PAGINA BLOKKEREN. Het rapport is deterministisch en compleet
//     zonder inleiding; die komt er later bij. De koude start van het model is
//     ~45–60 s, dus de UI toont een eigen, eerlijk gelabelde skeleton.
//  3. GEEN VERZONNEN CIJFERS. De ruwe uitvoer gaat door
//     `resolveLocalReportIntro` (vorm-afdwinging + cijfer-guardrail); noemt de
//     tekst een bedrag dat niet in de kerncijfers staat, dan blijft de inleiding
//     weg (`status: 'mislukt'`), precies zoals bij een generatiefout.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useExecutionMode } from './use-execution-mode'
// Statische import: litert-runtime laadt de zware @litert-lm/core-WASM-bundel
// pas lazy in zijn eigen functies (dynamic import), dus dit trekt die bundel
// NIET eager mee — zelfde afweging als in local-categorize-resolver.ts.
import { loadModelSession } from './litert-runtime'
import {
  buildLocalReportSystemPrompt,
  resolveLocalReportIntro,
  LOCAL_REPORT_TASK,
  type ReportIntroFigures,
} from './local-report-prompt'

/**
 * 'uit'     → deze pagina schrijft niets lokaal (cloud-modus, of geen cijfers).
 * 'wachten' → de bestemming wordt nog bepaald; er vertrekt nog niets.
 * 'bezig'   → het model draait op dit toestel.
 * 'klaar'   → er is een geverifieerde inleiding.
 * 'mislukt' → geen inleiding (fout, lege uitvoer of cijfer-guardrail).
 */
export type LocalReportIntroStatus = 'uit' | 'wachten' | 'bezig' | 'klaar' | 'mislukt'

export interface LocalReportIntroState {
  status: LocalReportIntroStatus
  /** De geverifieerde inleiding, of null. */
  intro: string | null
  /** Draait het lokale pad nog? Print moet hierop wachten (lege callout in PDF). */
  pending: boolean
  /** Uitleg bij 'uit' wanneer de groep lokaal staat maar het toestel niet kan. */
  blockedMessage: string | null
}

/** Ruwe token-ruimte voor de generatie; de web-SDK negeert dit (vorm gaat post-hoc). */
const INTRO_MAX_NEW_TOKENS = 320

/**
 * Schrijf de rapport-inleiding on-device wanneer de groep 'rapporten' lokaal
 * staat.
 *
 * @param figures De kerncijfers uit de al geladen `ReportData`, of null zolang
 *                het rapport nog niet binnen is. Bij null blijft alles uit —
 *                er is dan niets om over te schrijven.
 */
export function useLocalReportIntro(figures: ReportIntroFigures | null): LocalReportIntroState {
  const execution = useExecutionMode('rapporten', figures != null)
  // De uitkomst draagt zijn eigen signature mee. Zo hoeft de effect-body niets
  // te resetten (geen synchrone setState in een effect) en is een uitkomst van
  // een vórig rapport automatisch niet meer geldig: hij hoort bij een andere
  // signature en telt dan simpelweg niet mee.
  const [outcome, setOutcome] = useState<{ sig: string; intro: string | null } | null>(null)

  // Eén run per rapport. De signature is de identiteit van de cijfers: verandert
  // het rapport (andere periode), dan mag er opnieuw geschreven worden; een
  // re-render of StrictMode-dubbelmount niet.
  const startedRef = useRef<string | null>(null)

  const signature = useCallback((f: ReportIntroFigures) => JSON.stringify(f), [])
  const currentSig = figures ? signature(figures) : null

  useEffect(() => {
    if (!figures) return
    // FAIL-CLOSED: alleen bij een expliciet lokaal-groen licht. 'resolving' en
    // 'blocked' vallen hier af, en 'cloud' hoort hier niets te doen.
    if (!execution.canUseLocal) return

    const sig = signature(figures)
    if (startedRef.current === sig) return
    startedRef.current = sig

    let cancelled = false

    void (async () => {
      try {
        const session = await loadModelSession()
        const raw = await session.generate(
          [
            { role: 'system', content: buildLocalReportSystemPrompt(figures) },
            { role: 'user', content: LOCAL_REPORT_TASK },
          ],
          INTRO_MAX_NEW_TOKENS,
        )
        if (cancelled) return

        const resolved = resolveLocalReportIntro(raw, figures)
        if (!resolved.intro) {
          // ALTIJD loggen (les uit de lokale categorisatie): zonder deze kanarie
          // is een verworpen inleiding voor gebruiker én support onzichtbaar.
          console.error(
            `[lokale-ai] rapport-inleiding verworpen (${resolved.reason})`,
            resolved.offending.length ? resolved.offending : '',
          )
        }
        setOutcome({ sig, intro: resolved.intro })
      } catch (err) {
        if (cancelled) return
        console.error('[lokale-ai] rapport-inleiding mislukt:', err)
        setOutcome({ sig, intro: null })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [figures, execution.canUseLocal, signature])

  // ── Naar buiten toe één status ────────────────────────────────────────────
  if (!figures || execution.status === 'cloud') {
    return { status: 'uit', intro: null, pending: false, blockedMessage: null }
  }
  if (execution.status === 'blocked') {
    return { status: 'uit', intro: null, pending: false, blockedMessage: execution.message }
  }
  if (execution.status === 'resolving') {
    // Nog niet bekend waar dit hoort te draaien. Print wacht: anders zou een PDF
    // met een lege callout kunnen ontstaan terwijl de inleiding nog komt.
    return { status: 'wachten', intro: null, pending: true, blockedMessage: null }
  }

  // Alleen een uitkomst die bij DIT rapport hoort telt; zolang die er niet is,
  // draait het model nog (of staat het op het punt te starten).
  const settled = outcome && outcome.sig === currentSig ? outcome : null
  const status: LocalReportIntroStatus = !settled ? 'bezig' : settled.intro ? 'klaar' : 'mislukt'
  return {
    status,
    intro: settled?.intro ?? null,
    pending: status === 'bezig',
    blockedMessage: null,
  }
}
