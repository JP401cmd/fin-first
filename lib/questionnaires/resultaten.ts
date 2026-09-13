import { ANDERS_LABEL, JA, NEE, keuzesUitOpslag, type OpgeslagenAntwoord } from './antwoord'

/**
 * Vragenlijsten — samenvattingen per vraag voor /beheer/vragenlijsten.
 *
 * Bewust puur en klein: dit zijn tellingen over feedbackantwoorden, geen
 * financiële rekenmotor (die horen in lib/architecture/calculations.ts).
 */

/** Gemiddelde van de schaalantwoorden, of null zonder antwoorden. */
export function schaalGemiddelde(antwoorden: OpgeslagenAntwoord[]): number | null {
  const cijfers = antwoorden.map((a) => a.answer_scale).filter((c): c is number => c != null)
  if (cijfers.length === 0) return null
  return cijfers.reduce((s, c) => s + c, 0) / cijfers.length
}

/**
 * Net Promoter Score over een 0–10-schaal: % promoters (9–10) min % criticasters
 * (0–6), afgerond op een geheel getal. Alleen zinvol bij bereik 0–10.
 */
export function npsScore(antwoorden: OpgeslagenAntwoord[]): { score: number; promoters: number; passief: number; criticasters: number } | null {
  const cijfers = antwoorden.map((a) => a.answer_scale).filter((c): c is number => c != null)
  if (cijfers.length === 0) return null
  const promoters = cijfers.filter((c) => c >= 9).length
  const criticasters = cijfers.filter((c) => c <= 6).length
  return {
    score: Math.round(((promoters - criticasters) / cijfers.length) * 100),
    promoters,
    passief: cijfers.length - promoters - criticasters,
    criticasters,
  }
}

/** Aantal "Ja" en het aandeel daarvan (0–100, afgerond), of null zonder antwoorden. */
export function jaNeeTelling(antwoorden: OpgeslagenAntwoord[]): { ja: number; nee: number; jaPct: number } | null {
  // Expliciet op Ja én Nee: een afwijkende waarde (bv. een vraag die later van
  // type wisselde) hoort niet stil als "Nee" mee te tellen.
  const ja = antwoorden.filter((a) => a.answer_choice === JA).length
  const nee = antwoorden.filter((a) => a.answer_choice === NEE).length
  if (ja + nee === 0) return null
  return { ja, nee, jaPct: Math.round((ja / (ja + nee)) * 100) }
}

/**
 * Telling per optie bij meerkeuze, plus de losse "Anders"-teksten. Opties
 * zonder stemmen staan er met 0 in, in de volgorde van de vraag.
 */
export function keuzeTelling(antwoorden: OpgeslagenAntwoord[], opties: string[]): { telling: [string, number][]; anders: string[] } {
  const tellingen = new Map<string, number>(opties.map((o) => [o, 0]))
  const anders: string[] = []
  for (const a of antwoorden) {
    for (const k of keuzesUitOpslag(a.answer_choice)) {
      tellingen.set(k, (tellingen.get(k) ?? 0) + 1)
      if (k === ANDERS_LABEL && a.answer_text) anders.push(a.answer_text)
    }
  }
  return { telling: [...tellingen.entries()], anders }
}

/**
 * Rangschikken: gemiddelde positie per optie (1 = bovenaan), oplopend
 * gesorteerd. Is de vraag later aangepast, dan telt per antwoord alleen de
 * relatieve volgorde van de HUIDIGE opties: verwijderde opties vallen eruit en
 * de rest schuift op, zodat oude en nieuwe antwoorden op dezelfde schaal staan.
 */
export function gemiddeldePositie(antwoorden: OpgeslagenAntwoord[], opties: string[]): { optie: string; positie: number; aantal: number }[] {
  const som = new Map<string, { totaal: number; aantal: number }>(opties.map((o) => [o, { totaal: 0, aantal: 0 }]))
  for (const a of antwoorden) {
    keuzesUitOpslag(a.answer_choice).filter((k) => som.has(k)).forEach((k, i) => {
      const s = som.get(k)
      if (s) {
        s.totaal += i + 1
        s.aantal += 1
      }
    })
  }
  return [...som.entries()]
    .filter(([, s]) => s.aantal > 0)
    .map(([optie, s]) => ({ optie, positie: s.totaal / s.aantal, aantal: s.aantal }))
    .sort((x, y) => x.positie - y.positie)
}
