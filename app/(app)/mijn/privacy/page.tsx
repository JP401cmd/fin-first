import { redirect } from 'next/navigation'

/**
 * /mijn/privacy — redirect-stub naar legacy /identity/instellingen
 * met de privacy-tab geopend (AI-features toggle, financiële context-
 * toelichting, transparantie, huishouden-privacy).
 *
 * Toekomstige iteratie: extracteer regel 1221-1420 uit identity/
 * instellingen/page.tsx + privacy-policy-modal naar eigen page.
 */
export default function MijnPrivacyPage() {
  redirect('/identity/instellingen?tab=privacy')
}
