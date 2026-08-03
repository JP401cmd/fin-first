'use client'

// ── De persoonlijke nieuwseditie, samengesteld op het eigen toestel ──────────
//
// Deze hook is de UI-naad naar `generateLocalNewsEdition`. Hij hoort bewust NIET
// in nieuws-only-client.tsx: die pagina houdt al het cloudpad vast, en een tweede
// generatie-machinerie erbij maakt er een god-component van waarin de
// fail-closed-regels niet meer te lezen zijn.
//
// DRIE EIGENSCHAPPEN DIE HIER HARD IN ZITTEN:
//
//  1. NIET GENEREREN BIJ ELK BEZOEK. Een editie kost twee tot vier minuten
//     (~12 scoring-calls plus tot 8 schrijf-calls). Bij binnenkomst lezen we
//     daarom eerst de BEWAARDE editie terug (`GET /api/local-news-edition`);
//     staat daar iets, dan is dat de editie en start er niets.
//  2. ONDERWEG BEWAREN. `onItem` vuurt na élk afgerond bericht. Dat gaat meteen
//     naar de server (er is geen server-side hervatting van een lokale run) én
//     meteen in de state, zodat de gebruiker kan blijven lezen wat er al staat.
//     Het ANTWOORD van de POST is de bron van waarheid: de server hervalideert,
//     zet de bronvelden uit de bronrij en kan berichten verwerpen.
//  3. WEGNAVIGEREN STOPT DE GENERATIE. De `AbortController` wordt in de
//     effect-cleanup afgebroken; de resolver toetst dat tussen elke modelcall.
//
// FAIL-CLOSED: deze hook draait uitsluitend op `canUseLocal` van
// `useExecutionMode` — nooit op een eigen `status === 'lokaal'`-vergelijking, en
// er zit geen enkel pad naar `/api/news` in. Dat is precies de terugval die de
// privacybelofte zou breken.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { NewsItem } from '@/lib/news-item'
// Type-only: `local-chat-context` is server-side code, maar het TYPE wordt door
// TypeScript volledig weggecompileerd en komt dus niet in de client-bundel.
import type { LocalChatOverview } from '@/lib/ai/local/local-chat-context'
import type { LocalNewsSource } from '@/lib/ai/local/local-news-source'
// Statische import: `litert-runtime` laadt de zware WASM-bundel pas lazy in zijn
// eigen functies (dynamic import), dus dit trekt die bundel NIET eager mee —
// zelfde afweging als in use-local-report-intro.ts.
import {
  generateLocalNewsEdition,
  type LocalNewsProgress,
} from '@/lib/ai/local/local-news-resolver'

/**
 * 'laden'      → de bewaarde editie wordt teruggelezen (neutrale laadtoestand).
 * 'genereren'  → er wordt on-device samengesteld; `items` groeit onderweg.
 * 'klaar'      → er is een editie (die mag leeg zijn: niets raakte je situatie).
 * 'fout'       → samenstellen is mislukt; `error` bevat de reden.
 */
export type LocalEditionStatus = 'laden' | 'genereren' | 'klaar' | 'fout'

export interface LocalNewsEditionState {
  status: LocalEditionStatus
  /** De editie tot nu toe — tijdens 'genereren' groeit deze lijst per bericht. */
  items: NewsItem[]
  /** Voortgang binnen de huidige fase, of null zolang er nog niets draait. */
  progress: LocalNewsProgress | null
  error: string | null
  generatedAt?: string
  /** Aantal bronartikelen dat aan het profiel is getoetst. */
  sourceCount?: number
  editionNr?: number
  jaargang?: number
  /** Opnieuw samenstellen (Ververs). Breekt een lopende generatie af. */
  regenerate: () => void
}

const GENERIC_ERROR = 'Je editie kon niet op dit toestel worden samengesteld.'

/** Foutboodschap uit de gedeelde envelope (`{ error: string }`, ADR 0044). */
async function readError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? fallback
}

async function getJson<T>(url: string, fallback: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(await readError(res, fallback))
  return (await res.json()) as T
}

interface StoredEditionResponse {
  items: NewsItem[]
  cached: boolean
  generatedAt?: string
  sourceCount?: number
  editionNr?: number
  jaargang?: number
}

