// Platform-status: onderhoudsmodus, in-app aankondiging en globale kill-switches.
// Opgeslagen in app_settings key 'platform_status' (één JSON-object). Beheerd via
// /beheer/platform; gelezen in de (app)-layout (banner) en in getModel (AI-kill).

export type AnnouncementLevel = 'info' | 'warning'

export interface PlatformStatus {
  /** Onderhoudsmodus: toont een prominente, niet-sluitbare banner aan iedereen. */
  maintenance: { enabled: boolean; message: string }
  /** Vrije aankondiging aan alle gebruikers (sluitbaar per sessie). */
  announcement: { enabled: boolean; title: string; body: string; level: AnnouncementLevel }
  /** Globale kill-switches. `true` = functie staat AAN. */
  killSwitches: { ai: boolean }
}

export const DEFAULT_PLATFORM_STATUS: PlatformStatus = {
  maintenance: { enabled: false, message: '' },
  announcement: { enabled: false, title: '', body: '', level: 'info' },
  killSwitches: { ai: true },
}

export function parsePlatformStatus(raw: string | null | undefined): PlatformStatus {
  if (!raw) return DEFAULT_PLATFORM_STATUS
  try {
    const v = JSON.parse(raw) as Partial<PlatformStatus>
    const level: AnnouncementLevel = v?.announcement?.level === 'warning' ? 'warning' : 'info'
    return {
      maintenance: {
        enabled: Boolean(v?.maintenance?.enabled),
        message: String(v?.maintenance?.message ?? ''),
      },
      announcement: {
        enabled: Boolean(v?.announcement?.enabled),
        title: String(v?.announcement?.title ?? ''),
        body: String(v?.announcement?.body ?? ''),
        level,
      },
      killSwitches: {
        // Default AAN: een corrupt/ontbrekend veld mag AI niet per ongeluk uitzetten.
        ai: v?.killSwitches?.ai !== false,
      },
    }
  } catch {
    return DEFAULT_PLATFORM_STATUS
  }
}

/** True als er iets te tonen is (onderhoud of aankondiging) — scheelt een render. */
export function hasBanner(status: PlatformStatus): boolean {
  return status.maintenance.enabled || status.announcement.enabled
}
