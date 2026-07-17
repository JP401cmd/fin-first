// Meetharnas — UI-orkestratie. Kale functionele UI; dit is een meetinstrument,
// geen product. Het TriFinity-designsysteem is hier bewust niet van toepassing.
/// <reference types="vite/client" />

import { MODEL_REGISTRY, findEntry, type ModelEntry } from './registry.ts'
import { probeCapability, evaluateCapability, fmtBytes, type CapabilityReport } from './capability.ts'
import { loadModel, clearModelCache, type LoadedModel, type LoadOutcome, type ProgressSnapshot } from './loader.ts'
import { runDataset, type RunResult } from './runner.ts'
import { computeMetrics, type Metrics } from './metrics.ts'
import { buildDefaultBudgetOptions, coerceBudgetOptions, normalizeDatasetTransactions } from './budget-list.ts'
import { suggestMaxNewTokens } from './prompt.ts'
import type { DevSet, DevTransaction, OutputVariant, PromptVariant } from './types.ts'
import type { CategorizeBudgetOption } from '../../lib/ai/categorize-system-prompt.ts'
import devSetJson from './dataset/dev-set-v1.json'

const devSet = devSetJson as DevSet

// ── Dataset-bronnen ────────────────────────────────────────────────────────────
// dev-set-v1 = synthetisch, labels op de standaardboom (in de repo). goud-* =
// echte data van een andere agent, LOKAAL-ONLY (gitignored). Bij een goud-set
// schakelt de budgetlijst mee: promptlijst + slug-validatie + accuracy komen dan
// uit goud-budgets.json i.p.v. de standaardboom-afleiding.
type SourceKind = 'standaardboom' | 'goud'
type SourceDef = { id: string; label: string; kind: SourceKind; file?: string }

const SOURCES: SourceDef[] = [
  { id: 'dev-set-v1', label: 'dev-set-v1 — synthetisch (standaardboom)', kind: 'standaardboom' },
  { id: 'goud-set', label: 'goud-set — echt, ~7 tx (dun)', kind: 'goud', file: './dataset/goud-set.json' },
  { id: 'goud-set-replay', label: 'goud-set-replay — echt, 150–250 tx', kind: 'goud', file: './dataset/goud-set-replay.json' },
]

// Vite ontdekt de lokaal-aanwezige goud-bestanden statisch; ontbrekende bestanden
// staan simpelweg niet in de map → nette "niet aanwezig"-melding.
const goudLoaders = import.meta.glob('./dataset/goud-*.json')

type ActiveSource = {
  id: string
  label: string
  transactions: DevTransaction[]
  budgetOptions: CategorizeBudgetOption[]
  budgetLabel: string
}
let activeSource: ActiveSource | null = null

async function loadGoudJson(file: string): Promise<unknown> {
  const loader = goudLoaders[file]
  if (!loader) {
    throw new Error(`${file} niet aanwezig (lokaal-only, gitignored). Draai eerst "build:goud" bij de data-agent en herlaad de pagina.`)
  }
  const mod = (await loader()) as { default?: unknown }
  return mod?.default ?? mod
}

async function loadSource(id: string): Promise<ActiveSource> {
  const def = SOURCES.find((s) => s.id === id)
  if (!def) throw new Error(`Onbekende dataset-bron: ${id}`)

  if (def.kind === 'standaardboom') {
    return {
      id,
      label: def.label,
      transactions: devSet.transactions,
      budgetOptions: buildDefaultBudgetOptions(),
      budgetLabel: 'standaardboom (afgeleid uit lib/budget-data.ts)',
    }
  }

  const [txRaw, budgetsRaw] = await Promise.all([loadGoudJson(def.file as string), loadGoudJson('./dataset/goud-budgets.json')])
  return {
    id,
    label: def.label,
    transactions: normalizeDatasetTransactions(txRaw),
    budgetOptions: coerceBudgetOptions(budgetsRaw),
    budgetLabel: 'goud-budgets.json (echte budgetlijst bron-account)',
  }
}

// ── Stabiliteit (metriek 7) ───────────────────────────────────────────────────
const stability = { deviceLost: 0, uncaughtErrors: 0 }
window.addEventListener('error', () => {
  stability.uncaughtErrors++
  renderStability()
})
window.addEventListener('unhandledrejection', () => {
  stability.uncaughtErrors++
  renderStability()
})
// Probe-device om WebGPU device-lost te tellen (los van het model-device).
;(async () => {
  try {
    const gpu = (navigator as unknown as { gpu?: GPU }).gpu
    const adapter = gpu ? await gpu.requestAdapter() : null
    const device = adapter ? await adapter.requestDevice() : null
    device?.lost.then(() => {
      stability.deviceLost++
      renderStability()
    })
  } catch {
    /* geen probe-device */
  }
})()

