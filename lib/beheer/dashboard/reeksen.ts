import { amsterdamDag, dagVanIso, dagenTotEnMet, verschuifDag } from './tijd'

/**
 * Tijdreeksen per dag voor het beheerdashboard. Puur: de aanroeper levert de
 * tijdstempels en het moment van nu.
 *
 * TWEE REGELS DIE HIER VASTLIGGEN
 *
 *  1. Een dag buiten het leesvenster is `null`, geen 0. De foutenstapel wordt
 *     gelezen met een bovengrens (`ERROR_GROUPS_MAX_ROWS`); is het venster
 *     afgekapt, dan weten we van de dagen ervóór niets. De oudste dag ín het
 *     venster is dan zelf onvolledig en telt ook als niet gemeten.
 *  2. Vergelijken gaat over VOLLE dagen. Vandaag loopt nog; een periode die
 *     vandaag meetelt naast een periode van volle dagen, vergelijkt ongelijke
 *     lengtes. Vandaag staat wel in de reeks, gemarkeerd als lopend.
 */

export interface DagPunt {
  dag: string
  /** `null` = niet gemeten (buiten het leesvenster). */
  aantal: number | null
  /** De dag van vandaag: nog niet afgelopen. */
  lopend: boolean
}

export interface ReeksOpties {
  nu: Date
  /** Aantal dagen in de reeks, vandaag inbegrepen. */
  dagen: number
  /**
   * Oudste tijdstempel in een AFGEKAPT leesvenster. Dagen tot en met die dag
   * gelden als niet gemeten. Laat weg als het venster volledig is.
   */
  afgekaptVanaf?: string | null
}

/** Telt tijdstempels per Amsterdamse kalenderdag. */
export function telPerDag(momenten: readonly (string | null | undefined)[], opties: ReeksOpties): DagPunt[] {
  const vandaag = amsterdamDag(opties.nu)
  const dagen = dagenTotEnMet(vandaag, opties.dagen)
  const grens = dagVanIso(opties.afgekaptVanaf)

  const tellingen = new Map<string, number>()
  for (const m of momenten) {
    const dag = dagVanIso(m)
    if (dag) tellingen.set(dag, (tellingen.get(dag) ?? 0) + 1)
  }

  return dagen.map((dag) => ({
    dag,
    aantal: grens !== null && dag <= grens ? null : (tellingen.get(dag) ?? 0),
    lopend: dag === vandaag,
  }))
}

export interface PeriodeVergelijking {
  /** Lengte van elke periode in volle dagen. */
  dagen: number
  huidig: { van: string; tot: string; aantal: number | null }
  vorig: { van: string; tot: string; aantal: number | null }
  /** `huidig − vorig`; `null` als een van beide niet volledig gemeten is. */
  verschil: number | null
}

/**
 * De laatste `dagen` volle dagen tegenover de `dagen` volle dagen daarvoor.
 * Een periode met ook maar één niet-gemeten dag heeft geen totaal: een
 * deelsom presenteren als het geheel zou een daling verzinnen.
 */
export function vergelijkPerioden(
  reeks: readonly DagPunt[],
  opties: { nu: Date; dagen: number },
): PeriodeVergelijking {
  const gisteren = verschuifDag(amsterdamDag(opties.nu), -1)
  const huidigTot = gisteren
  const huidigVan = verschuifDag(huidigTot, -(opties.dagen - 1))
  const vorigTot = verschuifDag(huidigVan, -1)
  const vorigVan = verschuifDag(vorigTot, -(opties.dagen - 1))

  const opDag = new Map(reeks.map((p) => [p.dag, p]))
  const som = (van: string, tot: string): number | null => {
    let totaal = 0
    for (let dag = van; dag <= tot; dag = verschuifDag(dag, 1)) {
      const punt = opDag.get(dag)
      if (!punt || punt.aantal === null) return null
      totaal += punt.aantal
    }
    return totaal
  }

  const huidig = som(huidigVan, huidigTot)
  const vorig = som(vorigVan, vorigTot)
  return {
    dagen: opties.dagen,
    huidig: { van: huidigVan, tot: huidigTot, aantal: huidig },
    vorig: { van: vorigVan, tot: vorigTot, aantal: vorig },
    verschil: huidig !== null && vorig !== null ? huidig - vorig : null,
  }
}

/** Hoeveel dagen de reeks moet beslaan om twee periodes plus vandaag te dekken. */
export function reeksLengteVoor(dagen: number): number {
  return dagen * 2 + 1
}

/** De laatste `dagen` punten, vandaag inbegrepen: wat de grafiek toont. */
export function laatsteDagen(reeks: readonly DagPunt[], dagen: number): DagPunt[] {
  return reeks.slice(Math.max(0, reeks.length - dagen))
}

/** Som van de gemeten dagen in een reeks; `null` als er geen enkele gemeten is. */
export function somGemeten(reeks: readonly DagPunt[]): number | null {
  const gemeten = reeks.filter((p) => p.aantal !== null)
  if (gemeten.length === 0) return null
  return gemeten.reduce((s, p) => s + (p.aantal ?? 0), 0)
}
