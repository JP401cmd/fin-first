/**
 * WAT WE DE GEBRUIKER OVER ÉÉN BANKKOPPELING MELDEN — pure beslislogica.
 *
 * ## Waarom één functie voor twee signalen
 *
 * Over een gekoppelde rekening kunnen we twee dingen zeggen:
 *
 *  1. **De autorisatie verloopt bijna.** Een bankautorisatie leeft 90 dagen;
 *     `sync-status-badge.tsx` waarschuwde daar al 14 dagen van tevoren voor, maar
 *     alléén op de rekening zelf. Wie daar niet toevallig kijkt, merkt het pas als
 *     het synchroniseren stopt. Dit is het proactieve kanaal dat daarvoor ontbrak.
 *  2. **Er is al dagen niets binnengekomen** (`last_synced_at` > 3 dagen oud).
 *
 * Ze staan hier bewust in ÉÉN functie, want ze concurreren: een koppeling die
 * bijna verloopt is vaak óók al een tijd niet ververst, en dan zou de gebruiker
 * twee berichten over dezelfde rekening krijgen die om exact dezelfde handeling
 * vragen (vernieuw de koppeling). De verloop-waarschuwing wint dan — die noemt de
 * échte oorzaak en een deadline; "5 dagen niet gesynchroniseerd" is daar het
 * symptoom van. Zonder gedeelde functie zou die voorrang een los `continue` in de
 * route zijn, en dus ongetest.
 *
 * ## Wat hier NIET gebeurt
 *
 * De vier rauwe signalen tot een toestand samenvoegen — dat is en blijft
 * {@link deriveBankLinkHealth} in `lib/bank-connection-status.ts`, de ene
 * afleiding van koppelgezondheid. Deze module consumeert dat oordeel en vertaalt
 * het naar copy. Twee gevolgen die daaruit vanzelf volgen, en die dus GEEN eigen
 * regel hier nodig hebben:
 *
 *  - Een **al verlopen** koppeling levert `state: 'linked-broken'` en dus
 *    `expiringSoon: false`. Die krijgt geen "verloopt bijna"-bericht: dat is een
 *    andere toestand, met een eigen herstelknop op de rekeningdetail.
 *  - Een **zacht ontkoppelde** rekening (`is_active = false`) is `manual` —
 *    gebruikersintentie wint van storing. Geen enkel bericht.
 */

import {
  deriveBankLinkHealth,
  BANK_LINK_EXPIRY_WARNING_DAYS,
} from '@/lib/bank-connection-status'

/**
 * Vanaf hoeveel verstreken tijd sinds de laatste sync we over versheid beginnen.
 * Was een inline `threeDaysAgo` in de meldingen-route; hier benoemd zodat de
 * drempel testbaar is en niet per ongeluk verschuift.
 */
const STALE_SYNC_MS = 3 * 24 * 60 * 60 * 1000

/** Eén koppelrij zoals de meldingen-route haar leest. */
export interface BankSignalInput {
  /** `bank_connection_accounts.id` — de sleutel in de melding-id. */
  connectionAccountId: string
  /**
   * Gemaskeerd IBAN-fragment. Draagt ALLEEN het versheidsbericht — dat bestond al
   * met dit label en blijft ongewijzigd.
   */
  label: string
  /**
   * `bank_connections.provider_name` — de banknaam, en bewust het label van de
   * verloop-waarschuwing.
   *
   * Die waarschuwing raakt namelijk élke gekoppelde rekening 14 van elke 90 dagen,
   * waar het versheidsbericht een uitzonderingstoestand is. Met het IBAN-fragment
   * zou dit bericht dus structureel een stukje rekeningnummer in
   * `app_settings.notifications_history_*` schrijven — plaintext JSON, terwijl de
   * bron juist veld-versleuteld is (`iban_encrypted`) en de privacy-tekst die
   * versleuteling belooft. De banknaam identificeert de rekening voor de gebruiker
   * net zo goed ("ING verloopt bijna") zonder dat gegeven te verbreden.
   */
  providerName: string | null
  /**
   * `bank_connection_accounts.is_active`. De route leest alleen actieve rijen,
   * maar het signaal reist expliciet mee zodat de zachte-ontkoppelingsregel hier
   * zichtbaar is in plaats van verstopt in een `WHERE`.
   */
  linkIsActive: boolean
  /** `bank_connections.status`. */
  connectionStatus: string | null
  /** `bank_connections.token_expires_at` (ISO-string). */
  tokenExpiresAt: string | null
  /** `bank_connection_accounts.last_synced_at` (ISO-string). */
  lastSyncedAt: string | null
}

