import { describe, expect, it } from 'vitest'
import { CASH_FLOW } from './cash'
import { UAT_SCENARIOS, UAT_ZONES, type UatZone } from '../catalog'

const SCENARIO_BY_ID = new Map(UAT_SCENARIOS.map((s) => [s.id, s]))
const VALID_ZONES = new Set<UatZone>(UAT_ZONES.map((z) => z.zone))
const NODE_IDS = new Set(CASH_FLOW.nodes.map((n) => n.id))

describe('CASH_FLOW — curatie-integriteit', () => {
  it('is de CASH-zone', () => {
    expect(CASH_FLOW.zone).toBe('CASH')
  })

  it('heeft unieke knoop-ids', () => {
    expect(NODE_IDS.size).toBe(CASH_FLOW.nodes.length)
  })

  it('elke scenarioId (indien aanwezig) bestaat en heeft zone CASH', () => {
    for (const node of CASH_FLOW.nodes) {
      if (!node.scenarioId) continue
      const scenario = SCENARIO_BY_ID.get(node.scenarioId)
      expect(scenario, `scenario ${node.scenarioId} (knoop ${node.id}) moet bestaan`).toBeDefined()
      expect(scenario!.zone, `scenario ${node.scenarioId} moet zone CASH hebben`).toBe('CASH')
    }
  })

  it('elke edge.from/edge.to verwijst naar een bestaande node-id', () => {
    for (const edge of CASH_FLOW.edges) {
      expect(NODE_IDS.has(edge.from), `edge.from ${edge.from} moet bestaan`).toBe(true)
      expect(NODE_IDS.has(edge.to), `edge.to ${edge.to} moet bestaan`).toBe(true)
    }
  })

  it('elke subOf verwijst naar een bestaande node-id (en niet naar zichzelf)', () => {
    for (const node of CASH_FLOW.nodes) {
      if (!node.subOf) continue
      expect(NODE_IDS.has(node.subOf), `subOf ${node.subOf} (knoop ${node.id}) moet bestaan`).toBe(true)
      expect(node.subOf).not.toBe(node.id)
    }
  })

  it('crossZone is alleen gezet op kind=cross en verwijst naar een geldige UatZone', () => {
    for (const node of CASH_FLOW.nodes) {
      if (node.crossZone === undefined) continue
      expect(node.kind, `knoop ${node.id} met crossZone moet kind=cross zijn`).toBe('cross')
      expect(VALID_ZONES.has(node.crossZone), `crossZone ${node.crossZone} moet geldig zijn`).toBe(true)
    }
  })

  it('dekt alle WF-CASH-scenario\'s 01..61 op één gat na (WF-CASH-06, vervallen 12-09-2026 B-047)', () => {
    const covered = new Set(
      CASH_FLOW.nodes.map((n) => n.scenarioId).filter((id): id is string => Boolean(id)),
    )
    // 32 → 41: UAT-a bank-connect-doelrekening-toevoeging (WF-CASH-33..41).
    // 41 → 43: UAT-b fase 1 (B8/B9) — WF-CASH-42/43.
    // 43 → 44: UAT-b fase 4 (wizard, plan.md §6) — WF-CASH-44
    // (doelrekening kiezen tijdens onboarding, nul kandidaten).
    // 44 → 47: UAT-b fase 5 (callback, plan.md §6) — WF-CASH-45
    // (precedentieketen), WF-CASH-46 (rekeningtype van de bank, B3) en
    // WF-CASH-47 (het correctiemoment, nieuw gebruikersoppervlak op de
    // success-pagina).
    // 47 → 48: UAT-b fase 6 (FR5, plan.md §6) — WF-CASH-48 (één actieve
    // bankkoppeling per rekening: bezet is zichtbaar-maar-uitgeschakeld in de
    // wizard/correctiemoment, en 409 op auth-link/relink).
    // 48 → 49: UAT-b fase 7 (B6, herkoppelen vanaf de rekening, plan.md §6) —
    // WF-CASH-49 (deriveBankLinkHealth-regelvolgorde, het herstelpad vanaf de
    // rekening en de SC-13-reactivatie).
    // 49 → 50: UAT-b fase 8 (FR8, saldo via het herwaarderingspad, plan.md §6)
    // — WF-CASH-50 (valuations-rij + snapshot-mirror alleen bij wijziging, de
    // compenserende waardering bij een relink).
    // 50 → 51: bugfix-toevoeging (docs/adr/0073-grondslag-in-de-veldnaam.md)
    // — WF-CASH-51 (de cashflow-landingskaarten: Budget-KPI = resterend i.p.v.
    // plafond, Transacties-KPI = gerealiseerde huidige maand i.p.v. effective).
    // 51 → 52: nieuwe functionaliteit (docs/adr/0082-bankrekening-verwijderen-
    // alleen-op-gebruikersopdracht.md) — WF-CASH-52 (betaalrekening
    // verwijderen: bewaren archiveert, verwijderen wist, atomaire
    // ontkoppeling/opschoning via public.delete_bank_account).
    // 52 → 54: grenzenpotten fase 2-5 (ADR 0089/0092, requirement-delta 8 aug
    // 2026) — WF-CASH-53 (motor: kwartaal/jaar-periodes, isNearLimit, streaks,
    // trend) en WF-CASH-54 (beheren, prestatieweergave, widget, match-preview,
    // alias, meldingen).
    // 54 → 59: transactie-bulkbewerken (docs/requirements-transactie-
    // bulkbewerken.md, ADR 0104) — WF-CASH-55..59 (zoeken/selecteren/impact,
    // hercategoriseren, verwijderen, huishoud-scoping/5.000-grens,
    // regelaanbod/gedeeltelijke mislukking).
    // WF-CASH-06 ("Inflatie-impact verkennen") is VERVALLEN op 12-09-2026
    // (B-047, "helemaal weg"): de inflatiekaart en haar wegklik-mechaniek zijn
    // volledig uit de app verwijderd. Dit is dus een bewust gat, geen
    // verwijsregel-leemte — de nog-geldige versheidsmelding-dekking die op
    // dezelfde knoop stond is verhuisd naar WF-CASH-07 ('statusmelding').
    // WF-CASH-20 ("Wat als ik opzeg"-schuif) en WF-CASH-21 (cashflow-kalender
    // op de vaste-lastenpagina) zijn VERVALLEN op 19-09-2026 (W-017): beide
    // oppervlakken zijn verwijderd. "Wanneer komt het" blijft via de
    // Agenda-widget, die in OVZ zijn eigen knoop heeft.
    const VERVALLEN = new Set([6, 20, 21])
    const expected = Array.from({ length: 61 }, (_, i) => i + 1)
      .filter((n) => !VERVALLEN.has(n))
      .map((n) => `UAT-CASH-${String(n).padStart(2, '0')}`)
    for (const id of expected) {
      expect(covered.has(id), `${id} moet als flow-knoop voorkomen`).toBe(true)
    }
    // 59 → 61: WF-CASH-60 (grondslagkeuze inkomen/uitgaven, ADR 0103) en
    // WF-CASH-61 (grenzenpot-reeksscore/prestatiebadge).
    // 61 → 63: WF-CASH-63 (rekening-zichtbaarheid voor de partner, ADR 0118) en
    // WF-CASH-64 (grenzenpot-tempo, ADR 0119) zijn als flow-knoop toegevoegd.
    // WF-CASH-62 heeft (nog) geen eigen flow-knoop — bestaande, hier ongewijzigde
    // dekkingsleemte, geen regressie van deze wijziging.
    // 63 → 64: WF-CASH-65 (partner-samenwerkingslaag fase 1, "Te bespreken",
    // ADR 0128) is als flow-knoop toegevoegd, naast 'rekeningzichtbaarheid'.
    // 64 → 65: WF-CASH-66 (TrueLayer-sync stempelt ownership op de en/of-rekening
    // en ontdubbelt tegen de dragende rij van de partner) is als flow-knoop
    // toegevoegd.
    // 65 → 66: WF-CASH-67 (grenzenpot precies op de grens, ADR 0136) is als
    // flow-knoop 'grenzenpotbereikt' onder 'grenzenpotberekenen' toegevoegd.
    // 66 → 67: WF-CASH-68 (vul-ingangen staan één keer op de transactiepagina:
    // de KoppelRekeningBanner biedt koppelen/importeren bij nul rekeningen, en
    // dan laat de actie-rij ze juist weg) is als flow-knoop 'vulingangen'
    // onder 'geldstroom' toegevoegd.
    // 66 → 64: de knopen 'watals' (WF-CASH-20) en 'kalender' (WF-CASH-21) zijn
    // verwijderd (W-017, 19-09-2026) — zie het VERVALLEN-gat hierboven.
    // 64 → 65: WF-CASH-69 (waarschuwing bij overlap met een andere eigen
    // rekening) is als flow-knoop 'andererekening' onder 'mt940' toegevoegd.
    expect(covered.size).toBe(65)
  })

  it('de domeinoverschrijdende cross-knopen dekken BUDGET/OVZ/TOEK/WILL/BEZIT/MIJN', () => {
    const crossZones = new Set(
      CASH_FLOW.nodes
        .filter((n) => n.kind === 'cross')
        .map((n) => n.crossZone)
        .filter((z): z is UatZone => Boolean(z)),
    )
    for (const z of ['BUDGET', 'OVZ', 'TOEK', 'WILL', 'BEZIT', 'MIJN'] as const) {
      expect(crossZones.has(z), `cross naar ${z} moet aanwezig zijn`).toBe(true)
    }
  })
})
