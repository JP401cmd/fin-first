/**
 * Unit tests voor de prefetch-gate (WP-E2, feature #881).
 *
 * `createPrefetchGate` is puur (geen timers, geen React) — we toetsen de
 * beloftesemantiek rechtstreeks: een ronde resolvet zodra
 * `R <= shownRound + window`, `releaseUpTo` verhoogt de drempel (nooit
 * verlaagt), en `abort` laat alle wachtenden onmiddellijk door.
 *
 * `settled()` flusht een paar microtask-ticks en rapporteert of de promise al
 * resolved is — zonder timers, want de gate gebruikt er zelf ook geen.
 */
import { describe, it, expect } from 'vitest'
import { createPrefetchGate } from './wizard-gate'

/** True zodra `p` resolved is, na een paar microtask-ticks (geen timers nodig). */
async function settled(p: Promise<unknown>): Promise<boolean> {
  let done = false
  p.then(() => { done = true })
  // Een paar microtask-ticks zijn ruim genoeg voor een reeds-opgeloste of een
  // net-vrijgegeven promise om te settlen.
  for (let i = 0; i < 5; i++) await Promise.resolve()
  return done
}

describe('createPrefetchGate — venster-gedrag (window=2)', () => {
  it('ronde 1 en 2 gaan direct door zonder releaseUpTo (shown start op 0)', async () => {
    const gate = createPrefetchGate(2)
    const r1 = gate.onBeforeRound()
    const r2 = gate.onBeforeRound()
    expect(await settled(r1)).toBe(true)
    expect(await settled(r2)).toBe(true)
  })

  it('ronde 3 wacht tot releaseUpTo(1) — daarna resolvet die alsnog', async () => {
    const gate = createPrefetchGate(2)
    await gate.onBeforeRound() // ronde 1
    await gate.onBeforeRound() // ronde 2
    const r3 = gate.onBeforeRound() // ronde 3: 3 <= 0+2 is false → wacht

    expect(await settled(r3)).toBe(false)

    gate.releaseUpTo(1) // shown=1 → 3 <= 1+2 = 3 → toegestaan
    expect(await settled(r3)).toBe(true)
  })

  it('een verder-in-de-toekomst wachtende ronde blijft geblokkeerd tot zijn eigen drempel', async () => {
    const gate = createPrefetchGate(2)
    await gate.onBeforeRound() // ronde 1
    await gate.onBeforeRound() // ronde 2
    const r3 = gate.onBeforeRound() // wacht (3 > 0+2)
    const r4 = gate.onBeforeRound() // wacht (4 > 0+2)

    gate.releaseUpTo(1) // 3 <= 1+2=3 toegestaan, 4 > 3 blijft wachten
    expect(await settled(r3)).toBe(true)
    expect(await settled(r4)).toBe(false)

    gate.releaseUpTo(2) // 4 <= 2+2=4 toegestaan
    expect(await settled(r4)).toBe(true)
  })
})

describe('createPrefetchGate — releaseUpTo gaat nooit achteruit', () => {
  it('een lagere releaseUpTo na een hogere blijft zonder effect op de drempel', async () => {
    const gate = createPrefetchGate(2)
    gate.releaseUpTo(5) // shown=5 (nog geen wachtenden, puur drempel zetten)
    gate.releaseUpTo(2) // lager — moet genegeerd worden (drempel blijft 5)

    // Rondes 1..7 gebruiken (round <= shown(5)+window(2)=7 toegestaan).
    for (let i = 0; i < 7; i++) {
      const r = gate.onBeforeRound()
      expect(await settled(r)).toBe(true)
    }
    // Ronde 8: 8 > 7 → moet wachten (bewijst dat de drempel nog 5 is, niet 2).
    const r8 = gate.onBeforeRound()
    expect(await settled(r8)).toBe(false)

    gate.releaseUpTo(6) // 8 <= 6+2=8 → toegestaan
    expect(await settled(r8)).toBe(true)
  })
})

describe('createPrefetchGate — abort', () => {
  it('resolvet alle wachtenden onmiddellijk, ook meerdere tegelijk', async () => {
    const gate = createPrefetchGate(1)
    await gate.onBeforeRound() // ronde 1 (1 <= 0+1, direct door)
    const r2 = gate.onBeforeRound() // wacht (2 > 0+1)
    const r3 = gate.onBeforeRound() // wacht (3 > 0+1)
    expect(await settled(r2)).toBe(false)
    expect(await settled(r3)).toBe(false)

    gate.abort()

    expect(await settled(r2)).toBe(true)
    expect(await settled(r3)).toBe(true)
  })

  it('na abort resolvet ook een nieuwe ronde onmiddellijk (allowed() checkt aborted)', async () => {
    const gate = createPrefetchGate(1)
    gate.abort()
    const r5 = gate.onBeforeRound()
    expect(await settled(r5)).toBe(true)
  })
})
