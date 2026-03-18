'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Play, ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertTriangle,
  SkipForward, Clock, Download, RotateCcw, Loader2, Activity,
  TrendingUp, LineChart, ArrowDownToLine, Calculator, LayoutGrid,
  Tag, Shield, Wand2, Navigation,
} from 'lucide-react'
import type { TestReport, TestResult, TestCategory } from '@/lib/regression-tests/test-types'
import { loadAllTests, getCategories } from '@/lib/regression-tests/test-registry'
import { runTestSuite, runCategoryTests } from '@/lib/regression-tests/test-runner'

// ── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'fintwo-regression-report'

const ICON_MAP: Record<string, React.ElementType> = {
  TrendingUp, LineChart, ArrowDownToLine, Calculator, LayoutGrid,
  Tag, Shield, Wand2, Activity, Navigation,
}

// ── Status helpers ──────────────────────────────────────────────────────────

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

// ── Component ───────────────────────────────────────────────────────────────

export default function RegressietestPage() {
  const [categories, setCategories] = useState<TestCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [runningCategory, setRunningCategory] = useState<string | null>(null)
  const [report, setReport] = useState<TestReport | null>(null)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const [liveResults, setLiveResults] = useState<TestResult[]>([])
  const mountedRef = useRef(true)

  // Load test registry
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

  const handleProgress = useCallback((result: TestResult, completed: number, total: number) => {
    if (!mountedRef.current) return
    setProgress({ completed, total })
    setLiveResults(prev => [...prev, result])
  }, [])

  const runAll = useCallback(async () => {
    setRunning(true)
    setLiveResults([])
    setProgress({ completed: 0, total: 0 })
    setReport(null)

    try {
      const result = await runTestSuite({}, handleProgress)
      if (mountedRef.current) {
        setReport(result)
        // Expand all categories with failures
        const failedCats = new Set(
          result.categories
            .filter(c => c.results.some(r => r.status === 'fail' || r.status === 'error'))
            .map(c => c.categoryId),
        )
        setExpandedCats(failedCats)
        // Cache
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(result)) } catch { /* full */ }
      }
    } finally {
      if (mountedRef.current) {
        setRunning(false)
        setRunningCategory(null)
      }
    }
  }, [handleProgress])

  const runCategory = useCallback(async (catId: string) => {
    setRunningCategory(catId)
    setLiveResults([])
    setProgress({ completed: 0, total: 0 })

    try {
      const result = await runCategoryTests(catId, handleProgress)
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
    } finally {
      if (mountedRef.current) {
        setRunningCategory(null)
      }
    }
  }, [handleProgress])

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
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `regression-report-${report.runId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [report])

  const clearReport = useCallback(() => {
    setReport(null)
    setLiveResults([])
    setProgress({ completed: 0, total: 0 })
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  const totalTests = categories.reduce((sum, c) => sum + c.testCount, 0)

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
            {totalTests} tests in {categories.length} categorieën
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
            disabled={running}
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

      {/* Progress bar */}
      {(running || runningCategory) && progress.total > 0 && (
        <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-[var(--ink-2)]">
              {runningCategory ? `Categorie: ${runningCategory}` : 'Alle tests'}
            </span>
            <span className="font-mono text-[var(--ink-3)]">
              {progress.completed}/{progress.total}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${(progress.completed / progress.total) * 100}%` }}
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

      {/* Categories */}
      <div className="space-y-2">
        {categories.map((cat) => {
          const IconComp = ICON_MAP[cat.icon ?? ''] ?? Activity
          const catResults = report?.categories.find(c => c.categoryId === cat.id)?.results
          const isExpanded = expandedCats.has(cat.id)
          const isCatRunning = runningCategory === cat.id

          const passed = catResults?.filter(r => r.status === 'pass').length ?? 0
          const failed = catResults?.filter(r => r.status === 'fail' || r.status === 'error').length ?? 0
          const hasResults = !!catResults

          return (
            <div
              key={cat.id}
              className="overflow-hidden rounded-lg border border-[var(--border-ed)] bg-[var(--paper)]"
            >
              {/* Category header */}
              <div
                className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-[var(--subtle)] transition-colors"
                onClick={() => toggleCategory(cat.id)}
              >
                <IconComp className="h-5 w-5 text-[var(--ink-3)]" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--ink)]">{cat.label}</span>
                    <span className="text-xs text-[var(--ink-4)]">{cat.testCount} tests</span>
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

                {/* Run button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    runCategory(cat.id)
                  }}
                  disabled={running || isCatRunning}
                  className="flex items-center gap-1 rounded-md border border-[var(--border-ed)] px-2 py-1 text-xs text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors disabled:opacity-50"
                >
                  {isCatRunning ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  Run
                </button>

                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-[var(--ink-4)]" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[var(--ink-4)]" />
                )}
              </div>

              {/* Expanded test results */}
              {isExpanded && catResults && (
                <div className="border-t border-[var(--border-ed)]">
                  {catResults.map((result) => (
                    <TestResultRow key={result.testId} result={result} />
                  ))}
                </div>
              )}

              {isExpanded && !catResults && (
                <div className="border-t border-[var(--border-ed)] px-4 py-3 text-sm text-[var(--ink-4)] italic">
                  Nog niet uitgevoerd — klik op Run om deze categorie te testen
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

function TestResultRow({ result }: { result: TestResult }) {
  const [showError, setShowError] = useState(false)
  const hasError = result.status === 'fail' || result.status === 'error'

  return (
    <div className="border-b border-[var(--border-ed)] last:border-b-0">
      <div
        className={`flex items-center gap-3 px-4 py-2 text-sm ${hasError ? 'cursor-pointer hover:bg-red-50/50' : ''}`}
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
        <div className="mx-4 mb-3 rounded-md bg-red-50 p-3 text-xs">
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
