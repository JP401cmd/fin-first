import { createDeviceChatHistoryStore, type DeviceChatHistoryStore } from './device-store'
import { resolveBackend } from './resolve'
import type {
  ChatConversationMeta,
  ChatHistoryMode,
  ChatHistoryStore,
  ChatOrigin,
  StoredChatMessage,
} from './types'

/**
 * Eén gezicht op twee ruggen (W-004, B3).
 *
 * De paneelcode weet niet — en hoort niet te weten — of een gesprek op de
 * server of op dit toestel staat. Hij vraagt de lijst op en krijgt beide door
 * elkaar, op recentheid gesorteerd; hij opent een gesprek en de facade kiest de
 * rug op `meta.backend`. Dat is precies waarom "wisselen van opslagkeuze"
 * niets hoeft te verplaatsen (§2.4): er raakt niets uit zicht, dus er hoeft
 * niets te migreren.
 *
 * DE KEUZE VOOR EEN NIEUW GESPREK VALT ÉÉN KEER, hier, via `resolveBackend`.
 * Daarna ligt hij vast op de conversatie zelf. Een later gewijzigde instelling
 * verhuist dus geen bestaand gesprek — die zou anders halverwege van rug
 * kunnen wisselen en de helft van zijn beurten achterlaten.
 *
 * DE SERVERRUG WORDT LUI GELADEN. `server-store.ts` is fetch-only en klein,
 * maar hem statisch importeren zou hem in de chat-chunk trekken voor iedereen
 * die op 'apparaat' of 'uit' staat en er nooit iets mee doet.
 */

/** Waar een bestaand gesprek woont — genoeg om 'm te bedienen. */
export interface ChatHistoryDoel {
  id: string
  backend: 'server' | 'apparaat'
}

export interface ChatHistoryFacade {
  /** Beide ruggen door elkaar, aflopend op `lastMessageAt`. */
  list(opts?: { limit?: number }): Promise<ChatConversationMeta[]>
  /**
   * De beurten van één gesprek. WERPT bij een mislukte lezing — bewust, want de
   * aanroeper moet "dit gesprek is leeg" kunnen onderscheiden van "ik weet niet
   * wat erin staat". Ving deze methode de fout zelf af met `[]`, dan hervatte
   * het paneel een gesprek van twaalf beurten als leeg gesprek en schreef het de
   * volgende beurt op seq 0 — bovenop wat er al stond, en de RPC gooit dat stil
   * weg (`ON CONFLICT … DO NOTHING`).
   */
  load(doel: ChatHistoryDoel): Promise<StoredChatMessage[]>
  /**
   * Maakt het gesprek aan in de rug die bij (modus, origin) hoort. Geeft `null`
   * bij modus `uit` — dan is er niets om aan te maken en hoort de aanroeper
   * gewoon door te praten zonder te bewaren.
   */
  create(init: { title: string; origin: ChatOrigin }): Promise<ChatConversationMeta | null>
  appendTurn(doel: ChatHistoryDoel, messages: StoredChatMessage[]): Promise<ChatConversationMeta | null>
  rename(doel: ChatHistoryDoel, title: string): Promise<void>
  remove(doel: ChatHistoryDoel): Promise<void>
  /** Wist de gesprekken op DIT toestel. De serverkant loopt via de instellingsroute. */
  removeAllDevice(): Promise<void>
  /**
   * Hoeveel gesprekken staan er op DIT toestel? Voedt de wis-knop op
   * /mijn/privacy: die telde alleen de servergesprekken en bood daardoor bij
   * "0 gesprekken op je account" tóch "Verwijder ze nu" aan iemand met twintig
   * gesprekken in IndexedDB.
   */
  deviceAantal(): Promise<number>
  /** Kan dit toestel überhaupt bewaren? `false` ⇒ de lijst toont daar één regel over. */
  deviceBeschikbaar(): Promise<boolean>
  /** Waar zou een nieuw gesprek met deze origin landen? */
  backendVoorNieuwGesprek(origin: ChatOrigin): 'server' | 'apparaat' | 'geen'
}

export function createChatHistoryFacade(opts: {
  userId: string
  mode: ChatHistoryMode
}): ChatHistoryFacade {
  let device: DeviceChatHistoryStore | null = null
  let serverPromise: Promise<ChatHistoryStore | null> | null = null

  function apparaat(): DeviceChatHistoryStore {
    if (!device) device = createDeviceChatHistoryStore(opts.userId)
    return device
  }

  async function server(): Promise<ChatHistoryStore | null> {
    if (!serverPromise) {
      serverPromise = import('./server-store')
        .then((mod) => mod.serverChatHistoryStore)
        .catch(() => null)
    }
    return serverPromise
  }

  async function rug(backend: 'server' | 'apparaat'): Promise<ChatHistoryStore | null> {
    return backend === 'apparaat' ? apparaat() : server()
  }

  return {
    backendVoorNieuwGesprek(origin) {
      return resolveBackend(opts.mode, origin)
    },

    async list(listOpts) {
      const limit = listOpts?.limit ?? 50
      // Beide ruggen worden ALTIJD gelezen, ook bij modus 'uit'. Een instelling
      // is geen destructieve handeling: wat er staat blijft leesbaar (§2.4).
      const [vanServer, vanApparaat] = await Promise.all([
        server()
          .then((s) => (s ? s.list({ limit }) : []))
          .catch(() => [] as ChatConversationMeta[]),
        apparaat()
          .list({ limit })
          .catch(() => [] as ChatConversationMeta[]),
      ])
      return [...vanServer, ...vanApparaat]
        .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : a.lastMessageAt > b.lastMessageAt ? -1 : 0))
        .slice(0, limit)
    },

    async load(doel) {
      const store = await rug(doel.backend)
      // Geen rug = geen antwoord. Ook dit is een mislukte lezing en geen leeg
      // gesprek — zie de toelichting bij `load` in de interface hierboven.
      if (!store) throw new Error('Je gesprekken zijn nu niet beschikbaar.')
      return store.load(doel.id)
    },

    async create(init) {
      const backend = resolveBackend(opts.mode, init.origin)
      if (backend === 'geen') return null
      const store = await rug(backend)
      if (!store) return null
      const meta = await store.create(init)
      // De serverrug kent zijn eigen `backend` niet (daar is hij per definitie
      // 'server'); we zetten 'm hier zodat de lijst en de routering één veld
      // kunnen lezen in plaats van te raden waar iets vandaan kwam.
      return { ...meta, backend }
    },

    async appendTurn(doel, messages) {
      const store = await rug(doel.backend)
      if (!store) return null
      const meta = await store.appendTurn(doel.id, messages)
      return { ...meta, backend: doel.backend }
    },

    async rename(doel, title) {
      const store = await rug(doel.backend)
      if (!store) return
      await store.rename(doel.id, title)
    },

    async remove(doel) {
      const store = await rug(doel.backend)
      if (!store) return
      await store.remove(doel.id)
    },

    async removeAllDevice() {
      await apparaat().removeAll()
    },

    async deviceAantal() {
      try {
        return (await apparaat().list({ limit: 500 })).length
      } catch {
        return 0
      }
    },

    async deviceBeschikbaar() {
      return apparaat().beschikbaar()
    },
  }
}