// ── Globale run-state ─────────────────────────────────────────────────────────
let capReport: CapabilityReport | null = null
let loaded: LoadedModel | null = null
let lastLoad: LoadOutcome | null = null
// laadtijden per model-id bijhouden voor cold/warm-vergelijking
const loadTimes: Record<string, { cold?: number; warm?: number }> = {}
let lastRun: RunResult | null = null
let lastMetrics: Metrics | null = null
let lastRunSource: { id: string; label: string; budgetLabel: string; options: number } | null = null

// ── Helpers ───────────────────────────────────────────────────────────────────
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
}
function verdictClass(v: 'PASS' | 'WARN' | 'FAIL'): string {
  return v === 'PASS' ? 'pass' : v === 'WARN' ? 'warn' : 'fail'
}
function num(n: number | null, digits = 1, suffix = ''): string {
  return n == null ? '—' : `${n.toFixed(digits)}${suffix}`
}

// ── 1 · Capability ─────────────────────────────────────────────────────────────
async function renderCapability(): Promise<void> {
  capReport = await probeCapability()
  const entry = findEntry($<HTMLSelectElement>('model-select').value)
  const rows = evaluateCapability(capReport, entry)
  $('capability-body').innerHTML = `
    <table><thead><tr><th>Check</th><th>Waarde</th><th>Oordeel</th></tr></thead><tbody>
    ${rows
      .map(
        (r) =>
          `<tr><td>${esc(r.label)}</td><td class="mono-wrap">${esc(r.value)}</td><td class="${verdictClass(r.verdict)}">${r.verdict}</td></tr>`,
      )
      .join('')}
    </tbody></table>
    <div class="muted" style="margin-top:8px">GPU-features: ${capReport.features.length ? esc(capReport.features.join(', ')) : '—'}</div>`
}

// ── 2 · Loader ─────────────────────────────────────────────────────────────────
function populateModelSelect(): void {
  const sel = $<HTMLSelectElement>('model-select')
  sel.innerHTML = MODEL_REGISTRY.map((m) => `<option value="${m.id}">${esc(m.label)}</option>`).join('')
  sel.addEventListener('change', () => {
    void renderCapability()
    updateLoadWarning(findEntry(sel.value))
  })
  updateLoadWarning(findEntry(sel.value))
}

function updateLoadWarning(entry: ModelEntry): void {
  $('load-warning').textContent = `⚠ ${entry.repo} — geschatte download ~${entry.approxDownloadGB.toFixed(1)} GB. ${entry.note}`
}

async function onLoad(): Promise<void> {
  const entry = findEntry($<HTMLSelectElement>('model-select').value)
  const bar = $('load-bar')
  const status = $('load-status')
  $<HTMLButtonElement>('load-btn').disabled = true
  bar.style.width = '0%'
  status.textContent = 'Laden…'

  const onProgress = (s: ProgressSnapshot) => {
    bar.style.width = `${s.percent.toFixed(1)}%`
    status.textContent = `Downloaden/laden: ${fmtBytes(s.loaded)}${s.total ? ` / ${fmtBytes(s.total)}` : ''} (${s.percent.toFixed(1)}%, ${s.fileCount} bestanden)`
  }

  try {
    const outcome = await loadModel(entry, onProgress)
    loaded = outcome.model
    lastLoad = outcome
    const kind = outcome.wasCached ? 'warm' : 'cold'
    loadTimes[entry.id] = loadTimes[entry.id] ?? {}
    loadTimes[entry.id][kind] = outcome.loadMs
    bar.style.width = '100%'
    const lt = loadTimes[entry.id]
    status.innerHTML = `Geladen (${kind}). Laadtijd ${(outcome.loadMs / 1000).toFixed(2)} s · download ${fmtBytes(outcome.downloadBytes)}.
      <span class="muted">cold: ${lt.cold != null ? (lt.cold / 1000).toFixed(2) + ' s' : '—'} · warm: ${lt.warm != null ? (lt.warm / 1000).toFixed(2) + ' s' : '—'}</span>`
    $<HTMLButtonElement>('run-btn').disabled = false
    $('run-status').textContent = 'Klaar om te draaien.'
    renderDownloadBreakdown(outcome)
  } catch (e) {
    status.innerHTML = `<span class="fail">Laden mislukt: ${esc(e instanceof Error ? e.message : String(e))}</span>`
  } finally {
    $<HTMLButtonElement>('load-btn').disabled = false
  }
}

