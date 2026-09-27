/**
 * Minimale PostgREST-simulatie voor tests die het RESULTAAT van een query willen
 * meten, niet de vorm van de aanroepen.
 *
 * `eq`, `not(col, 'is', null)`, `gte`, `lt`, `order` en `limit` worden werkelijk
 * op de rijen van de tabel toegepast; `single`/`maybeSingle` schakelen naar
 * objectvorm. Andere builder-methoden (`in`, `is`, …) zijn no-ops die de keten
 * teruggeven, zodat een route met veel queries draait zonder dat elke methode
 * hier nagebouwd hoeft te worden. Elke `from()` wordt vastgelegd in `calls`, met
 * de methoden en argumenten in volgorde.
 *
 * RLS wordt bewust NIET gesimuleerd. Een tabel met een huishoud-gedeelde
 * SELECT-policy laat de rijen van de partner door; een persoonlijk oppervlak moet
 * zelf op `user_id` scopen. Deze simulatie geeft dus álle rijen terug die de
 * query niet zelf wegfiltert, precies het gedrag waartegen de tests moeten bijten.
 *
 * Opgezet naar het voorbeeld van lib/server-data/net-worth-snapshots-12m.test.ts.
 */

export type SimRow = Record<string, unknown>

export interface SimCall {
  table: string
  ops: Array<{ method: string; args: unknown[] }>
}

export interface PostgrestSim {
  /** De client; typeloos (`never`) zodat hij overal als `SupabaseClient` past. */
  client: never
  /** Elke `from()`-keten, in aanroepvolgorde. */
  calls: SimCall[]
  /** Alleen de ketens op één tabel. */
  callsTo: (table: string) => SimCall[]
}

/**
 * @param tables rijen per tabel; een onbekende tabel levert `[]`.
 * @param userId de ingelogde gebruiker voor `auth.getUser()`/`auth.getClaims()`;
 *               `null` simuleert een ontbrekende sessie.
 */
export function makePostgrestSim(tables: Record<string, SimRow[]>, userId: string | null = 'ik'): PostgrestSim {
  const calls: SimCall[] = []

  function from(table: string) {
    const call: SimCall = { table, ops: [] }
    calls.push(call)
    let result = [...(tables[table] ?? [])]
    let limitN: number | null = null
    let single = false

    const record = (method: string, args: unknown[]) => call.ops.push({ method, args })

    const known: Record<string, (...args: unknown[]) => unknown> = {
      eq: (col, val) => {
        result = result.filter(r => r[col as string] === val)
      },
      not: (col, op, val) => {
        // Alleen de vorm die de code hier gebruikt: `.not(col, 'is', null)`. Een andere vorm
        // gooit, zodat een test er niet stil groen doorheen gaat (eindreview 27 sep).
        if (op === 'is' && val === null) {
          result = result.filter(r => r[col as string] != null)
          return
        }
        throw new Error(`postgrest-sim: .not(${String(col)}, ${String(op)}, …) wordt niet gesimuleerd`)
      },
      gte: (col, val) => {
        result = result.filter(r => String(r[col as string]) >= String(val))
      },
      lt: (col, val) => {
        result = result.filter(r => String(r[col as string]) < String(val))
      },
      order: (col, opts) => {
        const asc = (opts as { ascending?: boolean } | undefined)?.ascending !== false
        result.sort((a, b) => (asc ? 1 : -1) * String(a[col as string]).localeCompare(String(b[col as string])))
      },
      limit: n => {
        limitN = n as number
      },
      single: () => {
        single = true
      },
      maybeSingle: () => {
        single = true
      },
    }

    const settle = () => {
      const rows = limitN === null ? result : result.slice(0, limitN)
      return { data: single ? (rows[0] ?? null) : rows, error: null }
    }

    const builder: Record<string, unknown> = new Proxy(
      {},
      {
        get(_target, prop) {
          if (typeof prop !== 'string') return undefined
          if (prop === 'then') {
            return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
              Promise.resolve(settle()).then(resolve, reject)
          }
          return (...args: unknown[]) => {
            record(prop, args)
            known[prop]?.(...args)
            return builder
          }
        },
      },
    )
    return builder
  }

  const client = {
    from,
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }),
      getClaims: async () => ({ data: userId ? { claims: { sub: userId } } : null, error: null }),
    },
  }

  return {
    client: client as never,
    calls,
    callsTo: (table: string) => calls.filter(c => c.table === table),
  }
}

/** Of een vastgelegde keten `.eq(col, val)` bevat. */
export function hasEq(call: SimCall, col: string, val: unknown): boolean {
  return call.ops.some(op => op.method === 'eq' && op.args[0] === col && op.args[1] === val)
}
