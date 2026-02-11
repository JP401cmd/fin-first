/**
 * Token-efficient formatting for AI context.
 * Uses compact text with section headers instead of JSON.
 */

export function section(title: string, content: string): string {
  if (!content.trim()) return ''
  return `== ${title.toUpperCase()} ==\n${content.trim()}\n`
}

export function formatCurrency(amount: number): string {
  return `€${Math.round(amount).toLocaleString('nl-NL')}`
}

export function formatFreedomTime(years: number, months: number): string {
  if (years === 0 && months === 0) return '0 maanden'
  const parts: string[] = []
  if (years > 0) parts.push(`${years} jaar`)
  if (months > 0) parts.push(`${months} maanden`)
  return parts.join(' en ')
}

export function formatPercentage(pct: number): string {
  return `${Math.round(pct * 10) / 10}%`
}

export function bulletList(items: string[]): string {
  return items.map((i) => `- ${i}`).join('\n')
}
