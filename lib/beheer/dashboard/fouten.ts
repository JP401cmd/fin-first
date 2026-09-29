import { errorSignature } from '@/lib/alerts/error-signature'
import type { ErrorGroup, ErrorLogRow } from '@/lib/error-groups'
import { amsterdamDag, dagVanIso, verschuifDag } from './tijd'

/**
 * Foutsoorten met hun gebruikersimpact, voor het beheerdashboard.
 *
 * De groepering zelf komt uit `buildErrorGroups` (lib/error-groups.ts, ADR 0113)
 * en wordt hier NIET opnieuw gedaan: open, afgehandeld en teruggekomen zijn de
 * standen van die module. Deze module voegt toe wat een groep niet draagt: hoe
 * vaak de soort recent voorkwam en hoeveel verschillende gebruikers hij raakte.
 *
 * GETROFFEN GEBRUIKERS IS EEN ONDERGRENS. Een deel van de foutregels draagt geen
 * gebruiker (fouten vóór inlog, server-fouten zonder sessie). Die tellen mee als
 * voorval, niet als gebruiker. Het aantal zonder gebruiker staat er daarom
 * altijd naast; zonder dat getal leest "3 gebruikers" als "het zijn er 3".
 *
 * Puur: geen IO. De gebruikers-id's komen binnen bij `naarVoorvallen` en gaan
 * daar niet verder: een voorval draagt een volgnummer, geen id.
 */

/** Context-prefix waarmee de AI-middleware mislukte aanroepen logt. */
export const AI_FOUT_CONTEXT_PREFIX = 'ai:'

export function isAiFout(context: string | null | undefined): boolean {
  return (context ?? '').toLowerCase().startsWith(AI_FOUT_CONTEXT_PREFIX)
}

/**
 * Eén foutregel, teruggebracht tot wat het dashboard telt. De sleutel wordt één
 * keer berekend; de melding zelf gaat niet mee.
 */
export interface Voorval {
  signature: string
  context: string | null
  created_at: string
  /**
   * Volgnummer van de gebruiker binnen deze ene lezing; `null` = het voorval
   * draagt geen gebruiker. Genoeg om verschillende gebruikers te tellen, en niet
   * terug te leiden tot een account: het nummer hangt af van de volgorde van de
   * regels en is bij een volgende lezing anders.
   */
  gebruiker: number | null
}

/**
 * Brengt foutregels terug tot telgegevens. Het gebruikers-id stopt hier: wat
 * verder gaat is een volgnummer, zodat een id ook niet per ongeluk in een prop
 * van een clientcomponent (en dus in de browser) kan belanden.
 */
export function naarVoorvallen(rows: readonly ErrorLogRow[]): Voorval[] {
  const nummers = new Map<string, number>()
  const nummerVan = (id: string | null | undefined): number | null => {
    if (!id) return null
    let nummer = nummers.get(id)
    if (nummer === undefined) {
      nummer = nummers.size + 1
      nummers.set(id, nummer)
    }
    return nummer
  }
  return rows.map((row) => ({
    signature: errorSignature(row.context, row.message),
    context: row.context,
    created_at: row.created_at,
    gebruiker: nummerVan(row.user_id),
  }))
}

export interface FoutsoortBeeld {
  signature: string
  context: string | null
  /** Nieuwste voorval, ingekort. Vrije tekst: alleen voor het beheerscherm. */
  voorbeeld: string
  niveau: string
  open: boolean
  /** Afgevinkt en daarna opnieuw voorgekomen: een regressie. */
  teruggekomen: boolean
  /** Voorvallen in het hele leesvenster. */
  aantal: number
  /** Voorvallen in de laatste `recentDagen` dagen, vandaag inbegrepen. */
  recent: number
  eerstGezien: string
  laatstGezien: string
  /** Verschillende gebruikers in het leesvenster (ondergrens). */
  gebruikers: number
  /** Voorvallen zonder gebruiker: tellen niet mee in `gebruikers`. */
  zonderGebruiker: number
  /** Eerste voorval na het afvinken; `null` als de soort niet is teruggekomen. */
  teruggekomenSinds: string | null
  sindsAfvinken: number
}

const VOORBEELD_MAX = 140

function kortIn(tekst: string): string {
  const schoon = tekst.replace(/\s+/g, ' ').trim()
  return schoon.length > VOORBEELD_MAX ? `${schoon.slice(0, VOORBEELD_MAX - 1)}…` : schoon
}

export interface FoutsoortOpties {
  nu: Date
  /** Lengte van "recent" in dagen, vandaag inbegrepen. */
  recentDagen: number
}