interface SourcesResponse {
  sources: LocalNewsSource[]
  sourceCount: number
  sourceNewestAt?: string
  editionNr?: number
  jaargang?: number
}

interface PersistResponse {
  items: NewsItem[]
  editionNr?: number
  jaargang?: number
}

/**
 * De wire-vorm die `localNewsClientItemSchema` accepteert. Bewust expliciet
 * uitgeschreven in plaats van het hele `NewsItem` over de lijn gooien: zo is aan
 * de client-kant zichtbaar dat `sourceUrl`/`sourceName`/`category`/`date` NIET
 * meegaan — die zet de server zelf uit de bronrij.
 */
function toWireItem(item: NewsItem) {
  return {
    id: item.id,
    headline: item.headline,
    summary: item.summary,
    personalImpact: item.personalImpact,
    impactType: item.impactType,
    impactScore: item.impactScore,
    impactDirection: item.impactDirection,
  }
}

async function persistEdition(
  items: NewsItem[],
  opts: { archivePrevious: boolean; complete: boolean; sourceCount: number; sourceNewestAt?: string },
): Promise<PersistResponse> {
  const res = await fetch('/api/local-news-edition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: items.map(toWireItem),
      archivePrevious: opts.archivePrevious,
      complete: opts.complete,
      // Het aantal GETOETSTE bronartikelen. De server kan dit niet zelf afleiden
      // — hij ziet alleen de artikelen die de editie hébben gehaald — en het
      // voedt "Gebaseerd op N bronartikelen" en de lege staat.
      sourceCount: opts.sourceCount,
      sourceNewestAt: opts.sourceNewestAt,
    }),
  })
  if (!res.ok) throw new Error(await readError(res, 'De editie kon niet worden bewaard.'))
  return (await res.json()) as PersistResponse
}

/**
 * @param active Zet op true zodra vaststaat dat 'nieuws' lokaal mag draaien
 *               (`useExecutionMode('nieuws').canUseLocal`). Zolang dit false is
 *               gebeurt er niets — dat dekt zowel 'resolving' als 'blocked'.
 */
