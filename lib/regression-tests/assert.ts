// ── Simple assertion library for browser-based regression tests ─────────────

export class AssertionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AssertionError'
  }
}

export function assert(condition: boolean, message?: string): void {
  if (!condition) {
    throw new AssertionError(message ?? 'Assertion failed')
  }
}

export function assertEqual<T>(actual: T, expected: T, label?: string): void {
  if (actual !== expected) {
    throw new AssertionError(
      `${label ? label + ': ' : ''}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

export function assertNotNull<T>(value: T | null | undefined, label?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new AssertionError(`${label ? label + ': ' : ''}Expected non-null value`)
  }
}

export function assertGreaterThan(actual: number, expected: number, label?: string): void {
  if (!(actual > expected)) {
    throw new AssertionError(
      `${label ? label + ': ' : ''}Expected ${actual} > ${expected}`,
    )
  }
}

export function assertGreaterThanOrEqual(actual: number, expected: number, label?: string): void {
  if (!(actual >= expected)) {
    throw new AssertionError(
      `${label ? label + ': ' : ''}Expected ${actual} >= ${expected}`,
    )
  }
}

export function assertLessThan(actual: number, expected: number, label?: string): void {
  if (!(actual < expected)) {
    throw new AssertionError(
      `${label ? label + ': ' : ''}Expected ${actual} < ${expected}`,
    )
  }
}

export function assertLessThanOrEqual(actual: number, expected: number, label?: string): void {
  if (!(actual <= expected)) {
    throw new AssertionError(
      `${label ? label + ': ' : ''}Expected ${actual} <= ${expected}`,
    )
  }
}

export function assertFinite(value: number, label?: string): void {
  if (!Number.isFinite(value)) {
    throw new AssertionError(
      `${label ? label + ': ' : ''}Expected finite number, got ${value}`,
    )
  }
}

export function assertType(value: unknown, type: string, label?: string): void {
  if (typeof value !== type) {
    throw new AssertionError(
      `${label ? label + ': ' : ''}Expected type ${type}, got ${typeof value}`,
    )
  }
}

export function assertDefined<T>(value: T | undefined, label?: string): asserts value is T {
  if (value === undefined) {
    throw new AssertionError(`${label ? label + ': ' : ''}Expected defined value`)
  }
}

export function assertIncludes<T>(array: T[], item: T, label?: string): void {
  if (!array.includes(item)) {
    throw new AssertionError(
      `${label ? label + ': ' : ''}Expected array to include ${JSON.stringify(item)}`,
    )
  }
}
