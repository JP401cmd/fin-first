// Robuuste extractie van de categorisatie-JSON uit ruwe modeltekst (lokaal pad).
//
// Overgenomen uit de fase-0-spike (spikes/lokale-categorisatie/parse.ts), de
// geverifieerde referentie-implementatie. Waargenomen faalmodi op de desktop-
// meting: markdown-fences, thinking-preambles en AFKAPPING (max_new_tokens te
// laag → array niet afgesloten). Deze parser stript fences + <think>-preambles
// en probeert bij een afgekapte array de reeds complete objecten alsnog te
// bergen (salvage), zodat afkapping niet de héle interne batch onbruikbaar
// maakt. Puur (geen Transformers.js) → los te unit-testen.

export type RawLocalCategorization = {
  /** Door het model teruggeechood batch-id (t1..tN), of null als het ontbreekt. */
  id: string | null
  budget_slug: string | null
  confidence: number
  reasoning: string
}

export type LocalParseResult = {
  /** Genormaliseerde items, of null als er niets bruikbaars in zat. */
  items: RawLocalCategorization[] | null
  hadFence: boolean
  hadThink: boolean
  /** Ruwe output eindigde niet op ] of } → waarschijnlijk afgekapt. */
  truncated: boolean
  /** Array-parse faalde maar losse objecten zijn alsnog geborgen. */
  salvaged: boolean
}

/** Strip <think>…</think>-preambles (ook een niet-afgesloten openende tag). */
// GEDEELD (geëxporteerd sinds de rapport-inleiding + wat-als-suggesties lokaal
// gingen draaien): dezelfde drie faalmodi — think-preamble, fence, afkapping —
// treffen élke lokale generatie. Eén implementatie, meerdere consumenten; de
// werking hier is ongewijzigd (puur additief `export`).
export function stripThink(s: string): string {
  return s.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '')
}

/** Vind de eerste balanced top-level JSON-array; null als niet gesloten/parsebaar. */
export function balancedArray(t: string, start: number): unknown[] | null {
  let depth = 0
  let end = -1
  let inStr = false
  let esc = false
  for (let i = start; i < t.length; i++) {
    const c = t[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '[') depth++
    else if (c === ']') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end === -1) return null
  try {
    const parsed = JSON.parse(t.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Berg alle complete top-level {…}-objecten (voor een afgekapte array). */
export function salvageObjects(s: string): unknown[] {
  const out: unknown[] = []
  let i = 0
  while (i < s.length) {
    if (s[i] !== '{') {
      i++
      continue
    }
    let depth = 0
    let inStr = false
    let esc = false
    let end = -1
    for (let j = i; j < s.length; j++) {
      const c = s[j]
      if (inStr) {
        if (esc) esc = false
        else if (c === '\\') esc = true
        else if (c === '"') inStr = false
        continue
      }
      if (c === '"') inStr = true
      else if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) {
          end = j
          break
        }
      }
    }
    if (end === -1) break // laatste object is afgekapt → stop
    try {
      out.push(JSON.parse(s.slice(i, end + 1)))
    } catch {
      /* onbruikbaar object overslaan */
    }
    i = end + 1
  }
  return out
}

function nonNull<T>(v: T | null): v is T {
  return v !== null
}

/** Ruwe JSON-objecten uit modeltekst + de diagnose van hoe ze eruit kwamen. */
export type LocalJsonExtraction = {
  /** De gevonden top-level objecten, of null als er niets bruikbaars in zat. */
  objects: unknown[] | null
  hadFence: boolean
  hadThink: boolean
  truncated: boolean
  salvaged: boolean
}

/**
 * De EXTRACTIE-helft van {@link parseLocalCategorizations}: fences en
 * <think>-preambles strippen, de eerste balanced array pakken en bij afkapping
 * de complete objecten bergen — zonder enige aanname over de VORM van die
 * objecten.
 *
 * Waarom dit apart staat: de faalmodi die deze parser opvangt (fences, think-
 * preambles, afkapping) zijn eigenschappen van het lokale MODEL, niet van de
 * categorisatie-taak. Elke volgende on-device taak — de vaste-kosten-analyse is
 * de eerste — loopt tegen exact dezelfde drie aan. Die logica een tweede keer
 * overtypen is precies de drift die we bij de prompts ook weigeren; daarom
 * delegeert `parseLocalCategorizations` hieronder naar deze functie en verschilt
 * alleen nog de normalisatie per taak.
 */
export function extractLocalJsonObjects(text: string): LocalJsonExtraction {
  const original = text.trim()
  const hadThink = /<think>/i.test(original)

  let t = stripThink(original).trim()

  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const hadFence = fence !== null
  if (fence) t = fence[1].trim()

  // Afkapping bepalen op de OPGESCHOONDE inhoud (na fence/think), niet op de ruwe
  // string — anders markeert een fence-afsluiting (```) een compleet antwoord
  // ten onrechte als afgekapt.
  const endsClean = /[\]}]\s*$/.test(t)

  const start = t.indexOf('[')
  if (start === -1) {
    // Geen array-haakje: probeer losse objecten (bv. per-regel JSON).
    const salv = salvageObjects(t)
    return {
      objects: salv.length ? salv : null,
      hadFence,
      hadThink,
      truncated: !endsClean,
      salvaged: salv.length > 0,
    }
  }

  const arr = balancedArray(t, start)
  if (arr) {
    return { objects: arr, hadFence, hadThink, truncated: false, salvaged: false }
  }

  // Array niet gesloten (afkapping) → berg de complete objecten uit de body.
  const salv = salvageObjects(t.slice(start + 1))
  return {
    objects: salv.length ? salv : null,
    hadFence,
    hadThink,
    truncated: true,
    salvaged: salv.length > 0,
  }
}

/** Normaliseer één ruw item naar {id, budget_slug, confidence, reasoning}.
 *  reasoning mag ontbreken ('kort'-uitvoer). */
export function normalizeLocalItem(item: unknown): RawLocalCategorization | null {
  if (!item || typeof item !== 'object') return null
  const o = item as Record<string, unknown>
  if (!('budget_slug' in o) && !('confidence' in o)) return null
  const idRaw = o.id
  const id = idRaw === null || idRaw === undefined || idRaw === '' ? null : String(idRaw).trim()
  const slugRaw = o.budget_slug
  const slug = slugRaw === null || slugRaw === undefined || slugRaw === 'null' ? null : String(slugRaw)
  const confRaw = Number(o.confidence)
  const confidence = Number.isFinite(confRaw) ? Math.min(1, Math.max(0, confRaw)) : 0
  const reasoning = typeof o.reasoning === 'string' ? o.reasoning : ''
  return { id, budget_slug: slug, confidence, reasoning }
}

/**
 * Parse de modeloutput naar categorisatie-items + diagnose.
 *
 * Dunne laag boven {@link extractLocalJsonObjects}: die doet de model-faalmodi
 * (fence/think/afkapping), hier gebeurt alleen nog de taak-specifieke
 * normalisatie. Gedrag is ongewijzigd — `objects: null` blijft `items: null`,
 * een gevonden array blijft een (mogelijk lege) lijst.
 */
export function parseLocalCategorizations(text: string): LocalParseResult {
  const { objects, hadFence, hadThink, truncated, salvaged } = extractLocalJsonObjects(text)
  return {
    items: objects ? objects.map(normalizeLocalItem).filter(nonNull) : null,
    hadFence,
    hadThink,
    truncated,
    salvaged,
  }
}
