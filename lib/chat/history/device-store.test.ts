import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDeviceChatHistoryStore } from './device-store'
import { chatTitelUitVraag } from '@/lib/chat/history-copy'
import type { StoredChatMessage } from './types'

/* ── Minimale IndexedDB-dubbel ──────────────────────────────────────────────
   Deze repo heeft geen `fake-indexeddb`-dependency en er is geen reden er één
   voor twee object-stores bij te halen. Dit is een bewust kleine dubbel: alleen
   wat `device-store.ts` daadwerkelijk aanroept (open/upgrade, transaction,
   get/getAll/put/delete, één index-getAll). De transactie sluit op een
   macrotask af, zodat `await`-ketens binnen dezelfde transactie hun handlers
   nog kunnen registreren — precies de volgorde die een echte browser aanhoudt.
   ------------------------------------------------------------------------- */

type Rij = Record<string, unknown>

function sleutelVan(keyPath: string | string[], rij: Rij): string {
  const delen = Array.isArray(keyPath) ? keyPath : [keyPath]
  return JSON.stringify(delen.map((p) => rij[p]))
}

class FakeIndex {
  constructor(
    private readonly store: FakeStore,
    private readonly veld: string,
  ) {}
  getAll(query?: unknown) {
    return this.store.__verzoek(() =>
      [...this.store.__data.values()].filter((r) => query === undefined || r[this.veld] === query),
    )
  }
}

class FakeStore {
  readonly __data: Map<string, Rij>
  readonly indexen = new Map<string, string>()
  constructor(
    readonly naam: string,
    readonly keyPath: string | string[],
    data: Map<string, Rij>,
    private readonly tx: FakeTx | null,
  ) {
    this.__data = data
  }
  createIndex(naam: string, veld: string) {
    this.indexen.set(naam, veld)
  }
  index(naam: string) {
    return new FakeIndex(this, this.indexen.get(naam) ?? naam)
  }
  __verzoek<T>(fn: () => T) {
    const req: { result?: T; error: unknown; onsuccess: null | (() => void); onerror: null | (() => void) } = {
      error: null,
      onsuccess: null,
      onerror: null,
    }
    this.tx?.__begin()
    queueMicrotask(() => {
      try {
        req.result = fn()
        req.onsuccess?.()
      } catch (e) {
        req.error = e
        req.onerror?.()
      }
      this.tx?.__eind()
    })
    return req
  }
  getAll(query?: unknown) {
    return this.__verzoek(() =>
      [...this.__data.values()].filter((r) => query === undefined || sleutelVan(this.keyPath, r) === JSON.stringify([query])),
    )
  }
  get(key: unknown) {
    return this.__verzoek(() => this.__data.get(JSON.stringify(Array.isArray(key) ? key : [key])))
  }
  put(rij: Rij) {
    return this.__verzoek(() => {
      this.__data.set(sleutelVan(this.keyPath, rij), { ...rij })
      return undefined
    })
  }
  delete(key: unknown) {
    return this.__verzoek(() => {
      this.__data.delete(JSON.stringify(Array.isArray(key) ? key : [key]))
      return undefined
    })
  }
}

class FakeTx {
  oncomplete: null | (() => void) = null
  onerror: null | (() => void) = null
  onabort: null | (() => void) = null
  error: unknown = null
  private open = 0
  private klaar = false
  constructor(private readonly db: FakeDb) {}
  objectStore(naam: string) {
    return this.db.__store(naam, this)
  }
  __begin() {
    this.open++
  }
  __eind() {
    this.open--
    setTimeout(() => {
      if (this.open === 0 && !this.klaar) {
        this.klaar = true
        this.oncomplete?.()
      }
    }, 0)
  }
}

