import { redirect } from 'next/navigation'

/**
 * /mijn/uiterlijk — redirect-stub naar legacy /identity/instellingen
 * met de weergave-tab geopend (palet, font-theme, module-/budget-/
 * phase-kleuren, category-tints).
 *
 * Toekomstige iteratie: extracteer regel 891-1219 uit identity/
 * instellingen/page.tsx naar een eigen page.tsx. Risico midden-laag
 * want de tab leeft via module-color-provider context (al global).
 */
export default function MijnUiterlijkPage() {
  redirect('/identity/instellingen?tab=weergave')
}
