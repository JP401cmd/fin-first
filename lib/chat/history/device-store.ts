import { CHAT_DEVICE_DB_NAAM } from './device-db-naam'
import type {
  ChatConversationMeta,
  ChatHistoryStore,
  ChatOrigin,
  StoredChatMessage,
} from './types'

/**
 * De apparaatrug van de gespreksgeschiedenis (W-004, §3.3) — IndexedDB.
 *
 * WAAROM INDEXEDDB EN NIET localStorage. localStorage is synchroon, deelt een
 * quotum van ~5 MB met de pin-stand, de Wft-vlag en al het andere, en faalt bij
 * overschrijding op de héle schrijfactie — je verliest dan óók de bestaande
 * sleutels. Een handvol gesprekken loopt daar doorheen. IndexedDB is
 * asynchroon, heeft een quotum in een andere orde en faalt per transactie.
 *
 * DE BELANGRIJKSTE REGEL VAN DEZE RUG IS DE GEBRUIKERSSCOPING. Er is hier geen
 * RLS die het voor je doet: dit is één database per browser, en op een gedeeld
 * toestel logt gebruiker B in waar gebruiker A net stond. Elke record draagt
 * daarom een `userId`, elke lezing filtert erop, en bij de eerste opening wissen
 * we alles wat van iemand anders is. Dat laatste is bewust destructief: een
 * transcript van een vórige gebruiker op dít toestel laten staan is de ergere
 * uitkomst.
 *
 * FALEN IS ZICHTBAAR, NOOIT STIL. Privémodus, quotum vol, opslag geblokkeerd
 * door beleid: dan degradeert de rug naar een no-op en meldt `beschikbaar()`
 * false, zodat de gesprekkenlijst één regel kan tonen ("Op dit apparaat kan
 * niets bewaard worden") in plaats van te doen alsof er bewaard is.
 *
 * DE SCHRIJFPADEN GOOIEN, DE LEESPADEN DEGRADEREN. `create()` en `appendTurn()`
 * werpen zodra er niets te bewaren valt (geen database, of een gesprek dat hier
 * niet bestaat) — een verzonnen meta teruggeven maakte van "er wordt niets
 * bewaard" een onzichtbare toestand, precies het stille falen dat de alinea
 * hierboven uitsluit. De aanroeper (`chat-panel`) vangt dat af met één
 * console-melding en laat het gesprek gewoon doorlopen. Lezen (`list`, `load`)
 * blijft leeg teruggeven: daar is "niets" een geldig antwoord.
 */

const DB_NAAM = CHAT_DEVICE_DB_NAAM
const DB_VERSIE = 1
const STORE_GESPREKKEN = 'conversations'
const STORE_BERICHTEN = 'messages'

/** Bovengrens per gesprek — spiegel van de servercap (§3.4). */
const MAX_BERICHTEN = 200

interface DeviceConversationRecord extends ChatConversationMeta {
  userId: string
}

interface DeviceMessageRecord extends StoredChatMessage {
  conversationId: string
  userId: string
}

export interface DeviceChatHistoryStore extends ChatHistoryStore {
  /**
   * Kan er op dit toestel überhaupt iets bewaard worden? `false` na een
   * mislukte `open()` (privémodus, quotum, beleid). De lijst toont dat als één
   * regel; er wordt nooit stil gefaald.
   */
  beschikbaar(): Promise<boolean>
}

/* ── IndexedDB-promise-hulpjes ─────────────────────────────────────────────
   Rauw IndexedDB in één bestand: er staat vandaag géén ander IndexedDB-gebruik
   in de repo, dus er is geen wrapper om te spiegelen — en een dependency
   erbijhalen voor twee object-stores is niet in verhouding. */

function verzoek<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB-verzoek mislukt'))
  })
}

function transactieKlaar(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB-transactie mislukt'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB-transactie afgebroken'))
  })
}

