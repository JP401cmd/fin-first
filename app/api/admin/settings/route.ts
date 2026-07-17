import { NextResponse } from 'next/server'
import { forbidden, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { encryptField, decryptField } from '@/lib/crypto/field-encryption'

// AI-provider-keys worden versleuteld opgeslagen in app_settings (AES-256-GCM
// via lib/crypto/field-encryption, dezelfde methodiek als bank/broker-tokens).
// Trui­layer-keys vallen bewust NIET in deze set: hun leespad (lib/truelayer/
// client.ts) decrypt (nog) niet — encrypten zou die integratie breken.
// Uitbreiden naar truelayer vergt eerst een decrypt-fallback dáár + eigenaar-
// akkoord (kaart Arch F3, bonusbevinding).
const AI_SECRET_KEYS = ['anthropic_api_key', 'openai_api_key', 'mistral_api_key']

// Alle secret-keys die in GET gemaskeerd worden en in PUT niet overschreven
// mogen worden met hun eigen masker.
const MASKED_KEYS = [
  'anthropic_api_key',
  'openai_api_key',
  'mistral_api_key',
  'truelayer_client_id',
  'truelayer_client_secret',
]

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return key ? '***' : ''
  return key.slice(0, 7) + '***' + key.slice(-4)
}

// Dual-read: al-versleutelde waarde (`v1:`-prefix) → decrypt, anders plaintext
// teruggeven. Nooit throwen naar de GET-response als de ciphertext/sleutel niet
// klopt — dan tonen we een lege hint zodat het beheerscherm blijft laden.
function safeReadSecret(raw: string | null | undefined): string {
  if (!raw) return ''
  if (!raw.startsWith('v1:')) return raw
  try {
    return decryptField(raw) ?? ''
  } catch {
    return ''
  }
}

export async function GET() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')

  if (error) {
    return serverError(error, 'admin-settings:GET')
  }

  const settings: Record<string, string | object> = {}
  for (const row of data ?? []) {
    if (AI_SECRET_KEYS.includes(row.key)) {
      // Versleutelde AI-keys eerst decrypten, dán maskeren, zodat de admin een
      // zinnige hint ziet (bv. `sk-ant-***abcd`) i.p.v. ciphertext.
      const plain = safeReadSecret(row.value)
      settings[row.key] = plain ? maskApiKey(plain) : ''
    } else if (MASKED_KEYS.includes(row.key)) {
      // Overige secret-keys (truelayer) staan (nog) plaintext → direct maskeren.
      settings[row.key] = row.value ? maskApiKey(row.value) : ''
    } else {
      settings[row.key] = row.value
    }
  }

  return NextResponse.json(settings)
}

const ALLOWED_KEYS = [
  'ai_provider',
  'ai_model_anthropic',
  'ai_model_openai',
  'anthropic_api_key',
  'openai_api_key',
  'ai_model_mistral',
  'mistral_api_key',
  'ollama_base_url',
  'ai_model_ollama',
  'ai_system_prompt_override',
  'truelayer_enabled',
  'truelayer_client_id',
  'truelayer_client_secret',
  'truelayer_environment',
]

export async function PUT(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const body = await req.json()
  const { data: { user } } = await supabase.auth.getUser()

  for (const key of ALLOWED_KEYS) {
    if (!(key in body)) continue
    let value = body[key]

    // Don't overwrite API keys if the masked value is sent back
    if (MASKED_KEYS.includes(key) && typeof value === 'string' && value.includes('***')) {
      continue
    }

    // Stringify object values
    if (typeof value === 'object' && value !== null) {
      value = JSON.stringify(value)
    }

    // AI-provider-keys versleuteld wegschrijven (AES-256-GCM, `v1:`-prefix).
    // Alleen niet-lege, nog-plaintext waarden encrypten; een leeg veld (key
    // wissen) blijft leeg zodat het leespad terugvalt op de env-var.
    if (AI_SECRET_KEYS.includes(key) && typeof value === 'string' && value.length > 0 && !value.startsWith('v1:')) {
      value = encryptField(value)
    }

    const { error } = await supabase
      .from('app_settings')
      .upsert(
        { key, value, updated_at: new Date().toISOString(), updated_by: user?.id },
        { onConflict: 'key' }
      )

    if (error) {
      return serverError(error, 'admin-settings:PUT')
    }
  }

  return NextResponse.json({ success: true })
}
