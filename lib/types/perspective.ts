// ── Perspectief data-contracten ───────────────────────────
// Verhuisd uit components/app/perspective-provider.tsx zodat de import-richting
// UI→lib is. Zuiver type-only.

export type Perspective = 'personal' | 'household' | 'partner'

export interface PerspectiveOption {
  id: Perspective
  label: string
  description: string
}
