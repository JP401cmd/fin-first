/**
 * Copy voor de twee onboarding-meldingen die een uitspraak doen over het
 * BEHOUD van al ingevulde gegevens.
 *
 * ACHTERGROND — de tekst is twee keer verhuisd, achter het gedrag aan:
 *
 *  · kaart C3 (aug 2026): het concept bewaarde toen alléén stap-positie en
 *    keuzes-zonder-bedrag, terwijl de banner "je eerder ingevulde gegevens zijn
 *    hersteld" meldde. De tekst is toen eerlijk gemaakt over wat er wegviel.
 *  · kaart UR2-01 (aug 2026): het concept staat nu server-side op de eigen
 *    profielrij en bevat wél alle antwoorden. Die eerlijke tekst van C3 is
 *    daarmee zélf onwaar geworden — hij zou een gebruiker die zijn bedragen
 *    gewoon ziet staan vertellen dat ze weg zijn. Wat nu resteert is één veld
 *    dat niet terugkomt: het geparste pensioenoverzicht (ADR 0115 — dat blijft
 *    op het toestel).
 *
 * Deze copy staat bewust in een eigen module (geen export uit `page.tsx`)
 * zodat de tekst getest kan worden zonder de hele client-component-keten te
 * mounten.
 */
import type { UNRESTORED_DRAFT_KEYS } from './draft-persistence'

/** Union van de conceptvelden die na een reload bewust NIET terugkomen. */
export type UnrestoredDraftKey = (typeof UNRESTORED_DRAFT_KEYS)[number]

/**
 * Per niet-hersteld veld de woorden waarmee de herstel-melding dat veld voor
 * de gebruiker benoemt. `Record` over de union: komt er een veld bij in
 * `UNRESTORED_DRAFT_KEYS`, dan geeft dit een compile-fout tot de melding het
 * óók noemt — precies de drift die C3 veroorzaakte.
 */
export const UNRESTORED_FIELD_MENTIONS: Record<UnrestoredDraftKey, readonly string[]> = {
  pensionParseResult: ['pensioenoverzicht'],
}

/**
 * Melding bij het hervatten van een concept. Bevestigt dat de antwoorden terug
 * zijn en noemt het ene veld dat dat niet is.
 */
export const DRAFT_RESTORED_NOTICE = {
  label: 'Verder waar je was',
  body:
    'Je eerder ingevulde antwoorden staan er weer — inclusief je bedragen, bezittingen en schulden. Alleen een geüpload pensioenoverzicht bewaren we niet; dat lees je zo nodig opnieuw in.',
} as const

/**
 * Melding na een mislukte eindopslag. De antwoorden staan nog in het scherm én
 * als concept op de server, dus verversen is niet meer fataal — maar het helpt
 * ook niet: de fout zit in het afronden, niet in het concept.
 */
export const SAVE_FAILED_NOTICE = {
  label: 'Opslaan mislukt',
  body:
    'Het afronden is niet gelukt. Je antwoorden staan nog in dit scherm en zijn als concept bewaard — probeer het opnieuw.',
} as const

/**
 * Melding wanneer een verplicht antwoord nog ontbreekt. Dit is GEEN opslagfout:
 * er is niets naar de server gegaan, dus "opslaan mislukt", "ververs de pagina
 * niet" en een knop "Opnieuw proberen" zijn hier alle drie onjuist. Wat de
 * gebruiker moet weten staat in het specifieke bericht (welk veld ontbreekt);
 * deze `body` is de terugval wanneer dat bericht leeg is.
 */
export const INCOMPLETE_INPUT_NOTICE = {
  label: 'Nog niet compleet',
  body:
    'Er ontbreekt nog een verplicht antwoord. We hebben je teruggebracht naar die vraag — vul hem aan en ga verder.',
} as const

/**
 * De twee oorzaken waarvoor de onboarding een melding bovenaan toont. Bewust
 * één gediscrimineerde vorm en geen losse boolean: de bug was juist dat beide
 * oorzaken op dezelfde `string | null`-state landden, waarna de banner niet
 * meer kón weten welke copy erbij hoorde.
 */
export type OnboardingNotice =
  /**
   * Een ontbrekend verplicht antwoord. Draagt zijn eigen tekst, want die is per
   * geval anders en wordt letterlijk getoond.
   */
  | { kind: 'validation'; message: string }
  /**
   * Een mislukte eindopslag. Bewust ZONDER tekst: de banner toont hier de
   * vaste, client-veilige `SAVE_FAILED_NOTICE`. Een meereizend message-veld dat
   * nergens landt, suggereert dat de technische fouttekst de gebruiker bereikt
   * — die hoort in de console, niet in de state.
   */
  | { kind: 'save' }

/** Wat de banner moet tonen: kop, tekst en of een herkansing zinvol is. */
export interface NoticeDisplay {
  label: string
  body: string
  /** Alleen bij een échte opslagpoging is "Opnieuw proberen" een echte actie. */
  showRetry: boolean
}

/**
 * Vertaalt de melding-state naar wat er op het scherm hoort — één beslissing,
 * los van de render, zodat hij testbaar is zonder de hele onboarding-keten te
 * mounten (zelfde opzet als `lib/page-status/display.ts#resolveBannerDisplay`).
 */
export function resolveNoticeDisplay(notice: OnboardingNotice | null): NoticeDisplay | null {
  if (!notice) return null
  if (notice.kind === 'validation') {
    return {
      label: INCOMPLETE_INPUT_NOTICE.label,
      body: notice.message.trim() || INCOMPLETE_INPUT_NOTICE.body,
      showRetry: false,
    }
  }
  return {
    label: SAVE_FAILED_NOTICE.label,
    body: SAVE_FAILED_NOTICE.body,
    showRetry: true,
  }
}
