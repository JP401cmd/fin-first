/**
 * Copy voor de twee onboarding-meldingen die een uitspraak doen over het
 * BEHOUD van al ingevulde gegevens.
 *
 * ACHTERGROND (kaart C3, aug 2026): sinds de security-fix van jul 2026
 * (optie A, commit `0b33ede80`) bewaart `draft-persistence.ts` bewust alléén
 * een NIET-gevoelig draft in localStorage — stap-positie en keuzes-zonder-
 * bedrag. Naam/geboortedatum, budgetbedragen, bezittingen en schulden staan
 * uitsluitend in de in-memory reducer-state en zijn na een refresh, op een
 * ander apparaat of in een privévenster weg.
 *
 * Beide meldingen claimden méér dan het product waarmaakt: de herstel-banner
 * meldde "je eerder ingevulde gegevens zijn hersteld" (terwijl alleen de
 * stap-positie terugkomt) en de opslag-fout meldde "je antwoorden staan nog
 * hier" (waar is: alleen zolang de gebruiker niet ververst). Het gedrag blijft
 * zoals het is — de tekst vertelt nu wat er WEL en NIET bewaard blijft.
 *
 * Deze copy staat bewust in een eigen module (geen export uit `page.tsx`)
 * zodat de tekst getest kan worden zonder de hele client-component-keten te
 * mounten.
 */
import type { SENSITIVE_DRAFT_KEYS } from './draft-persistence'

/** Union van de draft-velden die bewust NIET gepersisteerd worden. */
export type SensitiveDraftKey = (typeof SENSITIVE_DRAFT_KEYS)[number]

/**
 * Per niet-bewaard veld de woorden waarmee de herstel-melding dat veld voor
 * de gebruiker benoemt. `Record` over de union: komt er een gevoelig veld bij
 * in `SENSITIVE_DRAFT_KEYS`, dan geeft dit een compile-fout tot de melding het
 * óók noemt — precies de drift die C3 veroorzaakte.
 */
export const SENSITIVE_FIELD_MENTIONS: Record<SensitiveDraftKey, readonly string[]> = {
  identity: ['naam'],
  budgetAmounts: ['bedragen'],
  quickAssets: ['bezittingen'],
  quickDebts: ['schulden'],
}

/**
 * Melding bij het hervatten van een draft. Zegt exact wat er terugkomt (de
 * plek in de wizard) en wat niet (alles met een bedrag of een naam eraan).
 */
export const DRAFT_RESTORED_NOTICE = {
  label: 'Verder waar je was',
  body:
    'We hebben je plek in de vragenlijst onthouden. Je naam, bedragen, bezittingen en schulden bewaren we niet op dit apparaat — die vul je opnieuw in.',
} as const

/**
 * Melding na een mislukte eindopslag. De ingevulde antwoorden staan nog in de
 * in-memory state (er volgt geen reload op deze fout), maar een refresh wist
 * ze alsnog — dat staat er nu bij.
 */
export const SAVE_FAILED_NOTICE = {
  label: 'Opslaan mislukt',
  body:
    'Het opslaan is niet gelukt. Je antwoorden staan nog in dit scherm — probeer het opnieuw. Ververs de pagina niet: dan ben je je bedragen en posten kwijt.',
} as const
