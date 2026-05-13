/**
 * WOZ-waarde jaarlijkse reminder.
 *
 * Gemeenten publiceren nieuwe WOZ-beschikkingen tussen 1 mei en 1 juli.
 * In dat venster sturen we een herinnering aan elke gebruiker met minstens
 * één `eigen_huis` asset, mits er nog geen reminder is verstuurd in dit
 * kalenderjaar.
 *
 * Deze module levert pure beslislogica. Gewired in
 * `app/api/notifications/route.ts` (sectie 4b): de aggregator roept
 * `shouldSendWozReminder` aan, schiet de notificatie in als de uitkomst
 * `true` is en persisteert `lastSentAt` in `app_settings` (key:
 * `woz_reminder_last_sent_${user_id}`).
 */

export interface WozReminderProfile {
  /** Aantal actieve `eigen_huis` assets van de gebruiker. */
  eigenHuisAssetCount: number
}

export interface WozReminderInput {
  profile: WozReminderProfile
  /** ISO-string van de laatste verzonden reminder (of null/undefined). */
  lastSentAt: string | null | undefined
  /** Huidige tijd — injecteerbaar voor tests. Default: `new Date()`. */
  now?: Date
}

/** Start van het reminder-venster (1 mei, dag-precisie). */
const WINDOW_START_MONTH = 5 // mei (1-indexed)
const WINDOW_START_DAY = 1
/** Einde van het reminder-venster (1 juli — exclusief, dus 30 juni inclusief). */
const WINDOW_END_MONTH = 7 // juli (1-indexed)
const WINDOW_END_DAY = 1

/**
 * Bepaalt of er vandaag een WOZ-reminder gestuurd moet worden.
 *
 * Voorwaarden (alle moeten gelden):
 *  1. Gebruiker heeft minstens één `eigen_huis` asset.
 *  2. Huidige datum valt in het venster 1 mei – 30 juni (inclusief).
 *  3. Er is in het lopende kalenderjaar nog geen reminder verstuurd.
 */
export function shouldSendWozReminder(input: WozReminderInput): boolean {
  const now = input.now ?? new Date()

  if (input.profile.eigenHuisAssetCount <= 0) return false
  if (!isInWozWindow(now)) return false

  if (!input.lastSentAt) return true

  const lastSent = new Date(input.lastSentAt)
  if (Number.isNaN(lastSent.getTime())) return true

  return lastSent.getUTCFullYear() < now.getUTCFullYear()
}

/** Checkt of `date` binnen het mei–juni venster valt (inclusief 1 mei, exclusief 1 juli). */
export function isInWozWindow(date: Date): boolean {
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
export const WOZ_REMINDER_TEMPLATE = {
  type: 'sync' as const,
  priority: 3,
  title: 'Update je WOZ-waarde',
  description:
    'Je gemeente publiceert deze maanden nieuwe WOZ-beschikkingen. Open het officiële waardeloket en werk je eigen-huis waarde bij.',
  icon: 'Building2',
  color: 'amber',
  actionUrl: '/identity/koppelingen',
}
