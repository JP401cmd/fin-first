import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  resolvePotRules,
  potRulesToRaw,
  sanitizeCategoriePrios,
  ALL_WEALTH_GROUPS,
  POT_RULES_DEFAULTS,
  type PotRulesConfig,
  type SurplusGroup,
} from '@/lib/pot-rules'
import type { WealthGroup } from '@/lib/wealth-composition'

// ── Helpers ──────────────────────────────────────────────────────────

/** True wanneer `value` een array is waarvan elk element een geldige WealthGroup is. */
function isValidGroupOrder(value: unknown): value is WealthGroup[] {
  return (
    Array.isArray(value) &&
    value.every((g) => typeof g === 'string' && ALL_WEALTH_GROUPS.includes(g as WealthGroup))
  )
}

/** True wanneer `value` een geldige surplus-groep is (WealthGroup óf 'schuld_aflossen'). */
function isValidSurplusGroup(value: unknown): value is SurplusGroup {
  return (
    value === 'schuld_aflossen' ||
    (typeof value === 'string' && ALL_WEALTH_GROUPS.includes(value as WealthGroup))
  )
}

// ── GET — Lees pot-regels uit profiles ───────────────────────────────

export async function GET() {
  const supabase = await createClient()
  // Read-auth via getClaims() — lokale JWKS-verificatie, geen getUser-roundtrip (ADR 0051).
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('pot_rules')
    .eq('id', claims.sub)
    .single()

  if (error) {
    return NextResponse.json({ error: 'Fout bij laden pot-regels' }, { status: 500 })
  }

  return NextResponse.json(resolvePotRules({ pot_rules: data?.pot_rules }))
}

// ── PUT — Sla pot-regels op in profiles ──────────────────────────────

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }

  // ── Validate withdrawal order ──────────────────────────────────────
  const { withdrawalOrderGroups, surplusGroup, deficitOrderGroups } = body

  if (withdrawalOrderGroups !== undefined && !isValidGroupOrder(withdrawalOrderGroups)) {
    return NextResponse.json(
      { error: 'withdrawalOrderGroups moet een array van geldige vermogensgroepen zijn' },
      { status: 400 },
    )
  }

  // ── Validate deficit order ─────────────────────────────────────────
  if (deficitOrderGroups !== undefined && !isValidGroupOrder(deficitOrderGroups)) {
    return NextResponse.json(
      { error: 'deficitOrderGroups moet een array van geldige vermogensgroepen zijn' },
      { status: 400 },
    )
  }

  // ── Validate surplus group ─────────────────────────────────────────
  if (surplusGroup !== undefined && !isValidSurplusGroup(surplusGroup)) {
    return NextResponse.json(
      { error: 'surplusGroup moet een geldige vermogensgroep of schuld_aflossen zijn' },
      { status: 400 },
    )
  }

  // ── V5: per-categorie-prio's (optioneel) — gesaneerd (prio 1..5, onbekende genegeerd) ─
  const categoriePrios = sanitizeCategoriePrios(body.categoriePrios)

  // ── Build config, vallend terug op defaults voor ontbrekende velden ─
  const config: PotRulesConfig = {
    withdrawalOrderGroups: isValidGroupOrder(withdrawalOrderGroups)
      ? withdrawalOrderGroups
      : POT_RULES_DEFAULTS.withdrawalOrderGroups,
    surplusGroup: isValidSurplusGroup(surplusGroup)
      ? surplusGroup
      : POT_RULES_DEFAULTS.surplusGroup,
    deficitOrderGroups: isValidGroupOrder(deficitOrderGroups)
      ? deficitOrderGroups
      : POT_RULES_DEFAULTS.deficitOrderGroups,
    ...(categoriePrios ? { categoriePrios } : {}),
  }

  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      updated_at: new Date().toISOString(),
      pot_rules: potRulesToRaw(config),
    })

  if (error) {
    return NextResponse.json({ error: 'Fout bij opslaan pot-regels' }, { status: 500 })
  }

  return NextResponse.json({ success: true, ...config })
}
