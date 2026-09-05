/**
 * Gegevensregel ("dataNote") onder het deck van een onboarding-stap.
 *
 * Waarom deze module bestaat: de uitleg *waarom we iets vragen* stond verspreid
 * en de uitleg *wat ermee gebeurt* stond nergens — behalve op de pensioenstap.
 * Wie twijfelt bij het invullen zoekt niets op, die haakt af. De uitleg staat
 * dus waar de twijfel ontstaat, in één vaste vorm, uit één bron (UR3-15).
 *
 * ── De claim-grens (hard, niet onderhandelbaar) ─────────────────────────────
 * Een geruststelling die de code niet waarmaakt is erger dan geen uitleg. Wat
 * hier staat is daarom bewust smal:
 *
 *  - "versleuteld in de EU" — Supabase, database in Ierland, versleuteld in
 *    rust en in transport. Staat zo op /privacy §7 en op /mijn/privacy.
 *  - "later aan te passen" — de onboarding bewaart antwoorden als concept op je
 *    eigen profielrij (ADR 0122); elk veld hier is later te wijzigen.
 *
 * En bewust NIET:
 *  - **Geen** "veldversleuteld" / "extra versleuteld" bij inkomen, uitgaven,
 *    bezittingen of schulden. AES-256-GCM-veldversleuteling (ADR 0077,
 *    `lib/crypto/field-encryption.ts`) geldt alleen voor IBAN/rekeningnummer,
 *    bank- en broker-tokens en de intake — nooit voor bedragen.
 *  - **Geen** "gaat niet naar een AI-dienst". Waar voor het onboarding-formulier
 *    zelf, maar onwaar zodra iemand met Fin praat: `lib/ai/context/shared-context.ts`
 *    zet maandinkomen en -uitgaven in de chatcontext. De AI-hop hoort op
 *    /privacy §2 en §4 uitgelegd, niet als geruststelling onder een invoerveld.
 *  - **Geen** "alleen jij kunt erbij" — onwaar zodra er een huishoud-partner is.
 *  - **Geen** "alles blijft op je apparaat" — verboden claim.
 *
 * Elke variant eindigt zónder leesteken: `OnboardingShell` plakt er de
 * "wat we ermee doen"-link achter (zie `DATA_NOTE_LINK_LABEL`).
 */

/**
 * Linkdoel van de gegevensregel: de PUBLIEKE privacyverklaring, niet
 * /mijn/privacy. Zolang `onboarding_completed=false` stuurt de app-layout
 * /mijn/privacy terug naar /onboarding (WF-START-11) — die link zou dus
 * terugkaatsen naar de stap die de gebruiker net verliet.
 */
export const DATA_NOTE_PRIVACY_HREF = '/privacy'

/** Zichtbaar linklabel achter elke gegevensregel. */
export const DATA_NOTE_LINK_LABEL = 'wat we ermee doen'

/** De stappen die een gegevensregel dragen. */
export type OnboardingDataNoteStep =
  | 'naam'
  | 'geboortedatum'
  | 'inkomen'
  | 'uitgaven'
  | 'uitgaven-later'
  | 'bezittingen'
  | 'schulden'
  | 'spaardoel'

/**
 * De belofte die elke variant deelt. Staat apart zodat de test kan afdwingen
 * dat er geen tweede formulering ontstaat zodra iemand een stap toevoegt.
 */
export const DATA_NOTE_BELOFTE = 'versleuteld in de EU'

export const DATA_NOTE_BY_STEP: Record<OnboardingDataNoteStep, string> = {
  naam: 'Je naam en geboortedatum bewaren we versleuteld in de EU; aanpassen kan later altijd',
  geboortedatum:
    'Je naam en geboortedatum bewaren we versleuteld in de EU; aanpassen kan later altijd',
  inkomen: 'Je bedragen bewaren we versleuteld in de EU; aanpassen kan later altijd',
  uitgaven: 'Je bedragen bewaren we versleuteld in de EU; aanpassen kan later altijd',
  'uitgaven-later': 'Je bedragen bewaren we versleuteld in de EU; aanpassen kan later altijd',
  bezittingen:
    'Wat je toevoegt bewaren we versleuteld in de EU; aanpassen of verwijderen kan later altijd',
  schulden:
    'Wat je toevoegt bewaren we versleuteld in de EU; aanpassen of verwijderen kan later altijd',
  spaardoel: 'Je doel bewaren we versleuteld in de EU; aanpassen kan later altijd',
}

/** Lookup met een sprekende naam; gebruik deze in plaats van de map zelf. */
export function dataNoteFor(step: OnboardingDataNoteStep): string {
  return DATA_NOTE_BY_STEP[step]
}

/**
 * Formuleringen die nooit in een gegevensregel mogen staan — zie de claim-grens
 * hierboven. De test toetst hierop, zodat een latere "vriendelijkere" zin niet
 * stilletjes een belofte doet die de code niet waarmaakt.
 */
export const DATA_NOTE_VERBODEN_FRAGMENTEN = [
  'alleen jij',
  'anoniem',
  'op je apparaat',
  'blijft op je toestel',
  'veldversleuteld',
  'extra versleuteld',
  'niet naar een ai',
] as const
