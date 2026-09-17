import { GEBRUIK_BANDEN, type GebruikAnalyse } from '@/lib/beheer/gebruik-analyse/loader'
import type { GebruikSankey } from '@/lib/beheer/gebruik-analyse/doorstroom'
import type { Cel } from '@/lib/beheer/gebruik-analyse/onderdrukking'

/**
 * Handgemaakte fixture voor de presentatietests van /beheer/gebruik. Bevat
 * bewust de lastige gevallen: kleine en verborgen cellen, een lege week (0),
 * een stroom zonder ritme, cohorten met dekking 'geen' en 'deels', een maand
 * waarvan de noemer nog niet verstreken is, en de "Eerder"-rij (maand null).
 */

export const w = (n: number): Cel => ({ soort: 'waarde', n })
export const klein: Cel = { soort: 'klein' }
export const verborgen: Cel = { soort: 'verborgen' }

export function maakFixture(): GebruikAnalyse {
  return {
    k: 5,
    vensterDagen: 90,
    band: GEBRUIK_BANDEN[90],
    intern: false,
    gemetenSindsWeek: '2026-W30',
    modulesGemetenSindsWeek: '2026-W38',
    stromen: [
      { id: 'vermogen', naam: 'Vermogen', modules: ['overzicht', 'bezittingen', 'schulden'], kleurIndex: 0, ritmeDagen: 30, ritmeLabel: 'maand of kwartaal' },
      { id: 'budget', naam: 'Budget', modules: ['budget'], kleurIndex: 1, ritmeDagen: 7, ritmeLabel: 'dagelijks met koppeling, wekelijks met bestanden' },
      { id: 'toekomst', naam: 'Toekomst', modules: ['toekomst'], kleurIndex: 2, ritmeDagen: null, ritmeLabel: 'eenmalig, daarna bij een levensmoment' },
      { id: 'grip', naam: 'Grip', modules: ['grip'], kleurIndex: 3, ritmeDagen: 7, ritmeLabel: 'wekelijks' },
      { id: 'fin', naam: 'Fin', modules: ['fin'], kleurIndex: 4, ritmeDagen: null, ritmeLabel: 'kanaal, geen eigen ritme' },
    ],
    kerncijfers: {
      segmentTotaal: w(120),
      laatstActief: {
        totaal: w(120),
        verdeling: [
          { wanneer: 'vandaag', gebruikers: verborgen },
          { wanneer: '1_6', gebruikers: verborgen },
          { wanneer: '7_29', gebruikers: verborgen },
          { wanneer: '30_89', gebruikers: klein },
          { wanneer: '90_plus', gebruikers: w(0) },
          { wanneer: 'nooit', gebruikers: verborgen },
        ],
      },
      actiefVenster: w(77),
      nieuwVenster: w(31),
    },
    weektrend: [
      { week: '2026-W36', actief: w(22), nieuw: w(9) },
      { week: '2026-W37', actief: w(0), nieuw: w(0) },
      { week: '2026-W38', actief: w(30), nieuw: klein },
    ],
    stroomWeken: [
      { id: 'vermogen', gebruikers: w(40), weken: [{ week: '2026-W36', actief: w(12) }, { week: '2026-W37', actief: w(0) }, { week: '2026-W38', actief: w(14) }] },
      { id: 'budget', gebruikers: w(15), weken: [{ week: '2026-W36', actief: klein }, { week: '2026-W37', actief: w(0) }, { week: '2026-W38', actief: w(6) }] },
      { id: 'toekomst', gebruikers: w(60), weken: [{ week: '2026-W36', actief: w(20) }, { week: '2026-W37', actief: w(0) }, { week: '2026-W38', actief: w(27) }] },
      { id: 'grip', gebruikers: klein, weken: [{ week: '2026-W36', actief: klein }, { week: '2026-W37', actief: w(0) }, { week: '2026-W38', actief: verborgen }] },
      { id: 'fin', gebruikers: w(8), weken: [{ week: '2026-W36', actief: w(0) }, { week: '2026-W37', actief: w(0) }, { week: '2026-W38', actief: w(8) }] },
    ],
    dominant: {
      totaal: w(42),
      verdeling: [
        { stroom: 'vermogen', gebruikers: w(10) },
        { stroom: 'budget', gebruikers: verborgen },
        { stroom: 'toekomst', gebruikers: w(20) },
        { stroom: 'grip', gebruikers: klein },
        { stroom: 'fin', gebruikers: w(0) },
        { stroom: null, gebruikers: w(6) },
      ],
    },
    overlap: {
      totaal: w(77),
      verdeling: [
        { aantalStromen: 0, gebruikers: w(0) },
        { aantalStromen: 1, gebruikers: w(50) },
        { aantalStromen: 2, gebruikers: w(20) },
        { aantalStromen: 3, gebruikers: verborgen },
        { aantalStromen: 4, gebruikers: klein },
        { aantalStromen: 5, gebruikers: w(0) },
      ],
    },
    ritme: [
      { id: 'vermogen', ritmeDagen: 30, geschikt: w(25), terug: w(10), nietTerug: w(15), aandeelTerug: { fractie: 10 / 25, noemer: 25, waarschuwing: true }, mediaanDagen: 12.5, gatenGebruikers: w(21) },
      { id: 'budget', ritmeDagen: 7, geschikt: w(9), terug: klein, nietTerug: verborgen, aandeelTerug: null, mediaanDagen: null, gatenGebruikers: null },
      { id: 'toekomst', ritmeDagen: null, geschikt: w(60), terug: null, nietTerug: null, aandeelTerug: null, mediaanDagen: 41, gatenGebruikers: w(7) },
      { id: 'grip', ritmeDagen: 7, geschikt: w(0), terug: w(0), nietTerug: w(0), aandeelTerug: null, mediaanDagen: null, gatenGebruikers: null },
      { id: 'fin', ritmeDagen: null, geschikt: w(8), terug: null, nietTerug: null, aandeelTerug: null, mediaanDagen: null, gatenGebruikers: null },
    ],
    samen: {
      modules: [
        { module: 'overzicht', gebruikers: w(70) },
        { module: 'toekomst', gebruikers: w(60) },
        { module: 'grip', gebruikers: klein },
      ],
      paren: [
        { a: 'grip', b: 'overzicht', gebruikers: klein },
        { a: 'overzicht', b: 'toekomst', gebruikers: w(35) },
        { a: 'budget', b: 'overzicht', gebruikers: w(9) },
      ],
    },
    cohorten: [
      {
        // "Eerder": alle aanmelders van vóór de getoonde maanden (contract: maand null).
        maand: null,
        dekking: 'geen',
        aangemeld: w(40),
        onboardingAfgerond: w(30),
        gemeten: w(0),
        eersteDag: w(0),
        tweedeDag: w(0),
        week25Noemer: w(0),
        week25: w(0),
        maand2Noemer: w(0),
        maand2: w(0),
      },
      {
        maand: '2026-07',
        dekking: 'deels',
        aangemeld: w(20),
        onboardingAfgerond: w(16),
        gemeten: w(12),
        eersteDag: w(11),
        tweedeDag: w(6),
        week25Noemer: w(12),
        week25: klein,
        maand2Noemer: w(12),
        maand2: verborgen,
      },
      {
        maand: '2026-09',
        dekking: 'volledig',
        aangemeld: w(31),
        onboardingAfgerond: w(25),
        gemeten: w(31),
        eersteDag: w(28),
        tweedeDag: w(9),
        week25Noemer: w(0),
        week25: w(0),
        maand2Noemer: w(0),
        maand2: w(0),
      },
    ],
    eersteErvaring: {
      totaal: w(120),
      onboardingAfgerond: w(96),
      rondleiding: {
        totaal: w(120),
        verdeling: [
          { uitkomst: 'voltooid', gebruikers: w(40) },
          { uitkomst: 'overgeslagen', gebruikers: w(50) },
          { uitkomst: 'onderbroken', gebruikers: klein },
          { uitkomst: 'tegoed', gebruikers: verborgen },
          { uitkomst: 'geen', gebruikers: w(15) },
        ],
      },
      gids: {
        totaal: w(120),
        verdeling: [
          { stand: 'niet_gestart', gebruikers: w(60) },
          { stand: 'afgesloten', gebruikers: w(30) },
          { stand: '0_stappen', gebruikers: w(0) },
          { stand: '1_3_stappen', gebruikers: w(30) },
          { stand: '4_plus_stappen', gebruikers: w(0) },
        ],
      },
      uitgesteld: [
        { veld: 'income', gebruikers: w(12) },
        { veld: 'spaardoel', gebruikers: klein },
      ],
      briefingMailAan: w(33),
      checkinMinstensEen: klein,
      homeScreen: { totaal: w(120), verdeling: [{ waarde: 'overzicht', gebruikers: w(110) }, { waarde: 'budget', gebruikers: w(10) }] },
      displayMode: { totaal: w(120), verdeling: [{ waarde: 'simple', gebruikers: w(45) }, { waarde: 'full', gebruikers: w(75) }] },
    },
    sankey: { status: 'ok', data: maakSankeyFixture() },
  }
}

