/**
 * Re-export-barrel. De implementatie is verhuisd naar de gedeelde plek
 * `@/lib/ai/categorize-budget-options` zodat ook een client-component (de
 * lokale privé-modus-resolver in components/app/ai-categorize-sheet.tsx) 'm kan
 * importeren zonder uit `app/api/**` te hoeven trekken. De route en
 * budget-options.test.ts importeren ongewijzigd uit dit pad — geen duplicatie.
 */

export {
  buildBudgetOptions,
  resolveSlug,
  isAssignableType,
  type BudgetRow,
  type BudgetCandidate,
} from '@/lib/ai/categorize-budget-options'
