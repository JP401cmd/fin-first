/**
 * Publieke contactadressen van de juridische pagina's — één bron.
 *
 * WAAROM DIT BESTAND BESTAAT
 * TriFinity heeft (stand 7 augustus 2026) nog GEEN geregistreerd internet-
 * domein; de keuze tussen .nl en .app is uitgesteld tot een domein daadwerkelijk
 * is aangeschaft (besluit eigenaar, 5 augustus 2026). Tot die tijd mag geen
 * enkele juridische tekst een mailbox als bereikbaar presenteren die geen post
 * kan ontvangen: een privacyverklaring die verwijst naar een niet-bestaand
 * adres blokkeert het uitoefenen van AVG-rechten (art. 13 lid 1 sub a/b AVG).
 *
 * Eerder dreven de adressen al uiteen over de app heen (support@…app op
 * /contact, privacy@…nl in de in-app modal, noreply@…app in de mailer). Daarom
 * staat het adres nu op één plek in plaats van in elf JSX-fragmenten.
 *
 * ZO ZET JE HET AAN
 * Vul `address` in zodra (a) het domein geregistreerd is én (b) de mailbox
 * werkelijk post ontvangt. Alle oppervlakken die <LegalEmail> gebruiken tonen
 * dan automatisch weer een echte mailto-link in plaats van de placeholder:
 * app/privacy, app/voorwaarden, app/contact en de in-app privacy-modal.
 * Verwijder daarna ook de "nog geen domein"-passages in die pagina's.
 */

export type LegalContactKind = 'privacy' | 'support'

type LegalContactEntry = {
  /** `null` = nog geen bereikbaar adres; toon de placeholder. */
  address: string | null
  /** Zichtbare invulplek, in dezelfde stijl als [KvK-nummer] in de teksten. */
  placeholder: string
}

export const LEGAL_CONTACT: Record<LegalContactKind, LegalContactEntry> = {
  privacy: {
    address: null,
    placeholder: '[privacy-e-mailadres — volgt]',
  },
  support: {
    address: null,
    placeholder: '[support-e-mailadres — volgt]',
  },
}

/** True zodra er minstens één echt bereikbaar contactadres is. */
export function hasLegalContactEmail(): boolean {
  return Object.values(LEGAL_CONTACT).some((entry) => entry.address !== null)
}
