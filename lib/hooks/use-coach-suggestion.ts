'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import {
  getFirstUndismissedSuggestion,
  DEFAULT_COACH_TIMING,
  PATH_SUGGESTION_COOLDOWN_MS,
  type CoachSuggestion,
  type CoachDataGaps,
  type DeferredField,
  type CoachOverrides,
  type GuideSuggestionInput,
} from '@/lib/coach-suggestions'
import {
  EMPTY_COACH_STATE,
  GUIDE_SUGGESTION_KEY_PREFIX,
  isSameLocalDay,
  type CoachState,
} from '@/lib/coach-state'
import type { ModuleId } from '@/lib/module-registry'

/**
 * useCoachSuggestion — kiest de eerstvolgende proactieve melding van Fin.
 *
 * STAAT STAAT SERVER-SIDE (ADR 0130). De weggeklikte sleutels komen als
 * `coachState` mee uit de al geladen profielrij (`app/(app)/layout.tsx`) en
 * mutaties gaan via `PUT /api/coach-state`. Lokaal houden we alleen een
 * optimistische kopie aan zodat het kruisje direct voelt; de server is de
 * waarheid. Zie `lib/coach-state.ts`.
 *
 * PAUZE (`paused`). Zolang er een overlay openstaat, de route immersief is of
 * de rondleiding loopt, doet de hook NIETS: geen selectie, geen stempel, geen
 * dismiss. Dat dicht de latente fout uit de localStorage-versie — die stempelde
 * een tip als "gezien" terwijl FinHome 'm helemaal niet rendert (auto-dismiss
 * liep gewoon door achter een open modal), waardoor tips ongezien verdwenen.
 *
 * ÉÉN MELDING HOORT BIJ ÉÉN PAGINA (UR3-10, ADR 0134). Navigeert de gebruiker
 * terwijl er een melding openstaat, dan sluit die melding — hij hopt niet mee
 * naar de volgende route om daar opnieuw uit te typen met een verse
 * auto-dismiss-timer. Dat laatste was geen bedoeld gedrag maar een gevolg van de
 * selectie op `pathname`: elke navigatie duwde de pad-tip van de nieuwe route
 * over de openstaande melding heen, waardoor het las als "de tip komt op elke
 * pagina terug".
 *
 * DAGREGEL VOOR DE GIDS (`guide`, ADR 0130 fase 2). Fin noemt hoogstens ÉÉN
 * gidsstap per lokale kalenderdag. De stempel (`guideLastShownAt`) valt op het
 * moment dat de bubbel daadwerkelijk verschijnt — niet bij het kiezen, en zeker
 * niet achter een pauze. De stempel leeft hier bewust in een REF: een state-
 * update zou de selectie-effect opnieuw laten lopen en de zojuist getoonde
 * gids-bubbel meteen door een pad-tip vervangen.
 */

const LEGACY_DISMISSED_KEY = 'trifinity_coach_bubble_dismissed'
const LEGACY_DISMISSED_SUGGESTIONS_KEY = 'trifinity_coach_dismissed_suggestions'
const LEGACY_LAST_DISMISSED_AT_KEY = 'trifinity_coach_last_dismissed_at'

/** Waarom een melding verdwijnt: door de gebruiker, of door de auto-dismiss-termijn. */
export type CoachDismissReason = 'user' | 'auto'

export type UseCoachSuggestionArgs = {
  /** Server-seed uit `profiles.module_guide_state['coach:state']`. */
  coachState?: CoachState
  dataGaps?: CoachDataGaps
  deferredFields?: DeferredField[]
  overrides?: CoachOverrides
  activeModules?: ModuleId[]
  delayMs?: number
  /** Geen selectie en geen stempel zolang dit waar is. */
  paused?: boolean
  /** Open stappen uit de welkomstgids (server-seed uit de app-layout). */
  guide?: GuideSuggestionInput
}

/**
 * Leest de drie oude localStorage-sleutels uit en wist ze. Retourneert de
 * sleutels die naar de server moeten. Eenmalig per browser: na het wissen komt
 * er niets meer terug.
 */
function drainLegacyLocalState(): string[] {
  const keys: string[] = []
  try {
    const raw = localStorage.getItem(LEGACY_DISMISSED_SUGGESTIONS_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        for (const k of parsed) if (typeof k === 'string' && k !== '') keys.push(k)
      }
    }
  } catch {
    /* corrupt — dan importeren we die lijst gewoon niet */
  }
  try {
    // De alleroudste vorm: één boolean die "de standaardbubbel is weg" betekende.
    if (localStorage.getItem(LEGACY_DISMISSED_KEY)) keys.push('default')
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(LEGACY_DISMISSED_SUGGESTIONS_KEY)
    localStorage.removeItem(LEGACY_DISMISSED_KEY)
    // Het oude sluitmoment nemen we bewust NIET over (zie de route): wissen
    // volstaat, anders start de rustpauze op een tijdstip uit een ander leven.
    localStorage.removeItem(LEGACY_LAST_DISMISSED_AT_KEY)
  } catch {
    /* ignore */
  }
  // Zelfde sleutelvorm als de server (`SuggestionKeySchema` in /api/coach-state).
  // Eén afwijkende entry zou anders de héle batch een 400 opleveren — terwijl
  // localStorage hierboven al gewist is.
  const geldig = /^[a-z0-9_:-]{1,64}$/
  return [...new Set(keys)].filter((k) => geldig.test(k)).slice(0, 200)
}

