'use client'

/**
 * BudgetPillTree — een TIJDELIJKE, alternatieve boomweergave van budgetten
 * (`viewMode === 'pill'` in `budgets-client.tsx`), gemodelleerd naar het
 * pil-patroon van de Eenvoudig-modus van bezittingen (`EenvoudigPillList`)
 * gecombineerd met de boom-structuur van `BudgetTree` (`TreeGroup`/`ChildBar`).
 *
 * Verschil met `EenvoudigPillList` — CRUCIAAL: bij bezittingen vult de pil-balk
 * het AANDEEL van het totaal (statisch %, één kleur). Bij budgetten toont de
 * balk SPEND VS BEGROOT via dezelfde `computeBarSegments`-logica als de boom
 * (normaal → groen, waarschuwing → oranje vanaf alert_threshold,
 * overschrijding → rood/groen tot 105%, plus limit-fence + alert-marker). Dat
 * is bewust NIET de platte aandeel-balk, anders verdwijnt de
 * over-budget-waarschuwing.
 *
 * CONSUME-ONLY: dit component herberekent geen budgetcijfers. De host
 * (`budgets-client.tsx`) levert `groups` / `spending` / `beschikbaarMap` aan;
 * de limit-afleiding (`beschikbaar + spent` of `default_limit`) en de
 * aggregatie per parent zijn identiek aan `BudgetTree`.
 *
 * Prop-signatuur is IDENTIEK aan `BudgetTree`, zodat het een drop-in
 * alternatief is in dezelfde render-takken.
 */

import { useState, type MouseEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  BudgetIcon,
  getTypeColors,
  isOverPositive,
  computeBarSegments,
  anyChildOverBudget,
  BudgetOverWarningIcon,
  type BudgetType,
} from '@/components/app/budget-shared'
import type { Budget, BudgetWithChildren } from '@/lib/budget-data'
import { MaskedAmount } from '@/components/app/masked-amount'

interface BudgetPillTreeProps {
  groups: BudgetWithChildren[]
  spending: Record<string, number>
  budgetType: BudgetType
  onNavigate: (budgetId: string) => void
  beschikbaarMap?: Record<string, number>
}

/* ── PillBars (de spend-vs-begroot fills als achtergrond-laag) ──────────────
 * Dezelfde segment-tekening als de boom, maar dan ABSOLUUT binnen de pil
 * (`absolute inset-0`) en laag-opaak zodat de inhoud (icoon/naam/bedrag) er
 * leesbaar bovenop valt. Behoudt alert-marker + limit-fence. */

function PillBars({
  spent,
  limit,
  alertThreshold,
  isHard,
  colors,
  overPositive,
}: {
  spent: number
  limit: number
  alertThreshold: number
  isHard: boolean
  colors: ReturnType<typeof getTypeColors>
  overPositive: boolean
}) {
  const overBudget = spent > limit && limit > 0
  const seg = computeBarSegments(spent, limit, alertThreshold, colors, overPositive)

  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {/* Fill 1 — normaal (0 → threshold) */}
      <span
        className="absolute inset-y-0 left-0"
        style={{
          width: `${seg.normalPct}%`,
          backgroundColor: seg.normalColor,
          opacity: 0.18,
        }}
      />

      {/* Fill 2 — waarschuwing (threshold → 100%) */}
      {seg.warnPct > 0 && (
        <span
          className="absolute inset-y-0"
          style={{
            left: `${seg.warnLeft}%`,
            width: `${seg.warnPct}%`,
            backgroundColor: seg.warnColor,
            opacity: 0.22,
          }}
        />
      )}

      {/* Extension (100% → 105%) */}
      {seg.extensionPct > 0 && (
        <span
          className="absolute inset-y-0"
          style={{
            left: `${seg.extensionLeft}%`,
            width: `${seg.extensionPct}%`,
            backgroundColor: seg.extensionColor,
            opacity: 0.28,
          }}
        />
      )}

      {/* Alert threshold marker */}
      {alertThreshold > 0 && alertThreshold < 100 && (
        <span
          className="absolute inset-y-0 w-px border-l border-dashed border-zinc-400/60"
          style={{ left: `${seg.alertPosition}%` }}
        />
      )}

      {/* Limit boundary (de "fence") */}
      <span
        className={`absolute inset-y-0 ${isHard ? 'w-0.5' : 'w-0.5 border-l border-dashed'}`}
        style={{
          left: `${seg.limitPosition}%`,
          backgroundColor: isHard ? (overBudget ? seg.overColor : colors.hex) : undefined,
          borderColor: !isHard ? (overBudget ? seg.overColor : colors.hex) : undefined,
        }}
      />
    </span>
  )
}

