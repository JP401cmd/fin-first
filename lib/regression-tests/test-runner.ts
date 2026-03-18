import type {
  TestCase,
  TestResult,
  TestReport,
  TestSuiteConfig,
} from './test-types'
import { DEFAULT_SUITE_CONFIG } from './test-types'
import { getCategories, getTestsByCategory, getAllTests } from './test-registry'

// ── Test Runner Engine ──────────────────────────────────────────────────────

/** Generate a short unique run ID */
function generateRunId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `run-${ts}-${rand}`
}

/** Run a single test case with timeout */
async function runSingleTest(
  test: TestCase,
  timeoutMs: number,
): Promise<TestResult> {
  const start = performance.now()
  try {
    const result = test.fn()
    if (result instanceof Promise) {
      await Promise.race([
        result,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Test timed out after ${timeoutMs}ms`)), timeoutMs),
        ),
      ])
    }
    const duration = performance.now() - start
    return {
      testId: test.id,
      testName: test.name,
      category: test.category,
      status: 'pass',
      durationMs: Math.round(duration),
      completedAt: new Date().toISOString(),
    }
  } catch (err) {
    const duration = performance.now() - start
    const error = err instanceof Error ? err : new Error(String(err))
    const isTimeout = error.message.includes('timed out')
    return {
      testId: test.id,
      testName: test.name,
      category: test.category,
      status: isTimeout ? 'error' : 'fail',
      durationMs: Math.round(duration),
      errorMessage: error.message,
      errorStack: error.stack,
      completedAt: new Date().toISOString(),
    }
  }
}

/** Callback type for progress reporting */
export type TestProgressCallback = (result: TestResult, completed: number, total: number) => void

/** Run the full test suite */
export async function runTestSuite(
  config: Partial<TestSuiteConfig> = {},
  onProgress?: TestProgressCallback,
): Promise<TestReport> {
  const cfg: TestSuiteConfig = { ...DEFAULT_SUITE_CONFIG, ...config }
  const runId = generateRunId()
  const startedAt = new Date().toISOString()
  const startTime = performance.now()

  // Determine which categories to run
  const allCategories = getCategories()
  const targetCategories =
    cfg.categories.length > 0
      ? allCategories.filter((c) => cfg.categories.includes(c.id))
      : allCategories

  // Gather all tests
  const allTests: TestCase[] = cfg.categories.length > 0
    ? targetCategories.flatMap((c) => getTestsByCategory(c.id))
    : getAllTests()

  const totalCount = allTests.length
  let completedCount = 0
  let stopped = false

  // Results grouped by category
  const categoryResults: TestReport['categories'] = []

  for (const cat of targetCategories) {
    const tests = getTestsByCategory(cat.id)
    if (tests.length === 0) continue

    const results: TestResult[] = []

    if (cfg.parallel) {
      // Run tests in category concurrently
      const promises = tests.map(async (test) => {
        if (stopped) {
          return {
            testId: test.id,
            testName: test.name,
            category: test.category,
            status: 'skip' as const,
            durationMs: 0,
            completedAt: new Date().toISOString(),
          }
        }
        const result = await runSingleTest(test, cfg.timeoutMs)
        completedCount++
        onProgress?.(result, completedCount, totalCount)
        if (cfg.stopOnFailure && (result.status === 'fail' || result.status === 'error')) {
          stopped = true
        }
        return result
      })
      results.push(...(await Promise.all(promises)))
    } else {
      // Sequential execution
      for (const test of tests) {
        if (stopped) {
          const skipResult: TestResult = {
            testId: test.id,
            testName: test.name,
            category: test.category,
            status: 'skip',
            durationMs: 0,
            completedAt: new Date().toISOString(),
          }
          results.push(skipResult)
          completedCount++
          onProgress?.(skipResult, completedCount, totalCount)
          continue
        }

        const result = await runSingleTest(test, cfg.timeoutMs)
        results.push(result)
        completedCount++
        onProgress?.(result, completedCount, totalCount)

        if (cfg.stopOnFailure && (result.status === 'fail' || result.status === 'error')) {
          stopped = true
        }
      }
    }

    categoryResults.push({
      categoryId: cat.id,
      categoryLabel: cat.label,
      results,
    })
  }

  const finishedAt = new Date().toISOString()
  const totalDurationMs = Math.round(performance.now() - startTime)

  // Compute summary
  const allResults = categoryResults.flatMap((c) => c.results)
  const summary = {
    total: allResults.length,
    passed: allResults.filter((r) => r.status === 'pass').length,
    failed: allResults.filter((r) => r.status === 'fail').length,
    skipped: allResults.filter((r) => r.status === 'skip').length,
    errored: allResults.filter((r) => r.status === 'error').length,
  }

  return {
    runId,
    startedAt,
    finishedAt,
    totalDurationMs,
    summary,
    categories: categoryResults,
    config: cfg,
  }
}

/** Run tests for a single category */
export async function runCategoryTests(
  categoryId: string,
  onProgress?: TestProgressCallback,
): Promise<TestReport> {
  return runTestSuite({ categories: [categoryId] }, onProgress)
}
