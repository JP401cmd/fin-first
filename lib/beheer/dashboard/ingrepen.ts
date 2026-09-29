import { adminActieLabel, doelIsInstelling, isInzageActie } from '@/lib/admin-audit-labels'
import { formatVersionForDisplay } from '@/lib/app-version'
import type { ReleaseNote } from '@/lib/release-notes'
import { auditHref } from './doorklik'
import type { DagPunt } from './reeksen'
import { amsterdamDag, dagVanIso, dagenTussen, verschuifDag } from './tijd'

/**
 * Ingrepen: wat er aan het platform veranderd is, en wat er rond die
 * verandering te zien was.
 *
 * Twee bronnen: de vrijgavenotities (`lib/release-notes.ts`) en de beheeracties
 * uit het auditlog die iets WIJZIGDEN (inzage telt niet mee).
 *
 * WAT DIT WEL EN NIET ZEGT
 *
 *  - De vergelijking vóór/na is een WAARNEMING, geen bewijs. Twee dingen die na
 *    elkaar gebeuren hebben niet per se met elkaar te maken; de tabel zegt wat
 *    er veranderde, niet waardoor.
 *  - Een release draagt alleen een DATUM. Het moment van uitrol op die dag is
 *    nergens vastgelegd. De dag van de ingreep telt daarom bij geen van beide
 *    periodes mee.
 *  - Ingrepen die kort na elkaar vallen zijn niet uit elkaar te halen. Hoeveel
 *    andere ingrepen binnen hetzelfde venster vielen, staat er daarom bij.
 *
 * Puur: geen IO.
 */

export type IngreepSoort = 'release' | 'beheeractie'

export interface Ingreep {
  id: string
  soort: IngreepSoort
  /** Amsterdamse kalenderdag. */
  dag: string
  /** Exact moment, alleen bij beheeracties. */
  moment: string | null
  titel: string
  toelichting: string | null
  href: string
}

export interface AuditRij {
  id: string
  action: string
  target_label: string | null
  created_at: string
}

function releaseIngreep(note: ReleaseNote): Ingreep {
  return {
    id: `release-${note.version}`,
    soort: 'release',
    dag: note.date,
    moment: null,
    titel: `Versie ${formatVersionForDisplay(note.version)}`,
    toelichting: note.title,
    href: '/beheer/releases',
  }
}

function actieIngreep(rij: AuditRij): Ingreep | null {
  if (isInzageActie(rij.action)) return null
  const dag = dagVanIso(rij.created_at)
  if (!dag) return null
  return {
    id: `actie-${rij.id}`,
    soort: 'beheeractie',
    dag,
    moment: rij.created_at,
    titel: adminActieLabel(rij.action),
    // Het doel alleen tonen als het een instelling is; bij de overige acties
    // kan het een naam of e-mailadres zijn, en dat hoort op de auditpagina.
    toelichting: doelIsInstelling(rij.action) ? rij.target_label : null,
    href: auditHref(rij.action),
  }
}

/** Alle ingrepen vanaf `vanafDag`, nieuwste eerst. */
export function bouwIngrepen(
  releases: readonly ReleaseNote[],
  audit: readonly AuditRij[],
  vanafDag: string,
): Ingreep[] {
  const uit: Ingreep[] = []
  for (const note of releases) if (note.date >= vanafDag) uit.push(releaseIngreep(note))
  for (const rij of audit) {
    const ingreep = actieIngreep(rij)
    if (ingreep && ingreep.dag >= vanafDag) uit.push(ingreep)
  }
  return uit.sort((a, b) => {
    if (a.dag !== b.dag) return a.dag < b.dag ? 1 : -1
    // Binnen één dag: beheeracties op tijdstip, releases (zonder tijdstip) bovenaan.
    if (a.moment && b.moment) return Date.parse(b.moment) - Date.parse(a.moment)
    if (a.moment) return 1
    if (b.moment) return -1
    return b.id.localeCompare(a.id, 'nl', { numeric: true })
  })
}

