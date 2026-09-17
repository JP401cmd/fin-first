import { z } from 'zod'
import { onderdrukCel, onderdrukVerdeling, type Cel, type Verdeling } from './onderdrukking'
import { BandSchema } from './schema'

/**
 * Doorstroom per actieve dag voor de Sankey op /beheer/gebruik (ADR 0153).
 *
 * Kolommen zijn "actieve dag 1 … 4" van een gebruiker binnen de gekozen
 * periode; knopen zijn de waardestroom(en) van die dag. Dagen, geen schermen:
 * de schermvolgorde binnen een bezoek (zoals een klassieke pagina-Sankey) is
 * fase 2 en wordt niet gemeten (ADR 0154, voorstel).
 *
 * Bron: `admin_gebruik_doorstroom(p_dagen, p_intern, p_config)` (migratie
 * 20260917123000). Elke telling is in de database al k-onderdrukt (null = 1..k-1).
 *
 * ONDERDRUKKING VAN DE MATRIX. De overgangen tussen dag n en n+1 vormen een
 * matrix met publieke rij- en kolomtotalen (de knopen). Regel: een overgang
 * n → n+1 is alléén zichtbaar als (1) alle knopen van dag n én n+1 zichtbaar
 * zijn, (2) de dagtotalen van n en n+1 zichtbaar zijn en (3) geen enkele cel van
 * de matrix — inclusief "stopt" — onder k ligt. Anders gaat de hele overgang
 * dicht. Een lezer die het algoritme kent, kan zo — IN ISOLATIE — geen kleine
 * cel exact bepalen (doorstroom.test.ts speelt die lezer op kleine matrices).
 * Zichtbare nullen in een tabel die een superset telt, kunnen een verborgen cel
 * wél vastpinnen; daarom staat de losse stroom→stroom-matrix niet meer op de
 * pagina en toont het ritme geen aantal onder k (security-review 17-09-2026).
 * Wat overblijft is het benoemde restrisico in ADR 0153.
 */

export const SANKEY_MAX_STAP = 4
export const KNOOP_MEERDERE = '_meerdere'
export const KNOOP_GEEN = '_geen'
export const KNOOP_STOPT = '_stopt'

const n = z.number().int().nonnegative().nullable()
const knoopId = z.string().regex(/^(?:[a-z0-9-]{1,40}|_meerdere|_geen)$/)

export const DoorstroomRuwSchema = z
  .object({
    k: z.number().int().positive(),
    venster_dagen: z.union([z.literal(30), z.literal(90), z.literal(365)]),
    band: BandSchema,
    intern: z.boolean(),
    max_stap: z.literal(SANKEY_MAX_STAP),
    actief_venster: n,
    dagen_verdeling: z.array(z.object({ aantal: z.number().int().min(1).max(5), gebruikers: n }).strict()).length(5),
    stappen: z
      .array(
        z
          .object({
            stap: z.number().int().min(1).max(SANKEY_MAX_STAP),
            totaal: n,
            knopen: z.array(z.object({ knoop: knoopId, gebruikers: n }).strict()),
          })
          .strict(),
      )
      .length(SANKEY_MAX_STAP),
    overgangen: z.array(
      z
        .object({
          van_stap: z.number().int().min(1).max(SANKEY_MAX_STAP - 1),
          van: knoopId,
          naar: z.string().regex(/^(?:[a-z0-9-]{1,40}|_meerdere|_geen|_stopt)$/),
          gebruikers: n,
        })
        .strict(),
    ),
  })
  .strict()

export type DoorstroomRuw = z.infer<typeof DoorstroomRuwSchema>

export interface SankeyStap {
  stap: number
  totaal: Cel
  knopen: Array<{ knoop: string; gebruikers: Cel }>
}

export interface SankeyOvergang {
  vanStap: number
  /** false = deze overgang is als geheel verborgen (zie kop). */
  zichtbaar: boolean
  /** Alleen gevuld als `zichtbaar`; anders leeg — er gaat dan niets over de lijn. */
  cellen: Array<{ van: string; naar: string; gebruikers: Cel }>
}

export interface GebruikSankey {
  dagenVerdeling: { totaal: Cel; verdeling: Array<{ aantal: number; gebruikers: Cel }> }
  stappen: SankeyStap[]
  overgangen: SankeyOvergang[]
}

const isZichtbaar = (c: Cel) => c.soort === 'waarde'
const volledigZichtbaar = (v: Verdeling) => isZichtbaar(v.totaal) && v.cellen.every(isZichtbaar)

/**
 * Pure vertaling + onderdrukking. `knoopVolgorde` = de stroom-ids in
 * config-volgorde; de database levert dezelfde volgorde (de loader controleert).
 */
export function naarSankey(ruw: DoorstroomRuw): GebruikSankey {
  // Precies 1, 2, 3, 4, 5+ actieve dagen: een verdeling van "actief in de periode".
  const dagen = onderdrukVerdeling(
    ruw.dagen_verdeling.map((d) => d.gebruikers),
    ruw.actief_venster,
  )
  // Dagtotaal n (≥ n dagen) is alleen publiek voor n = 1, of als de hele
  // dagenverdeling zichtbaar is — anders zou een som van zichtbare cellen hem
  // alsnog prijsgeven.
  const dagenVol = volledigZichtbaar(dagen)

  const stapVerdelingen = ruw.stappen.map((s) => {
    const totaalPubliek = s.stap === 1 || dagenVol
    if (!totaalPubliek) {
      return {
        stap: s.stap,
        v: { totaal: { soort: 'verborgen' } as Cel, cellen: s.knopen.map((): Cel => ({ soort: 'verborgen' })) },
      }
    }
    return { stap: s.stap, v: onderdrukVerdeling(s.knopen.map((k) => k.gebruikers), s.totaal) }
  })

  const stappen: SankeyStap[] = ruw.stappen.map((s, i) => ({
    stap: s.stap,
    totaal: stapVerdelingen[i].v.totaal,
    knopen: s.knopen.map((k, j) => ({ knoop: k.knoop, gebruikers: stapVerdelingen[i].v.cellen[j] })),
  }))

  const overgangen: SankeyOvergang[] = []
  for (let vanStap = 1; vanStap < SANKEY_MAX_STAP; vanStap++) {
    const rijen = ruw.overgangen.filter((o) => o.van_stap === vanStap)
    const van = stapVerdelingen.find((s) => s.stap === vanStap)?.v
    const naar = stapVerdelingen.find((s) => s.stap === vanStap + 1)?.v
    const zichtbaar =
      rijen.length > 0 &&
      dagenVol &&
      !!van &&
      !!naar &&
      volledigZichtbaar(van) &&
      volledigZichtbaar(naar) &&
      rijen.every((o) => isZichtbaar(onderdrukCel(o.gebruikers)))
    overgangen.push({
      vanStap,
      zichtbaar,
      cellen: zichtbaar ? rijen.map((o) => ({ van: o.van, naar: o.naar, gebruikers: onderdrukCel(o.gebruikers) })) : [],
    })
  }

  return {
    dagenVerdeling: { totaal: dagen.totaal, verdeling: ruw.dagen_verdeling.map((d, i) => ({ aantal: d.aantal, gebruikers: dagen.cellen[i] })) },
    stappen,
    overgangen,
  }
}