/**
 * Sankey-fixture: overgang dag 1 → 2 zichtbaar, dag 2 → 3 verborgen (dag 3 heeft
 * verborgen knopen), dag 3 → 4 verborgen. Knopen in config-volgorde + _meerdere + _geen.
 */
export function maakSankeyFixture(): GebruikSankey {
  const knopen = (vals: Cel[]) =>
    ['vermogen', 'budget', 'toekomst', 'grip', 'fin', '_meerdere', '_geen'].map((knoop, i) => ({ knoop, gebruikers: vals[i] }))
  return {
    dagenVerdeling: {
      totaal: w(77),
      verdeling: [
        { aantal: 1, gebruikers: w(30) },
        { aantal: 2, gebruikers: w(17) },
        { aantal: 3, gebruikers: w(10) },
        { aantal: 4, gebruikers: w(8) },
        { aantal: 5, gebruikers: w(12) },
      ],
    },
    stappen: [
      { stap: 1, totaal: w(77), knopen: knopen([w(20), w(10), w(35), w(0), w(0), w(6), w(6)]) },
      { stap: 2, totaal: w(44), knopen: knopen([w(15), w(5), w(12), w(0), w(0), w(6), w(6)]) },
      { stap: 3, totaal: w(30), knopen: knopen([verborgen, verborgen, verborgen, w(0), w(0), verborgen, verborgen]) },
      { stap: 4, totaal: verborgen, knopen: knopen([verborgen, verborgen, verborgen, w(0), w(0), verborgen, verborgen]) },
    ],
    overgangen: [
      {
        vanStap: 1,
        zichtbaar: true,
        cellen: [
          { van: 'vermogen', naar: 'vermogen', gebruikers: w(10) },
          { van: 'vermogen', naar: 'budget', gebruikers: w(5) },
          { van: 'vermogen', naar: '_stopt', gebruikers: w(5) },
          { van: 'budget', naar: 'budget', gebruikers: w(0) },
          { van: 'budget', naar: '_stopt', gebruikers: w(10) },
          { van: 'toekomst', naar: 'toekomst', gebruikers: w(12) },
          { van: 'toekomst', naar: 'vermogen', gebruikers: w(5) },
          { van: 'toekomst', naar: '_meerdere', gebruikers: w(6) },
          { van: 'toekomst', naar: '_stopt', gebruikers: w(12) },
          { van: '_meerdere', naar: '_geen', gebruikers: w(6) },
          { van: '_geen', naar: '_stopt', gebruikers: w(6) },
        ],
      },
      { vanStap: 2, zichtbaar: false, cellen: [] },
      { vanStap: 3, zichtbaar: false, cellen: [] },
    ],
  }
}