/** Markeringen voor een tijdreeks: per dag hoeveel ingrepen van welke soort. */
export interface DagMarkering {
  dag: string
  releases: string[]
  beheeracties: number
}

export function markeringenPerDag(ingrepen: readonly Ingreep[]): DagMarkering[] {
  const perDag = new Map<string, DagMarkering>()
  for (const i of ingrepen) {
    const m = perDag.get(i.dag) ?? { dag: i.dag, releases: [], beheeracties: 0 }
    if (i.soort === 'release') m.releases.push(i.titel)
    else m.beheeracties += 1
    perDag.set(i.dag, m)
  }
  return [...perDag.values()].sort((a, b) => (a.dag < b.dag ? -1 : 1))
}

/** Lengte van de periode vóór en na een ingreep: een week, zodat elke weekdag één keer meetelt. */
export const EFFECT_VENSTER_DAGEN = 7

export interface EffectMeting {
  ingreep: Ingreep
  vensterDagen: number
  voor: { van: string; tot: string; aantal: number | null }
  na: { van: string; tot: string; aantal: number | null }
  /** Volle dagen die van de periode erna al voorbij zijn. */
  dagenNaVoorbij: number
  /** De periode erna is afgelopen én beide periodes zijn volledig gemeten. */
  vergelijkbaar: boolean
  /** `na − voor`, alleen als `vergelijkbaar`. */
  verschil: number | null
  /** Andere ingrepen binnen de twee periodes of op dezelfde dag. */
  samenloop: number
}

/**
 * De maat in de week vóór een ingreep tegenover de week erna. `reeks` moet de
 * dagen van beide periodes dragen; een ontbrekende of niet-gemeten dag maakt
 * het totaal van die periode onbekend.
 */
export function meetEffect(
  ingreep: Ingreep,
  reeks: readonly DagPunt[],
  alleIngrepen: readonly Ingreep[],
  opties: { nu: Date; vensterDagen?: number },
): EffectMeting {
  const venster = opties.vensterDagen ?? EFFECT_VENSTER_DAGEN
  const vandaag = amsterdamDag(opties.nu)
  const voorTot = verschuifDag(ingreep.dag, -1)
  const voorVan = verschuifDag(ingreep.dag, -venster)
  const naVan = verschuifDag(ingreep.dag, 1)
  const naTot = verschuifDag(ingreep.dag, venster)

  const opDag = new Map(reeks.map((p) => [p.dag, p]))
  const som = (van: string, tot: string): number | null => {
    let totaal = 0
    for (let dag = van; dag <= tot; dag = verschuifDag(dag, 1)) {
      const punt = opDag.get(dag)
      // Vandaag loopt nog: een lopende dag maakt de periode onvolledig.
      if (!punt || punt.aantal === null || punt.lopend) return null
      totaal += punt.aantal
    }
    return totaal
  }

  // Volle dagen van de periode erna die voorbij zijn (vandaag telt niet mee).
  const laatsteVolleDag = verschuifDag(vandaag, -1)
  const dagenNaVoorbij = Math.max(0, Math.min(venster, dagenTussen(naVan, laatsteVolleDag) + 1))

  const voor = som(voorVan, voorTot)
  const na = dagenNaVoorbij === venster ? som(naVan, naTot) : null
  const vergelijkbaar = voor !== null && na !== null

  const samenloop = alleIngrepen.filter(
    (ander) => ander.id !== ingreep.id && ander.dag >= voorVan && ander.dag <= naTot,
  ).length

  return {
    ingreep,
    vensterDagen: venster,
    voor: { van: voorVan, tot: voorTot, aantal: voor },
    na: { van: naVan, tot: naTot, aantal: na },
    dagenNaVoorbij,
    vergelijkbaar,
    verschil: vergelijkbaar ? (na as number) - (voor as number) : null,
    samenloop,
  }
}
