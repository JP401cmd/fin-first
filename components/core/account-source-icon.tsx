'use client'

// Uniform herkomst-symbool voor een BANKREKENING: wordt de rekening automatisch
// gevoed door een bankkoppeling (`Link2`), is die koppeling kwijtgeraakt
// (`Unlink`), of houd je 'm handmatig/via import bij (`FileText`)? Eén taal over
// de schermen heen — de rekening-filterpills op Transacties
// (`transactie-tijdlijn.tsx#AccountButton`) en de rekening-kaarten op Cashflow
// (`VermogenAssetCard`) delen dit component, zodat er geen tweede iconenvariant
// naast ontstaat. De toestand komt uit `deriveBankLinkState`
// (`lib/bank-connection-status.ts`) — dit component leidt niets zelf af.
//
// Verschil met `ConnectionIndicator` (Plug): die staat voor een externe
// vermogens-API (exchange/wallet) mét sync-status en versheid; dit symbool is
// herkomst van een rekening.
//
// ── AMENDEMENT (fase 7, B6): één van de drie toestanden IS status ────────────
// Hier stond: "puur herkomst — géén status, dus ook geen stoplichtkleur". Die
// regel klopte zolang er twee toestanden waren: "gekoppeld" en "handmatig" zijn
// beide normaal, geen van beide vraagt iets van de gebruiker, en een kleur zou
// een probleem suggereren waar er geen is. `linked-broken` is anders van aard:
// de rekening WAS gekoppeld, de bank voedt haar niet meer, en er is precies één
// handeling die dat oplost. Dat is per definitie status én actie, en het
// onderscheiden met alleen een ander glyph zou de énige toestand die aandacht
// verdient even stil maken als de twee die dat niet doen.
//
// Daarom: `linked-broken` krijgt `--warning` (aandacht, geen verlies — de
// autorisatie verloopt elk kwartaal, dat is verwacht onderhoud en geen fout), de
// andere twee blijven inkt. Twee grenzen bij dat amendement, bewust:
//
//  - het glyph doet het werk óók zonder kleur (`Unlink` is een verbroken schakel,
//    niet dezelfde schakel in een andere tint) — kleur is versterking, geen
//    enige drager;
//  - de 14-dagen-VOORAANKONDIGING hoort hier NIET (zie `BankLinkHealth.expiringSoon`).
//    Die zou het icoon elk kwartaal twee weken laten waarschuwen zonder dat er
//    iets stuk is, en dan leert de gebruiker het te negeren op het moment dat het
//    wél stuk is. Die nuance leeft alléén op de rekeningdetail; een proactief
//    kanaal (notificatie, briefing) bestaat niet — zie het restpunt bij fase 7.
//
// A11Y — het symbool is ALTIJD `aria-hidden`. Het zit per definitie binnen een
// control (de rekening-kaart, de filterpill), en een geneste `aria-label` wordt
// door de naamberekening van die control overstemd: hij zou nooit voorgelezen
// worden. De betekenis hoort dus in de accessible name van de OMVATTENDE control
// — gebruik daarvoor `accountSourceSuffix()`. De `title` blijft staan als
// hover-uitleg voor muisgebruikers.
//
// Dat is een EIS aan elke call-site, geen constatering: hier stond dat beide
// call-sites zo'n label al droegen, en voor de filterpill was dat feitelijk
// onjuist — die had alleen `{label}`, dus de toestand die om een handeling vraagt
// was voor AT-gebruikers volledig afwezig. Sinds fase 7 draagt ook die pill het
// suffix. Voeg je een derde call-site toe, dan hoort dat label erbij vóórdat het
// symbool erbij komt.

import { Link2, Unlink, FileText } from 'lucide-react'
import type { BankLinkState } from '@/lib/bank-connection-status'

/**
 * Volledige hover-uitleg (title) — hele zin, krant-toon.
 *
 * De tekst bij `linked-broken` is bewust NEUTRAAL: `bank_connections.status`
 * kent `expired` én `revoked`, maar geen enkel codepad schrijft ooit `revoked`.
 * Copy die het onderscheid benoemt ("ingetrokken door je bank") zou een
 * detectie suggereren die de app niet heeft.
 */
export const ACCOUNT_SOURCE_TOOLTIP = {
  linked: 'Wordt automatisch bijgewerkt via je bankkoppeling',
  'linked-broken': 'Verbinding kwijt — verbind opnieuw om weer bij te werken',
  manual: 'Handmatig bijgehouden — geen bankkoppeling',
} as const satisfies Record<BankLinkState, string>

/**
 * Korte herkomst-toevoeging voor de accessible name van de omvattende control,
 * bv. `aria-label={`${naam} openen — ${accountSourceSuffix('linked')}`}`.
 */
export function accountSourceSuffix(state: BankLinkState): string {
  return ACCOUNT_SOURCE_SUFFIX[state]
}

const ACCOUNT_SOURCE_SUFFIX = {
  linked: 'automatisch bijgewerkt via je bankkoppeling',
  'linked-broken': 'verbinding kwijt',
  manual: 'handmatig bijgehouden',
} as const satisfies Record<BankLinkState, string>

const ICONS = { linked: Link2, 'linked-broken': Unlink, manual: FileText } as const satisfies Record<
  BankLinkState,
  typeof Link2
>

// Gekoppeld is de betekenisvolle uitzondering en krijgt dus meer inkt dan de
// handmatige default; verbinding-kwijt is de énige die om een handeling vraagt en
// krijgt daarom `--warning` (zie het amendement bovenaan). Alle drie halen
// minimaal 3:1 tegen `--paper` (WCAG 1.4.11); `--ink-4` is daarvoor te licht en
// hier bewust NIET gebruikt.
const TONES = {
  linked: 'text-[var(--ink-2)]',
  'linked-broken': 'text-warning',
  manual: 'text-[var(--ink-3)]',
} as const satisfies Record<BankLinkState, string>

interface AccountSourceIconProps {
  /** De koppeltoestand uit `deriveBankLinkState` — nooit hier afgeleid. */
  state: BankLinkState
  /**
   * Erf de tekstkleur van de ouder in plaats van de eigen inkt-tonen. Nodig in
   * een gekleurde container (de actieve filterpill staat op `--ink` met
   * `--paper`-tekst; een vaste inkt-toon zou daar wegvallen).
   */
  inheritColor?: boolean
  className?: string
}

export function AccountSourceIcon({
  state,
  inheritColor = false,
  className = '',
}: AccountSourceIconProps) {
  const Icon = ICONS[state]
  const tone = inheritColor ? '' : TONES[state]

  return (
    <span
      title={ACCOUNT_SOURCE_TOOLTIP[state]}
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center ${tone} ${className}`}
    >
      <Icon className="h-3 w-3" />
    </span>
  )
}
