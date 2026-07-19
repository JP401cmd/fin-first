// Uniforme `[metric]`-logregel — bewust machine-leesbaar zodat Playwright de run
// volledig uit de console kan aflezen (geen DOM-scraping nodig).
//
// FORMAAT: `[metric] <kind> <JSON>` — waarbij <JSON> een compleet, geldig
// JSON-object is dat zélf ook een `kind`-veld bevat. Twee bewuste keuzes:
//   1. De payload wordt als STRING (JSON.stringify) meegegeven, niet als los
//      object. In Playwright plakt `msg.text()` de argumenten met een spatie aan
//      elkaar; een los object zou daar als afgekapte preview (`{a: 1, …}`,
//      unquoted keys) verschijnen — géén geldige/complete JSON. Een reeds
//      ge-stringify'de payload komt er compleet en parsebaar doorheen.
//   2. `kind` staat óók ín de JSON, zodat een lezer die simpelweg vanaf de eerste
//      `{` parseert (`JSON.parse(text.slice(text.indexOf('{')))`) altijd het type
//      terugvindt, ongeacht hoe streng hij het `[metric] <kind> `-voorvoegsel leest.
//
// Alle metric-regels beginnen met `[metric] ` (zie ook README → "Metingen aflezen").
export function metric(kind: string, payload: Record<string, unknown>): void {
  console.log(`[metric] ${kind}`, JSON.stringify({ kind, ...payload }))
}

/** Rond een (mogelijk null) millisecondewaarde af tot heel getal voor de logs. */
export function roundMs(v: number | null | undefined): number | null {
  return v == null || !Number.isFinite(v) ? null : Math.round(v)
}
