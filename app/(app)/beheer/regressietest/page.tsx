'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Play, ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertTriangle,
  SkipForward, Clock, Download, RotateCcw, Loader2, Activity,
  TrendingUp, LineChart, ArrowDownToLine, Calculator, LayoutGrid,
  Tag, Shield, Wand2, Navigation,
} from 'lucide-react'
import type { TestReport, TestResult, TestCategory } from '@/lib/regression-tests/test-types'
import { loadAllTests, getCategories } from '@/lib/regression-tests/test-registry'
import { getTestSessionStatus, REGRESSION_TEST_EMAIL } from '@/lib/regression-tests/test-session'

// ── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'fintwo-regression-report'

const ICON_MAP: Record<string, React.ElementType> = {
  TrendingUp, LineChart, ArrowDownToLine, Calculator, LayoutGrid,
  Tag, Shield, Wand2, Activity, Navigation,
}

/** Dutch display labels for module groups (first segment of dot-notation category IDs) */
const MODULE_LABELS: Record<string, string> = {
  'kern': 'De Kern',
  'horizon': 'De Horizon',
  'wil': 'De Wil',
  'widgets': 'Widgets',
  'identiteit': 'Identiteit',
  'onboarding': 'Onboarding',
  'beheer': 'Beheer',
  'berichten': 'Berichten',
  'checkin': 'Check-in',
  'rapportages': 'Rapportages',
  'cross-cutting': 'Cross-cutting',
  'security': 'Security',
  'performance': 'Performance',
  'data': 'Data',
}

// ── Types ───────────────────────────────────────────────────────────────────

type ModuleGroup = {
  module: string
  label: string
  categories: TestCategory[]
  totalTests: number
}

/** Shape of each NDJSON line from the server */
type StreamLine =
  | { type: 'result'; data: TestResult }
  | { type: 'report'; data: TestReport }
  | { type: 'error'; message: string }

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Parse a dot-notation category ID into module and area segments */
function parseModule(categoryId: string): { module: string; area: string } {
  const dotIdx = categoryId.indexOf('.')
  if (dotIdx === -1) return { module: categoryId, area: '' }
  return { module: categoryId.slice(0, dotIdx), area: categoryId.slice(dotIdx + 1) }
}

function statusIcon(status: TestResult['status']) {
  switch (status) {
    case 'pass': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    case 'fail': return <XCircle className="h-4 w-4 text-red-500" />
    case 'error': return <AlertTriangle className="h-4 w-4 text-amber-500" />
    case 'skip': return <SkipForward className="h-4 w-4 text-[var(--ink-4)]" />
  }
}

function statusLabel(status: TestResult['status']) {
  switch (status) {
    case 'pass': return 'Geslaagd'
    case 'fail': return 'Gefaald'
    case 'error': return 'Fout'
    case 'skip': return 'Overgeslagen'
  }
}

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// ── Server-side test execution via NDJSON stream ────────────────────────────

/**
 * Call POST /api/regression/run and stream NDJSON results.
 * Calls onResult for each TestResult line and returns the final TestReport.
 */
