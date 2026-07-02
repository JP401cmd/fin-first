/**
 * Horizon-kernel · wrappers — **deterministische Monte-Carlo-ruis** (sin-hash).
 *
 * Het Excel-model genereert zijn Monte-Carlo-randomness NIET met `RAND()` maar
 * met een **deterministische sin-hash** in de werkbladformules (zie
 * `docs/horizon-oracle/verificatie.md`: "seeding zit deterministisch in de
 * sheetformules (sin-hash), niet in VBA"). Zo is elke run reproduceerbaar en
 * oracle-veilig. Deze module port die formules één-op-één uit tab MC.
 *
 * ### De exacte MC-tab-formules (Core calc v5.xlsm, geverifieerd via openpyxl)
 * - **MC!B10** gedeelde marktschok per run:
 *   `=IF(B5=1, NORM.INV(0.0001+0.9998*MOD(SIN(B11*12.9898+3.1416)*43758.5453,1), 0, B3), 0)`
 * - **MC!C12:L12** idiosyncratische ruis per pot (kolom-offset `<col>11` = 1..10):
 *   `=IF(B5=1, NORM.INV(0.0001+0.9998*MOD(SIN(B11*78.233+<col>11*37.719)*43758.5453,1), 0, 0.3*B3), 0)`
 *
 * `B11` = de runteller (1..N), `B3` = sigma (jaarvolatiliteit), `<col>11` = de
 * per-pot seed-offset (C11=1 voor bezit-slot 0, D11=2 voor slot 1, …, L11=10 voor
 * slot 9). De gedeelde schok raakt álle investeringspotten (bens!F=1); de
 * idiosyncratische ruis is per pot verschillend (0,3·sigma).
 *
 * `MOD(x,1)` in Excel is de fractionele deling die het teken van de deler volgt en
 * dus altijd in `[0,1)` ligt: `x − FLOOR(x)` — in JS exact `x − Math.floor(x)`.
 *
 * Pure functies: geen fs/Supabase/Date.now/Math.random.
 */

/** De vier vaste sin-hash-constanten uit de MC-formules. */
const SIN_HASH_SCALE = 43758.5453
const SHARED_SIN_MULT = 12.9898
const SHARED_SIN_OFFSET = 3.1416
const POT_RUN_MULT = 78.233
const POT_SEED_MULT = 37.719

/**
 * De sin-hash-uniform: `0.0001 + 0.9998·MOD(SIN(arg)·43758.5453, 1)`. Levert een
 * pseudo-uniform getal in `[0.0001, 0.9999)` — de 0,0001-marge houdt `NORM.INV`
 * weg van de oneindige staarten.
 */
export function sinHashUniform(sinArg: number): number {
  const raw = Math.sin(sinArg) * SIN_HASH_SCALE
  const frac = raw - Math.floor(raw) // Excel MOD(x,1) → altijd in [0,1)
  return 0.0001 + 0.9998 * frac
}

/**
 * MC!B10 — de gedeelde marktschok voor run `run` (1-gebaseerd), met `sigma` =
 * MC!B3. `NORM.INV(sinHashUniform(run·12.9898 + 3.1416), 0, sigma)`.
 */
export function sharedMarketShock(run: number, sigma: number): number {
  return normInv(sinHashUniform(run * SHARED_SIN_MULT + SHARED_SIN_OFFSET), 0, sigma)
}

/**
 * MC!<col>12 — de idiosyncratische ruis voor bezit-slot `slot` (0-gebaseerd) op
 * run `run`. De per-pot seed-offset is `slot + 1` (C11=1 hoort bij slot 0).
 * `NORM.INV(sinHashUniform(run·78.233 + (slot+1)·37.719), 0, 0.3·sigma)`.
 */
export function potIdiosyncraticNoise(run: number, slot: number, sigma: number): number {
  const seedOffset = slot + 1 // MC!C11=1, D11=2, … (per-pot seed in rij 11)
  return normInv(sinHashUniform(run * POT_RUN_MULT + seedOffset * POT_SEED_MULT), 0, 0.3 * sigma)
}

// ── NORM.INV — inverse standaard-normale CDF (Acklam) ────────────────────────

// Coëfficiënten van P. J. Acklam's rationale benadering van de inverse normale
// CDF (max. relatieve fout ≈ 1,15·10⁻⁹ over het hele domein). De MC-uniforms
// liggen in [0,0001; 0,9999], ruim binnen het nauwkeurige middengebied — een fout
// van ~10⁻⁹ in de ruis is verwaarloosbaar voor de 1/0-slaagcriteria.
const ACKLAM_A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
  -3.066479806614716e1, 2.506628277459239,
]
const ACKLAM_B = [
  -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
  -1.328068155288572e1,
]
const ACKLAM_C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
  4.374664141464968, 2.938163982698783,
]
const ACKLAM_D = [
  7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416,
]
const ACKLAM_PLOW = 0.02425
const ACKLAM_PHIGH = 1 - ACKLAM_PLOW

/**
 * Inverse van de normale cumulatieve verdelingsfunctie (Excel `NORM.INV`), via
 * Acklam's rationale benadering. Voor `p` buiten `(0,1)` geeft dit ±∞/NaN —
 * de MC-formules leveren echter altijd `p ∈ [0,0001; 0,9999]`.
 */
export function normInv(p: number, mean = 0, sd = 1): number {
  let x: number
  if (p < ACKLAM_PLOW) {
    const q = Math.sqrt(-2 * Math.log(p))
    x =
      (((((ACKLAM_C[0] * q + ACKLAM_C[1]) * q + ACKLAM_C[2]) * q + ACKLAM_C[3]) * q + ACKLAM_C[4]) *
        q +
        ACKLAM_C[5]) /
      ((((ACKLAM_D[0] * q + ACKLAM_D[1]) * q + ACKLAM_D[2]) * q + ACKLAM_D[3]) * q + 1)
  } else if (p <= ACKLAM_PHIGH) {
    const q = p - 0.5
    const r = q * q
    x =
      ((((((ACKLAM_A[0] * r + ACKLAM_A[1]) * r + ACKLAM_A[2]) * r + ACKLAM_A[3]) * r + ACKLAM_A[4]) *
        r +
        ACKLAM_A[5]) *
        q) /
      (((((ACKLAM_B[0] * r + ACKLAM_B[1]) * r + ACKLAM_B[2]) * r + ACKLAM_B[3]) * r + ACKLAM_B[4]) *
        r +
        1)
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    x =
      -(((((ACKLAM_C[0] * q + ACKLAM_C[1]) * q + ACKLAM_C[2]) * q + ACKLAM_C[3]) * q + ACKLAM_C[4]) *
        q +
        ACKLAM_C[5]) /
      ((((ACKLAM_D[0] * q + ACKLAM_D[1]) * q + ACKLAM_D[2]) * q + ACKLAM_D[3]) * q + 1)
  }
  return mean + sd * x
}
