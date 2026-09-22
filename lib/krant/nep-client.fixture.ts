// ── Nep-Supabase-client voor de fase-2-tests van de Krant ────────────────────
//
// Een in-memory tabelset die de query-keten van supabase-js nabootst (select /
// insert / upsert / update / delete + eq / is / in / gt / gte / lt / or /
// order / limit / maybeSingle / single) en élke query vastlegt. Twee dingen
// maken 'm nuttig als bewijs, niet alleen als stub:
//
//   1. hij PAST de filters toe — een `.eq('user_id', …)` dat ontbreekt levert
//      dus zichtbaar de rijen van een ander op (de partnerrij-test);
//   2. hij bewaart per query de stappen, zodat een test kan toetsen wélke
//      kolommen zijn opgevraagd en of de scope in de keten zat.
//
// WAT HIJ NIET NABOOTST (bewust benoemd, zodat een test er niet stil op leunt):
//   - de kolomlijst van `select()` — elke rij komt volledig terug; een
//     niet-bestaande kolomnaam valt hier niet op (PostgREST geeft dan een 400);
//   - `maybeSingle()` gooit niet bij meer dan één rij (geeft de eerste);
//   - `.or(expr)` — de PostgREST-filtergrammatica wordt niet geparseerd. Zonder
//     `opties.or` GOOIT de query (fail-loud); een test die een `.or` wil dekken
//     geeft zelf de predicaatfunctie mee en toetst de expressie apart;
//   - `rpc()` bestaat niet: een helper die een RPC aanroept wordt in de test
//     gemockt (vi.mock) — zo blijft zichtbaar dat die som elders is bewezen.
//
// Eigen bestand (geen export uit een *.test.ts), zoals editie.fixture.ts.
// euro-only (B2, ADR 0172): bevat geen rekenwerk.

export type NepRij = Record<string, unknown>

export interface NepStap {
  m: string
  args: unknown[]
}

export interface NepQuery {
  table: string
  stappen: NepStap[]
}

export interface NepOpties {
  /** `"<tabel>:<operatie>"` → foutmelding; bv. `'krant_editie_items:insert': 'kapot'`. */
  fouten?: Record<string, string>
  /** Predicaat voor `.or(expr)`; zonder deze optie gooit een `.or`-query. */
  or?: (expr: string, rij: NepRij) => boolean
}

let idTeller = 0
function nieuwId(): string {
  idTeller++
  return `nep-${idTeller.toString().padStart(4, '0')}`
}

