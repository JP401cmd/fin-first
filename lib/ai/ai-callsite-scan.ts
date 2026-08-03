// ── AI-callsite guardrail — static privacy scan ─────────────────────
//
// Enforces the sanitize-in contract (ADR 0035): every AI generation
// callsite that builds a prompt from application data MUST import
// `sanitizeForAI`/`sanitizeTransactions` before sending to the provider.
//
// This is a coarse import-level net — it proves the helper is imported,
// not that it runs on the exact path (combine with the per-route unit
// tests for that). It exists to make a NEW unsanitized callsite fail a
// test instead of silently leaking IBANs/names to the AI provider.
//
// Scope scanned:
//   - app/api/**/route.ts
//   - lib/ai/**/*.ts (excl. *.test.ts)
//   - lib/briefing/redactie.ts
//   - lib/aangifte/extract-aangifte-data.ts
//   - lib/news-enrich.ts
//
// A file is a "generation callsite" when it imports one of
// generateObject/streamText/streamObject/generateText from the `ai`
// package. Such a file must either import the sanitize helper OR appear
// on the motivated allowlist below.

import * as fs from 'fs'
import * as path from 'path'

/** The AI SDK generation functions whose presence marks a callsite. */
const GENERATION_FNS = ['generateObject', 'streamText', 'streamObject', 'generateText'] as const

export interface CallsiteAllowlistEntry {
  /** Repo-relative path, forward slashes. */
  file: string
  /** Why this callsite is exempt from the sanitize-import requirement. */
  reason: string
}

/**
 * Motivated allowlist. Each entry is a callsite that legitimately does
 * NOT import `sanitizeForAI` — with the reason it is safe. Keep this list
 * short and justified; adding an entry is a security decision.
 */
export const AI_CALLSITE_ALLOWLIST: CallsiteAllowlistEntry[] = [
  {
    file: 'lib/ai/screen-publish-metadata.ts',
    reason:
      'Publish-screener: moet de PII juist ZIEN om te kunnen detecteren; faalt closed (ADR 0035).',
  },
  {
    file: 'app/api/pension/parse/route.ts',
    reason:
      'Binaire PDF, niet betrouwbaar te strippen; verwerkt onder expliciete gelogde AVG-consent (ADR 0035).',
  },
  {
    file: 'app/api/report/route.ts',
    reason:
      'Prompt bevat uitsluitend geaggregeerde cijfers (geen rauwe transactie-/naam-velden).',
  },
  {
    file: 'lib/aangifte/extract-aangifte-data.ts',
    reason:
      'BSN- én huishoud-naam-strip gebeuren upstream in de aangifte-route vóór deze functie.',
  },
  {
    file: 'lib/news-enrich.ts',
    reason:
      'Server-side nieuwsbronnen (RSS/webpagina-tekst), geen gebruikers-PII in de prompt.',
  },
  {
    file: 'lib/ai/local/local-categorize-resolver.ts',
    reason:
      'On-device inferentie (Gemma 4 E2B/WebGPU), geen egress; sanitize zou legitiem on-device-signaal strippen (ADR 0043, FR-3.5).',
  },
  {
    file: 'lib/ai/local/local-briefing-resolver.ts',
    reason:
      'On-device briefing-redactie (Gemma 4 E2B/WebGPU), geen egress; de prompt bevat uitsluitend de eigen, deterministisch gecomposeerde briefjes (ADR 0043 §5).',
  },
  {
    file: 'lib/ai/local/local-vaste-kosten-resolver.ts',
    reason:
      'On-device vaste-kosten-analyse (Gemma 4 E2B/WebGPU), geen egress; de handelsnaam van de tegenpartij is juist het signaal dat de classificatie mogelijk maakt (ADR 0043, FR-3.5).',
  },
  {
    file: 'lib/ai/local/local-extraction-resolver.ts',
    reason:
      'On-device vrije-tekst-extractie (Gemma 4 E2B/WebGPU), geen egress; de tekst GÁÁT over de eigen situatie, dus saniteren zou juist het te extraheren signaal wegstrepen (ADR 0043 §5).',
  },
  {
    file: 'lib/ai/local/use-local-report-intro.ts',
    reason:
      'On-device rapport-inleiding (Gemma 4 E2B/WebGPU), geen egress; de prompt bevat — net als het cloud-pad in app/api/report/route.ts — uitsluitend geaggregeerde kerncijfers (ADR 0043 §5).',
  },
  {
    file: 'lib/hooks/use-whatif-suggestions.ts',
    reason:
      'On-device wat-als-suggesties (Gemma 4 E2B/WebGPU), geen egress; de prompt bevat alleen scenario-delta’s en gebeurtenisnamen, geen rauwe transactie-/naam-velden (ADR 0043 §5).',
  },
  {
    file: 'lib/aangifte/local/extract-aangifte-local.ts',
    reason:
      'On-device aangifte-extractie (Gemma 4 E2B/WebGPU), geen egress — de aangiftetekst verlaat het toestel niet. BSN-/naam-strip blijven upstream als defense-in-depth (ADR 0043 §5).',
  },
  {
    file: 'lib/ai/local/local-pension-resolver.ts',
    reason:
      'On-device pensioen-uitlezen (Gemma 4 E2B/WebGPU), geen egress — de UPO-tekstlaag verlaat het toestel niet. De aanroeper draait stripSensitiveData als goedkope hygiëne (ADR 0043 §5).',
  },
  {
    file: 'lib/ai/local/local-tips-resolver.ts',
    reason:
      'On-device aanbevelingen (Gemma 4 E2B/WebGPU), geen egress. De prompt bevat per call één doorgerekende kans; de titel draagt daarbij BEWUST een handelsnaam (tegenpartij uit de vaste-lasten-detectie) of een zelf ingetypte schuld-/bezitsnaam — net als bij local-vaste-kosten-resolver is dát juist het signaal waar de tip over gaat. Saniteren zou de kans onbenoembaar maken. Let op: het ARTEFACT (recommendations.title/description) wordt later wél door de cloud-context gelezen en gaat dáár door sanitizeForAI (ADR 0043 §5).',
  },
  {
    file: 'lib/ai/local/local-news-resolver.ts',
    reason:
      'On-device nieuwseditie (Gemma 4 E2B/WebGPU), geen egress. De prompt bevat publieke bronartikelen plus het compacte LocalChatOverview (geaggregeerde kerncijfers uit de rekenmotoren) — geen rauwe transactie-, tegenpartij- of naamvelden. Het cloudpad (app/api/news/route.ts) saniteert wél, juist omdát het profiel daar een externe provider bereikt (ADR 0043 §5, ADR 0080).',
  },
  {
    file: 'lib/ai/local/local-calculator-resolver.ts',
    reason:
      'On-device rekenhulp-bouwer (Gemma 4 E2B/WebGPU), geen egress. Het cloudpad (lib/ai/build-calculator.ts) saniteert de vraag wél — juist omdát die naar een externe provider gaat; hier verlaat de vraag het toestel niet, en saniteren zou de vraag onbruikbaar maken (die GÁÁT over de eigen situatie). Verder bevat de prompt alleen de 13 prefill-KEYS, geen prefill-waarden (ADR 0043 §5).',
  },
]

