import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { TransformStream } from 'node:stream/web'
import { setTimeout as delay } from 'node:timers/promises'

/**
 * Runtime-ondergrens: Node's webstreams-race mag niet meer bestaan (ADR 0100).
 *
 * Achtergrond — de SSR-crash op `/overzicht`:
 *   TypeError: controller[kState].transformAlgorithm is not a function
 *     at transformStreamDefaultControllerPerformTransform (node:internal/webstreams/transformstream:527)
 *     at node:internal/webstreams/transformstream:568
 *
 * Dat is GEEN fout in onze code: het is nodejs/node#62036. Wanneer de
 * leeskant van een TransformStream wordt geannuleerd — precies wat Next.js
 * doet als een bezoeker wegklikt terwijl de RSC-stream nog loopt — wist Node
 * `transformAlgorithm` synchroon, terwijl de writable pas een microtask later
 * ge-errord wordt. Een write die in dat venster hervat, roept een inmiddels
 * gewiste functie aan en laat de interne TypeError naar buiten lekken. Next
 * ziet die als een render-fout → mislukte SSR-render voor die bezoeker.
 *
 * Gerepareerd upstream in Node 24.15.0 (backport) en 25.8.1: een guard in
 * `transformStreamDefaultControllerPerformTransform` die stilletjes terugkeert
 * zodra de algorithms gewist zijn.
 *
 * Deze test is de vangrail: hij is ROOD op elke Node < 24.15.0 en groen daarna.
 * Draai je hem rood, dan draai je op een kwetsbare runtime — upgrade Node,
 * de test hoeft niet aangepast te worden.
 */
describe('Node-runtime — webstreams TransformStream-race (nodejs/node#62036)', () => {
  it('laat geen interne TypeError lekken als een late write tegen een cancel racet', async () => {
    // Letterlijk de upstream-reproductie
    // (test/parallel/test-whatwg-transformstream-cancel-write-race.js).
    const stream = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk)
      },
    })

    // Vereist voor een betrouwbare reproductie: reader/writer pas ná een
    // macrotask ophalen, anders valt het race-venster weg.
    await delay(0)

    const reader = stream.readable.getReader()
    const writer = stream.writable.getWriter()

    // Backpressure vrijgeven (readable HWM = 0, dus backpressure staat aan).
    const pendingRead = reader.read()
    // Client disconnect / shutdown nabootsen — wist de algorithms synchroon.
    const pendingCancel = reader.cancel(new Error('client disconnected'))
    // Late write die in het venster valt vóór de writable ge-errord is.
    const pendingLateWrite = writer.write('late-write')

    const [readResult, cancelResult, lateWriteResult] = await Promise.allSettled([
      pendingRead,
      pendingCancel,
      pendingLateWrite,
    ])

    expect(readResult.status).toBe('fulfilled')
    expect(cancelResult.status).toBe('fulfilled')

    // De write mág afgewezen worden met een echte shutdown-reden; hij mag
    // alleen niet struikelen over Node's eigen gewiste interne slot.
    if (lateWriteResult.status === 'rejected') {
      const reason: unknown = lateWriteResult.reason
      const message = reason instanceof Error ? reason.message : String(reason)
      expect(
        /transformAlgorithm is not a function/.test(message),
        `Interne Node-implementatiefout lekt naar de caller op ${process.version}: ` +
          `"${message}". Dit is nodejs/node#62036 — de oorzaak van de SSR-crash op ` +
          `/overzicht. Upgrade naar Node >= 24.15.0 (zie ADR 0100 en .nvmrc).`,
      ).toBe(false)
    }
  })

  it('houdt de ondergrens in package.json op minimaal 24.15.0', () => {
    const pkg = JSON.parse(
      readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
    ) as { engines?: { node?: string } }

    const declared = pkg.engines?.node ?? ''
    const floor = /(\d+)\.(\d+)\.(\d+)/.exec(declared)

    expect(
      floor,
      `engines.node moet een expliciete patch-ondergrens noemen, stond op "${declared}". ` +
        'Een major-only bereik als "24.x" staat de kwetsbare 24.13/24.14 toe (ADR 0100).',
    ).not.toBeNull()

    const [major, minor] = [Number(floor![1]), Number(floor![2])]
    expect(
      major > 24 || (major === 24 && minor >= 15),
      `engines.node ondergrens "${declared}" ligt onder de gepatchte Node 24.15.0 (ADR 0100).`,
    ).toBe(true)
  })
})
