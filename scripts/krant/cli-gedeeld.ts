// Gedeelde hulp voor de Krant-scripts die een Claude-sessie draait
// (duiding-inhaalslag, categorisatie-inhaalslag, ochtend). Eén plek voor de
// argumenten, het env-bestand, de service-client en de poorten vóór een
// schrijfactie naar productie.
//
// De service-sleutel komt uit het opgegeven env-bestand en wordt nooit gelogd.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { parsePlatformStatus } from '../../lib/platform-status'

export function arg(naam: string): string | undefined {
  const i = process.argv.indexOf(`--${naam}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

export const vlag = (naam: string) => process.argv.includes(`--${naam}`)

export function stop(melding: string): never {
  console.error(`✗ ${melding}`)
  process.exit(1)
}

export function laadEnv(pad: string | undefined) {
  if (!pad) stop('Geef --env <pad naar .env.local> (in de hoofdmap van fin-first).')
  for (const regel of readFileSync(pad, 'utf8').split(/\r?\n/)) {
    const m = regel.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

/**
 * Het productieproject. De service-sleutel gaat als header mee naar deze host;
 * een gewijzigde URL in .env.local (bijvoorbeeld door een geïnjecteerde agent)
 * zou hem anders naar een vreemde host sturen (security-run 29 sep, 🟡-2).
 */
export const VERWACHTE_SUPABASE_HOST = 'pnnuqwdcgoympgddrvze.supabase.co'

export function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) stop('NEXT_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY ontbreken in het env-bestand.')
  eisVerwachteHost(url)
  console.log(`→ database: ${new URL(url).host}`)
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Stopt tenzij de URL naar het productieproject wijst, over https. */
export function eisVerwachteHost(url: string) {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    stop('NEXT_PUBLIC_SUPABASE_URL is geen geldige URL.')
  }
  if (u.protocol !== 'https:' || u.host !== VERWACHTE_SUPABASE_HOST) {
    stop(`NEXT_PUBLIC_SUPABASE_URL wijst naar ${u.host}, verwacht ${VERWACHTE_SUPABASE_HOST}: de sleutel gaat niet naar een andere host.`)
  }
}

export function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

export function huidigeCommit(): string {
  try {
    return git('rev-parse', 'HEAD')
  } catch {
    return 'onbekend'
  }
}

/**
 * Dezelfde poort als productie: de prompts, controles en versies komen uit de
 * lokale checkout. Schrijven mag alleen als die checkout gelijk is aan
 * origin/master (security-run 29 sep, 🟡-2; review 29 sep). `paden` = de
 * bestanden die de schrijfactie bepalen; die moeten schoon zijn.
 *
 * Let op: deze poort draait NA de module-imports. Tegen een gewijzigd script
 * beschermt hij dus niet; daarvoor vergelijkt de skill `git status` vóór en
 * ná elke agent.
 */
export function eisSchoneCheckout(paden: readonly string[]): string {
  const vuil = git('status', '--porcelain', '--', ...paden)
  if (vuil) stop(`lokale wijzigingen in ${paden.join(', ')} — schrijf alleen vanaf een schone checkout:\n${vuil}`)
  try {
    git('fetch', '-q', 'origin', 'master')
  } catch {
    stop('git fetch origin master mislukte — kan niet bewijzen dat deze checkout gelijk is aan productie.')
  }
  // Gelijk, niet "erin": een achterlopende master schrijft met een oude prompt
  // of oude controles, en de weekjob draaide dan een oude route (review 29 sep).
  const head = git('rev-parse', 'HEAD')
  const master = git('rev-parse', 'origin/master')
  if (head !== master) {
    stop(`HEAD (${head.slice(0, 9)}) is niet gelijk aan origin/master (${master.slice(0, 9)}): draai vanaf de actuele, gedeployde master.`)
  }
  return head
}

/** Staat de AI-noodstop van het platform uit, dan wordt er niet geschreven. */
export async function eisNoodstopAan(supabase: SupabaseClient) {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'platform_status').maybeSingle()
  if (error) stop(`noodstop niet te lezen: ${error.message}`)
  const raw = data?.value == null ? null : typeof data.value === 'string' ? data.value : JSON.stringify(data.value)
  if (!parsePlatformStatus(raw).killSwitches.ai) stop('De AI-noodstop staat uit (platform_status): er wordt niet geschreven.')
}

/** Voeg deelbestanden samen (één per subagent). Een id dat twee keer gevuld is, stopt de run. */
export function leesUitvoer(paden: string[]): Record<string, unknown> {
  const samen: Record<string, unknown> = {}
  for (const pad of paden) {
    const deel = JSON.parse(readFileSync(pad, 'utf8')) as Record<string, unknown>
    for (const [id, waarde] of Object.entries(deel)) {
      if (waarde === null || waarde === undefined) continue
      if (id in samen && samen[id] !== null) stop(`id ${id} is in meer dan één uitvoerbestand gevuld.`)
      samen[id] = waarde
    }
  }
  return samen
}

/** `--uitvoer a.json,b.json` → paden; stopt bij een pad dat geen .json is. */
export function uitvoerPaden(uitvoerArg: string): string[] {
  const paden = uitvoerArg.split(',').map((p) => p.trim()).filter(Boolean)
  if (paden.some((p) => !p.endsWith('.json'))) stop('Elk --uitvoer-pad moet op .json eindigen.')
  return paden
}
