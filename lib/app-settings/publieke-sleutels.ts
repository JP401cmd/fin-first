/**
 * DE PUBLIEKE `app_settings`-SLEUTELS — de TS-spiegel van de RLS-allowlist.
 *
 * ## Wat dit is
 *
 * De SELECT-policy `app_settings select` laat een ingelogde niet-superadmin
 * precies deze globale sleutels lezen (tak 2, sinds migratie
 * `20260919130000_app_settings_select_allowlist.sql`, ADR 0163). Alles wat hier
 * niet staat is voor de sessie-client dicht — ook een sleutel die morgen
 * bijkomt. Dat is de omkering van de oude denylist, waar een nieuw geheim
 * standaard lekte tot iemand de array aanvulde.
 *
 * ## Waarom de lijst twee keer bestaat
 *
 * De policy is de waarheid; deze constante is de spiegel die de repo kan
 * toetsen. `publieke-sleutels.test.ts` leest de nieuwste migratie die de
 * policy aanmaakt en eist dat beide lijsten gelijk zijn, én dat elke sleutel
 * een lezer buiten `app/api/admin` heeft — een sleutel zonder lezer is een
 * gat in de grens zonder reden.
 *
 * ## Een sleutel toevoegen
 *
 * 1. Nieuwe migratie (append-only: drop + create van de policy, de hele array
 *    opnieuw) — nooit een gedraaide migratie bewerken.
 * 2. Dezelfde sleutel hier.
 * 3. De lezer via de sessie-client (`createClient()` uit `lib/supabase/server`).
 *
 * Is de sleutel BEHEER-content (een prompt-override, directives, interne
 * endpoints)? Dan hoort hij hier NIET: lees hem server-side via
 * `lib/app-settings/beheer-instelling.ts` (service-role). De vraag is niet "is
 * dit geheim?" maar "moet een gebruiker dit kunnen lezen?" — standaard nee.
 */
export const PUBLIEKE_APP_SETTINGS = [
  /** Kredietregels voor de AI-tegoeden (`/api/ai-credits`, `lib/ai/credit-gate.ts`). */
  'ai_credit_config',
  /** Coach-configuratie voor de app-shell (`app/(app)/layout.tsx`). */
  'coach_config',
  /** Helpteksten per gids-sleutel (`lib/briefing/guide-help.ts`). */
  'guide_help_content',
  /** Welke modules de modulegids overslaat (`/api/module-guide/settings`). */
  'module_guide_disabled_modules',
  /** Rem op nieuws-verversingen per week (`lib/news-edition-store.ts`). */
  'news_max_refreshes_per_week',
  /** Onderhoudsmodus/aankondiging voor de app-shell (`app/(app)/layout.tsx`). */
  'platform_status',
  /** Bankkoppeling aan/uit (`lib/truelayer/feature-flag.ts`) — de kanarie: ontbreekt hij, dan 503 op elke bank-connect-route. */
  'truelayer_enabled',
  /** Sandbox of productie — `lib/truelayer/client.ts#getBaseUrls` (valt stil terug op sandbox). */
  'truelayer_environment',
  /** De welkomstgids (`lib/welcome-guide-loader.ts`, `/api/welcome-guide`). */
  'welcome_guide_config',
  /** Beheerder-gedefinieerde widget-presets (`/api/widget-presets`). */
  'widget_presets',
] as const

export type PubliekeAppSetting = (typeof PUBLIEKE_APP_SETTINGS)[number]
