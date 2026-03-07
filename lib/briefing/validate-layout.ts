// ── Briefing Layout Validation ──────────────────────────────
// Validates and reorders briefing cards against layout rules.
// Applied server-side after AI generates all tool calls.

import type { BriefingCardSpec } from './types'
import { CARD_SPAN } from './types'

/** Card types that are valid as the last card in a briefing */
const VALID_ENDING_TYPES = new Set<BriefingCardSpec['type']>(['action', 'insight', 'quote'])

/** 1-column card types (span = 1) */
function isOneCol(type: BriefingCardSpec['type']): boolean {
  return CARD_SPAN[type] === 1
}

/**
 * Validate and reorder briefing cards against layout rules.
 *
 * Rules applied:
 * 1. No two 1-col cards of the same type directly after each other — swap order
 * 2. Milestone never first or last — move to middle
 * 3. Last card must be action, insight, or quote — move if needed
 *
 * Returns a new array; does not mutate the input.
 */
export function validateBriefingLayout(cards: BriefingCardSpec[]): BriefingCardSpec[] {
  if (cards.length <= 1) return [...cards]

  let result = [...cards]

  // ── Rule 2: Milestone not first or last — move to middle ──
  result = fixMilestonePosition(result)

  // ── Rule 1: No two 1-col cards of same type adjacent ──
  result = fixAdjacentSameType(result)

  // ── Rule 3: Last card must be action, insight, or quote ──
  result = fixLastCard(result)

  return result
}

/**
 * Rule 1: No two 1-col cards of the same type directly after each other.
 * When found, try to swap the second one with the next non-matching card.
 */
function fixAdjacentSameType(cards: BriefingCardSpec[]): BriefingCardSpec[] {
  const result = [...cards]

  for (let i = 0; i < result.length - 1; i++) {
    const curr = result[i]
    const next = result[i + 1]

    // Only applies to 1-col cards of the same type
    if (!isOneCol(curr.type) || !isOneCol(next.type)) continue
    if (curr.type !== next.type) continue

    // Find the next card that is different (type or span) to swap with
    let swapIdx = -1
    for (let j = i + 2; j < result.length; j++) {
      if (result[j].type !== curr.type) {
        swapIdx = j
        break
      }
    }

    if (swapIdx !== -1) {
      // Swap positions
      const temp = result[i + 1]
      result[i + 1] = result[swapIdx]
      result[swapIdx] = temp
    }
    // If no swap candidate found, leave as-is (best effort)
  }

  return result
}

/**
 * Rule 2: Milestone cards should not be first or last.
 * Move them to the middle of the briefing.
 */
function fixMilestonePosition(cards: BriefingCardSpec[]): BriefingCardSpec[] {
  if (cards.length <= 2) return [...cards]

  const result = [...cards]
  const midpoint = Math.floor(result.length / 2)

  // Check first card
  if (result[0].type === 'milestone') {
    const [milestone] = result.splice(0, 1)
    result.splice(midpoint, 0, milestone)
  }

  // Check last card (re-check after potential first-card move)
  if (result.length > 1 && result[result.length - 1].type === 'milestone') {
    const milestone = result.pop()!
    const mid = Math.floor(result.length / 2)
    result.splice(mid, 0, milestone)
  }

  return result
}

/**
 * Rule 3: Last card must be action, insight, or quote.
 * If not, find the last occurrence of a valid ending type and move it to the end.
 */
function fixLastCard(cards: BriefingCardSpec[]): BriefingCardSpec[] {
  if (cards.length === 0) return []

  const result = [...cards]
  const lastCard = result[result.length - 1]

  if (VALID_ENDING_TYPES.has(lastCard.type)) {
    return result // Already valid
  }

  // Find the last valid ending card in the array
  let swapIdx = -1
  for (let i = result.length - 2; i >= 0; i--) {
    if (VALID_ENDING_TYPES.has(result[i].type)) {
      swapIdx = i
      break
    }
  }

  if (swapIdx !== -1) {
    // Move the valid ending card to the end
    const [endCard] = result.splice(swapIdx, 1)
    result.push(endCard)
  }
  // If no valid ending card exists at all, leave as-is (best effort)

  return result
}