class FakeDb {
  readonly objectStoreNames = {
    contains: (n: string) => this.stores.has(n),
  }
  private readonly stores = new Map<string, { keyPath: string | string[]; data: Map<string, Rij>; indexen: Map<string, string> }>()
  createObjectStore(naam: string, opts: { keyPath: string | string[] }) {
    this.stores.set(naam, { keyPath: opts.keyPath, data: new Map(), indexen: new Map() })
    return this.__store(naam, null)
  }
  __store(naam: string, tx: FakeTx | null) {
    const s = this.stores.get(naam)!
    const store = new FakeStore(naam, s.keyPath, s.data, tx)
    for (const [n, v] of s.indexen) store.indexen.set(n, v)
    // createIndex tijdens upgrade schrijft door naar de gedeelde definitie
    const origineel = store.createIndex.bind(store)
    store.createIndex = (n: string, veld: string) => {
      origineel(n, veld)
      s.indexen.set(n, veld)
    }
    return store
  }
  transaction(_namen: string | string[], _mode?: string) {
    void _namen
    void _mode
    return new FakeTx(this)
  }
  close() {}
}

let database: FakeDb | null = null

function installeerFakeIndexedDb(opties: { faalt?: boolean } = {}) {
  const fake = {
    open() {
      const req: {
        result?: FakeDb
        error: unknown
        onsuccess: null | (() => void)
        onerror: null | (() => void)
        onupgradeneeded: null | (() => void)
        onblocked: null | (() => void)
      } = { error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null }
      queueMicrotask(() => {
        if (opties.faalt) {
          req.error = new Error('opslag geblokkeerd')
          req.onerror?.()
          return
        }
        const vers = database === null
        if (vers) database = new FakeDb()
        req.result = database!
        if (vers) req.onupgradeneeded?.()
        req.onsuccess?.()
      })
      return req
    },
  }
  Object.defineProperty(globalThis, 'indexedDB', { value: fake, configurable: true, writable: true })
}

function verwijderIndexedDb() {
  Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true })
}

function beurt(seq: number, vraag: string, antwoord: string): StoredChatMessage[] {
  const nu = new Date().toISOString()
  return [
    { seq, role: 'user', content: vraag, richKinds: [], createdAt: nu },
    { seq: seq + 1, role: 'assistant', content: antwoord, richKinds: [], createdAt: nu },
  ]
}

beforeEach(() => {
  database = null
  installeerFakeIndexedDb()
})

afterEach(() => {
  database = null
})

describe('device-store — bewaren en teruglezen', () => {
  it('bewaart een gesprek met zijn beurten en leest ze in volgorde terug', async () => {
    const store = createDeviceChatHistoryStore('gebruiker-a')
    const meta = await store.create({ title: 'Hoeveel vrijheid heb ik?', origin: 'lokaal' })
    await store.appendTurn(meta.id, beurt(0, 'Hoeveel vrijheid heb ik?', 'Ruim acht jaar.'))
    await store.appendTurn(meta.id, beurt(2, 'En volgend jaar?', 'Dan negen jaar.'))

    const berichten = await store.load(meta.id)
    expect(berichten.map((b) => b.seq)).toEqual([0, 1, 2, 3])
    expect(berichten[0].content).toBe('Hoeveel vrijheid heb ik?')
    expect(berichten[3].content).toBe('Dan negen jaar.')

    const lijst = await store.list()
    expect(lijst).toHaveLength(1)
    expect(lijst[0].messageCount).toBe(4)
    expect(lijst[0].backend).toBe('apparaat')
    expect(lijst[0].origin).toBe('lokaal')
  })

  it('sorteert de lijst aflopend op lastMessageAt', async () => {
    const store = createDeviceChatHistoryStore('gebruiker-a')
    const eerste = await store.create({ title: 'Eerste', origin: 'cloud' })
    await store.appendTurn(eerste.id, beurt(0, 'a', 'b'))
    const tweede = await store.create({ title: 'Tweede', origin: 'cloud' })
    await new Promise((r) => setTimeout(r, 2))
    await store.appendTurn(tweede.id, beurt(0, 'c', 'd'))

    const lijst = await store.list()
    expect(lijst.map((g) => g.title)).toEqual(['Tweede', 'Eerste'])
  })

  it('hernoemt en verwijdert per gesprek, zonder het andere te raken', async () => {
    const store = createDeviceChatHistoryStore('gebruiker-a')
    const a = await store.create({ title: 'A', origin: 'cloud' })
    const b = await store.create({ title: 'B', origin: 'cloud' })
    await store.rename(a.id, 'Mijn schulden')
    expect((await store.list()).find((g) => g.id === a.id)?.title).toBe('Mijn schulden')

    await store.remove(a.id)
    const lijst = await store.list()
    expect(lijst.map((g) => g.id)).toEqual([b.id])
    expect(await store.load(a.id)).toEqual([])
  })

  it('removeAll wist alles van deze gebruiker', async () => {
    const store = createDeviceChatHistoryStore('gebruiker-a')
    const a = await store.create({ title: 'A', origin: 'cloud' })
    await store.appendTurn(a.id, beurt(0, 'x', 'y'))
    await store.removeAll()
    expect(await store.list()).toEqual([])
    expect(await store.load(a.id)).toEqual([])
  })
})

