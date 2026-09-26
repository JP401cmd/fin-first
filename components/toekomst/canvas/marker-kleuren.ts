// Verplaatst uit components/app/horizon/horizon-client.tsx r2293–2313 @ c1b4849eb (fase 1, ADR 0179).
//
// Marker-kleuren van de toekomstgrafiek. Stonden als lokale consts in de
// component-body; zijn render-onafhankelijk en dus module-constanten.
// Waarden ongewijzigd (pure move) — ook de losse partner-hex, zie inplug-map.

// ── Chart event-overlay (markers boven/onder de bar) ───────────────────
// Bouw één lijst met ChartEventOverlay-items uit gebruiker-events +
// natuurlijke mijlpalen. De chart bepaalt zelf side+positie via xScale;
// wij leveren alleen de raw lijst met side-hint en kleur.
export const COLOR_LIFE_INCOME = 'var(--color-horizon-500, #c4a06b)'
export const COLOR_LIFE_EXPENSE = 'var(--color-kern-500, #6b4339)'
export const COLOR_NAT_ASSET = 'var(--color-horizon-500, #c4a06b)'
export const COLOR_NAT_DEBT = 'var(--color-kern-500, #6b4339)'
export const COLOR_NAT_SIM = 'var(--ink-2, #4a453d)'
export const COLOR_NAT_DANGER = 'var(--negative, #b91c1c)'
// Distinctieve partner-kleur voor read-only partner-event-markers (teal) —
// verschilt van eigen events (goud/bruin) en natuurlijke mijlpalen.
export const COLOR_PARTNER_EVENT = '#0d9488'
// Doel-markers (M36) dragen het Wil-accent: `doelen` hoort in de module
// `inzicht_acties` → navModule 'wil' (lib/module-registry.ts). Dat token is
// door de gebruiker instelbaar, dus geen losse hex — de fallback benadert
// alleen de standaard-wil uit globals.css voor het geval de var ontbreekt.
// Een verstreken streefdatum is SEMANTIEK (stoplicht-rood) en volgt de
// accentkeuze bewust niet.
export const COLOR_GOAL = 'var(--color-wil-600, #3a2f52)'
export const COLOR_GOAL_OVERDUE = 'var(--negative, #b91c1c)'
