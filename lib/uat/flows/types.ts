// Datamodel voor de UAT-procesmodel-verdiepingslaag (laag 2 van de UAT-plaat).
//
// Een `UatFlow` beschrijft het gebruikersproces binnen ÉÉN zone als een
// gerichte graaf: knopen (schermen/acties/beslissingen/cross-afhankelijkheden)
// en gerichte edges. Knopen met een `scenarioId` koppelen aan een UAT-scenario
// uit lib/uat/catalog.ts en erven daarmee de rondestatus (via lib/uat/status.ts);
// statusloze knopen (entry/decision/outcome/cross) zijn puur structureel.
//
// GEEN React, GEEN DOM — alleen typen. De layout (flow-layout.ts) en de
// render (laag 2 in de plaatcomponent) consumeren dit schema.

import type { UatZone } from '../catalog'

/** Soort flow-knoop. Bepaalt de tekening (vorm) en of de knoop statusdragend is. */
export type UatFlowNodeKind = 'entry' | 'screen' | 'action' | 'decision' | 'cross' | 'outcome'

export interface UatFlowNode {
  /** Stabiele knoop-id binnen de flow (uniek per flow). */
  id: string
  /** 'UAT-BEZIT-05' → koppelt aan een UAT-scenario (status + detailpaneel). */
  scenarioId?: string
  /** Menselijk label; mag het WF-label tonen, bv. 'WF-BEZIT-05 · Bezit toevoegen'. */
  label: string
  kind: UatFlowNodeKind
  /** Kolom links→rechts (0 = instap … n = uitkomst). */
  stage: number
  /** Cluster/rijband: 'verkennen' | 'toevoegen' | 'beheren' | 'verdieping'. */
  lane?: string
  /** Nestelt onder een sub-hub-knoop (bv. holdings-app) — id van die sub-hub. */
  subOf?: string
  /** Alleen kind='cross': naar welk domein de afhankelijkheid loopt. */
  crossZone?: UatZone
}

export interface UatFlowEdge {
  from: string
  to: string
  label?: string
  kind?: 'normal' | 'branch' | 'cross'
}

export interface UatFlow {
  zone: UatZone
  nodes: UatFlowNode[]
  edges: UatFlowEdge[]
}