function renderDownloadBreakdown(outcome: LoadOutcome): void {
  if (!outcome.perFile.length) return
  $('download-details').style.display = 'block'
  $('download-body').innerHTML = `<div class="muted" style="margin:6px 0">Totaal ${fmtBytes(outcome.downloadBytes)} over ${outcome.perFile.length} bestand(en). Verwacht bij tekst-only q4f16: embed_tokens ~1,59 GB + decoder ~1,52 GB. Onverwacht grote fp16/fp32-shards wijzen op een dtype-terugval.</div>
    <table><thead><tr><th>bestand</th><th>bytes</th></tr></thead><tbody>
    ${outcome.perFile
      .map((f) => `<tr><td class="mono-wrap">${esc(f.file)}</td><td>${fmtBytes(f.loaded)}</td></tr>`)
      .join('')}
    </tbody></table>`
}

async function onClearCache(): Promise<void> {
  const n = await clearModelCache()
  $('load-status').textContent = `Cache gewist (${n} cache(s) verwijderd). Volgende laad is weer "cold".`
}

// ── 3 · Runner ─────────────────────────────────────────────────────────────────
function currentBatchSize(): number {
  return Math.max(1, Math.min(100, Number($<HTMLInputElement>('batch-size').value) || 20))
}
function currentOutput(): OutputVariant {
  return $<HTMLSelectElement>('output-select').value as OutputVariant
}

/** Vul max_new_tokens automatisch in op basis van uitvoervariant + batchgrootte. */
function refreshSuggestedTokens(): void {
  const suggested = suggestMaxNewTokens(currentBatchSize(), currentOutput())
  $<HTMLInputElement>('max-tokens').value = String(suggested)
  $('max-tokens-auto').textContent = `auto: ${suggested}`
}

async function onDatasetChange(): Promise<void> {
  const id = $<HTMLSelectElement>('dataset-select').value
  const status = $('dataset-status')
  status.textContent = `Dataset "${id}" laden…`
  try {
    activeSource = await loadSource(id)
    status.innerHTML = `Actief: <b>${esc(activeSource.label)}</b> · ${activeSource.transactions.length} transacties · budgetlijst ${activeSource.budgetOptions.length} opties (${esc(activeSource.budgetLabel)}).`
    refreshSuggestedTokens()
  } catch (e) {
    activeSource = null
    status.innerHTML = `<span class="fail">${esc(e instanceof Error ? e.message : String(e))}</span>`
  }
}

async function onRun(): Promise<void> {
  if (!loaded) return
  if (!activeSource) {
    $('run-status').innerHTML = `<span class="fail">Geen dataset actief — kies/laad eerst een dataset.</span>`
    return
  }
  const source = activeSource
  const batchSize = currentBatchSize()
  const maxNewTokens = Math.max(128, Math.min(4096, Number($<HTMLInputElement>('max-tokens').value) || 1600))
  const variant = $<HTMLSelectElement>('variant-select').value as PromptVariant
  const output = currentOutput()
  const bar = $('run-bar')
  const status = $('run-status')
  $<HTMLButtonElement>('run-btn').disabled = true
  bar.style.width = '0%'
  status.textContent = `Draaien (${source.label}: ${source.transactions.length} tx, batch ${batchSize}, ${variant}/${output}, max_new_tokens ${maxNewTokens})…`

  try {
    const result = await runDataset({
      model: loaded,
      transactions: source.transactions,
      options: source.budgetOptions,
      batchSize,
      variant,
      output,
      maxNewTokens,
      onProgress: (done, total, last) => {
        bar.style.width = `${((done / total) * 100).toFixed(1)}%`
        status.textContent = `Batch ${(last?.index ?? 0) + 1} klaar · ${done}/${total} tx · TTFT ${num(last?.ttftMs ?? null, 0, ' ms')} · ${num(last?.decodeTokPerSec ?? null, 1, ' tok/s')}`
      },
    })
    lastRun = result
    lastMetrics = computeMetrics(result.txResults, result.batches)
    lastRunSource = { id: source.id, label: source.label, budgetLabel: source.budgetLabel, options: source.budgetOptions.length }
    renderReport()
    status.textContent = `Klaar. ${result.batches.length} batches gedraaid.`
    $<HTMLButtonElement>('export-btn').disabled = false
  } catch (e) {
    status.innerHTML = `<span class="fail">Run mislukt: ${esc(e instanceof Error ? e.message : String(e))}</span>`
  } finally {
    $<HTMLButtonElement>('run-btn').disabled = false
  }
}