/* ── Eén pil (parent-header of child) ──────────────────────────────────────
 * `rounded-full`, `overflow-hidden`, `relative`. De fills zitten als
 * achtergrond-laag (PillBars); icoon/naam/bedrag liggen er `relative`
 * bovenop. */

function BudgetPill({
  budget,
  spent,
  beschikbaar,
  budgetType,
  level,
  expandable,
  expanded,
  onToggle,
  onNavigate,
  warnChildOverBudget,
}: {
  budget: Budget
  spent: number
  beschikbaar?: number
  budgetType: BudgetType
  /** 'parent' (groter) of 'child' (compacter, ingesprongen). */
  level: 'parent' | 'child'
  /** Parent met kinderen → klik klapt in/uit; child/parent-zonder-kinderen → klik = detail. */
  expandable: boolean
  expanded?: boolean
  onToggle?: () => void
  onNavigate: (id: string) => void
  /** Waarschuwing tonen: één of meer deelbudgetten zijn over budget (alleen parents). */
  warnChildOverBudget?: boolean
}) {
  const limit = beschikbaar !== undefined ? beschikbaar + spent : Number(budget.default_limit)
  const overBudget = spent > limit && limit > 0
  const alertThreshold = budget.alert_threshold ?? 80
  const isHard = budget.limit_type === 'hard'
  const colors = getTypeColors(budgetType)
  const overPositive = isOverPositive(budgetType)

  const isParent = level === 'parent'
  const iconSize = isParent ? 'h-7 w-7' : 'h-6 w-6'
  const iconGlyph = isParent ? 'h-4 w-4' : 'h-3.5 w-3.5'
  const nameClass = isParent
    ? 'text-sm font-semibold text-[var(--ink)]'
    : 'text-xs font-medium text-[var(--ink-2)]'
  const padY = isParent ? 'py-2' : 'py-1.5'

  // Parent met kinderen → toggle in/uitklappen; anders → detail openen.
  const handleBodyClick = expandable && onToggle ? onToggle : () => onNavigate(budget.id)
  // De waarschuwing zit in deze knop; de expliciete aria-label overschrijft de
  // naam van child-elementen, dus voeg de waarschuwing aan het label toe (en
  // markeer het icoon zelf als decoratief) zodat ook Tab-gebruikers het horen.
  const bodyAriaLabel =
    (expandable && onToggle
      ? `${budget.name} ${expanded ? 'inklappen' : 'uitklappen'}`
      : `${budget.name} openen`) +
    (warnChildOverBudget ? '. Waarschuwing: één of meer deelbudgetten zijn over budget' : '')

  // Icoon-knop opent ALTIJD het detailscherm — ook (juist) voor parents.
  const handleIconClick = (e: MouseEvent) => {
    e.stopPropagation()
    onNavigate(budget.id)
  }

  return (
    // NIET-interactieve wrapper: behoudt de pil-styling, maar bevat twee
    // sibling-buttons (icoon + body) i.p.v. één geneste button (ongeldige HTML).
    <div
      data-budget-id={budget.id}
      className={`relative flex w-full items-center gap-2.5 overflow-hidden rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 ${padY} text-left transition-colors hover:bg-[var(--subtle)]`}
    >
      {/* Achtergrond: spend-vs-begroot fills + alert-marker + limit-fence.
          Beslaat de hele pil-breedte, onder beide buttons. */}
      <PillBars
        spent={spent}
        limit={limit}
        alertThreshold={alertThreshold}
        isHard={isHard}
        colors={colors}
        overPositive={overPositive}
      />

      {/* Icoon-knop — aparte klik-target die ALTIJD het detailscherm opent. */}
      <button
        type="button"
        onClick={handleIconClick}
        aria-label={`${budget.name} budget openen`}
        title={`${budget.name} openen`}
        className={`relative flex ${iconSize} shrink-0 items-center justify-center rounded-full ${colors.bgDark} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset`}
      >
        <BudgetIcon name={budget.icon} className={`${iconGlyph} ${colors.text}`} />
      </button>

      {/* Body-knop — naam + bedrag + chevron; toggelt (parents-met-kinderen)
          of opent detail (children / parents-zonder-kinderen). */}
      <button
        type="button"
        onClick={handleBodyClick}
        aria-label={bodyAriaLabel}
        aria-expanded={expandable ? expanded : undefined}
        className="relative flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset rounded-full"
      >
        {/* Naam */}
        <span className={`min-w-0 flex-1 truncate ${nameClass}`}>{budget.name}</span>

        {/* Waarschuwing: een deelbudget is over budget (ook zichtbaar bij ingeklapte parent).
            Decoratief: de tekst zit al in de knop-aria-label (bodyAriaLabel). */}
        {warnChildOverBudget && <BudgetOverWarningIcon decorative />}

        {/* Bedrag: besteed / begroot. Over-budget kleurt semantisch. */}
        <span className="shrink-0 font-mono text-xs tabular-nums">
          <span className={overBudget ? (overPositive ? 'text-positive' : 'text-negative') : 'text-[var(--ink-2)]'}>
            <MaskedAmount value={spent} tone="wil" />
          </span>
          <span className="text-[var(--ink-3)]">
            {' / '}
            <MaskedAmount value={limit} tone="wil" />
          </span>
        </span>

        {/* Chevron alleen op uitklapbare parents. */}
        {expandable && (
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>
    </div>
  )
}

/* ── PillGroup (één parent + children) ─────────────────────────────────────
 * Spiegelt `TreeGroup`: lokale expand-state, parent-aggregatie over children,
 * children ingesprongen onder de parent-pil. */

function PillGroup({
  parent,
  spending,
  beschikbaarMap,
  budgetType,
  onNavigate,
}: {
  parent: BudgetWithChildren
  spending: Record<string, number>
  beschikbaarMap?: Record<string, number>
  budgetType: BudgetType
  onNavigate: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const hasChildren = parent.children.length > 0

  // Aggregatie identiek aan TreeGroup: parent toont de som van zijn kinderen
  // (of zijn eigen waarde als er geen kinderen zijn).
  const totalSpent = hasChildren
    ? parent.children.reduce((sum, c) => sum + (spending[c.id] ?? 0), 0)
    : (spending[parent.id] ?? 0)
  const totalLimit = hasChildren
    ? parent.children.reduce(
        (sum, c) =>
          sum +
          (beschikbaarMap?.[c.id] !== undefined
            ? beschikbaarMap[c.id] + (spending[c.id] ?? 0)
            : Number(c.default_limit)),
        0,
      )
    : beschikbaarMap?.[parent.id] !== undefined
      ? beschikbaarMap[parent.id] + (spending[parent.id] ?? 0)
      : Number(parent.default_limit)

  // Synthetische parent-budget-rij voor de pil: de geaggregeerde spent/limit
  // worden via `spent`/`beschikbaar` doorgegeven; de pil zelf leest verder
  // `parent.alert_threshold` / `parent.limit_type` / `parent.icon` / `name`.
  const parentBeschikbaar = totalLimit - totalSpent

  // Waarschuwing voor de (mogelijk ingeklapte) parent: een deelbudget is over
  // budget terwijl het totaal zelf nog binnen budget kan vallen.
  const childOverBudget = anyChildOverBudget(parent.children, spending, beschikbaarMap, budgetType)

  return (
    <div className="space-y-1.5">
      <BudgetPill
        budget={parent}
        spent={totalSpent}
        beschikbaar={parentBeschikbaar}
        budgetType={budgetType}
        level="parent"
        expandable={hasChildren}
        expanded={expanded}
        onToggle={hasChildren ? () => setExpanded((v) => !v) : undefined}
        onNavigate={onNavigate}
        warnChildOverBudget={childOverBudget}
      />

      {hasChildren && expanded && (
        <div className="space-y-1.5 pl-5">
          {parent.children.map((child) => (
            <BudgetPill
              key={child.id}
              budget={child}
              spent={spending[child.id] ?? 0}
              beschikbaar={beschikbaarMap?.[child.id]}
              budgetType={budgetType}
              level="child"
              expandable={false}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── BudgetPillTree (top-level) ────────────────────────────────────────── */

export function BudgetPillTree({
  groups,
  spending,
  budgetType,
  onNavigate,
  beschikbaarMap,
}: BudgetPillTreeProps) {
  if (groups.length === 0) return null

  return (
    // Ruimere gap TUSSEN hoofdbudget-groepen; binnen een groep blijft
    // parent↔children compact (PillGroup zelf houdt space-y-1.5).
    <div className="space-y-4">
      {groups.map((group) => (
        <PillGroup
          key={group.id}
          parent={group}
          spending={spending}
          beschikbaarMap={beschikbaarMap}
          budgetType={budgetType}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}
