/**
 * Pensioen jaarlijkse reminder.
 *
 * Begin van het jaar (heel januari) plannen veel mensen hun financiële
 * jaaroverzicht. In dat venster sturen we een herinnering aan elke gebruiker
 * met minstens één `retirement` asset, mits er nog geen reminder is verstuurd
 * in dit kalenderjaar.
 *
 * Mijnpensioenoverzicht biedt geen consumer-API (DigiD-vereist), dus de
 * waarde moet handmatig worden bijgewerkt — deze reminder is het
 * UX-handvat dat de gebruiker eraan herinnert om dat te doen.
 *
 * Deze module levert pure beslislogica. Gewired in
 * `app/api/notifications/route.ts` (sectie 4b): de aggregator roept
 * `shouldSendPensionReminder` aan, schiet de notificatie in als de uitkomst
 * `true` is en persisteert `lastSentAt` in `app_settings` (key:
 * `pension_reminder_last_sent_${user_id}`).
 */

export interface PensionReminderProfile {
  /** Aantal actieve `retirement` assets van de gebruiker. */
  retirementAssetCount: number
}

export interface PensionReminderInput {
  profile: PensionReminderProfile
  /** ISO-string van de laatste verzonden reminder (of null/undefined). */
  lastSentAt: string | null | undefined
  /** Huidige tijd — injecteerbaar voor tests. Default: `new Date()`. */
  now?: Date
}

/** Reminder-venster: heel januari (1 jan inclusief, 1 feb exclusief). */
const WINDOW_START_MONTH = 1 // januari (1-indexed)
const WINDOW_START_DAY = 1
const WINDOW_END_MONTH = 2 // februari (1-indexed)
const WINDOW_END_DAY = 1

/**
 * Bepaalt of er vandaag een pensioen-reminder gestuurd moet worden.
 *
 * Voorwaarden (alle moeten gelden):
 *  1. Gebruiker heeft minstens één `retirement` asset.
 *  2. Huidige datum valt in het venster 1 januari – 31 januari (inclusief).
 *  3. Er is in het lopende kalenderjaar nog geen reminder verstuurd.
 */
export function shouldSendPensionReminder(input: PensionReminderInput): boolean {
  const now = input.now ?? new Date()

  if (input.profile.retirementAssetCount <= 0) return false
  if (!isInPensionWindow(now)) return false

  if (!input.lastSentAt) return true

  const lastSent = new Date(input.lastSentAt)
  if (Number.isNaN(lastSent.getTime())) return true

  return lastSent.getUTCFullYear() < now.getUTCFullYear()
}

/** Checkt of `date` binnen het januari-venster valt (inclusief 1 jan, exclusief 1 feb). */
export function isInPensionWindow(date: Date): boolean {
  const year = date.getUTCFullYear()
  const start = Date.UTC(year, WINDOW_START_MONTH - 1, WINDOW_START_DAY)
  const end = Date.UTC(year, WINDOW_END_MONTH - 1, WINDOW_END_DAY)
  const t = date.getTime()
  return t >= start && t < end
}

/**
 * Vaste copy voor de reminder-notificatie. Match het schema van
 * `Notification` uit `app/api/notifications/route.ts` — caller bepaalt
 * `id`, `createdAt` en `read`-state.
 */
export const PENSION_REMINDER_TEMPLATE = {
  type: 'sync' as const,
  priority: 3,
  title: 'Check je pensioenoverzicht',
  description:
    'Begin van het jaar is een goed moment om je pensioendata bij te werken. Open Mijnpensioenoverzicht (DigiD vereist) en update je waarde handmatig.',
  icon: 'PiggyBank',
  color: 'amber',
  actionUrl: '/identity/koppelingen',
}
