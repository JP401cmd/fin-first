'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Users, Mail, UserPlus, LogOut, Clock, Check, X, AlertTriangle, Copy } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'

type HouseholdStatus = {
  has_household: boolean
  household: {
    id: string
    name: string
    split_mode: string
    custom_split_pct: number | null
    primary_payer_id: string | null
    created_by: string
    created_at: string
  } | null
  my_role?: string
  members: Array<{
    id: string
    user_id: string
    role: string
    sort_order: number
    joined_at: string
    full_name: string | null
    is_current_user: boolean
  }>
  pending_invitations_sent: Array<{
    id: string
    invited_email: string
    status: string
    expires_at: string
    created_at: string
    token: string
  }>
  pending_invitations_received: Array<{
    id: string
    status: string
    expires_at: string
    created_at: string
    token: string
    household_id: string
    households: { name: string } | null
    invited_by: string
  }>
}

export function HouseholdSection() {
  const supabase = createClient()
  const [status, setStatus] = useState<HouseholdStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [householdName, setHouseholdName] = useState('')
  const [sending, setSending] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [accepting, setAccepting] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/household/status')
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
      }
    } catch (err) {
      console.error('Failed to fetch household status:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Check for invite_token in URL (from email link redirect)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const inviteToken = params.get('invite_token')
    if (inviteToken) {
      handleAcceptDecline(inviteToken, 'accept')
      // Clean URL
      const url = new URL(window.location.href)
      url.searchParams.delete('invite_token')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return

    setSending(true)
    setActionMessage(null)

    try {
      const res = await fetch('/api/household/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          householdName: householdName.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setActionMessage({ type: 'success', text: `Uitnodiging verstuurd naar ${inviteEmail.trim()}` })
        setInviteEmail('')
        setHouseholdName('')
        fetchStatus()
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Uitnodigen mislukt' })
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Netwerkfout. Probeer opnieuw.' })
    } finally {
      setSending(false)
    }
  }

  const handleAcceptDecline = async (token: string, action: 'accept' | 'decline') => {
    setAccepting(token)
    setActionMessage(null)

    try {
      const res = await fetch('/api/household/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action }),
      })

      const data = await res.json()

      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: action === 'accept' ? 'Je bent toegetreden tot het huishouden!' : 'Uitnodiging geweigerd.',
        })
        fetchStatus()
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Actie mislukt' })
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Netwerkfout. Probeer opnieuw.' })
    } finally {
      setAccepting(null)
    }
  }

  const handleLeave = async () => {
    setLeaving(true)
    setShowLeaveDialog(false)
    setActionMessage(null)

    try {
      const res = await fetch('/api/household/leave', { method: 'POST' })
      const data = await res.json()

      if (res.ok) {
        setActionMessage({ type: 'success', text: 'Je hebt het huishouden verlaten.' })
        fetchStatus()
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Verlaten mislukt' })
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Netwerkfout. Probeer opnieuw.' })
    } finally {
      setLeaving(false)
    }
  }

  const handleCancelInvite = async (invitationId: string) => {
    setActionMessage(null)
    try {
      const res = await fetch(`/api/household/invite?id=${invitationId}`, { method: 'DELETE' })
      if (res.ok) {
        setActionMessage({ type: 'success', text: 'Uitnodiging geannuleerd.' })
        fetchStatus()
      } else {
        const data = await res.json()
        setActionMessage({ type: 'error', text: data.error || 'Annuleren mislukt' })
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Netwerkfout' })
    }
  }

  const handleCopyInviteLink = async (token: string) => {
    const baseUrl = window.location.origin
    const link = `${baseUrl}/api/household/accept?token=${token}`
    try {
      await navigator.clipboard.writeText(link)
      setCopiedToken(token)
      setTimeout(() => setCopiedToken(null), 2000)
    } catch {
      // Fallback for non-HTTPS
      setActionMessage({ type: 'error', text: 'Kopiëren niet mogelijk. Gebruik HTTPS.' })
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  const formatTimeRemaining = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now()
    if (diff <= 0) return 'Verlopen'
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    if (days > 0) return `Nog ${days} dag${days !== 1 ? 'en' : ''}`
    return `Nog ${hours} uur`
  }

  if (loading) {
    return (
      <section className="mb-10 rounded-[var(--r-lg)] border border-kern-200 bg-[var(--paper)] p-6 sm:p-8" data-testid="household-section">
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-kern-300 border-t-kern-600" />
        </div>
      </section>
    )
  }

  return (
    <section className="mb-10 rounded-[var(--r-lg)] border border-kern-200 bg-[var(--paper)] p-6 sm:p-8" data-testid="household-section">
      <div className="flex items-center gap-2 mb-1">
        <Users className="h-4 w-4 text-kern-600" />
        <h2 className="text-xs font-semibold tracking-[0.15em] text-kern-600 uppercase">
          Huishouden
        </h2>
      </div>
      <p className="mt-1 mb-6 text-sm text-[var(--ink-3)]">
        Beheer je huishouden en nodig je partner uit om samen jullie financiën bij te houden.
      </p>

      {/* Action message */}
      {actionMessage && (
        <div
          className={`mb-4 rounded-lg p-3 text-sm ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
          data-testid="household-action-message"
        >
          {actionMessage.text}
        </div>
      )}

      {/* ─── Received invitations (for users not in a household) ─── */}
      {status && !status.has_household && status.pending_invitations_received.length > 0 && (
        <div className="mb-6 space-y-3" data-testid="received-invitations">
          <h3 className="text-sm font-semibold text-[var(--ink-2)] flex items-center gap-2">
            <Mail className="h-4 w-4 text-kern-500" />
            Openstaande uitnodigingen
          </h3>
          {status.pending_invitations_received.map((invite) => (
            <div
              key={invite.id}
              className="rounded-[var(--r-lg)] border border-kern-100 bg-kern-50/50 p-4"
              data-testid="received-invitation-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-zinc-800">
                    Uitnodiging voor &ldquo;{invite.households?.name || 'Huishouden'}&rdquo;
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--ink-3)] flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTimeRemaining(invite.expires_at)}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleAcceptDecline(invite.token, 'accept')}
                    disabled={accepting === invite.token}
                    className="flex items-center gap-1 rounded-lg bg-kern-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-kern-700 disabled:opacity-50 transition-colors"
                    data-testid="accept-invite-btn"
                  >
                    <Check className="h-3 w-3" />
                    {accepting === invite.token ? 'Bezig...' : 'Accepteren'}
                  </button>
                  <button
                    onClick={() => handleAcceptDecline(invite.token, 'decline')}
                    disabled={accepting === invite.token}
                    className="flex items-center gap-1 rounded-lg border border-[var(--border-md)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] disabled:opacity-50 transition-colors"
                    data-testid="decline-invite-btn"
                  >
                    <X className="h-3 w-3" />
                    Weigeren
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── No household: Invite form ─── */}
      {status && !status.has_household && (
        <div data-testid="invite-form">
          <h3 className="text-sm font-semibold text-[var(--ink-2)] flex items-center gap-2 mb-3">
            <UserPlus className="h-4 w-4 text-kern-500" />
            Partner uitnodigen
          </h3>
          <p className="text-xs text-[var(--ink-3)] mb-4">
            Nodig je partner uit om samen een huishouden te vormen. Je kunt gedeelde financiën bijhouden terwijl persoonlijke zaken privé blijven.
          </p>

          <div className="space-y-3">
            <div>
              <label htmlFor="householdName" className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                Naam huishouden <span className="text-[var(--ink-3)]">(optioneel)</span>
              </label>
              <input
                id="householdName"
                type="text"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="Ons huishouden"
                className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                data-testid="household-name-input"
              />
            </div>
            <div>
              <label htmlFor="inviteEmail" className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                E-mailadres partner
              </label>
              <input
                id="inviteEmail"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="partner@voorbeeld.nl"
                className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleInvite()
                  }
                }}
                data-testid="invite-email-input"
              />
            </div>
            <button
              onClick={handleInvite}
              disabled={sending || !inviteEmail.trim()}
              className="flex items-center gap-2 rounded-lg bg-kern-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-kern-700 disabled:opacity-50"
              data-testid="send-invite-btn"
            >
              <Mail className="h-4 w-4" />
              {sending ? 'Versturen...' : 'Uitnodiging versturen'}
            </button>
          </div>
        </div>
      )}

      {/* ─── Has household: Members & management ─── */}
      {status && status.has_household && (
        <div data-testid="household-active">
          {/* Household info */}
          <div className="mb-5 rounded-[var(--r-lg)] bg-kern-50/50 border border-kern-100 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-800">
                  {status.household?.name || 'Huishouden'}
                </h3>
                <p className="text-xs text-[var(--ink-3)]">
                  Sinds {status.household ? formatDate(status.household.created_at) : '—'}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                status.my_role === 'owner'
                  ? 'bg-kern-100 text-kern-700 border border-kern-200'
                  : 'bg-zinc-100 text-[var(--ink-2)] border border-[var(--border-ed)]'
              }`}>
                {status.my_role === 'owner' ? 'Eigenaar' : 'Lid'}
              </span>
            </div>
          </div>

          {/* Members */}
          <h3 className="text-xs font-semibold text-[var(--ink-3)] uppercase tracking-wider mb-2">
            Leden ({status.members.length}/2)
          </h3>
          <div className="space-y-2 mb-5">
            {status.members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 rounded-lg border border-[var(--border-ed)] p-3"
                data-testid="household-member"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-kern-100 text-kern-600 text-sm font-bold">
                  {(member.full_name || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800 truncate">
                    {member.full_name || 'Naamloos'}
                    {member.is_current_user && <span className="text-xs text-[var(--ink-3)] ml-1">(jij)</span>}
                  </p>
                  <p className="text-xs text-[var(--ink-3)]">
                    {member.role === 'owner' ? 'Eigenaar' : 'Lid'} · Sinds {formatDate(member.joined_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Pending sent invitations */}
          {status.pending_invitations_sent.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-semibold text-[var(--ink-3)] uppercase tracking-wider mb-2">
                Uitnodigingen
              </h3>
              {status.pending_invitations_sent.map((invite) => {
                const isExpired = invite.status === 'expired' || new Date(invite.expires_at) < new Date()
                return (
                  <div
                    key={invite.id}
                    className={`flex items-center justify-between gap-3 rounded-lg border p-3 mb-2 last:mb-0 ${
                      isExpired
                        ? 'border-[var(--border-ed)] bg-[var(--subtle)] opacity-75'
                        : 'border-amber-100 bg-amber-50/50'
                    }`}
                    data-testid="sent-invitation"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--ink-2)] truncate">{invite.invited_email}</p>
                      <p className="text-xs text-[var(--ink-3)] flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {isExpired ? 'Verlopen' : formatTimeRemaining(invite.expires_at)}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {isExpired ? (
                        <button
                          onClick={() => {
                            handleCancelInvite(invite.id)
                            setInviteEmail(invite.invited_email)
                          }}
                          className="flex items-center gap-1 rounded-lg bg-kern-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-kern-700 transition-colors"
                          data-testid="reinvite-btn"
                        >
                          <Mail className="h-3 w-3" />
                          Opnieuw uitnodigen
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleCopyInviteLink(invite.token)}
                            className="flex items-center gap-1 rounded-lg border border-[var(--border-md)] px-2 py-1 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
                            title="Kopieer uitnodigingslink"
                            data-testid="copy-invite-link"
                          >
                            <Copy className="h-3 w-3" />
                            {copiedToken === invite.token ? 'Gekopieerd!' : 'Link'}
                          </button>
                          <button
                            onClick={() => handleCancelInvite(invite.id)}
                            className="flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                            data-testid="cancel-invite-btn"
                          >
                            <X className="h-3 w-3" />
                            Annuleren
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Invite partner (if only 1 member and user is owner, no active pending invitations) */}
          {status.my_role === 'owner' && status.members.length < 2 && !status.pending_invitations_sent.some(i => i.status === 'pending' && new Date(i.expires_at) > new Date()) && (
            <div className="mb-5" data-testid="invite-partner-section">
              <h3 className="text-xs font-semibold text-[var(--ink-3)] uppercase tracking-wider mb-2">
                Partner uitnodigen
              </h3>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="partner@voorbeeld.nl"
                  className="flex-1 rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleInvite()
                    }
                  }}
                  data-testid="invite-email-input"
                />
                <button
                  onClick={handleInvite}
                  disabled={sending || !inviteEmail.trim()}
                  className="flex items-center gap-1 rounded-lg bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50 transition-colors"
                  data-testid="send-invite-btn"
                >
                  <Mail className="h-4 w-4" />
                  {sending ? '...' : 'Uitnodigen'}
                </button>
              </div>
            </div>
          )}

          {/* Leave household */}
          <div className="pt-4 border-t border-[var(--border-ed)]">
            <button
              onClick={() => setShowLeaveDialog(true)}
              disabled={leaving}
              className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
              data-testid="leave-household-btn"
            >
              <LogOut className="h-4 w-4" />
              {leaving ? 'Bezig...' : 'Huishouden verlaten'}
            </button>
          </div>
        </div>
      )}

      {/* Leave confirmation dialog */}
      <BottomSheet open={showLeaveDialog} onClose={() => setShowLeaveDialog(false)} title="Huishouden verlaten" size="sm">
        <div className="p-5" data-testid="leave-dialog">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <p className="text-sm text-[var(--ink-2)]">
              Je gedeelde items worden weer persoonlijk. Je partner behoudt toegang tot hun eigen items.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowLeaveDialog(false)}
              className="rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
            >
              Annuleren
            </button>
            <button
              onClick={handleLeave}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              data-testid="confirm-leave-btn"
            >
              Verlaten
            </button>
          </div>
        </div>
      </BottomSheet>
    </section>
  )
}
