/**
 * Eén canonieke veiligheidszin voor élke uitnodiging om een bank te koppelen.
 *
 * Waarom deze module bestaat: de zin bestond in vijf formuleringen op vijf
 * plekken, terwijl vijf ándere uitnodigingen (coach-suggestie, next-step,
 * app-setup-kaart, lege transactielijst, rekeningkaart) alleen het *voordeel*
 * noemden — "minder typewerk". Dat is een voordeel, geen vertrouwen. Het
 * probleem was spreiding, geen onwaarheid: alle vijf oude zinnen klopten
 * (UR3-15).
 *
 * Twee lengtes, één inhoud:
 *  - `BANK_CONNECT_SAFETY_SHORT` — bij een compacte CTA (knop-onderregel,
 *    lege staat, suggestie-tekst).
 *  - `BANK_CONNECT_SAFETY_LONG` — bij een banner of instellingenblok met ruimte.
 *
 * De uitgebreide drie-bloks-uitleg op de bevestigstap van /core/cash/connect
 * (Veilige verbinding · 90 dagen geldig · Alleen lezen) blijft zoals hij is:
 * dat is het moment van beslissen, daar mag het langer.
 *
 * ── De claim-grens ──────────────────────────────────────────────────────────
 * Wat hier staat is feitelijk:
 *  - Je logt in bij je eigen bank via een OAuth-redirect
 *    (`app/api/bank-connect/auth-link/route.ts`) — het wachtwoord passeert ons niet.
 *  - De koppeling loopt via TrueLayer, een gereguleerde betaaldienstverlener met
 *    een PSD2-vergunning voor rekeninginformatie.
 *  - Alleen-lezen: de app kan geen betalingen doen.
 *  - Tokens en IBAN's staan veldversleuteld (AES-256-GCM, ADR 0077) — dit is de
 *    enige plek in de app waar "veldversleuteld" wél waar is.
 * Niet zeggen: "alleen jij kunt erbij" (onwaar bij een huishoud-partner) of
 * "we zien je gegevens niet".
 */

/** De koppelpagina — het enige eindpunt van een bank-uitnodiging. */
export const BANK_CONNECT_HREF = '/core/cash/connect'

/** De gereguleerde partij achter de koppeling. */
export const BANK_CONNECT_PROVIDER = 'TrueLayer'

/**
 * Korte veiligheidszin — past onder een knop of in een lege staat.
 * Noemt de twee dingen die de twijfel wegnemen: waar je inlogt, en wat wij
 * níet kunnen.
 */
export const BANK_CONNECT_SAFETY_SHORT =
  'Je logt in bij je eigen bank — je wachtwoord komt hier nooit langs — en wij kunnen alleen meelezen, nooit betalen.'

/**
 * Lange veiligheidszin — voor een banner of instellingenblok. Voegt de
 * gereguleerde partij en de geldigheidsduur toe.
 */
export const BANK_CONNECT_SAFETY_LONG =
  'Je logt in bij je eigen bank via TrueLayer, een betaaldienstverlener met een PSD2-vergunning; je wachtwoord komt hier nooit langs. Wij kunnen alleen meelezen, nooit betalen, en de toestemming verloopt na 90 dagen.'

/**
 * Formuleringen die nooit in een bank-uitnodiging mogen staan. De test toetst
 * hierop zodat een latere "geruststellende" herschrijving niet meer belooft dan
 * de koppeling waarmaakt.
 */
export const BANK_CONNECT_VERBODEN_FRAGMENTEN = [
  'alleen jij',
  'anoniem',
  '100%',
  'volledig veilig',
  'wij zien niets',
] as const