/**
 * De titel-op-woordgrens (B5) woont sinds de reparatieronde in
 * `lib/chat/history-copy.ts`. Reden: het chatpaneel gebruikte 'm en trok
 * daarmee deze IndexedDB-module het chat-chunk in, terwijl het paneel de
 * apparaatrug alleen via de lui geladen facade hoort te raken.
 */

export function createDeviceChatHistoryStore(userId: string): DeviceChatHistoryStore {
  let dbPromise: Promise<IDBDatabase | null> | null = null

  async function open(): Promise<IDBDatabase | null> {
    if (!dbPromise) {
      dbPromise = (async () => {
        if (typeof indexedDB === 'undefined' || indexedDB === null) return null
        try {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open(DB_NAAM, DB_VERSIE)
            req.onupgradeneeded = () => {
              const d = req.result
              if (!d.objectStoreNames.contains(STORE_GESPREKKEN)) {
                const s = d.createObjectStore(STORE_GESPREKKEN, { keyPath: 'id' })
                s.createIndex('byLastMessageAt', 'lastMessageAt')
              }
              if (!d.objectStoreNames.contains(STORE_BERICHTEN)) {
                const s = d.createObjectStore(STORE_BERICHTEN, {
                  keyPath: ['conversationId', 'seq'],
                })
                s.createIndex('byConversation', 'conversationId')
              }
            }
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => reject(req.error ?? new Error('IndexedDB kon niet openen'))
            req.onblocked = () => reject(new Error('IndexedDB geblokkeerd door een ander tabblad'))
          })
          await wisVreemdeGebruikers(db)
          return db
        } catch {
          return null
        }
      })()
    }
    return dbPromise
  }

  /**
   * Alles van een ándere gebruiker weg. Draait één keer per store-instantie,
   * direct na het openen — vóór de eerste lezing, zodat er geen venster bestaat
   * waarin een lijst nog vreemde gesprekken kan tonen.
   */
  async function wisVreemdeGebruikers(db: IDBDatabase): Promise<void> {
    try {
      const tx = db.transaction([STORE_GESPREKKEN, STORE_BERICHTEN], 'readwrite')
      const gesprekken = tx.objectStore(STORE_GESPREKKEN)
      const berichten = tx.objectStore(STORE_BERICHTEN)
      const alle = (await verzoek(
        gesprekken.getAll() as IDBRequest<DeviceConversationRecord[]>,
      )) as DeviceConversationRecord[]
      for (const rij of alle) {
        if (rij.userId !== userId) gesprekken.delete(rij.id)
      }
      const alleBerichten = (await verzoek(
        berichten.getAll() as IDBRequest<DeviceMessageRecord[]>,
      )) as DeviceMessageRecord[]
      for (const rij of alleBerichten) {
        if (rij.userId !== userId) berichten.delete([rij.conversationId, rij.seq])
      }
      await transactieKlaar(tx)
    } catch {
      /* Lukt het wissen niet, dan lukt lezen straks ook niet — de degradatie
         hieronder vangt dat af. Nooit hard falen op mount. */
    }
  }

  async function alleGesprekken(db: IDBDatabase): Promise<DeviceConversationRecord[]> {
    const tx = db.transaction(STORE_GESPREKKEN, 'readonly')
    const rijen = (await verzoek(
      tx.objectStore(STORE_GESPREKKEN).getAll() as IDBRequest<DeviceConversationRecord[]>,
    )) as DeviceConversationRecord[]
    return rijen.filter((r) => r.userId === userId)
  }

  async function gesprekVan(db: IDBDatabase, id: string): Promise<DeviceConversationRecord | null> {
    const tx = db.transaction(STORE_GESPREKKEN, 'readonly')
    const rij = (await verzoek(
      tx.objectStore(STORE_GESPREKKEN).get(id) as IDBRequest<DeviceConversationRecord | undefined>,
    )) as DeviceConversationRecord | undefined
    // De userId-check is hier geen dubbeling van `wisVreemdeGebruikers` maar de
    // vangrail eronder: een record dat tussentijds door een ander tabblad is
    // geschreven mag nooit alsnog gelezen worden.
    return rij && rij.userId === userId ? rij : null
  }

  function zonderUserId(rij: DeviceConversationRecord): ChatConversationMeta {
    const { userId: _weg, ...meta } = rij
    void _weg
    // `nextSeq` kwam er later bij; een rij die nog van vóór dat veld is zou als
    // `undefined` terugkomen en de volgende beurt op seq 0 laten schrijven —
    // bovenop wat er al staat. `messageCount` is dan de dichtstbijzijnde
    // ondergrens die zeker geen bestaande beurt overschrijft.
    return typeof meta.nextSeq === 'number' ? meta : { ...meta, nextSeq: meta.messageCount }
  }

  return {
    async beschikbaar() {
      return (await open()) !== null
    },

    async list(opts) {
      const db = await open()
      if (!db) return []
      try {
        const rijen = await alleGesprekken(db)
        const gesorteerd = rijen
          .filter((r) => (opts?.before ? r.lastMessageAt < opts.before : true))
          .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1))
        return gesorteerd.slice(0, opts?.limit ?? 50).map(zonderUserId)
      } catch {
        return []
      }
    },

    async load(conversationId) {
      const db = await open()
      if (!db) return []
      try {
        const gesprek = await gesprekVan(db, conversationId)
        if (!gesprek) return []
        const tx = db.transaction(STORE_BERICHTEN, 'readonly')
        const rijen = (await verzoek(
          tx
            .objectStore(STORE_BERICHTEN)
            .index('byConversation')
            .getAll(conversationId) as IDBRequest<DeviceMessageRecord[]>,
        )) as DeviceMessageRecord[]
        return rijen
          .filter((r) => r.userId === userId)
          .sort((a, b) => a.seq - b.seq)
          .map(({ conversationId: _c, userId: _u, ...bericht }) => {
            void _c
            void _u
            return bericht
          })
      } catch {
        return []
      }
    },

    async create(init: { title: string; origin: ChatOrigin }) {
      const nu = new Date().toISOString()
      const meta: ChatConversationMeta = {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `lokaal-${nu}-${Math.round(Math.random() * 1e9)}`,
        title: init.title.slice(0, 120) || 'Nieuw gesprek',
        origin: init.origin,
        backend: 'apparaat',
        messageCount: 0,
        nextSeq: 0,
        truncated: false,
        createdAt: nu,
        lastMessageAt: nu,
      }
      const db = await open()
      // ZICHTBAAR FALEN. Hier een meta teruggeven zonder database betekende: elke
      // volgende `appendTurn` levert stil een verzonnen terugval, het gesprek
      // lijkt bewaard en is het niet. Wie hier niet kan schrijven, hoort dat te
      // merken.
      if (!db) throw new Error('Op dit apparaat kan geen gesprek bewaard worden.')
      const tx = db.transaction(STORE_GESPREKKEN, 'readwrite')
      tx.objectStore(STORE_GESPREKKEN).put({ ...meta, userId } satisfies DeviceConversationRecord)
      await transactieKlaar(tx)
      return meta
    },

    async appendTurn(conversationId, messages) {
      const db = await open()
      const nu = new Date().toISOString()
      if (!db) throw new Error('Op dit apparaat kan geen gesprek bewaard worden.')
      const bestaand = await gesprekVan(db, conversationId)
      // Idem: een gesprek dat hier niet (meer) staat — verwijderd in een ander
      // tabblad, of nooit aangemaakt — mag geen verzonnen meta opleveren.
      if (!bestaand) throw new Error('Dit gesprek staat niet op dit apparaat.')
      const tx = db.transaction([STORE_GESPREKKEN, STORE_BERICHTEN], 'readwrite')
      const berichten = tx.objectStore(STORE_BERICHTEN)
      for (const bericht of messages) {
        berichten.put({ ...bericht, conversationId, userId } satisfies DeviceMessageRecord)
      }
      // Snoeien boven de cap: de OUDSTE beurten vallen weg, net als de
      // server-RPC doet. Dat is de enige plek waar deze rug data weggooit, en
      // het gesprek draagt het daarna zichtbaar als `truncated`.
      const alle = (await verzoek(
        berichten.index('byConversation').getAll(conversationId) as IDBRequest<
          DeviceMessageRecord[]
        >,
      )) as DeviceMessageRecord[]
      const gesorteerd = alle.filter((r) => r.userId === userId).sort((a, b) => a.seq - b.seq)
      let afgekapt = bestaand.truncated
      if (gesorteerd.length > MAX_BERICHTEN) {
        for (const oud of gesorteerd.slice(0, gesorteerd.length - MAX_BERICHTEN)) {
          berichten.delete([oud.conversationId, oud.seq])
        }
        afgekapt = true
      }
      const bijgewerkt: DeviceConversationRecord = {
        ...bestaand,
        messageCount: Math.min(gesorteerd.length, MAX_BERICHTEN),
        // `max(seq) + 1` over álle beurten, vóór het snoeien gemeten — snoeien
        // haalt de OUDSTE weg, dus het maximum verandert er niet door. Bewust
        // niet `messageCount + 1`: die is gecapt, `seq` loopt door.
        nextSeq:
          gesorteerd.length > 0 ? gesorteerd[gesorteerd.length - 1].seq + 1 : bestaand.nextSeq,
        truncated: afgekapt,
        lastMessageAt: nu,
      }
      tx.objectStore(STORE_GESPREKKEN).put(bijgewerkt)
      await transactieKlaar(tx)
      return zonderUserId(bijgewerkt)
    },

    async rename(conversationId, title) {
      const db = await open()
      if (!db) return
      try {
        const bestaand = await gesprekVan(db, conversationId)
        if (!bestaand) return
        const tx = db.transaction(STORE_GESPREKKEN, 'readwrite')
        tx.objectStore(STORE_GESPREKKEN).put({ ...bestaand, title: title.slice(0, 120) })
        await transactieKlaar(tx)
      } catch {
        /* stil: hernoemen is cosmetisch, een fout mag het paneel niet breken */
      }
    },

    async remove(conversationId) {
      const db = await open()
      if (!db) return
      try {
        const bestaand = await gesprekVan(db, conversationId)
        if (!bestaand) return
        const tx = db.transaction([STORE_GESPREKKEN, STORE_BERICHTEN], 'readwrite')
        const berichten = tx.objectStore(STORE_BERICHTEN)
        const rijen = (await verzoek(
          berichten.index('byConversation').getAll(conversationId) as IDBRequest<
            DeviceMessageRecord[]
          >,
        )) as DeviceMessageRecord[]
        for (const rij of rijen) berichten.delete([rij.conversationId, rij.seq])
        tx.objectStore(STORE_GESPREKKEN).delete(conversationId)
        await transactieKlaar(tx)
      } catch {
        /* stil */
      }
    },

    async removeAll() {
      const db = await open()
      if (!db) return
      try {
        const eigen = await alleGesprekken(db)
        const eigenIds = new Set(eigen.map((g) => g.id))
        const tx = db.transaction([STORE_GESPREKKEN, STORE_BERICHTEN], 'readwrite')
        const berichten = tx.objectStore(STORE_BERICHTEN)
        const alle = (await verzoek(
          berichten.getAll() as IDBRequest<DeviceMessageRecord[]>,
        )) as DeviceMessageRecord[]
        for (const rij of alle) {
          if (rij.userId === userId || eigenIds.has(rij.conversationId)) {
            berichten.delete([rij.conversationId, rij.seq])
          }
        }
        const gesprekken = tx.objectStore(STORE_GESPREKKEN)
        for (const id of eigenIds) gesprekken.delete(id)
        await transactieKlaar(tx)
      } catch {
        /* stil */
      }
    },
  }
}
