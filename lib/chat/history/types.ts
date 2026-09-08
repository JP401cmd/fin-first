/**
 * Gespreksgeschiedenis van Fin — het gedeelde contract (ADR 0137, melding W-004).
 *
 * Dit bestand is de ENIGE plek waar de records en de opslaginterface wonen. De
 * serverrug (`server-store.ts` + de routes onder `app/api/chat/`) en de
 * apparaatrug (`device-store.ts`, IndexedDB) dragen exact deze vorm; de UI kent
 * alleen `ChatHistoryStore` en weet niet welke rug eronder zit.
 *
 * BEWUST ZONDER LOGICA EN ZONDER SUPABASE-IMPORTS. Zodra hier een import uit
 * `@/lib/supabase` binnenkomt, trekt elk clientcomponent dat deze types
 * gebruikt de serverclient de browserbundel in.
 *
 * DE VELDNAMEN ZIJN camelCase, óók in de JSON van de API-routes. De routes
 * mappen zelf van de snake_case DB-kolommen; de frontend leest nergens
 * `last_message_at`. Twee schrijfwijzen naast elkaar is precies de drift die
 * dit bestand moet uitsluiten.
 */

/** Waar de gebruiker zijn gesprekken wil bewaren. Staat op `profiles.chat_history_mode`. */
export type ChatHistoryMode = 'account' | 'apparaat' | 'uit'

/**
 * Waar het gesprek gevóerd is. `lokaal` = via `LocalChatTransport`, on-device.
 *
 * Dit is geen smaakje maar een privacyvloer: een lokaal gevoerd gesprek gaat
 * NOOIT naar de server, ook niet wanneer de gebruiker 'account' koos. Dubbel
 * afgedwongen — in `resolveBackend()` én met een CHECK-constraint op de tabel,
 * zodat een fout in de clientlaag het niet alsnog kan omzeilen.
 */
export type ChatOrigin = 'cloud' | 'lokaal'

/** Welke rug een gesprek daadwerkelijk draagt. `geen` = niet bewaren. */
export type ChatHistoryBackend = 'server' | 'apparaat' | 'geen'

/**
 * Wat er in een bewaard bericht STOND, zonder het te bewaren.
 *
 * We slaan alleen tekst op (zie `StoredChatMessage.content`). Een visualisatie
 * of actievoorstel bevroor anders cijfers die de app elders canoniek berekent —
 * exact de drift die "consume, don't recompute" uitbant. In plaats daarvan
 * onthouden we dát er iets stond, en rendert het hervatte gesprek daar een
 * neutrale regel.
 */
export type ChatRichKind = 'visualisatie' | 'actievoorstel' | 'aanbeveling' | 'afgekapt'

export interface ChatConversationMeta {
  id: string
  title: string
  origin: ChatOrigin
  /**
   * Waar dit gesprek WOONT. Afgeleid bij het aanmaken uit
   * `resolveBackend(mode, origin)`, daarna vast — een later gewijzigde
   * instelling verplaatst bestaande gesprekken niet. Op de server niet
   * opgeslagen: daar is de waarde per definitie `'server'`.
   */
  backend: Exclude<ChatHistoryBackend, 'geen'>
  messageCount: number
  /**
   * De eerstvolgende vrije `seq` in dit gesprek — `max(seq) + 1`, door de RUG
   * bepaald en nooit door de client opgeteld.
   *
   * WAAROM DIT VELD BESTAAT. De client hield de teller zelf bij en hoogde 'm
   * alleen op in het succespad, terwijl de server-RPC `ON CONFLICT
   * (conversation_id, seq) DO NOTHING` doet. Brak de fetch af ná een geslaagde
   * schrijfactie (timeout), dan bleef de clientteller staan, postte de volgende
   * beurt dezelfde `seq` en werd die STIL weggegooid. De rug weet als enige wat
   * er echt staat, dus de rug levert de teller.
   *
   * BEWUST NIET `messageCount`: die is gecapt op de bewaargrens (200) terwijl
   * `seq` gewoon doorloopt. Bij een gesnoeid gesprek zijn ze niet gelijk.
   */
  nextSeq: number
  /** Waar: het gesprek liep tegen de bewaargrens en de oudste beurten zijn gesnoeid. */
  truncated: boolean
  /** ISO 8601. */
  createdAt: string
  /** ISO 8601. Sorteersleutel van de gesprekkenlijst (aflopend). */
  lastMessageAt: string
}

export interface StoredChatMessage {
  /** 0-based, oplopend binnen het gesprek. Draagt de idempotentie van het appenden. */
  seq: number
  role: 'user' | 'assistant'
  /** Samengevoegde tekst-parts, max 32.000 tekens. */
  content: string
  richKinds: ChatRichKind[]
  /** ISO 8601. */
  createdAt: string
}

/**
 * De interface waarachter beide ruggen zitten.
 *
 * `facade.ts` voegt server en apparaat samen tot één lijst en routeert per
 * gesprek op `meta.backend`; de paneelcode roept uitsluitend deze methodes aan.
 */
export interface ChatHistoryStore {
  list(opts?: { limit?: number; before?: string }): Promise<ChatConversationMeta[]>
  load(conversationId: string): Promise<StoredChatMessage[]>
  create(init: { title: string; origin: ChatOrigin }): Promise<ChatConversationMeta>
  /** Voegt één beurt toe (vraag + antwoord). Idempotent op `seq`. */
  appendTurn(conversationId: string, messages: StoredChatMessage[]): Promise<ChatConversationMeta>
  rename(conversationId: string, title: string): Promise<void>
  remove(conversationId: string): Promise<void>
  removeAll(): Promise<void>
}
