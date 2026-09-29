// ── De grenzen van de AI-laag: één bron (Krant 1E, ADR 0190) ─────────────────
//
// Server (lib/krant/ai-laag.ts, de prompt, de schema-beschrijving) en scherm
// (components/berichten/tijdlijn-client.tsx) lezen dezelfde getallen. Een
// getal in UI-tekst wordt hier vandaan geïnterpoleerd, nooit uitgeschreven
// ("vijf", "drie") — anders loopt de belofte op het scherm stil achter op de
// code (eindreview Y7, 29-09).
//
// PUUR: alleen constanten — client-veilig.
//
// euro-only (B2, ADR 0172): dit bestand rekent niets.

/** Hoogstens zoveel kandidaten die de matcher níet koos gaan naar het model (K3). */
export const AI_LAAG_MAX_KANDIDATEN = 12
/** Hoogstens zoveel berichten mag het model toevoegen (K3). */
export const AI_LAAG_MAX_TOEVOEGINGEN = 3
/** Hoogstens zoveel modelcalls per lezer binnen het venster (K5) — telt in de database. */
export const AI_LAAG_MAX_PER_WEEK = 5
/** Het venster van het quotum: rollend, in dagen (geen kalenderweek). */
export const AI_LAAG_QUOTUM_DAGEN = 7
/** Een toelichting is kort: hoogstens zoveel zinnen … */
export const AI_TEKST_MAX_ZINNEN = 3
/** … en hoogstens zoveel tekens. */
export const AI_TEKST_MAX_TEKENS = 480
