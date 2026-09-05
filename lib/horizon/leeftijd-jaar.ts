// lib/horizon/leeftijd-jaar.ts
//
// ÉÉN afrondingsregel voor een fractionele leeftijd op het scherm — een bewust
// import-vrij blad, zodat zowel `hero-fire-age.ts` (het kopgetal) als
// `anker-copy.ts` (de zinnen eronder) 'm kunnen lezen zonder elkaar te importeren.
// Zie de toelichting bij `heroFireAgeYear` in hero-fire-age.ts (bevinding S15/M5).

/** Het HELE JAAR dat een fractionele leeftijd op het scherm krijgt — `Math.round`. */
export function leeftijdJaar(age: number): number {
  return Math.round(age)
}