async function executeServerTests(
  categories: string[] | undefined,
  onResult: (result: TestResult, completed: number, total: number) => void,
  abortSignal?: AbortSignal,
): Promise<TestReport> {
  const body: Record<string, unknown> = {}
  if (categories && categories.length > 0) {
    body.categories = categories
  }

  const response = await fetch('/api/regression/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: abortSignal,
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: 'Onbekende fout' }))
    throw new Error(errorBody.error || `Server returned ${response.status}`)
  }

  if (!response.body) {
    throw new Error('Geen streaming response ontvangen van de server')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let resultCount = 0
  let finalReport: TestReport | null = null

  // We don't know the total upfront from the stream, so we estimate
  // based on the test count from the loaded registry. The server sends
  // the real total as part of the report at the end.
  const estimatedTotal = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    // Keep the last incomplete line in the buffer
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const parsed: StreamLine = JSON.parse(line)
        if (parsed.type === 'result') {
          resultCount++
          onResult(parsed.data, resultCount, estimatedTotal || resultCount)
        } else if (parsed.type === 'report') {
          finalReport = parsed.data
        } else if (parsed.type === 'error') {
          throw new Error(parsed.message)
        }
      } catch (parseErr) {
        // If it's a re-thrown error from an 'error' line, propagate it
        if (parseErr instanceof Error && !parseErr.message.startsWith('Unexpected')) {
          throw parseErr
        }
        // Otherwise skip malformed lines
        console.warn('[regressietest] Ongeldige NDJSON regel:', line)
      }
    }
  }

  // Process any remaining buffer content
  if (buffer.trim()) {
    try {
      const parsed: StreamLine = JSON.parse(buffer)
      if (parsed.type === 'report') {
        finalReport = parsed.data
      } else if (parsed.type === 'error') {
        throw new Error(parsed.message)
      }
    } catch {
      // Ignore incomplete final line
    }
  }

  if (!finalReport) {
    throw new Error('Geen rapport ontvangen van de server')
  }

  return finalReport
}

// ── Component ───────────────────────────────────────────────────────────────