function vergelijk(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const sa = String(a)
  const sb = String(b)
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

export function maakNepClient(tabellen: Record<string, NepRij[]>, opties: NepOpties = {}) {
  const data: Record<string, NepRij[]> = {}
  for (const [t, rijen] of Object.entries(tabellen)) data[t] = rijen.map((r) => ({ ...r }))
  const queries: NepQuery[] = []

  function tabel(t: string): NepRij[] {
    return (data[t] ??= [])
  }

  function filter(rijen: NepRij[], stappen: NepStap[]): NepRij[] {
    let out = rijen
    for (const s of stappen) {
      const [col, v] = s.args as [string, unknown]
      switch (s.m) {
        case 'eq':
          out = out.filter((r) => r[col] === v)
          break
        case 'is':
          out = out.filter((r) => (v === null ? r[col] == null : r[col] === v))
          break
        case 'in':
          out = out.filter((r) => (v as unknown[]).includes(r[col]))
          break
        case 'gt':
          out = out.filter((r) => vergelijk(r[col], v) > 0)
          break
        case 'gte':
          out = out.filter((r) => vergelijk(r[col], v) >= 0)
          break
        case 'lt':
          out = out.filter((r) => vergelijk(r[col], v) < 0)
          break
        case 'or': {
          const predicaat = opties.or
          if (!predicaat) throw new Error(`nep-client: .or(${String(col)}) zonder opties.or — geef het predicaat mee`)
          out = out.filter((r) => predicaat(col, r))
          break
        }
        case 'order': {
          const asc = (s.args[1] as { ascending?: boolean } | undefined)?.ascending !== false
          out = [...out].sort((a, b) => vergelijk(a[col], b[col]) * (asc ? 1 : -1))
          break
        }
        case 'limit':
          out = out.slice(0, col as unknown as number)
          break
      }
    }
    return out
  }

  function voerUit(q: NepQuery): { data: unknown; error: { message: string } | null; count?: number | null } {
    const op = q.stappen.find((s) => ['select', 'insert', 'upsert', 'update', 'delete'].includes(s.m))
    const operatie = op?.m ?? 'select'
    const fout = opties.fouten?.[`${q.table}:${operatie}`]
    if (fout) return { data: null, error: { message: fout } }

    const wilSelect = q.stappen.some((s) => s.m === 'select')
    const single = q.stappen.some((s) => s.m === 'maybeSingle' || s.m === 'single')
    const vorm = (rijen: NepRij[]) => (single ? (rijen[0] ?? null) : rijen)

    switch (operatie) {
      case 'select': {
        const selectArgs = op?.args[1] as { count?: string; head?: boolean } | undefined
        const rijen = filter(tabel(q.table), q.stappen)
        if (selectArgs?.count === 'exact') return { data: selectArgs.head ? null : vorm(rijen), error: null, count: rijen.length }
        return { data: vorm(rijen.map((r) => ({ ...r }))), error: null }
      }
      case 'insert': {
        const invoer = op!.args[0]
        const rijen = (Array.isArray(invoer) ? invoer : [invoer]) as NepRij[]
        const geschreven = rijen.map((r) => ({ id: nieuwId(), ...r }))
        tabel(q.table).push(...geschreven)
        return { data: wilSelect ? vorm(geschreven) : null, error: null }
      }
      case 'upsert': {
        const invoer = op!.args[0] as NepRij
        const conflict = ((op!.args[1] as { onConflict?: string } | undefined)?.onConflict ?? 'id').split(',').map((s) => s.trim())
        const t = tabel(q.table)
        const i = t.findIndex((r) => conflict.every((c) => r[c] === invoer[c]))
        if (i >= 0) t[i] = { ...t[i], ...invoer }
        else t.push({ id: nieuwId(), ...invoer })
        return { data: wilSelect ? vorm([i >= 0 ? t[i] : t[t.length - 1]]) : null, error: null }
      }
      case 'update': {
        const patch = op!.args[0] as NepRij
        const t = tabel(q.table)
        const geraakt = filter(t, q.stappen)
        for (const r of geraakt) Object.assign(r, patch)
        return { data: wilSelect ? vorm(geraakt) : null, error: null }
      }
      case 'delete': {
        const t = tabel(q.table)
        const geraakt = new Set(filter(t, q.stappen))
        data[q.table] = t.filter((r) => !geraakt.has(r))
        const deleteArgs = op!.args[0] as { count?: string } | undefined
        return { data: null, error: null, count: deleteArgs?.count === 'exact' ? geraakt.size : null }
      }
    }
    return { data: null, error: null }
  }

  const chainMethods = ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'is', 'in', 'gt', 'gte', 'lt', 'or', 'order', 'limit', 'maybeSingle', 'single']

  function maakQuery(table: string) {
    const q: NepQuery = { table, stappen: [] }
    queries.push(q)
    const chain: Record<string, unknown> = {}
    for (const m of chainMethods) {
      chain[m] = (...args: unknown[]) => {
        q.stappen.push({ m, args })
        return chain
      }
    }
    chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      let uitkomst: unknown
      try {
        uitkomst = voerUit(q)
      } catch (err) {
        return Promise.reject(err).then(res, rej)
      }
      return Promise.resolve(uitkomst).then(res, rej)
    }
    return chain
  }

  return {
    client: { from: (table: string) => maakQuery(table) },
    queries,
    /** De actuele inhoud van een tabel. */
    rijen: (table: string) => tabel(table),
    /** Queries op één tabel, in volgorde. */
    queriesOp: (table: string) => queries.filter((q) => q.table === table),
  }
}

export type NepClient = ReturnType<typeof maakNepClient>['client']
