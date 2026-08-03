// ── Lokale (on-device) vaste-kosten-analyse ───────────────────────────────────
//
// De structurele TWEELING van lib/ai/local/local-categorize-resolver.ts, en
// bewust in dezelfde vorm gegoten: chunking op 10, sessieherstel (dispose + één
// retry, dan werpen), id-echo-mapping en een sessiestart-signaal voor de stille
// GPU-warmup. Wie de één begrijpt, begrijpt de ander.
//
// De taak is meetbaar MAKKELIJKER dan categorisatie: drie labels
// (subscription | vaste_kosten | skip) in plaats van tientallen budget-slugs, en
// het model krijgt de deterministische auto-categorie als hint mee. Alle bedragen
// zijn al door de server berekend (`toMonthly` in de route) — het model raakt
// geen enkel cijfer aan en hoeft niets te rekenen.
//
// Kernafspraken (ADR 0043 / POC-lessen, identiek aan het categorisatie-pad):
//  - Model = Gemma 4 E2B (LiteRT-LM/WebGPU, lib/ai/local/litert-runtime.ts),
//    dynamisch geladen; álle inferentie loopt door één gedeelde GPU-wachtrij.
//  - Interne chunkgrootte 10: bij 20 trad de `unaligned accesses`-crash op.
//  - Sessieherstel per chunk: crash → dispose + verse sessie, één keer opnieuw;
//    faalt het weer → werpen, zodat de UI eerlijk faalt. NOOIT een stille
//    cloud-fallback (privacy fail-closed, FR-3.6).
//  - Prompt single-source: `VASTE_KOSTEN_ANALYSE_PROMPT` wordt RECHTSTREEKS uit
//    lib/ai/dna/wil.ts geïmporteerd — dezelfde string die het cloud-pad gebruikt.
//    Geen gecondenseerde kopie, dus per definitie nul drift en geen extra
//    parity-artefact (lib/ai/local/parity-manifest.json blijft ongemoeid; dat
//    manifest bewaakt de chat-DNA-condensatie, niet deze prompt).
//  - GEEN `sanitizeForAI`: er is geen egress. De cloud-guardrails uit ADR 0035
//    (sanitize in, maskPIIInOutput uit, token-logging) zijn hier N.V.T. omdat er
//    geen externe provider, geen netwerkverkeer en geen kosten zijn. Saniteren
//    zou hier alleen legitiem signaal wegstrepen: juist de handelsnaam van de
//    tegenpartij ("Spotify", "Vattenfall") is wat de classificatie mogelijk maakt.
//
// SNELHEID IS HIER HET ECHTE RISICO, niet kwaliteit. Bij ~9-12 tok/s kost elk
// item zijn eigen decode; 50 kandidaten × ~40 tokens loopt in de minuten. Vier
// maatregelen samen houden het draaglijk: (1) de "reden" is in de uitvoer-
// instructie hieronder afgekapt op 8 woorden — dat halveert de decode per item;
// (2) de route capt het lokale pad op 30 kandidaten i.p.v. 50; (3) chunks van 10;
// (4) `onChunk` rendert progressief, zodat de gebruiker na de eerste chunk al
// resultaat ziet in plaats van minutenlang naar een spinner te kijken.

import { VASTE_KOSTEN_ANALYSE_PROMPT } from '@/lib/ai/dna/wil'
import type { RecurringCategory } from '@/lib/recurring-detection'
import { extractLocalJsonObjects } from './parse'
// Statische import: litert-runtime laadt de zware @litert-lm/core-WASM-bundel pas
// lazy in zijn eigen functies (dynamic import), dus dit trekt die bundel NIET
// eager mee. De statische import maakt de generatie-callsite bovendien expliciet
// zodat de sanitize-scan ('m op de allowlist) 'm herkent (ADR 0035/0043).
import { loadModelSession, disposeSession } from './litert-runtime'

/** De drie klassen die de analyse kent — identiek aan het cloud-contract. */
export type VasteKostenKlasse = 'subscription' | 'vaste_kosten' | 'skip'

/**
 * HARDE ENUM-WHITELIST. Een 2B-model verzint met enige regelmaat een vierde
 * label ("abonnement", "vast", "onbekend"). Alles wat hier niet exact in staat
 * wordt `skip` — gedragspariteit met de cloud-route, waar een classificatie die
 * niet op een geldige index landt eveneens als `skip` in de suggestie komt.
 */
