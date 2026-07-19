// Meetharnas — UI-orkestratie voor de LiteRT-LM-runtime. Kale functionele UI; dit
// is een meetinstrument, geen product. Het TriFinity-designsysteem is hier bewust
// niet van toepassing.
//
// Twee bedieningswijzen:
//   1. Handmatig: knoppen Download/Init → Run (met N-runs + batchgrootte).
//   2. Auto (Playwright): ?autorun=1&runs=N&batch=10 → init + N runs zonder
//      interactie; alle meetdata verschijnt als `[metric] …`-regels in de console.
/// <reference types="vite/client" />

import { clearModelCache, initEngine, isModelCached, type InitOutcome, type LitertEngine } from './litert-engine.ts'
import { runDatasetOnce, type LitertRunResult } from './runner.ts'
import { DEFAULT_BATCH_SIZE, DEFAULT_RUNS } from './litert-config.ts'
import { metric } from './metric.ts'
import { buildDefaultBudgetOptions } from '../lokale-categorisatie/budget-list.ts'
import type { CategorizeBudgetOption } from '../../lib/ai/categorize-system-prompt.ts'
import type { DevSet } from '../lokale-categorisatie/types.ts'
import devSetJson from '../lokale-categorisatie/dataset/dev-set-v1.json'

const devSet = devSetJson as DevSet

// ── DOM-helpers ─────────────────────────────────────────────────────────────────
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
}
function setState(state: 'idle' | 'loading' | 'ready' | 'running' | 'done' | 'error'): void {
  // Playwright wacht op body[data-state="done"] (of "error") om de run af te ronden.
  document.body.dataset.state = state
}
function num(n: number | null | undefined, digits = 1, suffix = ''): string {
  return n == null || !Number.isFinite(n) ? '—' : `${n.toFixed(digits)}${suffix}`
}

// ── Globale run-state ─────────────────────────────────────────────────────────
let engine: LitertEngine | null = null
let lastInit: InitOutcome | null = null
// Actieve dataset + budgetopties — default de synthetische dev-set; via
// ?set=goud-replay vervangen door de gouden set (zie loadGoldenSet in boot()).
let activeSet: DevSet = devSet
let budgetOptions: CategorizeBudgetOption[] = buildDefaultBudgetOptions()
const runSummaries: { run: number; result: LitertRunResult }[] = []

// ── Stabiliteit: uncaught fouten tellen + loggen ────────────────────────────────
const stability = { uncaughtErrors: 0 }
window.addEventListener('error', (ev) => {
  stability.uncaughtErrors++
  metric('error', { where: 'window.error', message: String(ev.message ?? ev.error ?? 'onbekend') })
})
window.addEventListener('unhandledrejection', (ev) => {
  stability.uncaughtErrors++
  metric('error', { where: 'unhandledrejection', message: String((ev as PromiseRejectionEvent).reason ?? 'onbekend') })
})

// ── Query-params (auto-modus) ───────────────────────────────────────────────────
function params(): { autorun: boolean; runs: number; batch: number; set: 'dev' | 'goud-replay' } {
  const q = new URLSearchParams(location.search)
  const runs = Math.max(1, Math.min(50, Number(q.get('runs')) || DEFAULT_RUNS))
  const batch = Math.max(1, Math.min(100, Number(q.get('batch')) || DEFAULT_BATCH_SIZE))
  const set = q.get('set') === 'goud-replay' ? 'goud-replay' : 'dev'
  return { autorun: q.get('autorun') === '1', runs, batch, set }
}

/**
 * Gouden-set-lading (?set=goud-replay): de tijdreis-replay-set (250 échte
 * residu-transacties) + de échte budgetlijst van het bron-account. Beide staan
 * als lokaal gegenereerde, gitignorede bestanden in public/dataset/ (nooit in
 * het repo — fase-0-regel). Het go/no-go-instrument; de dev-set blijft default.
 */
async function loadGoldenSet(): Promise<{ set: DevSet; options: CategorizeBudgetOption[] }> {
  const [setRes, budRes] = await Promise.all([
    fetch('/dataset/goud-set-replay.json'),
    fetch('/dataset/goud-budgets.json'),
  ])
  if (!setRes.ok || !budRes.ok) {
    throw new Error(
      `gouden set ontbreekt (set ${setRes.status}, budgets ${budRes.status}) — genereer via build:goud en kopieer naar public/dataset/`,
    )
  }
  return { set: (await setRes.json()) as DevSet, options: (await budRes.json()) as CategorizeBudgetOption[] }
}