/**
 * True if the source imports an on-device generation entrypoint from the local
 * LiteRT-LM runtime: `loadModelSession` (transaction categorisation, ADR 0043)
 * or `createChatSession` (local Fin-chat, ADR 0043 §C1b). Both build a prompt
 * from application data and run inference locally on WebGPU/Gemma. They use
 * @litert-lm/core instead of the `ai` package, so the cloud-detector above
 * misses them — this marker brings such callsites under the same guardrail net.
 * On-device generation has no egress, so a matching lib/ai callsite belongs on
 * the allowlist (sanitize would strip legitimate signal). The generation itself
 * lives INSIDE litert-runtime.ts (which imports neither name), so the runtime
 * file is not flagged; this catches any future lib/ai consumer of that path.
 */
export function importsLocalGeneration(source: string): boolean {
  const re = /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]*litert-runtime['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    if (/\bloadModelSession\b|\bcreateChatSession\b/.test(m[1])) return true
  }
  return false
}

/** True if the source imports a generation function (cloud `ai`-SDK or on-device). */
export function importsGenerationFn(source: string): boolean {
  const re = /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"]ai['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const names = m[1]
    if (GENERATION_FNS.some((fn) => new RegExp(`\\b${fn}\\b`).test(names))) return true
  }
  return importsLocalGeneration(source)
}

/** True if the source imports sanitizeForAI/sanitizeTransactions from the sanitize helper. */
export function importsSanitizeHelper(source: string): boolean {
  const re = /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"]@\/lib\/ai\/sanitize['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    if (/\bsanitizeForAI\b|\bsanitizeTransactions\b/.test(m[1])) return true
  }
  return false
}

export interface CallsiteViolation {
  /** Repo-relative path of the offending callsite. */
  file: string
}

/** Extra individual files scanned outside the two directory sweeps. */
const EXTRA_FILES = [
  'lib/briefing/redactie.ts',
  'lib/aangifte/extract-aangifte-data.ts',
  // Het on-device aangifte-pad staat buiten lib/ai (het hoort bij het
  // aangifte-domein) maar is wél een generatie-callsite. Zonder deze regel valt
  // het door de mazen van de directory-sweep — precies het gat dat deze scan
  // hoort te dichten.
  'lib/aangifte/local/extract-aangifte-local.ts',
  // De lokale wat-als-suggesties draaien vanuit een hook in lib/hooks (de UI-naad
  // is daar, niet in lib/ai). Zonder deze regel is het een generatie-callsite die
  // de directory-sweep niet ziet — zelfde gat als bij het aangifte-pad hierboven.
  'lib/hooks/use-whatif-suggestions.ts',
  'lib/news-enrich.ts',
]

function walk(dir: string, onFile: (absPath: string) => void): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      walk(abs, onFile)
    } else if (entry.isFile()) {
      onFile(abs)
    }
  }
}

/** Collect every in-scope file path (absolute), de-duplicated. */
export function collectScannedFiles(root: string = process.cwd()): string[] {
  const files = new Set<string>()
  walk(path.join(root, 'app', 'api'), (fp) => {
    if (fp.endsWith('route.ts')) files.add(fp)
  })
  walk(path.join(root, 'lib', 'ai'), (fp) => {
    if (fp.endsWith('.ts') && !fp.endsWith('.test.ts')) files.add(fp)
  })
  for (const rel of EXTRA_FILES) files.add(path.join(root, ...rel.split('/')))
  return [...files]
}

/**
 * Scan all in-scope files and return every generation callsite that
 * neither imports the sanitize helper nor is allowlisted. Empty array =
 * the contract holds.
 */
export function scanAiCallsites(root: string = process.cwd()): CallsiteViolation[] {
  const allow = new Set(AI_CALLSITE_ALLOWLIST.map((e) => e.file))
  const violations: CallsiteViolation[] = []

  for (const abs of collectScannedFiles(root)) {
    let src: string
    try {
      src = fs.readFileSync(abs, 'utf-8')
    } catch {
      continue
    }
    if (!importsGenerationFn(src)) continue

    const rel = path.relative(root, abs).split(path.sep).join('/')
    if (allow.has(rel)) continue
    if (importsSanitizeHelper(src)) continue

    violations.push({ file: rel })
  }

  return violations
}