export const VASTE_KOSTEN_KLASSEN: readonly VasteKostenKlasse[] = ['subscription', 'vaste_kosten', 'skip']

/**
 * Eén kandidaat zoals de server 'm aanlevert (`candidatesOnly`-modus van
 * POST /api/subscriptions/analyse-ai). Alle bedragen zijn dáár al berekend.
 * De route importeert dit type `import type` — volledig erased, dus het lokale
 * runtime-pad komt nooit in de serverbundel terecht.
 */
export interface VasteKostenCandidate {
  /** Stabiele sleutel van het gedetecteerde patroon (DetectedRecurring.key). */
  id: string
  name: string
  /** Door de server berekend maandbedrag — het model raakt dit niet aan. */
  monthlyAmount: number
  /** Gemiddeld bedrag per keer (absoluut), alleen als promptcontext. */
  averageAmount: number
  frequency: 'monthly' | 'weekly' | 'quarterly' | 'yearly'
  occurrences: number
  autoCategory: RecurringCategory
  autoCategoryLabel: string
  confidence: 'high' | 'medium' | 'low'
}

/** Uitkomst per kandidaat: de klasse plus de korte motivering van het model. */
export interface VasteKostenClassificatie {
  id: string
  klasse: VasteKostenKlasse
  reden: string
}

/**
 * Interne chunkgrootte. Dezelfde crash-vrije waarde als het categorisatie-pad
 * (`LOCAL_INTERNAL_BATCH_SIZE`): bij 20 trad de `unaligned accesses`-crash op,
 * bij 10 met een verse sessie niet. Bewust een eigen constante en geen import:
 * de twee taken hebben verschillende promptlengtes en mogen los bewegen.
 */
export const LOCAL_VASTE_KOSTEN_CHUNK_SIZE = 10

/**
 * Kandidaat-cap voor het LOKALE pad. Het cloud-pad gaat tot 50
 * (`MAX_AI_CANDIDATES` in de route); on-device is 50 × ~30 outputtokens bij
 * 9-12 tok/s al gauw twee tot drie minuten. 30 houdt de analyse binnen ~een
 * minuut nadat het model warm is, en de staart onder de 30 bestaat vrijwel
 * uitsluitend uit lage-frequentie-ruis die tóch als `skip` eindigt.
 *
 * De route leest deze constante NIET (dat zou het lokale runtime-pad de
 * serverbundel in trekken) maar spiegelt 'm als `MAX_LOCAL_AI_CANDIDATES`;
 * `local-vaste-kosten-resolver.test.ts` pint dat de twee gelijk blijven.
 */
export const LOCAL_VASTE_KOSTEN_CANDIDATE_CAP = 30

/**
 * max_new_tokens-schatting: ~32 tokens per kandidaat (id + klasse + een reden van
 * hoogstens 8 woorden) plus 96 marge. De LiteRT-web-SDK kent geen per-call cap en
 * negeert deze waarde; hij blijft in de signatuur zodat het contract gelijkloopt
 * met de categorisatie-resolver en een toekomstige runtime 'm kan honoreren.
 */
export function suggestVasteKostenMaxNewTokens(chunkSize: number): number {
  return Math.min(4096, Math.max(128, chunkSize * 32 + 96))
}