/** Fire-and-forget mutatie; een mislukte PUT mag de UI nooit blokkeren. */
function putCoachState(body: Record<string, unknown>): void {
  void fetch('/api/coach-state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {
    /* stil — de optimistische lokale staat houdt de melding weg deze sessie */
  })
}

export function useCoachSuggestion({
  coachState = EMPTY_COACH_STATE,
  dataGaps, deferredFields, overrides, activeModules,
  delayMs = DEFAULT_COACH_TIMING.delayMs,
  paused = false,
  guide,
}: UseCoachSuggestionArgs): {
  suggestion: CoachSuggestion | null
  dismiss: (reason?: CoachDismissReason) => void
} {
  const pathname = usePathname()
  const [suggestion, setSuggestion] = useState<CoachSuggestion | null>(null)
  const dismissedThisMount = useRef(false)

  // Optimistische kopie van de server-staat. Wordt aangevuld bij een dismiss en
  // bij de legacy-import; blijft verder een spiegel van de seed.
  const [dismissedKeys, setDismissedKeys] = useState<ReadonlySet<string>>(
    () => new Set(coachState.dismissed),
  )
  const [lastDismissedAt, setLastDismissedAt] = useState<string | null>(coachState.lastDismissedAt)

  // De pauze en de huidige melding lezen we in callbacks via refs: `dismiss`
  // moet stabiel blijven (FinHome hangt 'm in een effect-dependency).
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const suggestionRef = useRef<CoachSuggestion | null>(null)

  const show = useCallback((next: CoachSuggestion | null) => {
    suggestionRef.current = next
    setSuggestion(next)
  }, [])

  // ── Server-seed → lokale kopie ────────────────────────────────────────────
  // Een verse shell-render kan nieuwe sleutels meebrengen (bv. weggeklikt op een
  // ander toestel). Alleen aanvullen, nooit terugdraaien: onze eigen
  // optimistische sleutels mogen niet verdwijnen als de seed nog achterloopt.
  useEffect(() => {
    setDismissedKeys((cur) => {
      const missing = coachState.dismissed.filter((k) => !cur.has(k))
      return missing.length === 0 ? cur : new Set([...cur, ...missing])
    })
  }, [coachState.dismissed])

  // ── Dagstempel van de gids-bubbel ─────────────────────────────────────────
  // Bewust een REF, geen state: stempelen mag de selectie-effect niet opnieuw
  // laten lopen (dat zou de zojuist getoonde gids-bubbel meteen vervangen).
  const guideShownAtRef = useRef<string | null>(coachState.guideLastShownAt)
  useEffect(() => {
    // Een verse shell-render kan een NIEUWERE stempel meebrengen (bv. de bubbel
    // is vandaag al op een ander toestel getoond). Alleen vooruit, nooit terug.
    const seed = coachState.guideLastShownAt
    if (!seed) return
    const current = guideShownAtRef.current
    if (!current || Date.parse(seed) > Date.parse(current)) guideShownAtRef.current = seed
  }, [coachState.guideLastShownAt])

  /** Eén stempel per getoonde gids-suggestie. */
  const guideStampedKey = useRef<string | null>(null)
  const markGuideShown = useCallback((key: string) => {
    if (guideStampedKey.current === key) return
    guideStampedKey.current = key
    guideShownAtRef.current = new Date().toISOString()
    putCoachState({ action: 'guideShown' })
  }, [])

  // ── Eenmalige overname van de oude localStorage-staat ─────────────────────
  const legacyDrained = useRef(false)
  useEffect(() => {
    if (legacyDrained.current) return
    legacyDrained.current = true
    const keys = drainLegacyLocalState()
    if (keys.length === 0) return
    setDismissedKeys((cur) => new Set([...cur, ...keys]))
    putCoachState({ action: 'importLegacy', keys })
  }, [])

  const dismiss = useCallback((reason: CoachDismissReason = 'user') => {
    // Geen enkele stempel zolang de melding niet zichtbaar is (M15 / ADR 0130).
    if (pausedRef.current) return
    const current = suggestionRef.current
    if (!current) return

    dismissedThisMount.current = true
    show(null)

    const isGuideKey = current.key.startsWith(GUIDE_SUGGESTION_KEY_PREFIX)
    if (reason === 'auto' && isGuideKey) {
      // Een gids-bubbel die vanzelf wegglijdt is géén "deze stap hoef ik niet
      // meer" — de stap blijft open in de gids. Alleen de dagregel gaat om, zodat
      // Fin er vandaag niet nóg een keer over begint. `markGuideShown` is
      // idempotent per sleutel: normaal is er bij het verschijnen al gestempeld
      // en schrijft deze tak niets meer.
      markGuideShown(current.key)
      return
    }

    // Kruisje op een gids-bubbel: naast de dagstempel (al gezet bij verschijnen)
    // óók een échte dismiss, zodat juist DIE stap stil blijft en Fin morgen de
    // volgende noemt.
    setDismissedKeys((cur) => (cur.has(current.key) ? cur : new Set([...cur, current.key])))
    setLastDismissedAt(new Date().toISOString())
    putCoachState({ action: 'dismiss', key: current.key })
  }, [show, markGuideShown])

  // ── Selectie ──────────────────────────────────────────────────────────────
  //
  // De routewissel-sluiting (UR3-10) hangt bewust IN dit effect en niet in een
  // eigen effect ernaast: de selectie plant zijn timer óók op een
  // pathname-wissel, en een los effect dat ná deze plaatsing zou draaien laat
  // die al geplande timer gewoon vuren. Hier sluiten we eerst, waarna de
  // `dismissedThisMount`-poort direct hieronder de nieuwe selectie tegenhoudt.
  const lastSelectionPath = useRef<string | null>(null)
  useEffect(() => {
    const vorigePad = lastSelectionPath.current
    lastSelectionPath.current = pathname
    if (vorigePad !== null && vorigePad !== pathname && suggestionRef.current) {
      // Reden `'auto'`: de gebruiker heeft de melding niet weggeklikt, hij is
      // verder gelopen. Voor een gidsbubbel betekent dat (net als de bestaande
      // auto-dismiss) alleen de dagstempel — de stap blijft open in de gids.
      dismiss('auto')
    }
    if (paused) return
    if (dismissedThisMount.current) return
    // Dagregel: is er vandaag al een gidsstap genoemd, dan houden we de STAPPEN
    // leeg — niet de hele gids-invoer. `status: 'active'` blijft dus staan, zodat
    // de data-gap-laag overgeslagen blijft (één stem) en de selectie doorvalt
    // naar de pad-/default-laag, precies als op een dag mét bubbel.
    const guideForSelection: GuideSuggestionInput | undefined =
      guide && guide.status === 'active' && isSameLocalDay(guideShownAtRef.current, new Date())
        ? { ...guide, steps: [] }
        : guide
    const next = getFirstUndismissedSuggestion(
      dataGaps, pathname, dismissedKeys as Set<string>, deferredFields, overrides, activeModules,
      guideForSelection,
    )
    if (!next) return
    // Rustpauze na een gesloten melding: route-tips (`path_*`) staan per
    // pagina klaar, dus zonder pauze duwt elke navigatie meteen de volgende
    // omhoog. Data-gap- en uitgestelde-veld-tips blijven ongemoeid — die zijn
    // niet route-gebonden en herhalen zich dus niet bij het navigeren (H17).
    //
    // UR3-10 stelde voor deze pauze te verbreden naar ELKE niet-gidslaag.
    // Bewust NIET gedaan: dat keert het H17-besluit om (en de test die het
    // vastlegt) terwijl de gemelde klacht — de tip die op elke pagina terugkomt
    // — al volledig wordt verholpen door de routewissel-sluiting hierboven, die
    // via `dismissedThisMount` sowieso élke laag voor de rest van deze mount
    // stilzet. Zie de oplevernotitie bij de kaart.
    if (next.key.startsWith('path_') && lastDismissedAt) {
      const since = Date.now() - Date.parse(lastDismissedAt)
      if (Number.isFinite(since) && since >= 0 && since < PATH_SUGGESTION_COOLDOWN_MS) return
    }
    const timer = setTimeout(() => {
      show(next)
      // Pas hier stempelen: dit is het moment waarop de bubbel écht verschijnt.
      // Bij een pauze is de timer al opgeruimd, dus een ongeziene gidsstap
      // verbruikt zijn dag niet.
      if (next.key.startsWith(GUIDE_SUGGESTION_KEY_PREFIX)) markGuideShown(next.key)
    }, delayMs)
    return () => clearTimeout(timer)
  }, [
    paused, pathname, dataGaps, deferredFields, overrides, activeModules, delayMs,
    dismissedKeys, lastDismissedAt, show, guide, markGuideShown, dismiss,
  ])


  return { suggestion, dismiss }
}
