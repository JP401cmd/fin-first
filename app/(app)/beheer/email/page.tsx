import { Mail, Check, AlertCircle, MinusCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { isEmailConfigured } from '@/lib/email'

export const dynamic = 'force-dynamic'

interface MailRow {
  id: string
  to_email: string
  subject: string
  status: 'sent' | 'failed' | 'skipped'
  provider: string | null
  error: string | null
  created_at: string
}

const dateTimeFmt = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Amsterdam',
})
function fmt(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d)
}

function StatusBadge({ status }: { status: MailRow['status'] }) {
  if (status === 'sent') {
    return (
      <span className="inline-flex items-center gap-1 bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-green-800">
        <Check className="h-3 w-3" /> Verzonden
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-800">
        <AlertCircle className="h-3 w-3" /> Mislukt
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 bg-[var(--subtle)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
      <MinusCircle className="h-3 w-3" /> Overgeslagen
    </span>
  )
}

export default async function BeheerEmailPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('mail_log')
    .select('id, to_email, subject, status, provider, error, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const rows = (data ?? []) as MailRow[]
  const configured = isEmailConfigured()

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-[var(--ink-3)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">E-mail</h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Transactionele e-mail (huishouden-uitnodigingen) en recente pogingen.
        </p>
      </div>

      {/* Providerstatus */}
      <div
        className={`mb-6 flex items-start gap-2 border px-4 py-3 text-sm ${
          configured
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}
      >
        {configured ? (
          <Check className="mt-0.5 h-4 w-4 flex-shrink-0" />
        ) : (
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        )}
        <p>
          {configured ? (
            <>Resend is geconfigureerd — e-mails worden verzonden.</>
          ) : (
            <>
              <span className="font-semibold">Geen e-mailprovider.</span> Zet{' '}
              <code className="font-mono text-xs">RESEND_API_KEY</code> (en optioneel{' '}
              <code className="font-mono text-xs">EMAIL_FROM</code>) om e-mails echt te versturen.
              Tot die tijd worden pogingen als &lsquo;overgeslagen&rsquo; gelogd en blijven
              uitnodigingen via de deelbare link werken.
            </>
          )}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-[var(--border-ed)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--ink-3)]">Nog geen e-mailpogingen geregistreerd.</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-ed)] text-left">
              <th className="py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">Datum</th>
              <th className="py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">Aan</th>
              <th className="py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">Onderwerp</th>
              <th className="py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-dotted border-[var(--border-ed)] align-top hover:bg-[var(--subtle)]">
                <td className="whitespace-nowrap py-2 pr-4 font-mono text-xs tabular-nums text-[var(--ink-3)]">{fmt(r.created_at)}</td>
                <td className="py-2 pr-4 font-mono text-xs text-[var(--ink-3)]">{r.to_email}</td>
                <td className="py-2 pr-4 text-[var(--ink-2)]">
                  {r.subject}
                  {r.error && <span className="mt-0.5 block font-mono text-[11px] text-red-600">{r.error}</span>}
                </td>
                <td className="py-2">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