export function useLocalNewsEdition(active: boolean): LocalNewsEditionState {
  const [status, setStatus] = useState<LocalEditionStatus>('laden')
  const [items, setItems] = useState<NewsItem[]>([])
  const [progress, setProgress] = useState<LocalNewsProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<{
    generatedAt?: string
    sourceCount?: number
    editionNr?: number
    jaargang?: number
  }>({})

  // Elke ophoging is één expliciete "stel opnieuw samen"-opdracht. Nonce 0 is de
  // binnenkomst (eerst de bewaarde editie lezen); daarboven wil de gebruiker een
  // verse editie en slaan we die leesstap over.
  const [runNonce, setRunNonce] = useState(0)
  const regenerate = useCallback(() => setRunNonce((n) => n + 1), [])

  // De laatst gestarte run wint. Zonder dit zou een afgebroken run (StrictMode-
  // dubbelmount, of een Ververs midden in een generatie) alsnog state van een
  // oudere generatie kunnen schrijven.
  const runRef = useRef(0)

  useEffect(() => {
    if (!active) return

    const runId = ++runRef.current
    const controller = new AbortController()
    const isCurrent = () => runRef.current === runId && !controller.signal.aborted

    void (async () => {
      // ── 1. Bewaarde editie ──────────────────────────────────────────────
      if (runNonce === 0) {
        setStatus('laden')
        try {
          const stored = await getJson<StoredEditionResponse>(
            '/api/local-news-edition',
            'Je bewaarde editie kon niet worden geladen.',
          )
          if (!isCurrent()) return
          setMeta({
            generatedAt: stored.generatedAt,
            sourceCount: stored.sourceCount,
            editionNr: stored.editionNr,
            jaargang: stored.jaargang,
          })
          // Er staat een editie klaar → tonen en NIET genereren. Twee tot vier
          // minuten rekenen bij elk paginabezoek is geen optie.
          //
          // OP `cached`, NIET OP `items.length`. Een LEGE editie is een geldige
          // uitkomst ("geen nieuws met impact op jouw situatie") en wordt ook
          // bewaard. Zou je op de lengte testen, dan telt zo'n editie als "niets
          // bewaard" en start élk paginabezoek een nieuwe generatie van twee tot
          // vier minuten — een oneindige lus voor precies de gebruiker die geen
          // nieuws heeft.
          if (stored.cached) {
            setItems(stored.items)
            setStatus('klaar')
            return
          }
        } catch (err) {
          if (!isCurrent()) return
          setError(err instanceof Error ? err.message : GENERIC_ERROR)
          setStatus('fout')
          return
        }
      }

      // ── 2. Samenstellen op dit toestel ──────────────────────────────────
      setStatus('genereren')
      setError(null)
      setProgress(null)

      // Het bewaren gebeurt per bericht; alleen de ALLEREERSTE POST van deze run
      // archiveert de vorige editie. Levert de generatie nul berichten op, dan is
      // de slot-POST hieronder de eerste — en archiveert die alsnog, zodat een
      // lege editie de vorige niet stilzwijgend overschrijft.
      let firstPost = true
      // Het aantal getoetste bronartikelen, bekend zodra /api/local-news-sources
      // binnen is. Gaat bij élke POST mee: de server bewaart 'm als grondslag.
      let testedSourceCount = 0
      let newestSourceAt: string | undefined
      const persist = async (list: NewsItem[], complete: boolean) => {
        const archivePrevious = firstPost
        firstPost = false
        return persistEdition(list, { archivePrevious, complete, sourceCount: testedSourceCount, sourceNewestAt: newestSourceAt })
      }

      try {
        const [sourceData, overview] = await Promise.all([
          getJson<SourcesResponse>(
            '/api/local-news-sources',
            'De bronartikelen konden niet worden opgehaald.',
          ),
          getJson<LocalChatOverview>(
            '/api/local-chat-overview',
            'Je financiële overzicht kon niet worden geladen.',
          ),
        ])
        if (!isCurrent()) return

        testedSourceCount = sourceData.sourceCount
        newestSourceAt = sourceData.sourceNewestAt
        setMeta((prev) => ({
          ...prev,
          // Het aantal artikelen dat aan je profiel is getoetst — dat is de
          // eerlijke grondslag-regel, ook als er straks nul berichten overblijven.
          sourceCount: sourceData.sourceCount,
          editionNr: sourceData.editionNr ?? prev.editionNr,
          jaargang: sourceData.jaargang ?? prev.jaargang,
        }))

        const produced = await generateLocalNewsEdition({
          sources: sourceData.sources,
          overview,
          signal: controller.signal,
          onProgress: (p) => {
            if (isCurrent()) setProgress(p)
          },
          onItem: async (partial) => {
            // Het antwoord van de server is de bron van waarheid: hij
            // hervalideert, zet de bronvelden uit de bronrij en kan berichten
            // verwerpen. Wat hier terugkomt is dus wat er écht bewaard is.
            const saved = await persist(partial, false)
            if (!isCurrent()) return
            setItems(saved.items)
            setMeta((prev) => ({
              ...prev,
              editionNr: saved.editionNr ?? prev.editionNr,
              jaargang: saved.jaargang ?? prev.jaargang,
            }))
          },
        })
        if (!isCurrent()) return

        // Slot-POST: sluit de run af en markeert de gebruikte bronartikelen, zodat
        // ze niet in een volgende editie terugkomen.
        //
        // ONVOORWAARDELIJK — óók bij nul berichten. Zonder deze POST wordt een
        // lege editie nooit bewaard, blijft `cached` false en start het volgende
        // paginabezoek opnieuw een generatie van twee tot vier minuten.
        const final = await persist(produced, true)
        if (!isCurrent()) return

        setItems(final.items)
        setMeta((prev) => ({
          ...prev,
          generatedAt: new Date().toISOString(),
          editionNr: final.editionNr ?? prev.editionNr,
          jaargang: final.jaargang ?? prev.jaargang,
        }))
        setProgress(null)
        setStatus('klaar')
      } catch (err) {
        if (!isCurrent()) return
        setError(err instanceof Error ? err.message : GENERIC_ERROR)
        setStatus('fout')
      }
    })()

    return () => {
      controller.abort()
    }
  }, [active, runNonce])

  return {
    status,
    items,
    progress,
    error,
    generatedAt: meta.generatedAt,
    sourceCount: meta.sourceCount,
    editionNr: meta.editionNr,
    jaargang: meta.jaargang,
    regenerate,
  }
}