// ── Capability (lichte WebGPU-check, puur ter info) ─────────────────────────────
async function renderCapability(): Promise<void> {
  const nav = navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }
  const body = $('capability-body')
  if (!nav.gpu) {
    body.innerHTML = `<span class="fail">WebGPU (navigator.gpu) ONTBREEKT — geen secure context of WebGPU uit.</span>`
    metric('capability', { webgpu: false })
    return
  }
  try {
    const adapter = (await nav.gpu.requestAdapter()) as { info?: Record<string, string>; features?: Set<string> } | null
    const info = adapter?.info ?? {}
    const shaderF16 = adapter?.features?.has?.('shader-f16') ?? false
    body.innerHTML = adapter
      ? `<span class="pass">WebGPU aanwezig</span> · ${esc([info.vendor, info.architecture, info.description].filter(Boolean).join(' · ') || 'adapter beschikbaar')} · shader-f16: ${shaderF16 ? 'ja' : 'nee'}`
      : `<span class="warn">WebGPU aanwezig maar geen adapter (requestAdapter → null).</span>`
    metric('capability', { webgpu: true, adapter: Boolean(adapter), vendor: info.vendor ?? null, architecture: info.architecture ?? null, shaderF16 })
  } catch (e) {
    body.innerHTML = `<span class="warn">Capability-probe faalde: ${esc(e instanceof Error ? e.message : String(e))}</span>`
    metric('capability', { webgpu: true, error: e instanceof Error ? e.message : String(e) })
  }
}

// ── Init (Download/Init) ─────────────────────────────────────────────────────────
async function onInit(): Promise<void> {
  const bar = $('load-bar')
  const status = $('load-status')
  $<HTMLButtonElement>('init-btn').disabled = true
  setState('loading')
  bar.style.width = '0%'
  const cached = await isModelCached()
  status.textContent = cached ? 'Laden uit cache (warm)…' : 'Downloaden + initialiseren (cold, ~2 GB)…'

  try {
    const outcome = await initEngine((loaded, total) => {
      const pct = total > 0 ? (loaded / total) * 100 : 0
      bar.style.width = `${pct.toFixed(1)}%`
      status.textContent = `${sourceLabel(cached)}: ${(loaded / 1e9).toFixed(2)} GB${total ? ` / ${(total / 1e9).toFixed(2)} GB` : ''} (${pct.toFixed(1)}%)`
    })
    engine = outcome.engine
    lastInit = outcome
    bar.style.width = '100%'
    status.innerHTML = `Geïnitialiseerd (<b>${outcome.source}</b>). download/lees ${(outcome.downloadMs / 1000).toFixed(2)} s · init ${(outcome.initMs / 1000).toFixed(2)} s · ${(outcome.loadedBytes / 1e9).toFixed(2)} GB.`
    $<HTMLButtonElement>('run-btn').disabled = false
    $('run-status').textContent = 'Klaar om te draaien.'
    setState('ready')
  } catch (e) {
    status.innerHTML = `<span class="fail">Init mislukt: ${esc(e instanceof Error ? e.message : String(e))}</span>`
    setState('error')
  } finally {
    $<HTMLButtonElement>('init-btn').disabled = false
  }
}

// Statuslabel: op het moment van de progress-callback weten we cold/warm nog niet
// zeker (dat komt uit de outcome), dus we leunen op de vooraf-gemeten cache-check.
function sourceLabel(cached: boolean): string {
  return cached ? 'Cache-lees' : 'Download'
}

async function onClearCache(): Promise<void> {
  const ok = await clearModelCache()
  $('load-status').textContent = ok ? 'Cache gewist — volgende init is weer "cold".' : 'Geen cache om te wissen.'
}

// ── Runs ────────────────────────────────────────────────────────────────────────
function currentRuns(): number {
  return Math.max(1, Math.min(50, Number($<HTMLInputElement>('runs-input').value) || DEFAULT_RUNS))
}
function currentBatch(): number {
  return Math.max(1, Math.min(100, Number($<HTMLInputElement>('batch-input').value) || DEFAULT_BATCH_SIZE))
}

