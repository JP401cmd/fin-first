import { describe, expect, it } from 'vitest'
import {
  clampPan,
  clampScale,
  fitToBox,
  IDENTITY,
  isClick,
  zoomAtPoint,
  type PlaatTransform,
} from './plaat-transform'

describe('clampScale', () => {
  it('begrenst boven en onder', () => {
    expect(clampScale(10, 0.5, 6)).toBe(6)
    expect(clampScale(0.1, 0.5, 6)).toBe(0.5)
    expect(clampScale(2, 0.5, 6)).toBe(2)
  })
})

describe('zoomAtPoint', () => {
  it('houdt het punt onder de cursor exact op z\'n plek bij inzoomen', () => {
    const t = { ...IDENTITY }
    const ux = 300
    const uy = 200
    const next = zoomAtPoint(t, 2, ux, uy, 0.5, 6)
    // Het content-punt onder de cursor was c=(u−t)/scale; het moet na de zoom op
    // dezelfde schermplek terugkomen: newScale·c + t' === u.
    const cx = (ux - t.tx) / t.scale
    const cy = (uy - t.ty) / t.scale
    expect(next.scale * cx + next.tx).toBeCloseTo(ux, 6)
    expect(next.scale * cy + next.ty).toBeCloseTo(uy, 6)
    expect(next.scale).toBe(2)
  })

  it('houdt het punt vast ook vanuit een al gepande/gezoomde staat', () => {
    const t: PlaatTransform = { scale: 1.7, tx: -140, ty: 55 }
    const ux = 410
    const uy = 260
    const next = zoomAtPoint(t, 0.8, ux, uy, 0.5, 6)
    const cx = (ux - t.tx) / t.scale
    const cy = (uy - t.ty) / t.scale
    expect(next.scale * cx + next.tx).toBeCloseTo(ux, 6)
    expect(next.scale * cy + next.ty).toBeCloseTo(uy, 6)
  })

  it('respecteert de zoomgrenzen (fixpunt geldt dan niet meer, schaal wel)', () => {
    const t: PlaatTransform = { scale: 6, tx: 0, ty: 0 }
    const next = zoomAtPoint(t, 2, 100, 100, 0.5, 6)
    expect(next.scale).toBe(6) // geklemd, geen verdere inzoom
  })
})

describe('fitToBox', () => {
  it('centreert de content-box in de viewBox', () => {
    const box = { x: 100, y: 50, w: 200, h: 100 }
    const viewW = 1000
    const viewH = 800
    const t = fitToBox(box, viewW, viewH)
    // Beperkende as is hoogte-of-breedte-verhouding: min(1000/200, 800/100)=5→ nee,
    // min(5, 8) = 5. Getoonde box: 200*5=1000 breed vult viewW volledig.
    expect(t.scale).toBe(5)
    // Linkerbovenhoek van de box verschijnt op (viewW − w·scale)/2, (viewH − h·scale)/2.
    expect(t.scale * box.x + t.tx).toBeCloseTo((viewW - box.w * t.scale) / 2, 6)
    expect(t.scale * box.y + t.ty).toBeCloseTo((viewH - box.h * t.scale) / 2, 6)
  })

  it('fit-to-screen van de hele content geeft ~identity bij gelijke viewBox', () => {
    const t = fitToBox({ x: 0, y: 0, w: 1240, h: 1292 }, 1240, 1292)
    expect(t.scale).toBeCloseTo(1, 6)
    expect(t.tx).toBeCloseTo(0, 6)
    expect(t.ty).toBeCloseTo(0, 6)
  })

  it('respecteert maxScale', () => {
    const t = fitToBox({ x: 0, y: 0, w: 10, h: 10 }, 1000, 1000, 0, 3)
    expect(t.scale).toBe(3)
  })
})

describe('clampPan', () => {
  it('zet de content-randen aan de viewBox-randen als de content groter is', () => {
    // scale 2 op 1000×800 content → 2000×1600 getoond; viewBox 1000×800.
    const t = clampPan({ scale: 2, tx: 500, ty: 500 }, 1000, 800, 1000, 800)
    // tx mag in [1000−2000, 0] = [−1000, 0]; 500 → 0.
    expect(t.tx).toBe(0)
    expect(t.ty).toBe(0)
    const t2 = clampPan({ scale: 2, tx: -5000, ty: -5000 }, 1000, 800, 1000, 800)
    expect(t2.tx).toBe(-1000)
    expect(t2.ty).toBe(-800)
  })

  it('houdt kleinere content binnen de viewBox', () => {
    const t = clampPan({ scale: 0.5, tx: 9999, ty: -9999 }, 1000, 800, 1000, 800)
    // dispW=500 → tx ∈ [0, 500]; dispH=400 → ty ∈ [0, 400].
    expect(t.tx).toBe(500)
    expect(t.ty).toBe(0)
  })
})

describe('isClick', () => {
  it('kleine verplaatsing = klik, grote = sleep', () => {
    expect(isClick(2, 2)).toBe(true)
    expect(isClick(0, 0)).toBe(true)
    expect(isClick(10, 0)).toBe(false)
    expect(isClick(4, 4, 5)).toBe(false) // hypot ≈ 5.66 > 5
  })
})