/**
 * De inhoud van één melding. Spiegelt `Notification` uit
 * `app/api/notifications/route.ts` mínus de velden die de aggregator zet
 * (`createdAt`, `read`).
 */
export interface BankSignalNotification {
  id: string
  type: 'sync'
  priority: number
  title: string
  description: string
  icon: string
  color: string
  actionUrl: string
  aiContext: string
}

/** Nederlandse dag-aanduiding voor een deadline die nog niet verstreken is. */
function verloopMoment(days: number): string {
  if (days <= 0) return 'vandaag'
  if (days === 1) return 'morgen'
  return `over ${days} dagen`
}

/**
 * Het bericht over één bankkoppeling, of `null` als er niets te melden valt.
 *
 * Volgorde is het contract:
 *  1. koppeling verloopt binnen {@link BANK_LINK_EXPIRY_WARNING_DAYS} dagen →
 *     verloop-waarschuwing (en dus GEEN versheidsbericht, zie moduledocstring);
 *  2. anders: langer dan 3 dagen niets binnengekomen → versheidsbericht;
 *  3. anders → `null`.
 *
 * @param now Injecteerbaar voor tests; standaard de systeemtijd.
 */
export function buildBankSignalNotification(
  input: BankSignalInput,
  now: Date = new Date(),
): BankSignalNotification | null {
  const health = deriveBankLinkHealth(
    {
      linkIsActive: input.linkIsActive,
      connectionStatus: input.connectionStatus,
      tokenExpiresAt: input.tokenExpiresAt,
      lastSyncedAt: input.lastSyncedAt,
    },
    now,
  )

  if (health.expiringSoon && health.daysUntilExpiry !== null) {
    const days = health.daysUntilExpiry
    const moment = verloopMoment(days)
    const bank = input.providerName?.trim() || 'Je bankkoppeling'
    return {
      id: `bank_expiry_${input.connectionAccountId}`,
      type: 'sync',
      priority: 3,
      title: `${bank}: koppeling verloopt ${moment}`,
      description:
        `Je toestemming om deze rekening automatisch uit te lezen loopt ${moment} af. ` +
        'Vernieuw de koppeling, dan blijven je transacties vanzelf binnenkomen.',
      icon: 'ShieldAlert',
      color: 'amber',
      actionUrl: '/core/cash',
      aiContext:
        `Mijn bankkoppeling met ${bank} verloopt ${moment}. ` +
        'Wat gebeurt er als ik niets doe, en hoe vernieuw ik hem?',
    }
  }

  // Zacht ontkoppeld → helemaal niets: gebruikersintentie wint van storing.
  //
  // Een KAPOTTE koppeling (`linked-broken`, autorisatie verlopen of ingetrokken)
  // valt hier bewust NIET onder en houdt haar versheidsbericht. Dat was al zo, en
  // het moet zo blijven: juist dan komt er niets meer binnen, en het bericht is
  // het enige proactieve duwtje richting herstel. De herstelknop op de
  // rekeningdetail vindt de gebruiker alleen als hij er zelf gaat kijken — precies
  // de aanname die dit hele kanaal bestrijdt.
  if (health.state === 'manual') return null

  if (!input.lastSyncedAt) return null
  const lastSynced = new Date(input.lastSyncedAt)
  const elapsedMs = now.getTime() - lastSynced.getTime()
  if (!Number.isFinite(elapsedMs) || elapsedMs <= STALE_SYNC_MS) return null

  const daysSince = Math.floor(elapsedMs / 86_400_000)
  return {
    id: `sync_${input.connectionAccountId}`,
    type: 'sync',
    priority: 2,
    title: `${input.label}: ${daysSince} dagen niet gesynchroniseerd`,
    description: `Laatste sync: ${lastSynced.toLocaleDateString('nl-NL')}. Vernieuw je bankgegevens voor actueel inzicht.`,
    icon: 'RefreshCw',
    color: 'red',
    actionUrl: '/core/cash',
    aiContext: `Mijn bankrekening ${input.label} is al ${daysSince} dagen niet gesynchroniseerd. Wat moet ik doen?`,
  }
}
