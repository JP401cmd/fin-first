/**
 * Shared chart padding constants for the Horizon module.
 *
 * SimChart, EventsTimeline, and PhaseBar all share the same horizontal
 * coordinate space so that age-based markers align pixel-perfectly.
 *
 * IMPORTANT: If you change these values, verify alignment across all three
 * components visually.
 */
export const CHART_PAD = { top: 16, right: 16, bottom: 28, left: 60 } as const