// ── 4 · Rapport ────────────────────────────────────────────────────────────────
function renderStability(): void {
  $('stability').innerHTML = `<b>Stabiliteit (metriek 7):</b> device-lost-events: <span class="${stability.deviceLost ? 'fail' : 'pass'}">${stability.deviceLost}</span> · uncaught errors: <span class="${stability.uncaughtErrors ? 'warn' : 'pass'}">${stability.uncaughtErrors}</span>`
}

function renderReport(): void {
  if (!lastMetrics || !lastRun) return
  const m = lastMetrics
  const txr = lastRun.txResults

  // Randgeval-tegel: goud-sets hebben geen edge-markeringen → "n.v.t." i.p.v. NaN/—.
  const edgeCount = txr.filter((t) => t.edge_case).length
  const edgeDisplay = edgeCount ? num(m.edgeCaseAccuracy, 1, '%') : 'n.v.t.'

  // Accuracy per bron: alleen zinvol op goud-sets (manual = sterkste ground truth).
  const withBron = txr.filter((t) => t.bron)
  const bronRow = withBron.length
    ? `<tr><td>Accuracy per bron</td><td>${(['manual', 'ai'] as const)
        .map((g) => {
          const arr = txr.filter((t) => t.bron === g)
          if (!arr.length) return `${g}: —`
          const corr = arr.filter((t) => t.correct).length
          return `<b>${g}</b>: ${((corr / arr.length) * 100).toFixed(1)}% (${corr}/${arr.length})`
        })
        .join(' · ')}</td></tr>`
    : `<tr><td>Accuracy per bron</td><td class="muted">n.v.t. (dataset zonder bron-veld)</td></tr>`

  const sourceRow = lastRunSource
    ? `<tr><td>Dataset / budgetlijst</td><td>${esc(lastRunSource.label)} · budgetlijst ${lastRunSource.options} opties (${esc(lastRunSource.budgetLabel)})</td></tr>`
    : ''

  $('metrics').innerHTML = `
    <div style="margin-bottom:12px">
      <span class="kpi"><b>${num(m.accuracy, 1, '%')}</b><span>Accuracy (metriek 1)</span></span>
      <span class="kpi"><b>${num(m.validityPct, 1, '%')}</b><span>Output-validiteit (9)</span></span>
      <span class="kpi"><b>${edgeDisplay}</b><span>Accuracy randgevallen</span></span>
      <span class="kpi"><b>${num(m.throughput.avgDecodeTokPerSec, 1)}</b><span>tok/s decode (6)</span></span>
      <span class="kpi"><b>${num(m.throughput.avgTtftMs, 0, ' ms')}</b><span>gem. TTFT (6)</span></span>
    </div>
    <table><tbody>
      ${sourceRow}
      <tr><td>Correct / totaal</td><td>${txr.filter((t) => t.correct).length} / ${m.total}</td></tr>
      <tr><td>Accuracy op geldige output</td><td>${num(m.accuracyOnValid, 1, '%')}</td></tr>
      ${bronRow}
      <tr><td>Kalibratie — confidence ≥ 0.5</td><td>${num(m.calibration.highConf.correctPct, 1, '%')} correct (n=${m.calibration.highConf.n})</td></tr>
      <tr><td>Kalibratie — confidence &lt; 0.5</td><td>${num(m.calibration.lowConf.correctPct, 1, '%')} correct (n=${m.calibration.lowConf.n})</td></tr>
      <tr><td>Totale wandkloktijd</td><td>${(m.throughput.totalWallMs / 1000).toFixed(2)} s over ${m.throughput.batches} batches</td></tr>
      <tr><td>Gegenereerde tokens (totaal)</td><td>${m.throughput.totalGeneratedTokens}</td></tr>
      <tr><td>Prompt / uitvoer</td><td>${lastRun.variant} / ${lastRun.output} · systeemprompt ${lastRun.systemPromptChars} tekens</td></tr>
    </tbody></table>`

  // Per-batch — met diagnose-vlaggen voor de validiteits-analyse (metriek 9)
  $('batches-details').style.display = 'block'
  $('batches-body').innerHTML = `<table><thead><tr><th>#</th><th>n</th><th>TTFT</th><th>tok/s</th><th>wand (s)</th><th>in-tok</th><th>gen-tok</th><th>parse</th><th>items</th><th>diagnose</th></tr></thead><tbody>
    ${lastRun.batches
      .map((b) => {
        const d = b.diagnostics
        const flags = [
          d.hadFence ? 'fence' : '',
          d.hadThink ? 'think' : '',
          d.truncated ? 'afgekapt' : '',
          d.salvaged ? 'geborgen' : '',
        ]
          .filter(Boolean)
          .join(', ')
        return `<tr><td>${b.index + 1}</td><td>${b.size}</td><td>${num(b.ttftMs, 0, ' ms')}</td><td>${num(b.decodeTokPerSec, 1)}</td><td>${(b.wallMs / 1000).toFixed(2)}</td><td>${b.inputTokens}</td><td>${b.generatedTokens}</td><td class="${b.parseOk ? 'pass' : 'fail'}">${b.parseOk ? 'ok' : 'FAIL'}</td><td>${d.itemCount}/${d.expectedCount}</td><td class="${flags.includes('afgekapt') ? 'warn' : 'muted'}">${esc(flags) || '—'}</td></tr>`
      })
      .join('')}
    </tbody></table>`

  // Per-transactie
  $('tx-details').style.display = 'block'
  $('tx-body').innerHTML = `<table><thead><tr><th>id</th><th>bron</th><th>verwacht</th><th>gekregen</th><th>gevalideerd</th><th>conf</th><th>ok</th><th>geldig</th><th>edge</th></tr></thead><tbody>
    ${lastRun.txResults
      .map(
        (t) =>
          `<tr><td>${esc(t.id)}</td><td class="muted">${t.bron ?? '—'}</td><td>${esc(String(t.expected))}</td><td>${esc(String(t.rawSlug))}</td><td>${esc(String(t.validatedSlug))}</td><td>${t.confidence.toFixed(2)}</td><td class="${t.correct ? 'pass' : 'fail'}">${t.correct ? '✓' : '✗'}</td><td class="${t.valid ? 'pass' : 'fail'}">${t.valid ? '✓' : '✗'}</td><td>${t.edge_case ? '●' : ''}</td></tr>`,
      )
      .join('')}
    </tbody></table>`
}