/** De eerste dag van "recent": `recentDagen` dagen, vandaag inbegrepen. */
export function recentVanafDag(opties: FoutsoortOpties): string {
  return verschuifDag(amsterdamDag(opties.nu), -(opties.recentDagen - 1))
}

/** Verrijkt de groepen met recente aantallen en gebruikersimpact. Volgorde van `groups` blijft. */
export function bouwFoutsoorten(
  voorvallen: readonly Voorval[],
  groups: readonly ErrorGroup[],
  opties: FoutsoortOpties,
): FoutsoortBeeld[] {
  const recentVanaf = recentVanafDag(opties)

  const perSoort = new Map<string, Voorval[]>()
  for (const v of voorvallen) {
    const bak = perSoort.get(v.signature)
    if (bak) bak.push(v)
    else perSoort.set(v.signature, [v])
  }

  return groups.map((g) => {
    const eigen = perSoort.get(g.signature) ?? []
    const gebruikers = new Set<number>()
    let zonderGebruiker = 0
    let recent = 0
    let teruggekomenMs = Number.POSITIVE_INFINITY
    let teruggekomenSinds: string | null = null
    const afgevinktMs = g.resolution ? Date.parse(g.resolution.resolvedAt) : NaN

    for (const v of eigen) {
      if (v.gebruiker !== null) gebruikers.add(v.gebruiker)
      else zonderGebruiker += 1

      const dag = dagVanIso(v.created_at)
      if (dag !== null && dag >= recentVanaf) recent += 1

      const ms = Date.parse(v.created_at)
      if (!Number.isNaN(afgevinktMs) && !Number.isNaN(ms) && ms > afgevinktMs && ms < teruggekomenMs) {
        teruggekomenMs = ms
        teruggekomenSinds = v.created_at
      }
    }

    return {
      signature: g.signature,
      context: g.context,
      voorbeeld: kortIn(g.sampleMessage),
      niveau: g.sampleLevel,
      open: g.open,
      teruggekomen: g.resolution !== null && g.open,
      aantal: g.count,
      recent,
      eerstGezien: g.firstSeenAt,
      laatstGezien: g.lastSeenAt,
      gebruikers: gebruikers.size,
      zonderGebruiker,
      teruggekomenSinds,
      sindsAfvinken: g.countSinceResolved,
    }
  })
}

export interface GebruikersImpact {
  /** Verschillende gebruikers over alle meegegeven voorvallen (ondergrens). */
  gebruikers: number
  zonderGebruiker: number
  voorvallen: number
}

/** Verschillende gebruikers over een verzameling voorvallen; een gebruiker telt één keer. */
export function telGebruikers(voorvallen: readonly Pick<Voorval, 'gebruiker'>[]): GebruikersImpact {
  const gebruikers = new Set<number>()
  let zonderGebruiker = 0
  for (const v of voorvallen) {
    if (v.gebruiker !== null) gebruikers.add(v.gebruiker)
    else zonderGebruiker += 1
  }
  return { gebruikers: gebruikers.size, zonderGebruiker, voorvallen: voorvallen.length }
}

/**
 * Per foutsoort de impact vanaf een dag: voor de ranglijst van grootste
 * veroorzakers over een gekozen periode.
 */
export function impactPerSoort(
  voorvallen: readonly Voorval[],
  vanafDag: string,
): Map<string, GebruikersImpact> {
  const perSoort = new Map<string, Voorval[]>()
  for (const v of voorvallen) {
    const dag = dagVanIso(v.created_at)
    if (dag === null || dag < vanafDag) continue
    const bak = perSoort.get(v.signature)
    if (bak) bak.push(v)
    else perSoort.set(v.signature, [v])
  }
  return new Map([...perSoort].map(([signature, eigen]) => [signature, telGebruikers(eigen)]))
}

/** De voorvallen van een verzameling foutsoorten, optioneel vanaf een dag. */
export function voorvallenVan(
  voorvallen: readonly Voorval[],
  signatures: ReadonlySet<string>,
  vanafDag: string | null = null,
): Voorval[] {
  return voorvallen.filter((v) => {
    if (!signatures.has(v.signature)) return false
    if (vanafDag === null) return true
    const dag = dagVanIso(v.created_at)
    return dag !== null && dag >= vanafDag
  })
}

/** Foutsoorten die voor het eerst gezien zijn op of na `vanafDag` en op of vóór `totDag`. */
export function nieuwInPeriode(
  soorten: readonly FoutsoortBeeld[],
  vanafDag: string,
  totDag: string,
): FoutsoortBeeld[] {
  return soorten.filter((s) => {
    const dag = dagVanIso(s.eerstGezien)
    return dag !== null && dag >= vanafDag && dag <= totDag
  })
}
