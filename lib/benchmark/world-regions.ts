/**
 * Wereld-indeling voor de "stippen-wereldkaart" in de benchmark.
 *
 * De continenten zijn getekend als POLYGONEN (kustlijn-contouren in lengte-/
 * breedtegraad), niet als rechthoeken — zo lopen de land/zee-grenzen vloeiend
 * (diagonale randen op het stippenraster i.p.v. blokkerig). Per polygoon een
 * welvaartsklasse:
 *
 *   rich   → hoge-inkomenslanden    (kleur = Overzicht/kern)
 *   middle → midden-inkomenslanden  (kleur = Toekomst/horizon)
 *   poor   → lage-inkomenslanden    (kleur = Mijn/wil)
 *
 * Bewust een grove benadering van de echte kaart — puur ter relativering, geen
 * geopolitieke bron. Zee = geen tier (neutrale stip).
 */

export type WealthTier = 'rich' | 'middle' | 'poor'

// Kaart-uitsnede (equirectangulair). x: lengtegraad −180→180, y: breedtegraad 83→−60.
const LON0 = -180
const LON_SPAN = 360
const LAT_TOP = 83
const LAT_SPAN = 143

type LonLat = [number, number]
interface LandPoly {
  tier: WealthTier
  /** Kustlijn-contour als [lengtegraad, breedtegraad]-punten. */
  pts: LonLat[]
}

// Volgorde = prioriteit (eerste rake polygoon wint): rijke overlays + rijk,
// dan midden, dan arm. Zo winnen Golfstaten/Japan van de regio eromheen.
const LAND: LandPoly[] = [
  // ── rich-overlays (klein, vóór de grotere regio's) ──
  { tier: 'rich', pts: [[46, 30], [56, 26], [58, 23], [52, 22], [47, 25]] }, // Golfstaten
  { tier: 'rich', pts: [[126, 33], [131, 35], [137, 37], [142, 42], [140, 45], [132, 40], [127, 38], [124, 35]] }, // Japan/Korea
  { tier: 'rich', pts: [[-45, 60], [-22, 70], [-20, 76], [-40, 80], [-55, 76], [-58, 68], [-50, 61]] }, // Groenland

  // ── rich ──
  {
    tier: 'rich',
    pts: [
      [-168, 66], [-162, 70], [-130, 70], [-95, 69], [-80, 63], [-64, 60], [-56, 52],
      [-66, 45], [-70, 41], [-75, 35], [-81, 25], [-90, 29], [-97, 26], [-105, 31],
      [-117, 32], [-124, 40], [-125, 48], [-133, 54], [-140, 59], [-150, 59], [-165, 60],
    ],
  }, // Noord-Amerika (VS + Canada + Alaska)
  {
    tier: 'rich',
    pts: [
      [-10, 36], [-9, 43], [-2, 44], [-6, 50], [-5, 58], [5, 62], [10, 66], [20, 70],
      [24, 66], [22, 58], [20, 54], [20, 46], [14, 46], [18, 42], [14, 38], [6, 38], [-2, 40], [-9, 37],
    ],
  }, // West-/Noord-Europa
  {
    tier: 'rich',
    pts: [
      [114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -18], [150, -25],
      [153, -30], [150, -37], [140, -38], [130, -32], [120, -34], [114, -30], [113, -26],
    ],
  }, // Australië
  { tier: 'rich', pts: [[167, -37], [174, -37], [178, -42], [173, -46], [168, -44]] }, // Nieuw-Zeeland

  // ── middle ──
  { tier: 'middle', pts: [[-117, 32], [-105, 31], [-97, 26], [-94, 18], [-88, 21], [-87, 16], [-83, 9], [-78, 8], [-83, 14], [-92, 15], [-96, 16], [-106, 23], [-112, 24]] }, // Mexico + Midden-Amerika
  {
    tier: 'middle',
    pts: [
      [-81, 8], [-76, 9], [-60, 5], [-50, 2], [-35, -5], [-35, -8], [-39, -13], [-48, -25],
      [-58, -34], [-65, -41], [-72, -50], [-75, -52], [-73, -45], [-71, -30], [-70, -18],
      [-77, -12], [-81, -5], [-80, 2],
    ],
  }, // Zuid-Amerika
  {
    tier: 'middle',
    pts: [
      [22, 48], [30, 52], [28, 58], [30, 66], [40, 68], [60, 70], [90, 72], [140, 72],
      [170, 68], [180, 66], [178, 62], [160, 60], [150, 59], [140, 52], [135, 48], [120, 50],
      [100, 50], [88, 48], [80, 45], [68, 40], [55, 40], [48, 40], [40, 44], [30, 46], [24, 46],
    ],
  }, // Rusland + Centraal-Azië + Oost-Europa
  { tier: 'middle', pts: [[-16, 30], [-6, 36], [10, 34], [20, 32], [32, 31], [35, 28], [44, 30], [50, 30], [58, 24], [60, 22], [52, 16], [44, 12], [36, 15], [20, 16], [8, 18], [-5, 20], [-16, 21]] }, // Noord-Afrika + Midden-Oosten
  { tier: 'middle', pts: [[90, 28], [100, 32], [105, 40], [120, 42], [126, 42], [122, 30], [110, 22], [100, 22], [98, 28]] }, // China/Oost-Azië

  // ── poor ──
  {
    tier: 'poor',
    pts: [
      [-16, 16], [-5, 15], [10, 12], [20, 16], [35, 12], [44, 11], [51, 12], [42, -2],
      [40, -12], [35, -22], [28, -34], [20, -35], [18, -28], [12, -16], [9, -2], [5, 4], [-8, 6], [-16, 12],
    ],
  }, // Sub-Sahara-Afrika
  { tier: 'poor', pts: [[60, 24], [68, 24], [70, 30], [80, 30], [90, 28], [92, 22], [88, 16], [80, 8], [77, 8], [72, 18], [66, 24]] }, // Zuid-Azië (India)
  { tier: 'poor', pts: [[95, 20], [100, 16], [106, 10], [109, 2], [118, 5], [127, 1], [140, -4], [135, -9], [120, -9], [112, -7], [103, 1], [99, 8], [96, 16]] }, // Zuidoost-Azië/Indonesië
]

// Voorgecompileerde, genormaliseerde polygonen (0–1 kaartcoördinaten).
const POLYS = LAND.map(l => ({
  tier: l.tier,
  poly: l.pts.map(([lon, lat]): [number, number] => [
    (lon - LON0) / LON_SPAN,
    (LAT_TOP - lat) / LAT_SPAN,
  ]),
}))

/** Ray-casting point-in-polygon. */
function inPoly(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Welvaartsklasse op kaartpositie (x,y in 0–1), of `null` voor zee. */
export function tierAt(x: number, y: number): WealthTier | null {
  for (const p of POLYS) {
    if (inPoly(x, y, p.poly)) return p.tier
  }
  return null
}
