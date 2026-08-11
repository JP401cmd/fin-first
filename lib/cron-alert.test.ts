import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { alertCronFailure } from './cron-alert'

/**
 * Mock-service die de twee app_settings-operaties van alertCronFailure dekt:
 *   read:  .from('app_settings').select('value').eq('key', k).maybeSingle()
 *   write: .from('app_settings').upsert({...})
 * `throttleValue` = waarde in de cron_alert_last_<job>-sleutel (of null).
 */
function makeService(throttleValue: string | null) {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const maybeSingle = vi.fn().mockResolvedValue({ data: throttleValue == null ? null : { value: throttleValue } })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select, upsert })
  return { service: { from } as unknown as SupabaseClient, from, select, eq, maybeSingle, upsert }
}

const okSend = vi.fn().mockResolvedValue({ ok: true })

/** Push standaard uit, zodat de tests niet van ambient env afhangen. */
const noPush = { pushConfigured: () => false }

describe('alertCronFailure', () => {
  it('stuurt 1 mail + zet throttle-stempel bij een fout met recipient', async () => {
    const { service, upsert } = makeService(null)
    const send = vi.fn().mockResolvedValue({ ok: true })
    const now = () => new Date('2026-07-21T12:00:00Z')
    const res = await alertCronFailure(
      service,
      { job: 'snapshots', error: 'profiel-query faalde' },
      { send, now, recipient: () => 'ops@trifinity.app', ...noPush },
    )
    expect(res).toEqual({ sent: true, channels: { mail: true, push: false } })
    expect(send).toHaveBeenCalledTimes(1)
    const mail = send.mock.calls[0][0]
    expect(mail.to).toBe('ops@trifinity.app')
    expect(mail.subject).toContain('Maandsnapshots')
    // Throttle-stempel weggeschreven onder de juiste sleutel.
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert.mock.calls[0][0]).toEqual({
      key: 'cron_alert_last_snapshots',
      value: '2026-07-21T12:00:00.000Z',
    })
  })

  it('geen enkel kanaal -> stille no-op', async () => {
    const { service, upsert } = makeService(null)
    const send = vi.fn()
    const res = await alertCronFailure(
      service,
      { job: 'retention', error: 'x' },
      { send, recipient: () => null, ...noPush },
    )
    expect(res).toEqual({ sent: false, skipped: 'no-recipient' })
    expect(send).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('respecteert de dag-throttle (recente alert -> skip)', async () => {
    const now = () => new Date('2026-07-21T12:00:00Z')
    // 2 uur geleden gealarmeerd -> binnen 24u venster.
    const { service, upsert } = makeService('2026-07-21T10:00:00.000Z')
    const send = vi.fn()
    const push = vi.fn()
    const res = await alertCronFailure(
      service,
      { job: 'news-ingest', error: 'x' },
      { send, now, recipient: () => 'ops@trifinity.app', push, pushConfigured: () => true },
    )
    expect(res).toEqual({ sent: false, skipped: 'throttled' })
    expect(send).not.toHaveBeenCalled()
    // Eén throttle voor beide kanalen: de push gaat ook niet uit.
    expect(push).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('verstuurt weer nadat het throttle-venster verstreken is', async () => {
    const now = () => new Date('2026-07-21T12:00:00Z')
    // 25 uur geleden -> buiten venster.
    const { service } = makeService('2026-07-20T11:00:00.000Z')
    const res = await alertCronFailure(
      service,
      { job: 'holdings-prices', error: 'x' },
      { send: okSend, now, recipient: () => 'ops@trifinity.app', ...noPush },
    )
    expect(res).toEqual({ sent: true, channels: { mail: true, push: false } })
  })

  it('mail-fout -> geen stempel, geen throw', async () => {
    const { service, upsert } = makeService(null)
    const send = vi.fn().mockResolvedValue({ ok: false })
    const res = await alertCronFailure(
      service,
      { job: 'briefing-email', error: 'x' },
      { send, recipient: () => 'ops@trifinity.app', ...noPush },
    )
    expect(res).toEqual({ sent: false, skipped: 'send-failed' })
    expect(upsert).not.toHaveBeenCalled()
  })

  // ── Duw-kanaal naast de mail (ADR 0102) ──────────────────────────────────
  it('pusht ook zonder mail-recipient, en zet dan wél de stempel', async () => {
    const { service, upsert } = makeService(null)
    const send = vi.fn()
    const push = vi.fn().mockResolvedValue({ sent: true })
    const res = await alertCronFailure(
      service,
      { job: 'retention', error: 'x' },
      {
        send,
        now: () => new Date('2026-07-21T12:00:00Z'),
        recipient: () => null,
        push,
        pushConfigured: () => true,
      },
    )
    expect(res).toEqual({ sent: true, channels: { mail: false, push: true } })
    expect(send).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('de push draagt nooit de fouttekst (payloadregel)', async () => {
    const { service } = makeService(null)
    const push = vi.fn().mockResolvedValue({ sent: true })
    await alertCronFailure(
      service,
      { job: 'snapshots', error: 'profiel jan@example.com faalde op /overzicht?id=42' },
      { send: okSend, recipient: () => 'ops@trifinity.app', push, pushConfigured: () => true },
    )
    const payload = JSON.stringify(push.mock.calls[0][0])
    expect(payload).not.toContain('jan@example.com')
    expect(payload).not.toContain('profiel')
    expect(payload).toContain('Maandsnapshots')
  })

  it('mail faalt maar push lukt -> alsnog gealarmeerd + stempel', async () => {
    const { service, upsert } = makeService(null)
    const send = vi.fn().mockResolvedValue({ ok: false })
    const push = vi.fn().mockResolvedValue({ sent: true })
    const res = await alertCronFailure(
      service,
      { job: 'news-ingest', error: 'x' },
      { send, recipient: () => 'ops@trifinity.app', push, pushConfigured: () => true },
    )
    expect(res).toEqual({ sent: true, channels: { mail: false, push: true } })
    expect(upsert).toHaveBeenCalledTimes(1)
  })
})
