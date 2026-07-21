// ── Rekening-typen ───────────────────────────
// Verhuisd uit components/app/account-form-modal.tsx zodat lib (regression) deze
// lijst kan importeren zonder terug naar components te reiken (import-richting
// UI→lib). Zuiver data.

export const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Betaalrekening' },
  { value: 'savings', label: 'Spaarrekening' },
  { value: 'joint', label: 'En/of-rekening' },
  { value: 'business', label: 'Zakelijke rekening' },
  { value: 'contant_geld', label: 'Contant geld' },
  { value: 'other', label: 'Overig' },
] as const
