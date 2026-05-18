import { redirect } from 'next/navigation'

/**
 * /mijn/notificaties — redirect-stub naar legacy /identity/instellingen
 * met de notificaties-tab vooraf geopend.
 *
 * Toekomstige iteratie: extracteer de notificaties-sectie uit
 * /identity/instellingen/page.tsx (regel 682-890) + bijbehorende
 * handlers (toggleNotifPref, saveNotifPrefs, savePartnerNotifPrefs,
 * togglePartnerCategory, toggleCheckin) naar een eigen page.tsx onder
 * /mijn/notificaties. Volg agent-plan: laag-risico extractie want de
 * sectie heeft geen cross-tab state. Voor nu redirect zodat de URL
 * werkt en de gebruiker landt waar verwacht.
 */
export default function MijnNotificatiesPage() {
  redirect('/identity/instellingen?tab=notificaties')
}