describe('device-store — gebruikersscoping op een gedeeld toestel', () => {
  it('wist bij de eerste opening alles van een ándere gebruiker', async () => {
    const a = createDeviceChatHistoryStore('gebruiker-a')
    const gesprek = await a.create({ title: 'Mijn schulden', origin: 'cloud' })
    await a.appendTurn(gesprek.id, beurt(0, 'Mijn schulden?', 'Nog €4.000.'))
    expect(await a.list()).toHaveLength(1)

    // Gebruiker B logt in op hetzelfde toestel, dezelfde database.
    const b = createDeviceChatHistoryStore('gebruiker-b')
    expect(await b.list()).toEqual([])
    expect(await b.load(gesprek.id)).toEqual([])

    // En A's records zijn ook echt weg, niet alleen gefilterd.
    const aOpnieuw = createDeviceChatHistoryStore('gebruiker-a')
    expect(await aOpnieuw.list()).toEqual([])
  })
})

describe('device-store — degradatie', () => {
  it('meldt niet-beschikbaar en faalt nooit hard als IndexedDB ontbreekt', async () => {
    verwijderIndexedDb()
    const store = createDeviceChatHistoryStore('gebruiker-a')
    expect(await store.beschikbaar()).toBe(false)
    expect(await store.list()).toEqual([])
    expect(await store.load('wat-dan-ook')).toEqual([])
    await expect(store.rename('x', 'y')).resolves.toBeUndefined()
    await expect(store.remove('x')).resolves.toBeUndefined()
    await expect(store.removeAll()).resolves.toBeUndefined()
    // create WERPT: zonder database valt er niets te bewaren, en een meta
    // teruggeven zou elke volgende appendTurn stil laten falen terwijl het
    // gesprek bewaard lijkt. De aanroeper vangt dit af en praat gewoon door.
    await expect(store.create({ title: 'Toch een gesprek', origin: 'cloud' })).rejects.toThrow(
      /geen gesprek bewaard/i,
    )
    await expect(store.appendTurn('wat-dan-ook', [])).rejects.toThrow(/geen gesprek bewaard/i)
  })

  it('meldt niet-beschikbaar wanneer openen wordt geweigerd', async () => {
    installeerFakeIndexedDb({ faalt: true })
    const store = createDeviceChatHistoryStore('gebruiker-a')
    expect(await store.beschikbaar()).toBe(false)
    expect(await store.list()).toEqual([])
  })

  it('is wél beschikbaar met een werkende IndexedDB', async () => {
    const store = createDeviceChatHistoryStore('gebruiker-a')
    expect(await store.beschikbaar()).toBe(true)
  })
})

describe('chatTitelUitVraag', () => {
  it('houdt een korte vraag ongewijzigd', () => {
    expect(chatTitelUitVraag('Hoeveel vrijheid heb ik?')).toBe('Hoeveel vrijheid heb ik?')
  })

  it('kapt op woordgrens af met een beletselteken', () => {
    const lang =
      'Wat als ik nu honderd euro per maand extra opzij zet en dat tien jaar volhoud, wat levert dat op?'
    const titel = chatTitelUitVraag(lang)
    expect(titel.length).toBeLessThanOrEqual(61)
    expect(titel.endsWith('…')).toBe(true)
    expect(titel).not.toMatch(/ …$/)
  })

  it('valt terug op "Nieuw gesprek" bij lege invoer', () => {
    expect(chatTitelUitVraag('   ')).toBe('Nieuw gesprek')
  })
})