function buildReportObject() {
  const entry = loaded?.entry
  return {
    generatedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    dataset: lastRunSource ? { id: lastRunSource.id, label: lastRunSource.label } : { id: 'onbekend', label: 'onbekend' },
    budgetSource: lastRunSource ? { label: lastRunSource.budgetLabel, options: lastRunSource.options } : null,
    capability: capReport,
    stability,
    model: entry
      ? { id: entry.id, repo: entry.repo, kind: entry.kind, dtype: entry.dtype, device: entry.device }
      : null,
    load: lastLoad
      ? {
          loadMs: lastLoad.loadMs,
          wasCached: lastLoad.wasCached,
          downloadBytes: lastLoad.downloadBytes,
          coldWarm: loadTimes[entry?.id ?? ''],
          perFile: lastLoad.perFile,
        }
      : null,
    run: lastRun
      ? {
          variant: lastRun.variant,
          output: lastRun.output,
          batchSize: lastRun.batchSize,
          systemPromptChars: lastRun.systemPromptChars,
        }
      : null,
    metrics: lastMetrics,
    batches: lastRun?.batches ?? [],
    transactions: lastRun?.txResults ?? [],
  }
}

async function onExport(): Promise<void> {
  const json = JSON.stringify(buildReportObject(), null, 2)
  const statusEl = $('export-status')
  try {
    await navigator.clipboard.writeText(json)
    statusEl.textContent = 'Gekopieerd naar klembord.'
  } catch {
    statusEl.textContent = 'Klembord niet beschikbaar — bestand wordt gedownload.'
  }
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `meetrapport-${loaded?.entry.id ?? 'onbekend'}-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Init ───────────────────────────────────────────────────────────────────────
function populateDatasetSelect(): void {
  $<HTMLSelectElement>('dataset-select').innerHTML = SOURCES.map(
    (s) => `<option value="${s.id}">${esc(s.label)}</option>`,
  ).join('')
}

function init(): void {
  populateModelSelect()
  populateDatasetSelect()
  renderStability()
  void renderCapability()
  $('load-btn').addEventListener('click', () => void onLoad())
  $('clear-cache-btn').addEventListener('click', () => void onClearCache())
  $('run-btn').addEventListener('click', () => void onRun())
  $('export-btn').addEventListener('click', () => void onExport())
  $('dataset-select').addEventListener('change', () => void onDatasetChange())
  // max_new_tokens automatisch mee laten bewegen met uitvoervariant + batchgrootte.
  $('output-select').addEventListener('change', refreshSuggestedTokens)
  $('batch-size').addEventListener('change', refreshSuggestedTokens)
  refreshSuggestedTokens()
  // Standaardbron (dev-set-v1) meteen laden.
  void onDatasetChange()
}

init()
