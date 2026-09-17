/**
 * Het toestemmingscontract voor cloud-AI (ADR 0155) — de sleutels die de
 * migratie `20260917130000_ai_consent_events.sql`, de route
 * `POST /api/consent/ai` en de drie keuze-oppervlakken delen.
 *
 * Eén keuzemoment, gelogd en omkeerbaar: elke keuze (ja/nee, ook een latere
 * omkering) schrijft één rij in `consent_events` (append-only, eigen-rij RLS,
 * geen update/delete voor gebruikers) en zet de effectieve stand op de eigen
 * `profiles`-rij (`ai_enabled`, `ai_consent_at`, `ai_consent_version`). De
 * server-side kill-switch (lib/ai/privacy-gate.ts) leest `ai_enabled` en is
 * daarmee automatisch de handhaving van de keuze.
 *
 * De CHECK-constraints in de migratie spiegelen deze lijsten letterlijk — voeg je
 * hier een waarde toe, dan hoort daar een correctiemigratie bij.
 */

/** Wat er toestemming voor wordt gevraagd. */
export const AI_CONSENT_KINDS = ['ai_cloud', 'pension_pdf'] as const
export type AiConsentKind = (typeof AI_CONSENT_KINDS)[number]

/** De keuze zelf. `withdrawn` dekt zowel een eerste "nee" als een latere intrekking. */
export const AI_CONSENT_DECISIONS = ['granted', 'withdrawn'] as const
export type AiConsentDecision = (typeof AI_CONSENT_DECISIONS)[number]

/**
 * Waar de keuze gemaakt werd. De eerste drie mag de client meesturen naar
 * `POST /api/consent/ai`; de rest schrijft alleen de server: `pension-upload`
 * (app/api/pension/parse, bij een PDF-upload) en `seed` (lib/seed-persona.ts —
 * een geseed testaccount is post-onboarding, dus mét een vastgelegde keuze;
 * anders loopt élke UAT-/regressie-run tegen de vergrendelde overlay).
 */
export const AI_CONSENT_CLIENT_SOURCES = ['onboarding', 'interstitial', 'mijn-privacy'] as const
export type AiConsentClientSource = (typeof AI_CONSENT_CLIENT_SOURCES)[number]

export const AI_CONSENT_SOURCES = [...AI_CONSENT_CLIENT_SOURCES, 'pension-upload', 'seed'] as const
export type AiConsentSource = (typeof AI_CONSENT_SOURCES)[number]

/** Het token dat de pensioen-PDF-upload al sinds ADR 0035 meestuurt. */
export const PENSION_PDF_CONSENT_VERSION = 'pension_pdf_ai_v1'

/** Request-body van `POST /api/consent/ai` (zod-schema in de route). */
export interface AiConsentRequest {
  decision: AiConsentDecision
  source: AiConsentClientSource
}

/** Antwoord van `POST /api/consent/ai` bij succes. */
export interface AiConsentResponse {
  ok: true
  /** De effectieve stand van de kill-switch ná deze keuze. */
  aiEnabled: boolean
  /** ISO-tijdstip van deze keuze, zoals op `profiles.ai_consent_at` gezet. */
  consentAt: string
  /** De versie van de feiten waarvoor gekozen is (lib/ai/privacy-facts.ts). */
  version: string
}

/** Route-pad, zodat de drie aanroepers geen letterlijke string dragen. */
export const AI_CONSENT_ROUTE = '/api/consent/ai'
