import type {
  ChatConversationMeta,
  ChatHistoryMode,
  ChatHistoryStore,
  StoredChatMessage,
} from './types'

/**
 * De SERVERRUG achter `ChatHistoryStore` (melding W-004, ADR 0137).
 *
 * Praat uitsluitend met de routes onder `app/api/chat/` — géén supabase-client.
 * Dat is geen stijlkeuze maar de datapad-conventie (ADR 0058): muteren gaat via
 * een API-route, en deze store draait in de browser, binnen het lui geladen
 * chatpaneel. Een supabase-import hier zou bovendien de serverclient de
 * browserbundel in trekken en R7 (de lazy mount) breken.
 *
 * Alle foutpaden gooien een `Error` met de `data.error`-string uit de platte
 * envelope (ADR 0044). De aanroeper (`facade.ts`) mag daarop rekenen: er komt
 * nooit een `{ ok: false }`-object uit deze methodes, altijd een waarde of een
 * exception.
 */

const BASE = '/api/chat'

interface HistorySettingsResponse {
  mode: ChatHistoryMode
  serverConversationCount: number
}

/**
 * Eén doorgang voor élke call. Leest de envelope, gooit bij een niet-ok
 * antwoord de tekst die de route zelf al client-veilig maakte, en valt terug op
 * één generieke zin als het antwoord helemaal geen JSON was (proxy-fout,
 * offline, HTML-foutpagina).
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers:
      init?.body === undefined
        ? init?.headers
        : { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : 'Er ging iets mis bij je gesprekken. Probeer het later opnieuw.'
    throw new Error(message)
  }

  return payload as T
}

/**
 * De serverrug. Bewust een object en geen class: er is geen state — de
 * identiteit van de gebruiker zit in de sessiecookie, niet in deze module.
 */
export const serverChatHistoryStore: ChatHistoryStore = {
  async list(opts) {
    const params = new URLSearchParams()
    if (opts?.limit !== undefined) params.set('limit', String(opts.limit))
    if (opts?.before !== undefined) params.set('before', opts.before)
    const query = params.toString()

    const data = await request<{ conversations: ChatConversationMeta[] }>(
      `/conversations${query ? `?${query}` : ''}`,
    )
    return data.conversations ?? []
  },

  async load(conversationId) {
    const data = await request<{
      conversation: ChatConversationMeta
      messages: StoredChatMessage[]
    }>(`/conversations/${encodeURIComponent(conversationId)}`)
    return data.messages ?? []
  },

  async create(init) {
    // DE PRIVACYVLOER, derde plek. `resolveBackend()` stuurt een lokaal gesprek
    // nooit hierheen en de CHECK-constraint zou hem alsnog weigeren — maar een
    // stille 400 uit de route is een slechter signaal dan een expliciete fout
    // hier, en dit is de laatste plek waar de reden nog leesbaar is.
    if (init.origin !== 'cloud') {
      throw new Error('Een gesprek met de lokale AI wordt nooit op je account bewaard.')
    }

    const data = await request<{ conversation: ChatConversationMeta }>('/conversations', {
      method: 'POST',
      body: JSON.stringify({ title: init.title, origin: 'cloud' }),
    })
    return data.conversation
  },

  async appendTurn(conversationId, messages) {
    const data = await request<{ conversation: ChatConversationMeta }>(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      { method: 'POST', body: JSON.stringify({ messages }) },
    )
    return data.conversation
  },

  async rename(conversationId, title) {
    await request<{ conversation: ChatConversationMeta }>(
      `/conversations/${encodeURIComponent(conversationId)}`,
      { method: 'PATCH', body: JSON.stringify({ title }) },
    )
  },

  async remove(conversationId) {
    await request<{ ok: true }>(`/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'DELETE',
    })
  },

  /**
   * "Verwijder mijn gesprekken" op /mijn/privacy.
   *
   * Loopt bewust via `PUT /api/chat/history-settings` met `deleteExisting` en
   * niet via een eigen bulk-delete-route: het wissen is dáár al de gekoppelde
   * handeling van de opslagkeuze, en een tweede ingang naar dezelfde
   * destructieve actie is er één te veel. De huidige modus wordt eerst gelezen
   * en ongewijzigd teruggeschreven — deze methode wist gesprekken, ze verandert
   * geen instelling.
   */
  async removeAll() {
    const settings = await request<HistorySettingsResponse>('/history-settings')
    await request<{ mode: ChatHistoryMode; deleted: number }>('/history-settings', {
      method: 'PUT',
      body: JSON.stringify({ mode: settings.mode, deleteExisting: true }),
    })
  },
}
