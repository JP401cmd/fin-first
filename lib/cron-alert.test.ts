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

describe('alertCronFailure', () => {
  it('stuurt 1 mail + zet throttle-stempel bij een fout met recipient', async () => {
    const { service, upsert } = makeService(null)
    const send = vi.fn().mockResolvedValue({ ok: true })
    const now = () => new Date('2026-07-21T12:00:00Z')
    const res = await alertCronFailure(
      service,
      { job: 'snapshots', error: 'profiel-query faalde' },
      { send, now, recipient: () => 'ops@trifinity.app' },
    )
    expect(res).toEqual({ sent: true })
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

  it('geen recipient -> geen mail (stille no-op)', async () => {
    const { service, upsert } = makeService(null)
    const send = vi.fn()
    const res = await alertCronFailure(
      service,
      { job: 'retention', error: 'x' },
      { send, recipient: () => null },
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
    const res = await alertCronFailure(
      service,
      { job: 'news-ingest', error: 'x' },
      { send, now, recipient: () => 'ops@trifinity.app' },
    )
    expect(res).toEqual({ sent: false, skipped: 'throttled' })
    expect(send).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('verstuurt weer nadat het throttle-venster verstreken is', async () => {
    const now = () => new Date('2026-07-21T12:00:00Z')
    // 25 uur geleden -> buiten venster.
    const { service } = makeService('2026-07-20T11:00:00.000Z')
    const res = await alertCronFailure(
      service,
      { job: 'holdings-prices', error: 'x' },
      { send: okSend, now, recipient: () => 'ops@trifinity.app' },
    )
    expect(res).toEqual({ sent: true })
  })

  it('mail-fout -> geen stempel, geen throw', async () => {
    const { service, upsert } = makeService(null)
    const send = vi.fn().mockResolvedValue({ ok: false })
    const res = await alertCronFailure(
      service,
      { job: 'briefing-email', error: 'x' },
      { send, recipient: () => 'ops@trifinity.app' },
    )
    expect(res).toEqual({ sent: false, skipped: 'send-failed' })
    expect(upsert).not.toHaveBeenCalled()
  })
})
