/**
 * Het VERSCHILVLAK tussen de basislijn en de wat-als-lijn op /toekomst.
 *
 * Pure, isomorfe module: geen React, geen SVG-kennis buiten het pad-formaat, geen kernel-run.
 * Beide reeksen komen al berekend binnen (de hoofdlijn uit `allPts`, de gestippelde lijn uit
 * de scenario-overlay) — hier wordt niets herrekend en niets geprojecteerd.
 *
 * WAAROM EEN VLAK EN NIET ALLEEN TWEE LIJNEN. Twee lijnen dicht bij elkaar laten zien dát er
 * verschil is, maar niet hoeveel en niet welke kant op. Het gearceerde vlak beantwoordt de
 * vraag die de knoppen stellen — levert dit meer of minder op? — zonder dat de lezer twee
 * curves met het oog hoeft af te trekken. Groen waar de wat-als BOVEN de basislijn ligt
 * (meer vermogen), rood waar hij eronder ligt.
 *
 * DE KRUISING IS HET HELE PUNT. Waar de twee lijnen elkaar snijden moet het vlak van kleur
 * wisselen op precies dat punt, niet op het eerstvolgende meetpunt: anders steekt er een
 * rood driehoekje boven de basislijn uit (of andersom) en klopt de kleur niet meer met wat
 * er staat. Daarom wordt het snijpunt lineair geïnterpoleerd en in BEIDE vlakken opgenomen.
 *
 * GRONDSLAG: beide reeksen moeten dezelfde grootheid dragen (netto vermogen óf liquide) —
 * de aanroeper levert ze uit dezelfde `primaryBasis`-keuze. Een vlak tussen twee verschillende
 * grondslagen zou een verschil tonen dat er niet is (CLAUDE.md: meng ze nooit op één as).
 */

/** Een punt op de tijdas: `[leeftijd, waarde]`. */
export type ChartPunt = readonly [number, number]

/** Eén aaneengesloten vlak tussen de twee lijnen, met de kant waarop de wat-als ligt. */
export interface DiffVlak {
  /** `boven` = de wat-als ligt hoger dan de basis (groen); `onder` = lager (rood). */
  readonly kant: 'boven' | 'onder'
  /** De omtrek in grafiek-coördinaten: heen over de wat-als, terug over de basis. */
  readonly punten: ChartPunt[]
}

/** Waarde van een reeks op een leeftijd; `null` als die leeftijd er niet in zit. */
function waardeOp(reeks: ReadonlyMap<number, number>, leeftijd: number): number | null {
  const v = reeks.get(leeftijd)
  return v == null || !Number.isFinite(v) ? null : v
}

/**
 * Splits de twee reeksen in aaneengesloten vlakken, één per kant, met een geïnterpoleerd
 * snijpunt op elke kruising. Leeftijden die maar in één reeks voorkomen tellen niet mee:
 * een vlak heeft twee randen nodig.
 *
 * Een verschil kleiner dan `drempel` (default 0) telt als "gelijk" en breekt het vlak af —
 * zo ontstaat er geen haarfijne sliver bij twee praktisch samenvallende lijnen.
 */
export function buildDiffVlakken(
  basis: readonly ChartPunt[],
  watAls: readonly ChartPunt[],
  drempel = 0,
): DiffVlak[] {
  const basisMap = new Map<number, number>()
  for (const [a, v] of basis) if (Number.isFinite(a) && Number.isFinite(v)) basisMap.set(a, v)
  const watAlsMap = new Map<number, number>()
  for (const [a, v] of watAls) if (Number.isFinite(a) && Number.isFinite(v)) watAlsMap.set(a, v)

  // Gedeelde leeftijden, oplopend — de tijdas van het vlak.
  const leeftijden = [...basisMap.keys()].filter((a) => watAlsMap.has(a)).sort((x, y) => x - y)
  if (leeftijden.length < 2) return []

  const vlakken: DiffVlak[] = []
  /** Het vlak dat we nu opbouwen: de wat-als-rand heen, de basis-rand terug. */
  let heen: ChartPunt[] = []
  let terug: ChartPunt[] = []
  let kant: 'boven' | 'onder' | null = null

  /** Sluit het lopende vlak af (heen + de basis-rand terug) en begin opnieuw. */
  const sluit = () => {
    if (kant !== null && heen.length >= 2) {
      vlakken.push({ kant, punten: [...heen, ...[...terug].reverse()] })
    }
    heen = []
    terug = []
    kant = null
  }

  for (let i = 0; i < leeftijden.length; i++) {
    const leeftijd = leeftijden[i]
    const b = waardeOp(basisMap, leeftijd)
    const w = waardeOp(watAlsMap, leeftijd)
    if (b === null || w === null) {
      sluit()
      continue
    }

    const verschil = w - b
    const nieuweKant: 'boven' | 'onder' | null =
      Math.abs(verschil) <= drempel ? null : verschil > 0 ? 'boven' : 'onder'

    // De lijnen raken elkaar: sluit het lopende vlak af ÓP dit punt, zodat de rand
    // samenvalt met de lijnen in plaats van er een meetpunt vóór te stoppen.
    if (nieuweKant === null) {
      if (kant !== null) {
        heen.push([leeftijd, w])
        terug.push([leeftijd, b])
        sluit()
      }
      continue
    }

    // KRUISING tussen het vorige en dit meetpunt: bepaal het snijpunt en laat beide
    // vlakken daar eindigen resp. beginnen — anders steekt er een rood driehoekje boven
    // de basislijn uit (of andersom) en klopt de kleur niet meer met wat er staat.
    if (kant !== null && nieuweKant !== kant) {
      const vorige = leeftijden[i - 1]
      const bVorig = waardeOp(basisMap, vorige)
      const wVorig = waardeOp(watAlsMap, vorige)
      if (bVorig !== null && wVorig !== null) {
        const d0 = wVorig - bVorig
        const d1 = verschil
        // d0 en d1 hebben een verschillend teken, dus de noemer is nooit 0.
        const t = d0 / (d0 - d1)
        const kruis: ChartPunt = [
          vorige + t * (leeftijd - vorige),
          bVorig + t * (b - bVorig),
        ]
        heen.push(kruis)
        terug.push(kruis)
        sluit()
        // Het nieuwe vlak begint op exact hetzelfde snijpunt — geen gat ertussen.
        heen.push(kruis)
        terug.push(kruis)
      } else {
        sluit()
      }
    }

    if (kant === null) kant = nieuweKant
    heen.push([leeftijd, w])
    terug.push([leeftijd, b])
  }
  sluit()

  return vlakken
}
