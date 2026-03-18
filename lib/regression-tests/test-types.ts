// ── Regression Test Types ────────────────────────────────────────────────────

/** Result status of a single test case */
export type TestStatus = 'pass' | 'fail' | 'skip' | 'error'

/** Priority level for ordering/filtering */
export type TestPriority = 'critical' | 'high' | 'medium' | 'low'

/** A single test case definition */
export interface TestCase {
  /** Unique identifier (kebab-case, e.g. "fire-sim-basic") */
  id: string
  /** Human-readable name */
  name: string
  /** Short description of what this test verifies */
  description: string
  /** Category this test belongs to (matches TestCategory.id) */
  category: string
  /** Priority level */
  priority: TestPriority
  /** Estimated duration in milliseconds */
  estimatedDurationMs: number
  /** The actual test function — returns void on success, throws on failure */
  fn: () => void | Promise<void>
}

/** Result of running a single test case */
export interface TestResult {
  /** The test case that was run */
  testId: string
  testName: string
  category: string
  /** Outcome */
  status: TestStatus
  /** Duration in milliseconds */
  durationMs: number
  /** Error message if status is 'fail' or 'error' */
  errorMessage?: string
  /** Stack trace if available */
  errorStack?: string
  /** Timestamp when the test completed */
  completedAt: string
}

/** A category grouping of tests */
export interface TestCategory {
  /** Unique identifier */
  id: string
  /** Display name */
  label: string
  /** Description */
  description: string
  /** Icon name (lucide) */
  icon?: string
  /** Number of tests in this category */
  testCount: number
}

/** Configuration for a test suite run */
export interface TestSuiteConfig {
  /** Run tests in parallel within each category? Default: false (sequential) */
  parallel: boolean
  /** Categories to include (empty = all) */
  categories: string[]
  /** Stop on first failure? */
  stopOnFailure: boolean
  /** Timeout per test in ms */
  timeoutMs: number
}

/** Full report from a test suite run */
export interface TestReport {
  /** Unique run ID */
  runId: string
  /** When the run started */
  startedAt: string
  /** When the run finished */
  finishedAt: string
  /** Total duration in ms */
  totalDurationMs: number
  /** Summary counts */
  summary: {
    total: number
    passed: number
    failed: number
    skipped: number
    errored: number
  }
  /** Results grouped by category */
  categories: {
    categoryId: string
    categoryLabel: string
    results: TestResult[]
  }[]
  /** Configuration used for this run */
  config: TestSuiteConfig
}

/** Default test suite configuration */
export const DEFAULT_SUITE_CONFIG: TestSuiteConfig = {
  parallel: false,
  categories: [],
  stopOnFailure: false,
  timeoutMs: 10_000,
}
