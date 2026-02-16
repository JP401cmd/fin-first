import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/test-schema-validation — Test request body validation logic.
 *
 * This endpoint tests the same validation patterns used in production API routes,
 * without requiring authentication. Used for automated testing.
 *
 * Query params:
 *   ?endpoint=holdings     — test holdings POST validation
 *   ?endpoint=holdings-patch — test holdings PATCH validation
 *   ?endpoint=badges-evaluate — test badges/evaluate validation
 *   ?endpoint=next-steps-complete — test next-steps/complete validation
 */

// Valid step keys (same as in /api/next-steps/complete)
const VALID_STEP_KEYS = [
  'import_transactions',
  'set_budgets',
  'add_assets',
  'register_debts',
  'complete_profile',
  'create_snapshot',
  'set_goals',
]

function validateHoldingsPost(body: unknown): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body moet een JSON-object zijn' }
  }

  const b = body as Record<string, unknown>
  const { name, ticker, isin, units, avg_purchase_price, current_price, asset_type } = b

  if (!name || typeof name !== 'string' || (name as string).trim().length === 0) {
    return { valid: false, error: 'Naam is verplicht en moet een niet-lege string zijn' }
  }

  if (units !== undefined && units !== null) {
    const n = Number(units)
    if (isNaN(n) || n < 0) {
      return { valid: false, error: 'Units moet een positief getal zijn' }
    }
  }

  if (avg_purchase_price !== undefined && avg_purchase_price !== null) {
    const n = Number(avg_purchase_price)
    if (isNaN(n) || n < 0) {
      return { valid: false, error: 'Gemiddelde aankoopprijs moet een positief getal zijn' }
    }
  }

  if (current_price !== undefined && current_price !== null) {
    const n = Number(current_price)
    if (isNaN(n) || n < 0) {
      return { valid: false, error: 'Huidige prijs moet een positief getal zijn' }
    }
  }

  if (ticker !== undefined && ticker !== null && typeof ticker !== 'string') {
    return { valid: false, error: 'Ticker moet een string zijn' }
  }

  if (isin !== undefined && isin !== null && typeof isin !== 'string') {
    return { valid: false, error: 'ISIN moet een string zijn' }
  }

  if (asset_type !== undefined && asset_type !== null && typeof asset_type !== 'string') {
    return { valid: false, error: 'Asset type moet een string zijn' }
  }

  return { valid: true }
}

function validateHoldingsPatch(body: unknown): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body moet een JSON-object zijn' }
  }

  const b = body as Record<string, unknown>
  const { id } = b

  if (!id || typeof id !== 'string') {
    return { valid: false, error: 'ID is verplicht en moet een string zijn' }
  }

  if (b.current_price !== undefined && b.current_price !== null && isNaN(Number(b.current_price))) {
    return { valid: false, error: 'Huidige prijs moet een getal zijn' }
  }

  if (b.units !== undefined && b.units !== null && isNaN(Number(b.units))) {
    return { valid: false, error: 'Units moet een getal zijn' }
  }

  return { valid: true }
}

function validateBadgesEvaluate(body: unknown): { valid: boolean; error?: string } {
  if (body !== null && body !== undefined && (typeof body !== 'object' || Array.isArray(body))) {
    return { valid: false, error: 'Request body moet een JSON-object zijn of leeg' }
  }
  return { valid: true }
}

function validateNextStepsComplete(body: unknown): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body moet een JSON-object zijn' }
  }

  const b = body as Record<string, unknown>
  const { step_key } = b

  if (!step_key || typeof step_key !== 'string' || (step_key as string).trim().length === 0) {
    return { valid: false, error: 'step_key is verplicht en moet een niet-lege string zijn' }
  }

  if (!VALID_STEP_KEYS.includes(step_key as string)) {
    return { valid: false, error: `Ongeldige step_key: "${step_key}". Geldige waarden: ${VALID_STEP_KEYS.join(', ')}` }
  }

  return { valid: true }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get('endpoint')

  if (!endpoint) {
    return NextResponse.json({ error: 'Query param ?endpoint= is verplicht' }, { status: 400 })
  }

  // Parse body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { valid: false, status: 400, error: 'Ongeldig JSON-formaat in request body' },
      { status: 400 }
    )
  }

  let result: { valid: boolean; error?: string }

  switch (endpoint) {
    case 'holdings':
      result = validateHoldingsPost(body)
      break
    case 'holdings-patch':
      result = validateHoldingsPatch(body)
      break
    case 'badges-evaluate':
      result = validateBadgesEvaluate(body)
      break
    case 'next-steps-complete':
      result = validateNextStepsComplete(body)
      break
    default:
      return NextResponse.json(
        { error: `Onbekend endpoint: "${endpoint}". Geldige waarden: holdings, holdings-patch, badges-evaluate, next-steps-complete` },
        { status: 400 }
      )
  }

  const status = result.valid ? 200 : 400
  return NextResponse.json(
    { valid: result.valid, status, error: result.error || null, endpoint },
    { status }
  )
}

export async function GET() {
  return NextResponse.json({
    message: 'POST with JSON body and ?endpoint= query param to test validation',
    endpoints: ['holdings', 'holdings-patch', 'badges-evaluate', 'next-steps-complete'],
    examples: {
      'holdings-valid': { name: 'VWRL ETF', units: 10, avg_purchase_price: 85.50 },
      'holdings-invalid-no-name': {},
      'holdings-invalid-units': { name: 'Test', units: 'not-a-number' },
      'next-steps-complete-valid': { step_key: 'import_transactions' },
      'next-steps-complete-invalid': { step_key: '' },
    },
  })
}
