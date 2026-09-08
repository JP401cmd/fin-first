import type { ChatHistoryBackend, ChatHistoryMode, ChatOrigin } from './types'

/**
 * Waar landt dít gesprek? De enige plek waar de opslagkeuze en de privacyvloer
 * elkaar ontmoeten (ADR 0137, melding W-004).
 *
 * Vier gevallen, en het vierde is de reden dat deze functie bestaat:
 *
 * | modus      | origin | uitkomst   |
 * |------------|--------|------------|
 * | `uit`      | *      | `geen`     |
 * | `apparaat` | *      | `apparaat` |
 * | `account`  | cloud  | `server`   |
 * | `account`  | lokaal | `apparaat` | ← de vloer
 *
 * DE VLOER. Een gesprek dat met de lokale AI is gevoerd gaat nooit naar onze
 * server — ook niet wanneer de gebruiker "op mijn account" heeft gekozen. ADR
 * 0043 laat dat technisch toe (die belofte gaat over de inferentie), maar de
 * tekst waarmee we de modus verkopen doet dat niet: "je vraag en je cijfers
 * verlaten het toestel niet". De tekst wint. Dezelfde vloer staat een tweede
 * keer in de database als `CHECK (origin = 'cloud')` op `chat_conversations`,
 * zodat een fout in deze laag geen stil lek kan worden.
 *
 * Puur en zonder randgevallen: geen fetch, geen datum, geen willekeur. Dat is
 * bewust — dit is de enige deterministisch toetsbare kern van de privacybelofte
 * en hij hoort in één oogopslag na te rekenen te zijn.
 */
export function resolveBackend(mode: ChatHistoryMode, origin: ChatOrigin): ChatHistoryBackend {
  if (mode === 'uit') return 'geen'
  if (mode === 'apparaat') return 'apparaat'
  return origin === 'lokaal' ? 'apparaat' : 'server'
}
