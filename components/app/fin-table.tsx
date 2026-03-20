'use client'

import { type ReactNode, type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes, forwardRef } from 'react'

/**
 * FinTable — Standardized table design for financial data.
 *
 * Inspired by fd.nl "beurstabellen":
 * - Headers: --ink-3, 11px, uppercase, tracking-wide, border-b
 * - Body rows: subtle hover state
 * - Amounts: text-right font-mono tabular-nums
 * - Optional zebra striping
 * - Responsive: horizontal scroll on mobile
 *
 * Usage:
 *   <FinTable>
 *     <FinTable.Header>
 *       <FinTable.Row>
 *         <FinTable.Th>Label</FinTable.Th>
 *         <FinTable.Th align="right">Bedrag</FinTable.Th>
 *       </FinTable.Row>
 *     </FinTable.Header>
 *     <FinTable.Body zebra>
 *       <FinTable.Row>
 *         <FinTable.Td>Spaargeld</FinTable.Td>
 *         <FinTable.Td numeric>€10.000</FinTable.Td>
 *       </FinTable.Row>
 *     </FinTable.Body>
 *     <FinTable.Footer>
 *       <FinTable.Row>
 *         <FinTable.Td bold>Totaal</FinTable.Td>
 *         <FinTable.Td numeric bold>€10.000</FinTable.Td>
 *       </FinTable.Row>
 *     </FinTable.Footer>
 *   </FinTable>
 */

// ── Shared class helpers ────────────────────────────────────────────

const BASE_TH =
  'text-[11px] uppercase tracking-wider font-medium text-[var(--ink-3)] pb-2'

const BASE_TD = 'py-2 text-sm text-[var(--ink)]'

function cx(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ')
}

// ── Root: overflow wrapper + table ──────────────────────────────────

interface FinTableRootProps extends HTMLAttributes<HTMLDivElement> {
  /** Minimum width for horizontal scroll (e.g. "480px"). Default: none */
  minWidth?: string
  /** Additional className for the <table> element */
  tableClassName?: string
  children: ReactNode
}

function FinTableRoot({
  minWidth,
  tableClassName,
  children,
  className,
  ...rest
}: FinTableRootProps) {
  return (
    <div className={cx('overflow-x-auto', className)} {...rest}>
      <table
        className={cx(
          'w-full',
          minWidth ? `min-w-[${minWidth}]` : undefined,
          tableClassName,
        )}
        style={minWidth ? { minWidth } : undefined}
      >
        {children}
      </table>
    </div>
  )
}

// ── Header (thead) ──────────────────────────────────────────────────

interface FinTableHeaderProps extends HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode
}

function FinTableHeader({ children, className, ...rest }: FinTableHeaderProps) {
  return (
    <thead className={className} {...rest}>
      {children}
    </thead>
  )
}

// ── Body (tbody) ────────────────────────────────────────────────────

interface FinTableBodyProps extends HTMLAttributes<HTMLTableSectionElement> {
  /** Enable zebra striping on even rows */
  zebra?: boolean
  children: ReactNode
}

function FinTableBody({ zebra, children, className, ...rest }: FinTableBodyProps) {
  return (
    <tbody
      className={cx(zebra ? 'fin-table-zebra' : undefined, className)}
      {...rest}
    >
      {children}
    </tbody>
  )
}

// ── Footer (tfoot) ──────────────────────────────────────────────────

interface FinTableFooterProps extends HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode
}

function FinTableFooter({ children, className, ...rest }: FinTableFooterProps) {
  return (
    <tfoot className={className} {...rest}>
      {children}
    </tfoot>
  )
}

// ── Row (tr) ────────────────────────────────────────────────────────

interface FinTableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Is this a totals / summary row? Adds top border + bold */
  total?: boolean
  /** Dashed bottom border (default for body rows) */
  dashed?: boolean
  children: ReactNode
}

function FinTableRow({ total, dashed, children, className, ...rest }: FinTableRowProps) {
  return (
    <tr
      className={cx(
        // Hover state for all body rows
        'transition-colors hover:bg-[var(--subtle)]/50',
        // Border styles
        total
          ? 'border-t-2 border-[var(--border-md)] font-semibold'
          : dashed !== false
            ? 'border-b border-dashed border-[var(--border-ed)] last:border-0'
            : undefined,
        className,
      )}
      {...rest}
    >
      {children}
    </tr>
  )
}

// ── Th (header cell) ────────────────────────────────────────────────

interface FinTableThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** Horizontal alignment. Default: 'left' for first column, 'right' for rest */
  align?: 'left' | 'right' | 'center'
  children?: ReactNode
}

const FinTableTh = forwardRef<HTMLTableCellElement, FinTableThProps>(
  function FinTableTh({ align = 'left', children, className, ...rest }, ref) {
    return (
      <th
        ref={ref}
        className={cx(
          BASE_TH,
          align === 'right'
            ? 'text-right'
            : align === 'center'
              ? 'text-center'
              : 'text-left',
          'px-2 first:pl-0 last:pr-0',
          className,
        )}
        {...rest}
      >
        {children}
      </th>
    )
  },
)

// ── Td (body cell) ──────────────────────────────────────────────────

interface FinTableTdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** Right-align + font-mono tabular-nums for financial numbers */
  numeric?: boolean
  /** Bold text (for totals, emphasis) */
  bold?: boolean
  /** Text color override (e.g. 'text-red-600', 'text-kern-600') */
  color?: string
  /** Muted secondary text */
  muted?: boolean
  children?: ReactNode
}

const FinTableTd = forwardRef<HTMLTableCellElement, FinTableTdProps>(
  function FinTableTd({ numeric, bold, color, muted, children, className, ...rest }, ref) {
    return (
      <td
        ref={ref}
        className={cx(
          BASE_TD,
          numeric ? 'text-right font-mono tabular-nums' : undefined,
          bold ? 'font-semibold' : undefined,
          color ?? (muted ? 'text-[var(--ink-3)]' : undefined),
          'px-2 first:pl-0 last:pr-0',
          className,
        )}
        {...rest}
      >
        {children}
      </td>
    )
  },
)

// ── Compound export ─────────────────────────────────────────────────

/**
 * CSS for zebra striping — add to your global CSS or use the inline style:
 *
 *   .fin-table-zebra > tr:nth-child(even) { background: var(--subtle) / 0.3 }
 *
 * Since Tailwind v4 doesn't have `even:` on parent selectors easily,
 * we inject a tiny <style> tag scoped via data-attribute.
 */

export const FinTable = Object.assign(FinTableRoot, {
  Header: FinTableHeader,
  Body: FinTableBody,
  Footer: FinTableFooter,
  Row: FinTableRow,
  Th: FinTableTh,
  Td: FinTableTd,
})

// ── CSS helper: inject zebra striping rules ─────────────────────────

export const FIN_TABLE_ZEBRA_CSS = `
.fin-table-zebra > tr:nth-child(even) {
  background-color: color-mix(in srgb, var(--subtle) 30%, transparent);
}
`
