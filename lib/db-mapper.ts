/**
 * DB → Frontend type mapper.
 *
 * Converts snake_case database column names to camelCase TypeScript properties.
 * Provides both type-level utilities and runtime conversion functions.
 *
 * Usage:
 *   import { mapDbRow, mapDbRows, type CamelCaseKeys } from '@/lib/db-mapper'
 *
 *   // Type-level: derive a camelCase version of a DB row type
 *   type AssetFe = CamelCaseKeys<Asset>
 *   // → { id: string; userId: string; currentValue: number; ... }
 *
 *   // Runtime: convert rows after Supabase fetch
 *   const { data } = await supabase.from('assets').select('*')
 *   const assets = mapDbRows(data ?? [])
 *   // → assets[0].currentValue instead of assets[0].current_value
 */

import type { Asset } from './asset-data'
import type { Debt } from './debt-data'
import type { Budget } from './budget-data'
import type { LifeEvent } from './horizon-data'

// ── Type-level utilities ────────────────────────────────────

/** Converts a single snake_case string to camelCase at the type level. */
export type SnakeToCamelCase<S extends string> =
  S extends `${infer T}_${infer U}`
    ? `${T}${Capitalize<SnakeToCamelCase<U>>}`
    : S

/** Maps all keys of T from snake_case to camelCase, preserving value types. */
export type CamelCaseKeys<T> = {
  [K in keyof T as K extends string ? SnakeToCamelCase<K> : K]: T[K]
}

// ── Runtime utilities ───────────────────────────────────────

/** Converts a snake_case string to camelCase at runtime. */
export function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

/**
 * Converts a single database row's keys from snake_case to camelCase.
 * Values are passed through unchanged.
 */
export function mapDbRow<T extends Record<string, unknown>>(row: T): CamelCaseKeys<T> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(row)) {
    result[snakeToCamel(key)] = row[key]
  }
  return result as CamelCaseKeys<T>
}

/**
 * Converts an array of database rows from snake_case to camelCase.
 */
export function mapDbRows<T extends Record<string, unknown>>(rows: T[]): CamelCaseKeys<T>[] {
  return rows.map(row => mapDbRow(row))
}

// ── Table-specific frontend types ───────────────────────────

/** Asset with camelCase keys (frontend representation). */
export type AssetFe = CamelCaseKeys<Asset>

/** Debt with camelCase keys (frontend representation). */
export type DebtFe = CamelCaseKeys<Debt>

/** Budget with camelCase keys (frontend representation). */
export type BudgetFe = CamelCaseKeys<Budget>

/** LifeEvent with camelCase keys (frontend representation). */
export type LifeEventFe = CamelCaseKeys<LifeEvent>
