// Mapt de frontmatter-kleurnamen uit .claude/agents/*.md (amber/pink/cyan/...)
// naar nette accent-tinten voor de development-pagina. Kleur is hier nooit de
// enige drager van betekenis — de agent-naam staat er altijd bij. Onbekende of
// ontbrekende kleur valt terug op een neutrale randkleur.

const NEUTRAL = 'var(--border-md)'

const COLOR_HEX: Record<string, string> = {
  amber: '#d97706',
  pink: '#db2777',
  cyan: '#0891b2',
  orange: '#ea580c',
  purple: '#7c3aed',
  green: '#16a34a',
  blue: '#2563eb',
  red: '#dc2626',
  yellow: '#ca8a04',
  teal: '#0d9488',
}

/** Accent-hex voor een agent-kleur; neutrale CSS-var bij onbekend/leeg. */
export function agentAccent(color?: string): string {
  if (!color) return NEUTRAL
  return COLOR_HEX[color.toLowerCase()] ?? NEUTRAL
}