async function onRun(): Promise<void> {
  if (!engine) return
  const runs = currentRuns()
  const batchSize = currentBatch()
  const bar = $('run-bar')
  const status = $('run-status')
  $<HTMLButtonElement>('run-btn').disabled = true
  setState('running')
  runSummaries.length = 0

  try {
    for (let r = 1; r <= runs; r++) {
      bar.style.width = '0%'
      status.textContent = `Run ${r}/${runs} — ${activeSet.transactions.length} tx, batch ${batchSize} (kort)…`
      const result = await runDatasetOnce({
        engine,
        transactions: activeSet.transactions,
        options: budgetOptions,
        batchSize,
        runIndex: r,
        onProgress: (doneTx, total, last) => {
          bar.style.width = `${((doneTx / total) * 100).toFixed(1)}%`
          status.textContent = `Run ${r}/${runs} · batch ${(last?.index ?? 0) + 1} · ${doneTx}/${total} tx · TTFT ${num(last?.ttftMs ?? null, 0, ' ms')} · ${num(last?.decodeTokPerSec ?? null, 1, ' tok/s')}`
        },
      })
      runSummaries.push({ run: r, result })
      renderResults()
    }
    status.textContent = `Klaar — ${runs} run(s) gedraaid.`
    metric('done', { runs, batchSize, uncaughtErrors: stability.uncaughtErrors })
    setState('done')
  } catch (e) {
    status.innerHTML = `<span class="fail">Run mislukt: ${esc(e instanceof Error ? e.message : String(e))}</span>`
    metric('error', { where: 'onRun', message: e instanceof Error ? e.message : String(e) })
    setState('error')
  } finally {
    $<HTMLButtonElement>('run-btn').disabled = false
  }
}

function renderResults(): void {
  if (!runSummaries.length) return
  const rows = runSummaries
    .map(({ run, result }) => {
      const txr = result.txResults
      const correct = txr.filter((t) => t.correct).length
      const valid = txr.filter((t) => t.valid).length
      const acc = txr.length ? (correct / txr.length) * 100 : 0
      const validity = txr.length ? (valid / txr.length) * 100 : 0
      const wall = result.batches.reduce((s, b) => s + b.wallMs, 0)
      const ttfts = result.batches.map((b) => b.ttftMs).filter((v): v is number => v != null)
      const avgTtft = ttfts.length ? ttfts.reduce((a, b) => a + b, 0) / ttfts.length : null
      const rates = result.batches.map((b) => b.decodeTokPerSec).filter((v): v is number => v != null)
      const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null
      return `<tr><td>${run}</td><td>${num(acc, 1, '%')}</td><td>${correct}/${txr.length}</td><td>${num(validity, 1, '%')}</td><td>${num(avgTtft, 0, ' ms')}</td><td>${num(avgRate, 1)}</td><td>${(wall / 1000).toFixed(1)} s</td></tr>`
    })
    .join('')
  $('results').innerHTML = `<table><thead><tr><th>run</th><th>accuracy</th><th>correct</th><th>validiteit</th><th>gem. TTFT</th><th>tok/s</th><th>wandklok</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="muted" style="margin-top:6px">Volledige, machine-leesbare meetdata staat in de console als <code>[metric] …</code>-regels.</div>`
}

// ── Init ─────────────────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  const p = params()
  $<HTMLInputElement>('runs-input').value = String(p.runs)
  $<HTMLInputElement>('batch-input').value = String(p.batch)

  if (p.set === 'goud-replay') {
    try {
      const golden = await loadGoldenSet()
      activeSet = golden.set
      budgetOptions = golden.options
      metric('dataset', { set: 'goud-replay', tx: activeSet.transactions.length, budgetOptions: budgetOptions.length })
    } catch (e) {
      $('dataset-status').innerHTML = `<span class="fail">${esc(e instanceof Error ? e.message : String(e))}</span>`
      metric('error', { where: 'loadGoldenSet', message: e instanceof Error ? e.message : String(e) })
      setState('error')
      return
    }
  }
  $('dataset-status').innerHTML = `Dataset: <b>${esc(activeSet.version)}</b> · ${activeSet.transactions.length} transacties · budgetlijst ${budgetOptions.length} opties${p.set === 'goud-replay' ? ' (gouden set — échte budgetlijst)' : ' (standaardboom)'}.`

  $('init-btn').addEventListener('click', () => void onInit())
  $('clear-cache-btn').addEventListener('click', () => void onClearCache())
  $('run-btn').addEventListener('click', () => void onRun())

  await renderCapability()
  setState('idle')

  if (p.autorun) {
    // Auto-modus: init → runs, zonder verdere interactie.
    await onInit()
    if (engine) await onRun()
  }
}

void boot()
