'use client'

import { Clock, CheckCircle2, AlertTriangle } from 'lucide-react'
import { formatTimestamp } from '@/lib/format'
import { BANK_DAILY_REQUEST_LIMIT, type BankLinkHealth } from '@/lib/bank-connection-status'

/**
 * DE STATUS-PIL van één bankkoppeling, op de bankverbindingen-sectie van de
 * rekeningdetail.
 *
 * ## Leidt niets zelf af (fase 7)
 *
 * Tot fase 7 stond hier een eigen kopie van de afleiding: `status === 'expired'
 * || 'revoked'` plus een `Math.ceil`-som op `token_expires_at` met een eigen
 * 14-dagendrempel. Diezelfde regels leefden óók op het herkomst-symbool
 * (`components/core/account-source-icon.tsx`) en op de detailkaart — drie
 * afleidingen, drie kansen dat de pil iets anders zegt dan het icoon over
 * dezelfde koppeling. Sinds fase 7 is `deriveBankLinkHealth`
 * (`lib/bank-connection-status.ts`) de ENIGE afleiding; dit component kiest
 * alleen nog woorden en kleur. Reken hier dus niets na — óók de afronding van
 * `daysUntilExpiry` komt kant-en-klaar mee.
 *
 * Het OORDEEL komt sinds de kolom-drop-voorbereiding als `health`-prop binnen in
 * plaats van als drie rauwe signalen die deze pil zelf door `deriveBankLinkHealth`
 * haalde. Aanleiding: de rekeningdetail las `bank_connection_accounts`
 * client-direct — de laatste lezer van de PLAINTEXT `iban`-kolom — en is verhuisd
 * naar `GET /api/bank-connect/linked-accounts`. Die route levert bewust het
 * oordeel en niet de rauwe signalen, dus die zijn hier simpelweg niet meer
 * beschikbaar. Winst: de afleiding draait nog één keer, server-side, voor álle
 * consumers van die route.
 *
 * `linkIsActive` hoeft deze pil daarom niet meer te veronderstellen: de route
 * leest dat signaal wél en verwerkt het in `health`.
 *
 * ## Kleur: verlopen is AANDACHT, geen verlies
 *
 * `linked-broken` krijgt `--warning` en niet `--negative`. Twee redenen. (1) Het
 * herkomst-symbool koos `--warning` voor exact dezelfde toestand; zou de pil
 * `--negative` gebruiken, dan zeggen twee oppervlakken iets anders over één
 * koppeling — precies de drift die fase 7 wegneemt. (2) De autorisatie verloopt
 * elke 90 dagen: dat is verwacht onderhoud met één handeling als oplossing, geen
 * fout en geen verlies. `--negative` blijft voor wat écht misging (een gefaalde
 * actie, zie de meldingen op de kaart).
 *
 * De 14-dagen-vooraankondiging draagt daarom géén eigen stoplichtvlak: hij staat
 * op inkt met alleen het klok-icoon in `--warning`. De verbinding wérkt nog — een
 * tweede warning-vlak naast "Verbinding kwijt" zou de twee toestanden even hard
 * laten roepen. De volledige nuance (mét herstel-aanbod) leeft op de kaart
 * eromheen; een proactief kanaal (notificatie, briefing) bestaat níet, dus wie
 * hier niet komt kijken ziet die nuance nooit.
 *
 * ## Woorden: "Verbinding kwijt", niet "Verlopen"
 *
 * De pil zei tot fase 7 "Verlopen" voor exact de toestand die het herkomst-symbool
 * en de kaart eromheen "verbinding kwijt" noemen — drie oppervlakken, twee woorden,
 * één toestand. Glossarium-regel: één woord per concept. "Verlopen" benoemt
 * bovendien de oorzaak (en dus een detectie die de app niet altijd heeft: de
 * statuskolom kan ook op `revoked` staan zonder dat een datum verstreken is).
 */
type SyncStatusBadgeProps = {
  /** Server-afgeleid oordeel over deze koppeling. Reken er niets uit na. */
  health: BankLinkHealth
  dailyRequests: number
}

/**
 * Eén pil-vorm voor alle vier de toestanden; alleen vlak en inkt verschillen.
 *
 * `shrink-0 whitespace-nowrap`: "Verbinding kwijt" is breder dan het oude
 * "Verlopen", en op 360px naast een lange banknaam mag de pil niet in twee regels
 * afbreken. De identiteit links van de pil schikt in (`min-w-0` + `truncate` in
 * `connected-account-card.tsx`), de status niet.
 */
const BADGE =
  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium'

export function SyncStatusBadge({ health, dailyRequests }: SyncStatusBadgeProps) {
  if (health.state === 'linked-broken') {
    return (
      /* Tekst op `--ink`, tint in vlak en icoon. `text-warning` op `--warning-bg`
         haalt 4,48:1 (gemeten op de tokens in `app/globals.css`) en blijft daarmee
         onder de 4,5:1 die AA voor 12px-tekst eist; een icoon is een grafisch
         element en mag op 3:1. Zelfde behandeling als de herstelband op
         `connected-account-card.tsx` en `vermogen-asset-card.tsx`. */
      <span className={`${BADGE} bg-warning-bg text-[var(--ink)]`}>
        <AlertTriangle aria-hidden className="h-3 w-3 text-warning" />
        Verbinding kwijt
      </span>
    )
  }

  if (health.expiringSoon) {
    return (
      <span className={`${BADGE} bg-[var(--subtle)] text-[var(--ink-2)]`}>
        <Clock aria-hidden className="h-3 w-3 text-warning" />
        Verloopt over {health.daysUntilExpiry}d
      </span>
    )
  }

  if (!health.lastSyncedAt) {
    return (
      <span className={`${BADGE} bg-[var(--subtle)] text-[var(--ink-3)]`}>
        <Clock aria-hidden className="h-3 w-3" />
        Nog niet gesynchroniseerd
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`${BADGE} bg-positive-bg text-positive`}>
        <CheckCircle2 aria-hidden className="h-3 w-3" />
        {formatTimestamp(health.lastSyncedAt)}
      </span>
      <span className="text-xs text-[var(--ink-3)]">
        {dailyRequests}/{BANK_DAILY_REQUEST_LIMIT}
      </span>
    </div>
  )
}