export default function RegressietestPage() {
  const [categories, setCategories] = useState<TestCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [runningCategory, setRunningCategory] = useState<string | null>(null)
  const [runningModule, setRunningModule] = useState<string | null>(null)
  const [report, setReport] = useState<TestReport | null>(null)
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const [liveResults, setLiveResults] = useState<TestResult[]>([])
  const [serverError, setServerError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  // Load test registry (client-side, for category listing only)
  useEffect(() => {
    mountedRef.current = true
    async function init() {
      await loadAllTests()
      if (mountedRef.current) {
        setCategories(getCategories())
        setLoading(false)
      }
      // Try to load cached report
      try {
        const cached = localStorage.getItem(STORAGE_KEY)
        if (cached && mountedRef.current) {
          setReport(JSON.parse(cached))
        }
      } catch { /* ignore */ }
    }
    init()
    return () => { mountedRef.current = false }
  }, [])

  // ── Module grouping ─────────────────────────────────────────────────────

  const moduleGroups = useMemo<ModuleGroup[]>(() => {
    const groupMap = new Map<string, TestCategory[]>()
    for (const cat of categories) {
      const { module } = parseModule(cat.id)
      if (!groupMap.has(module)) groupMap.set(module, [])
      groupMap.get(module)!.push(cat)
    }
    return Array.from(groupMap.entries())
      .map(([mod, cats]) => ({
        module: mod,
        label: MODULE_LABELS[mod] ?? mod,
        categories: cats.sort((a, b) => a.label.localeCompare(b.label, 'nl')),
        totalTests: cats.reduce((s, c) => s + c.testCount, 0),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'nl'))
  }, [categories])

  const totalTests = categories.reduce((sum, c) => sum + c.testCount, 0)

  // ── Callbacks ───────────────────────────────────────────────────────────

  const handleProgress = useCallback((result: TestResult, completed: number, total: number) => {
    if (!mountedRef.current) return
    setProgress({ completed, total })
    setLiveResults(prev => [...prev, result])
  }, [])

  const runAll = useCallback(async () => {
    setRunning(true)
    setLiveResults([])
    setProgress({ completed: 0, total: totalTests })
    setReport(null)
    setServerError(null)

    try {
      const result = await executeServerTests(undefined, handleProgress)
      if (mountedRef.current) {
        setReport(result)
        // Expand modules and categories with failures
        const failedCats = new Set(
          result.categories
            .filter(c => c.results.some(r => r.status === 'fail' || r.status === 'error'))
            .map(c => c.categoryId),
        )
        setExpandedCats(failedCats)
        const failedMods = new Set(
          Array.from(failedCats).map(catId => parseModule(catId).module),
        )
        setExpandedModules(failedMods)
        // Cache
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(result)) } catch { /* full */ }
      }
    } catch (err) {
      if (mountedRef.current) {
        setServerError(err instanceof Error ? err.message : 'Onbekende fout')
      }
    } finally {
      if (mountedRef.current) {
        setRunning(false)
        setRunningCategory(null)
        setRunningModule(null)
      }
    }
  }, [handleProgress, totalTests])

  const runCategory = useCallback(async (catId: string) => {
    setRunningCategory(catId)
    setLiveResults([])
    setProgress({ completed: 0, total: 0 })
    setServerError(null)

    try {
      const result = await executeServerTests([catId], handleProgress)
      if (mountedRef.current) {
        // Merge into existing report or create new
        setReport(prev => {
          if (!prev) return result
          const updated = { ...prev }
          // Replace or add the category results
          const idx = updated.categories.findIndex(c => c.categoryId === catId)
          if (idx >= 0) {
            updated.categories = [...updated.categories]
            updated.categories[idx] = result.categories[0]
          } else {
            updated.categories = [...updated.categories, ...result.categories]
          }
          // Recalculate summary
          const allResults = updated.categories.flatMap(c => c.results)
          updated.summary = {
            total: allResults.length,
            passed: allResults.filter(r => r.status === 'pass').length,
            failed: allResults.filter(r => r.status === 'fail').length,
            skipped: allResults.filter(r => r.status === 'skip').length,
            errored: allResults.filter(r => r.status === 'error').length,
          }
          updated.finishedAt = new Date().toISOString()
          updated.totalDurationMs += result.totalDurationMs
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)) } catch { /* full */ }
          return updated
        })
        setExpandedCats(prev => new Set([...prev, catId]))
      }
    } catch (err) {
      if (mountedRef.current) {
        setServerError(err instanceof Error ? err.message : 'Onbekende fout')
      }
    } finally {
      if (mountedRef.current) {
        setRunningCategory(null)
      }
    }
  }, [handleProgress])

  /** Run all categories within a module using a single test suite invocation */
  const runModule = useCallback(async (moduleId: string) => {
    const group = moduleGroups.find(g => g.module === moduleId)
    if (!group) return

    const catIds = group.categories.map(c => c.id)
    setRunningModule(moduleId)
    setLiveResults([])
    setProgress({ completed: 0, total: group.totalTests })
    setServerError(null)

    try {
      const result = await executeServerTests(catIds, handleProgress)
      if (mountedRef.current) {
        // Merge each category result into existing report or create new
        setReport(prev => {
          if (!prev) return result
          const updated = { ...prev }
          updated.categories = [...updated.categories]

          for (const catResult of result.categories) {
            const idx = updated.categories.findIndex(c => c.categoryId === catResult.categoryId)
            if (idx >= 0) {
              updated.categories[idx] = catResult
            } else {
              updated.categories.push(catResult)
            }
          }

          // Recalculate summary
          const allResults = updated.categories.flatMap(c => c.results)
          updated.summary = {
            total: allResults.length,
            passed: allResults.filter(r => r.status === 'pass').length,
            failed: allResults.filter(r => r.status === 'fail').length,
            skipped: allResults.filter(r => r.status === 'skip').length,
            errored: allResults.filter(r => r.status === 'error').length,
          }
          updated.finishedAt = new Date().toISOString()
          updated.totalDurationMs += result.totalDurationMs
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)) } catch { /* full */ }
          return updated
        })

        // Expand the module and any categories with failures
        setExpandedModules(prev => new Set([...prev, moduleId]))
        const failedCats = new Set(
          result.categories
            .filter(c => c.results.some(r => r.status === 'fail' || r.status === 'error'))
            .map(c => c.categoryId),
        )
        setExpandedCats(prev => new Set([...prev, ...failedCats]))
      }
    } catch (err) {
      if (mountedRef.current) {
        setServerError(err instanceof Error ? err.message : 'Onbekende fout')
      }
    } finally {
      if (mountedRef.current) {
        setRunningModule(null)
      }
    }
  }, [moduleGroups, handleProgress])

  const toggleModule = useCallback((id: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleCategory = useCallback((id: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const exportReport = useCallback(() => {
    if (!report) return

    // Build module summary data for the export
    const moduleSummaries = moduleGroups.map(g => {
      const catIds = new Set(g.categories.map(c => c.id))
      const moduleResults = report.categories
        .filter(c => catIds.has(c.categoryId))
        .flatMap(c => c.results)

      return {
        module: g.module,
        label: g.label,
        totalTests: g.totalTests,
        categories: g.categories.map(c => c.id),
        passed: moduleResults.filter(r => r.status === 'pass').length,
        failed: moduleResults.filter(r => r.status === 'fail').length,
        skipped: moduleResults.filter(r => r.status === 'skip').length,
        errored: moduleResults.filter(r => r.status === 'error').length,
      }
    })

    const exportData = { ...report, modules: moduleSummaries }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `regression-report-${report.runId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [report, moduleGroups])

  const clearReport = useCallback(() => {
    setReport(null)
    setLiveResults([])
    setProgress({ completed: 0, total: 0 })
    setServerError(null)
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  /** Compute per-module results summary from the current report */
  function getModuleResultSummary(group: ModuleGroup) {
    if (!report) return null
    const catIds = new Set(group.categories.map(c => c.id))
    const results = report.categories
      .filter(c => catIds.has(c.categoryId))
      .flatMap(c => c.results)
    if (results.length === 0) return null
    return {
      passed: results.filter(r => r.status === 'pass').length,
      failed: results.filter(r => r.status === 'fail' || r.status === 'error').length,
    }
  }

  // ── Busy state helpers ──────────────────────────────────────────────────

  const isBusy = running || !!runningCategory || !!runningModule

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--ink-3)]" />
        <span className="ml-2 text-sm text-[var(--ink-3)]">Tests laden...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--ink)]">Regressietest Suite</h2>
          <p className="text-sm text-[var(--ink-3)]">
            <span className="font-mono tabular-nums">{totalTests}</span> tests in{' '}
            <span className="font-mono tabular-nums">{moduleGroups.length}</span> modules,{' '}
            <span className="font-mono tabular-nums">{categories.length}</span> categorie{categories.length === 1 ? '' : 'en'}
          </p>
        </div>
        <div className="flex gap-2">
          {report && (
            <>
              <button
                onClick={exportReport}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border-ed)] px-3 py-1.5 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export JSON</span>
              </button>
              <button
                onClick={clearReport}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border-ed)] px-3 py-1.5 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            </>
          )}
          <button
            onClick={runAll}
            disabled={isBusy}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--ink)] px-4 py-1.5 text-sm font-medium text-[var(--paper)] hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {running ? 'Bezig...' : 'Start alle tests'}
          </button>
        </div>
      </div>

      {/* Test account safety banner — always visible with context-dependent message */}
      <TestSessionBanner isRunning={isBusy} serverError={serverError} />

      {/* Server error banner */}
      {serverError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
          <XCircle className="h-4 w-4 text-red-700 shrink-0" />
          <span className="text-sm text-red-700">{serverError}</span>
        </div>
      )}

      {/* Progress bar */}
      {(running || runningCategory || runningModule) && progress.total > 0 && (
        <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-[var(--ink-2)]">
              {runningModule
                ? `Module: ${MODULE_LABELS[runningModule] ?? runningModule}`
                : runningCategory
                  ? `Categorie: ${runningCategory}`
                  : 'Alle tests'}
            </span>
            <span className="font-mono text-[var(--ink-3)]">
              {progress.completed}/{progress.total}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${(progress.completed / Math.max(progress.total, 1)) * 100}%` }}
            />
          </div>
          {/* Live results ticker */}
          {liveResults.length > 0 && (
            <div className="mt-2 flex items-center gap-2 text-xs text-[var(--ink-3)]">
              {statusIcon(liveResults[liveResults.length - 1].status)}
              <span className="truncate">{liveResults[liveResults.length - 1].testName}</span>
              <span className="font-mono">{formatDuration(liveResults[liveResults.length - 1].durationMs)}</span>
            </div>
          )}
        </div>
      )}

      {/* Report summary */}
      {report && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <SummaryCard label="Totaal" value={report.summary.total} color="var(--ink)" />
          <SummaryCard label="Geslaagd" value={report.summary.passed} color="#10b981" />
          <SummaryCard label="Gefaald" value={report.summary.failed} color="#ef4444" />
          <SummaryCard label="Fouten" value={report.summary.errored} color="#f59e0b" />
          <SummaryCard label="Duur" value={formatDuration(report.totalDurationMs)} color="var(--ink-2)" />
        </div>
      )}

      {/* Module groups with nested categories */}
      <div className="space-y-3">
        {moduleGroups.map((group) => {
          const isModuleExpanded = expandedModules.has(group.module)
          const isModuleRunning = runningModule === group.module
          const moduleSummary = getModuleResultSummary(group)

          return (
            <div
              key={group.module}
              className="overflow-hidden rounded-lg border border-[var(--border-ed)] bg-[var(--paper)]"
            >
              {/* Module header */}
              <div
                className="flex cursor-pointer items-center gap-3 border-l-4 border-l-[var(--ink-4)] px-4 py-3 hover:bg-[var(--subtle)] transition-colors"
                onClick={() => toggleModule(group.module)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-[var(--ink)]">{group.label}</span>
                    <span className="font-mono tabular-nums text-xs text-[var(--ink-4)]">
                      {group.totalTests} tests
                    </span>
                    <span className="text-xs text-[var(--ink-4)]">
                      ({group.categories.length} {group.categories.length === 1 ? 'categorie' : 'categorie\u00ebn'})
                    </span>
                  </div>
                </div>

                {/* Module-level status badges */}
                {moduleSummary && (
                  <div className="flex items-center gap-1.5">
                    {moduleSummary.passed > 0 && (
                      <span className="flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />{moduleSummary.passed}
                      </span>
                    )}
                    {moduleSummary.failed > 0 && (
                      <span className="flex items-center gap-0.5 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        <XCircle className="h-3 w-3" />{moduleSummary.failed}
                      </span>
                    )}
                  </div>
                )}

                {/* Run module button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    runModule(group.module)
                  }}
                  disabled={isBusy}
                  className="flex items-center gap-1 rounded-md border border-[var(--border-ed)] px-2.5 py-1 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors disabled:opacity-50"
                >
                  {isModuleRunning ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  Run module
                </button>

                {isModuleExpanded ? (
                  <ChevronDown className="h-4 w-4 text-[var(--ink-4)]" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[var(--ink-4)]" />
                )}
              </div>

              {/* Expanded categories within this module */}
              {isModuleExpanded && (
                <div className="border-t border-[var(--border-ed)]">
                  {group.categories.map((cat) => {
                    const IconComp = ICON_MAP[cat.icon ?? ''] ?? Activity
                    const catResults = report?.categories.find(c => c.categoryId === cat.id)?.results
                    const isCatExpanded = expandedCats.has(cat.id)
                    const isCatRunning = runningCategory === cat.id

                    const passed = catResults?.filter(r => r.status === 'pass').length ?? 0
                    const failed = catResults?.filter(r => r.status === 'fail' || r.status === 'error').length ?? 0
                    const hasResults = !!catResults

                    return (
                      <div key={cat.id} className="border-b border-[var(--border-ed)] last:border-b-0">
                        {/* Category header */}
                        <div
                          className="flex cursor-pointer items-center gap-3 py-2.5 pl-8 pr-4 hover:bg-[var(--subtle)] transition-colors"
                          onClick={() => toggleCategory(cat.id)}
                        >
                          <IconComp className="h-4 w-4 text-[var(--ink-3)]" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-[var(--ink)]">{cat.label}</span>
                              <span className="font-mono tabular-nums text-xs text-[var(--ink-4)]">{cat.testCount} tests</span>
                            </div>
                            <p className="text-xs text-[var(--ink-3)] truncate">{cat.description}</p>
                          </div>

                          {/* Status badges */}
                          {hasResults && (
                            <div className="flex items-center gap-1.5">
                              {passed > 0 && (
                                <span className="flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                  <CheckCircle2 className="h-3 w-3" />{passed}
                                </span>
                              )}
                              {failed > 0 && (
                                <span className="flex items-center gap-0.5 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                                  <XCircle className="h-3 w-3" />{failed}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Run category button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              runCategory(cat.id)
                            }}
                            disabled={isBusy}
                            className="flex items-center gap-1 rounded-md border border-[var(--border-ed)] px-2 py-1 text-xs text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors disabled:opacity-50"
                          >
                            {isCatRunning ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Play className="h-3 w-3" />
                            )}
                            Run
                          </button>

                          {isCatExpanded ? (
                            <ChevronDown className="h-4 w-4 text-[var(--ink-4)]" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-[var(--ink-4)]" />
                          )}
                        </div>

                        {/* Expanded test results */}
                        {isCatExpanded && catResults && (
                          <div className="border-t border-[var(--border-ed)] bg-[var(--subtle)]/30">
                            {catResults.map((result) => (
                              <TestResultRow key={result.testId} result={result} />
                            ))}
                          </div>
                        )}

                        {isCatExpanded && !catResults && (
                          <div className="border-t border-[var(--border-ed)] px-4 py-3 pl-8 text-sm text-[var(--ink-4)] italic">
                            Nog niet uitgevoerd — klik op Run om deze categorie te testen
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Report metadata */}
      {report && (
        <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-3 text-xs text-[var(--ink-3)]">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>Run ID: <span className="font-mono">{report.runId}</span></span>
            <span>Start: {new Date(report.startedAt).toLocaleString('nl-NL')}</span>
            <span>Einde: {new Date(report.finishedAt).toLocaleString('nl-NL')}</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(report.totalDurationMs)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3">
      <div className="text-xs text-[var(--ink-3)]">{label}</div>
      <div className="mt-0.5 text-xl font-bold font-mono tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  )
}

function TestSessionBanner({ isRunning, serverError }: { isRunning: boolean; serverError: string | null }) {
  const status = getTestSessionStatus({ isRunning, serverError: null })

  if (status.variant === 'running') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5">
        <Shield className="h-4 w-4 text-emerald-700 shrink-0" />
        <span className="text-sm font-medium text-emerald-700">{status.message}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5">
      <Shield className="h-4 w-4 text-sky-700 shrink-0" />
      <span className="text-sm text-sky-700">{status.message}</span>
    </div>
  )
}

function TestResultRow({ result }: { result: TestResult }) {
  const [showError, setShowError] = useState(false)
  const hasError = result.status === 'fail' || result.status === 'error'

  return (
    <div className="border-b border-[var(--border-ed)] last:border-b-0">
      <div
        className={`flex items-center gap-3 px-4 py-2 pl-12 text-sm ${hasError ? 'cursor-pointer hover:bg-red-50/50' : ''}`}
        onClick={() => hasError && setShowError(!showError)}
      >
        {statusIcon(result.status)}
        <span className="flex-1 min-w-0 truncate text-[var(--ink)]">{result.testName}</span>
        <span className="text-xs text-[var(--ink-4)]">{statusLabel(result.status)}</span>
        <span className="font-mono text-xs text-[var(--ink-4)] tabular-nums">
          {formatDuration(result.durationMs)}
        </span>
        {hasError && (
          <ChevronDown className={`h-3 w-3 text-[var(--ink-4)] transition-transform ${showError ? 'rotate-180' : ''}`} />
        )}
      </div>
      {showError && result.errorMessage && (
        <div className="mx-4 mb-3 ml-12 rounded-md bg-red-50 p-3 text-xs">
          <div className="font-medium text-red-700">{result.errorMessage}</div>
          {result.errorStack && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-red-600/70 font-mono text-[10px]">
              {result.errorStack}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
