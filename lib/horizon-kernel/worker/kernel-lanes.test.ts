/**
 * B-057/B4 — rijstroken: één-in-vlucht-per-soort met "laatste wacht". Een verzoek
 * op een strook waar al iets in vlucht is, gaat in de wachtkamer; een nieuwer
 * verzoek verdringt het wachtende (dat krijgt het `superseded`-antwoord en wordt
 * NOOIT gepost). Stroken verdringen elkaar niet. Puur getest: `post` is een fake
 * die vastlegt wat "de worker" bereikt en de test laat antwoorden.
 */
import { describe, it, expect } from 'vitest'
import { createLaneDispatcher, KERNEL_SUPERSEDED } from './kernel-lanes'

type Req = { id: number }
type Res = { id: number; ok: boolean; error?: string }

function maakFake() {
  const posted: number[] = []
  const open = new Map<number, (res: Res) => void>()
  const dispatcher = createLaneDispatcher<Req, Res>(
    (req) =>
      new Promise<Res>((resolve) => {
        posted.push(req.id)
        open.set(req.id, resolve)
      }),
    (req) => ({ id: req.id, ok: false, error: KERNEL_SUPERSEDED }),
  )
  const antwoord = async (id: number) => {
    const r = open.get(id)
    if (!r) throw new Error(`geen open verzoek ${id}`)
    open.delete(id)
    r({ id, ok: true })
    // Laat de then-keten (resolve + volgende post) afwikkelen.
    await Promise.resolve()
    await Promise.resolve()
  }
  return { posted, dispatcher, antwoord }
}

describe('kernel-lanes — laatste wacht per strook', () => {
  it('alleen het in-vlucht- en het láátste wachtende verzoek bereiken de worker', async () => {
    const { posted, dispatcher, antwoord } = maakFake()

    const p1 = dispatcher.dispatch('main', { id: 1 }, false)
    const p2 = dispatcher.dispatch('main', { id: 2 }, false)
    const p3 = dispatcher.dispatch('main', { id: 3 }, false)

    // Alleen #1 is gepost; #2 wachtte en is inmiddels verdrongen door #3.
    expect(posted).toEqual([1])
    expect(await p2).toEqual({ id: 2, ok: false, error: KERNEL_SUPERSEDED })

    // #1 landt → #3 wordt gepost; #2 is NOOIT gepost.
    await antwoord(1)
    expect((await p1).ok).toBe(true)
    expect(posted).toEqual([1, 3])

    await antwoord(3)
    expect((await p3).ok).toBe(true)
    expect(posted).toEqual([1, 3])
  })

  it('na het landen van de wachtende is de strook weer vrij: een volgend verzoek post direct', async () => {
    const { posted, dispatcher, antwoord } = maakFake()
    const p1 = dispatcher.dispatch('main', { id: 1 }, false)
    const p2 = dispatcher.dispatch('main', { id: 2 }, false)
    await antwoord(1)
    await p1
    await antwoord(2)
    await p2
    void dispatcher.dispatch('main', { id: 3 }, false)
    expect(posted).toEqual([1, 2, 3])
  })

  it('verschillende stroken verdringen elkaar niet (hoofd- vs scenario-run)', () => {
    const { posted, dispatcher } = maakFake()
    void dispatcher.dispatch('main', { id: 1 }, false)
    void dispatcher.dispatch('scenario', { id: 2 }, false)
    void dispatcher.dispatch('stoppad', { id: 3 }, false)
    expect(posted).toEqual([1, 2, 3])
  })

  it('workerOnly reist mee met het wachtende verzoek', async () => {
    const gezien: Array<[number, boolean]> = []
    const dispatcher = createLaneDispatcher<Req, Res>(
      (req, workerOnly) => {
        gezien.push([req.id, workerOnly])
        return Promise.resolve({ id: req.id, ok: true })
      },
      (req) => ({ id: req.id, ok: false, error: KERNEL_SUPERSEDED }),
    )
    await dispatcher.dispatch('presets', { id: 1 }, true)
    expect(gezien).toEqual([[1, true]])
  })
})
