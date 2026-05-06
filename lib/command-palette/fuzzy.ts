// Sublime-stijl fuzzy ranker. Subsequence-match + bonuses voor:
//   - match aan begin van string
//   - match net na separator (space, dash, slash)
//   - opeenvolgende matches
// Plus een lengte-penalty zodat kortere matches winnen bij gelijke kwaliteit.
//
// Returnt `null` als query niet als subsequence in target voorkomt — dan filtert
// de caller het item weg. Volledige token-match (`query.includes(token)`) krijgt
// een grote bonus zodat exacte zoekopdrachten altijd boven fuzzy-hits staan.

const SEPARATOR_RE = /[\s\-/_]/

// Combining diacritical marks — verwijdert accenten na NFD-decompositie.
const DIACRITIC_RE = /[̀-ͯ]/g

export type FuzzyResult = {
  score: number
  /** 0-based indices waarop in de target gematcht is — voor highlight-rendering (toekomstig). */
  matchedIndices: number[]
}

/**
 * Score een target tegen een query. Case-insensitive. Diakritisch-strip beperkt
 * tot een lichte normalisatie (ë→e etc.) zodat "schoolfond" "schoolfönds" raakt.
 */
export function fuzzyScore(target: string, query: string): FuzzyResult | null {
  if (!query) return { score: 0, matchedIndices: [] }
  const t = normalize(target)
  const q = normalize(query)
  if (q.length > t.length) return null

  // Snelle exact-substring-pad: grootste bonus, geen subsequence-loop nodig.
  const exactIdx = t.indexOf(q)
  if (exactIdx >= 0) {
    const startBonus = exactIdx === 0 ? 50 : 0
    const sepBonus = exactIdx > 0 && SEPARATOR_RE.test(t[exactIdx - 1] ?? '') ? 20 : 0
    const lengthPenalty = (t.length - q.length) * 0.5
    const score = 100 + startBonus + sepBonus + q.length * 4 - lengthPenalty
    const matchedIndices = Array.from({ length: q.length }, (_, i) => exactIdx + i)
    return { score, matchedIndices }
  }

  // Subsequence-match met bonuses.
  let ti = 0
  let qi = 0
  let score = 0
  let consecutive = 0
  const matchedIndices: number[] = []
  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) {
      let charScore = 1
      if (ti === 0) charScore += 8
      else if (SEPARATOR_RE.test(t[ti - 1] ?? '')) charScore += 5
      consecutive += 1
      charScore += Math.min(consecutive, 4) * 2
      score += charScore
      matchedIndices.push(ti)
      qi += 1
    } else {
      consecutive = 0
    }
    ti += 1
  }
  if (qi < q.length) return null
  // Lengte-penalty: hoe meer "ruis" in target, hoe lager de score.
  const lengthPenalty = (t.length - q.length) * 0.3
  score -= lengthPenalty
  return { score, matchedIndices }
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(DIACRITIC_RE, '')
}