/** Batch-id voor de id-echo: t1..tN, één-gebaseerd (spiegelt `batchItemId`). */
export function vasteKostenItemId(index: number): string {
  return `t${index + 1}`
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ── Hint-volgzaamheid: verdient de AI-stap zijn plek? ─────────────────────────
//
// OORDEEL (bij de bouw, expliciet vastgelegd omdat het de rechtvaardiging van
// deze hele functie raakt). De invoer bevat een deterministische hint
// ("auto-categorie: Abonnement") uit `detectRecurringTransactions`. Voor 12 van
// de 16 `RecurringCategory`-waarden ligt de klasse dáármee al vast: Abonnement →
// subscription; Huur/Hypotheek/Nutsvoorziening/Verzekering/Belasting/
// Kinderopvang/Woonlasten/Lening → vaste_kosten; Salaris/Overig inkomen →
// inkomsten en dus skip. Voor díe gevallen voegt het model niets toe en is
// napraten precies het juiste antwoord.
//
// De AI verdient zijn plek uitsluitend in de RESTGROEP: `other_expense`,
// `transport`, `healthcare`, `savings` en `donation` — daar zegt de hint
// nauwelijks iets ("Overige uitgave") en moet de naam van de tegenpartij het
// werk doen. Dat is in de praktijk ook de grootste bak.
//
// Daarom METEN we het in plaats van het aan te nemen: `hintKlasse` geeft de
// deterministische verwachting waar die bestaat, en de resolver telt per chunk
// hoe vaak het model afwijkt. Wijkt het model in de eenduidige gevallen
// structureel af, dan is de prompt stuk; wijkt het in de restgroep NOOIT af van
// een naïeve "overige → skip", dan is de AI-stap daar zinloos en volstaat de
// deterministische categorie. Beide zijn af te lezen uit de '[lokale-ai]'-regel
// in de console.
//
// De uitkomst blijft hoe dan ook ASSISTIEF: net als in het cloud-pad bevestigt
// de gebruiker elk voorstel (en kan hij de klasse omzetten) vóór er iets wordt
// opgeslagen. Er wordt niets automatisch vastgelegd op gezag van dit model.

/**
 * De deterministische klasse die uit de auto-categorie volgt, of `null` wanneer
 * de categorie niets eenduidigs zegt (dán moet het model oordelen).
 */
export function hintKlasse(category: RecurringCategory): VasteKostenKlasse | null {
  switch (category) {
    case 'subscription':
      return 'subscription'
    case 'rent':
    case 'mortgage':
    case 'utility':
    case 'insurance':
    case 'taxes':
    case 'childcare':
    case 'housing_other':
    case 'loan':
      return 'vaste_kosten'
    case 'salary':
    case 'other_income':
      // Inkomsten horen niet in een vaste-lastenoverzicht thuis.
      return 'skip'
    default:
      // other_expense / transport / healthcare / savings / donation — hier moet
      // het model het doen.
      return null
  }
}

/** Telling van de hint-volgzaamheid over één chunk. */
export interface HintVolgzaamheid {
  /** Kandidaten waarvoor de hint een eenduidige klasse impliceert. */
  eenduidig: number
  /** Daarvan: hoe vaak het model diezelfde klasse koos. */
  gevolgd: number
  /** Kandidaten waar de hint niets zegt — hier verdient de AI zijn plek. */
  open: number
  /** Daarvan: hoe vaak het model iets anders koos dan `skip`. */
  openBeoordeeld: number
}

/** Meet hoe vaak het model de deterministische hint napraat (zie het blok hierboven). */
export function meetHintVolgzaamheid(
  candidates: VasteKostenCandidate[],
  results: VasteKostenClassificatie[],
): HintVolgzaamheid {
  const byId = new Map(results.map((r) => [r.id, r] as const))
  const out: HintVolgzaamheid = { eenduidig: 0, gevolgd: 0, open: 0, openBeoordeeld: 0 }
  for (const c of candidates) {
    const hint = hintKlasse(c.autoCategory)
    const klasse = byId.get(c.id)?.klasse
    if (hint === null) {
      out.open++
      if (klasse && klasse !== 'skip') out.openBeoordeeld++
    } else {
      out.eenduidig++
      if (klasse === hint) out.gevolgd++
    }
  }
  return out
}

// ── Prompt ────────────────────────────────────────────────────────────────────

/**
 * De gebruikersprompt voor één chunk. Het SYSTEEM-deel is
 * `VASTE_KOSTEN_ANALYSE_PROMPT` uit lib/ai/dna/wil.ts, letterlijk en ongewijzigd
 * — de wording daarvan is eigendom van het prompt-DNA, niet van deze module.
 *
 * Wat hier WÉL wordt bepaald is het UITVOERCONTRACT, en dat wijkt bewust af van
 * het cloud-pad: dat gebruikt `generateObject` met een zod-schema en positionele
 * indexen, wat on-device niet bestaat. Twee harde keuzes:
 *
 *  - ID-ECHO, NOOIT POSITIONEEL. Het model moet het id teruggeven dat het kreeg.
 *    Laat een klein model één regel vallen — en dat doet het — dan schuift bij
 *    positionele koppeling de hele rest één op en krijgt "Vattenfall" de reden
 *    van "Spotify". Een gemiste regel mag hoogstens één kandidaat kosten.
 *  - REDEN MAX 8 WOORDEN. Puur een snelheidsmaatregel: de reden is veruit het
 *    duurste deel van de decode en 8 woorden is genoeg om de keuze te kunnen
 *    controleren ("vast bedrag, streamingdienst").
 */
export function buildVasteKostenUserPrompt(candidates: VasteKostenCandidate[]): string {
  const lijst = candidates
    .map((c, i) => {
      const bedrag = Math.abs(c.averageAmount).toFixed(2)
      return `${vasteKostenItemId(i)}: ${c.name} | ${c.frequency} | €${bedrag}/keer | ${c.occurrences}x gezien | auto-categorie: ${c.autoCategoryLabel}`
    })
    .join('\n')

  return `Classificeer elk van deze terugkerende betalingen als subscription, vaste_kosten of skip:

${lijst}

ANTWOORD: precies ${candidates.length} regels, één JSON-object per regel, geen andere tekst:
{"id":"t1","klasse":"vaste_kosten","reden":"vast maandbedrag energieleverancier"}
- "id": exact het id uit de lijst hierboven (${vasteKostenItemId(0)} t/m ${vasteKostenItemId(candidates.length - 1)}), elk id precies één keer
- "klasse": alleen subscription, vaste_kosten of skip
- "reden": maximaal 8 woorden, Nederlands`
}

// ── Mapping ───────────────────────────────────────────────────────────────────

/** Normaliseer één ruw modelobject naar {id, klasse, reden}; null als onbruikbaar. */
export function normalizeVasteKostenItem(item: unknown): { id: string | null; klasse: string; reden: string } | null {
  if (!item || typeof item !== 'object') return null
  const o = item as Record<string, unknown>
  if (!('klasse' in o) && !('id' in o)) return null
  const idRaw = o.id
  const id = idRaw === null || idRaw === undefined || idRaw === '' ? null : String(idRaw).trim()
  const klasse = typeof o.klasse === 'string' ? o.klasse.trim().toLowerCase() : ''
  const reden = typeof o.reden === 'string' ? o.reden.trim() : ''
  return { id, klasse, reden }
}

/**
 * PUUR: map de modeloutput van één chunk terug op de aangeboden kandidaten.
 *
 *  - Id-echo-mapping via het teruggeechode "id" (t1..tN), NOOIT positioneel.
 *  - Ontbrekend/onbekend id → die kandidaat krijgt `skip` met een eerlijke reden.
 *  - Duplicaat-id → het eerste telt (het model herhaalt zichzelf soms).
 *  - Klasse buiten de whitelist → `skip`.
 *
 * Elke aangeboden kandidaat krijgt exact één resultaat terug, in dezelfde
 * volgorde — zodat de aanroeper nooit hoeft te raden wat er met een item gebeurde.
 */
export function mapVasteKostenChunkResults(
  chunkItems: VasteKostenCandidate[],
  objects: unknown[] | null,
): VasteKostenClassificatie[] {
  const idToIndex = new Map<string, number>()
  chunkItems.forEach((_, i) => idToIndex.set(vasteKostenItemId(i), i))

  const assigned: ({ klasse: string; reden: string } | null)[] = new Array(chunkItems.length).fill(null)
  const seen = new Set<string>()

  for (const raw of objects ?? []) {
    const item = normalizeVasteKostenItem(raw)
    if (!item || item.id === null) continue // ontbrekend id
    const idx = idToIndex.get(item.id)
    if (idx === undefined) continue // onbekend id (bv. verzonnen t99)
    if (seen.has(item.id)) continue // duplicaat → eerste telt
    seen.add(item.id)
    assigned[idx] = { klasse: item.klasse, reden: item.reden }
  }

  return chunkItems.map((c, i) => {
    const raw = assigned[i]
    if (!raw) {
      // Gedragspariteit met de cloud-route: een kandidaat zonder classificatie
      // komt als `skip` in de lijst, mét de reden waarom — de gebruiker ziet 'm
      // onder "overgeslagen" en kan er alsnog iets mee.
      return { id: c.id, klasse: 'skip' as const, reden: 'Geen classificatie ontvangen van AI' }
    }
    const klasse = (VASTE_KOSTEN_KLASSEN as readonly string[]).includes(raw.klasse)
      ? (raw.klasse as VasteKostenKlasse)
      : 'skip'
    return { id: c.id, klasse, reden: raw.reden || 'Geen reden ontvangen van AI' }
  })
}

// ── Resolver ──────────────────────────────────────────────────────────────────

export interface LocalVasteKostenOptions {
  /**
   * Wordt aangeroepen rond het laden van de on-device sessie: 'starten' vlak
   * vóór loadModelSession(), 'klaar' zodra die resolved. De eerste (koude)
   * sessie-load is de trage GPU-warmup (~45-60 s, volledig stil); dit signaal
   * laat de sheet daar feedback op tonen zodat het niet als een hang voelt.
   * loadModelSession cachet, dus na de eerste chunk is starten→klaar vrijwel
   * instant — dat is prima.
   */
  onSessionState?: (s: 'starten' | 'klaar') => void
  /**
   * Per afgeronde chunk aangeroepen met de resultaten van díe chunk plus de
   * voortgang. Hiermee rendert de sheet progressief: zonder dit zou de gebruiker
   * minutenlang naar een spinner kijken voor er iets verschijnt.
   */
  onChunk?: (results: VasteKostenClassificatie[], done: number, total: number) => void
}

/**
 * Bouwt de lokale vaste-kosten-resolver. Geeft een functie die een lijst
 * kandidaten classificeert en de volledige uitkomst teruggeeft; tussentijds
 * levert `onChunk` de deelresultaten.
 *
 * Werpt wanneer een chunk ook ná sessieherstel faalt — de sheet toont dan een
 * eerlijke foutmelding. Er is GEEN cloud-fallback: dat zou de privacybelofte
 * breken die de gebruiker juist heeft gekozen.
 */
export function createLocalVasteKostenResolver(
  opts?: LocalVasteKostenOptions,
): (candidates: VasteKostenCandidate[]) => Promise<VasteKostenClassificatie[]> {
  const onSessionState = opts?.onSessionState
  const onChunk = opts?.onChunk

  const runChunk = async (chunkItems: VasteKostenCandidate[]): Promise<unknown[] | null> => {
    onSessionState?.('starten')
    const session = await loadModelSession()
    onSessionState?.('klaar')
    const text = await session.generate(
      [
        { role: 'system', content: VASTE_KOSTEN_ANALYSE_PROMPT },
        { role: 'user', content: buildVasteKostenUserPrompt(chunkItems) },
      ],
      suggestVasteKostenMaxNewTokens(chunkItems.length),
    )
    // Eén JSON-object per regel is géén array — `extractLocalJsonObjects` valt
    // daarvoor terug op de salvage-route (losse top-level objecten), en vangt
    // meteen ook fences, <think>-preambles en afkapping af.
    return extractLocalJsonObjects(text).objects
  }

  const runChunkWithRecovery = async (chunkItems: VasteKostenCandidate[]): Promise<unknown[] | null> => {
    try {
      return await runChunk(chunkItems)
    } catch (err) {
      // Mogelijke device-loss/poisoned session → dispose + verse sessie, één keer
      // opnieuw. Faalt het weer, propageer de fout naar de sheet. ALTIJD loggen:
      // zonder deze regels is een lokale-AI-fout voor gebruiker én support
      // volstrekt onzichtbaar — de UI toont alleen een generieke melding.
      console.error('[lokale-ai] vaste-kosten-chunk mislukt — sessieherstel + één retry volgt:', err)
      await disposeSession()
      try {
        return await runChunk(chunkItems)
      } catch (err2) {
        console.error('[lokale-ai] vaste-kosten-chunk mislukt ná sessieherstel — analyse faalt definitief:', err2)
        throw err2
      }
    }
  }

  return async (candidates: VasteKostenCandidate[]): Promise<VasteKostenClassificatie[]> => {
    const results: VasteKostenClassificatie[] = []
    const totaal = candidates.length
    const meting: HintVolgzaamheid = { eenduidig: 0, gevolgd: 0, open: 0, openBeoordeeld: 0 }

    for (const internal of chunk(candidates, LOCAL_VASTE_KOSTEN_CHUNK_SIZE)) {
      const objects = await runChunkWithRecovery(internal)
      const mapped = mapVasteKostenChunkResults(internal, objects)
      results.push(...mapped)

      const m = meetHintVolgzaamheid(internal, mapped)
      meting.eenduidig += m.eenduidig
      meting.gevolgd += m.gevolgd
      meting.open += m.open
      meting.openBeoordeeld += m.openBeoordeeld

      onChunk?.(mapped, results.length, totaal)
    }

    // Zie het hint-volgzaamheidsblok hierboven: dit is de meting die bepaalt of
    // de AI-stap hier iets toevoegt of dat de deterministische categorie volstaat.
    console.info(
      `[lokale-ai] vaste-kosten: hint eenduidig ${meting.gevolgd}/${meting.eenduidig} gevolgd; ` +
        `open ${meting.openBeoordeeld}/${meting.open} als vaste last beoordeeld`,
    )

    return results
  }
}
