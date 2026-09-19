/**
 * Rijstroken voor de kernel-worker: één-in-vlucht-per-soort met "laatste wacht"
 * (B-057 / B4).
 *
 * De worker is FIFO zonder annulering: een eenmaal gepost verzoek wordt altijd
 * volledig uitgerekend, ook als de aanroeper het antwoord allang negeert (reqId-
 * guard in `use-horizon-fire-sim`). Bij een planwijziging leverde `loadData()`
 * meerdere commits en dus meerdere hoofdruns op — allemaal in de rij vóór de run
 * die telt. Een rijstrook (`lane`) houdt per soort hooguit ÉÉN verzoek in vlucht
 * en ÉÉN in de wachtkamer; een nieuw verzoek vervangt het wachtende (dat krijgt
 * het `superseded`-antwoord en wordt NOOIT gepost). Verouderd werk bereikt de
 * worker daardoor niet meer.
 *
 * Pure module: het echte posten wordt geïnjecteerd (`post`), zodat de logica
 * zonder `Worker` te testen is. `run-in-worker.ts` maakt er één instantie van.
 */

/** Rijstrook-sleutels. Hoofd- en scenario-run delen `kind: 'projection'` maar
 *  zijn ANDERE stromen: elk zijn eigen strook, anders zou een scenario-run de
 *  hoofdrun verdringen. */
export type KernelLane = 'main' | 'scenario' | 'stoppad' | 'presets'

/** `error`-waarde van een verdrongen (nooit gepost) verzoek. */
export const KERNEL_SUPERSEDED = 'superseded'
/** `reason`-waarde in de projectie-uitkomst voor een verdrongen verzoek. */
export const KERNEL_SUPERSEDED_REASON = 'verdrongen door een nieuwere run'

interface LaneQueued<Req, Res> {
  req: Req
  workerOnly: boolean
  resolve: (res: Res) => void
}
interface LaneState<Req, Res> {
  inFlight: boolean
  queued: LaneQueued<Req, Res> | null
}

export interface LaneDispatcher<Req, Res> {
  /** Post via de strook: direct als er niets in vlucht is, anders in de wachtkamer
   *  (en het eerdere wachtende verzoek wordt verdrongen). Settelt altijd precies
   *  één keer. */
  dispatch: (lane: KernelLane, req: Req, workerOnly: boolean) => Promise<Res>
  /** Alle stroken leegmaken (tests). */
  reset: () => void
}

export function createLaneDispatcher<Req, Res>(
  post: (req: Req, workerOnly: boolean) => Promise<Res>,
  superseded: (req: Req) => Res,
): LaneDispatcher<Req, Res> {
  const lanes = new Map<KernelLane, LaneState<Req, Res>>()

  function getLane(lane: KernelLane): LaneState<Req, Res> {
    let s = lanes.get(lane)
    if (!s) {
      s = { inFlight: false, queued: null }
      lanes.set(lane, s)
    }
    return s
  }

  function run(lane: LaneState<Req, Res>, req: Req, workerOnly: boolean, resolve: (res: Res) => void): void {
    if (lane.inFlight) {
      if (lane.queued) lane.queued.resolve(superseded(lane.queued.req))
      lane.queued = { req, workerOnly, resolve }
      return
    }
    lane.inFlight = true
    void post(req, workerOnly).then((res) => {
      resolve(res)
      lane.inFlight = false
      const next = lane.queued
      if (next) {
        lane.queued = null
        run(lane, next.req, next.workerOnly, next.resolve)
      }
    })
  }

  return {
    dispatch: (lane, req, workerOnly) =>
      new Promise<Res>((resolve) => {
        run(getLane(lane), req, workerOnly, resolve)
      }),
    reset: () => lanes.clear(),
  }
}
