'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { computeGoalProgress, getGoalColorClasses, type Goal } from '@/lib/goal-data'
import { formatCurrency } from '@/components/app/budget-shared'

/**
 * Test page for Feature #72: Goal progress tracks real current_value changes.
 *
 * This page demonstrates the complete goal progress lifecycle:
 * 1. Create a savings goal with target €10,000
 * 2. Set initial current_value to €2,000 (20%)
 * 3. Update current_value to €3,500 (35%)
 * 4. Verify progress bar shows 35%
 * 5. Check goal data persistence in database
 *
 * When not authenticated, uses in-browser demonstration mode
 * to verify the progress calculation and display logic.
 */

type TestGoal = Goal & { _source?: string }

export default function TestGoalProgressPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [goals, setGoals] = useState<TestGoal[]>([])
  const [log, setLog] = useState<string[]>([])
  const [testPhase, setTestPhase] = useState<'idle' | 'creating' | 'updating' | 'verifying' | 'done' | 'error'>('idle')
  const [testGoalId, setTestGoalId] = useState<string | null>(null)

  const addLog = useCallback((msg: string) => {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString('nl-NL')}] ${msg}`])
  }, [])

  // Check auth status
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAuthenticated(!!user)
      if (user) {
        addLog(`Ingelogd als ${user.email}`)
        loadGoals()
      } else {
        addLog('Niet ingelogd — demonstratiemodus actief')
      }
    })
  }, [addLog])

  async function loadGoals() {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) {
      addLog(`Fout bij laden doelen: ${error.message}`)
      return
    }

    setGoals((data ?? []) as TestGoal[])
    addLog(`${(data ?? []).length} doelen geladen uit database`)
  }

  // Full test flow (authenticated)
  async function runFullTest() {
    setTestPhase('creating')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      addLog('ERROR: Niet ingelogd')
      setTestPhase('error')
      return
    }

    // Step 1: Create goal with target €10,000 and initial €2,000
    addLog('Stap 1: Spaardoel aanmaken — doel €10.000, huidig €2.000')
    const { data: newGoal, error: createError } = await supabase
      .from('goals')
      .insert({
        user_id: user.id,
        name: 'TEST_GOAL_PROGRESS_72',
        description: 'Test: voortgang volgt echte current_value wijzigingen',
        goal_type: 'savings',
        target_value: 10000,
        current_value: 2000,
        target_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        icon: 'Target',
        color: 'teal',
        is_completed: false,
      })
      .select()
      .single()

    if (createError) {
      addLog(`ERROR bij aanmaken: ${createError.message}`)
      setTestPhase('error')
      return
    }

    const goalId = newGoal.id
    setTestGoalId(goalId)
    addLog(`Doel aangemaakt met id=${goalId}`)

    // Verify initial progress
    const initialProgress = computeGoalProgress(newGoal as Goal)
    addLog(`Initiële voortgang: ${initialProgress.pct}% (verwacht: 20%)`)
    if (initialProgress.pct !== 20) {
      addLog(`WARNING: Verwacht 20%, kreeg ${initialProgress.pct}%`)
    }

    // Step 2: Update current_value to €3,500
    setTestPhase('updating')
    addLog('Stap 2: current_value bijwerken naar €3.500')
    const { data: updatedGoal, error: updateError } = await supabase
      .from('goals')
      .update({
        current_value: 3500,
        updated_at: new Date().toISOString(),
      })
      .eq('id', goalId)
      .select()
      .single()

    if (updateError) {
      addLog(`ERROR bij bijwerken: ${updateError.message}`)
      setTestPhase('error')
      return
    }

    addLog(`Database bijgewerkt: current_value = ${updatedGoal.current_value}`)

    // Step 3: Verify progress bar shows 35%
    setTestPhase('verifying')
    const updatedProgress = computeGoalProgress(updatedGoal as Goal)
    addLog(`Bijgewerkte voortgang: ${updatedProgress.pct}% (verwacht: 35%)`)

    if (updatedProgress.pct === 35) {
      addLog('✅ PASS: Voortgangsbalk toont correct 35%')
    } else {
      addLog(`❌ FAIL: Verwacht 35%, kreeg ${updatedProgress.pct}%`)
    }

    // Step 4: Verify goal data persisted in database
    const { data: dbGoal, error: readError } = await supabase
      .from('goals')
      .select('*')
      .eq('id', goalId)
      .single()

    if (readError) {
      addLog(`ERROR bij lezen: ${readError.message}`)
    } else {
      addLog(`Database verificatie: current_value=${dbGoal.current_value}, target_value=${dbGoal.target_value}`)
      if (Number(dbGoal.current_value) === 3500 && Number(dbGoal.target_value) === 10000) {
        addLog('✅ PASS: Database waarden correct')
      } else {
        addLog('❌ FAIL: Database waarden onjuist')
      }
    }

    // Reload goals to show updated state
    await loadGoals()
    setTestPhase('done')
    addLog('Test voltooid')
  }

  // Cleanup test goal
  async function cleanupTest() {
    if (!testGoalId) return
    const supabase = createClient()
    await supabase.from('goals').delete().eq('id', testGoalId)
    setTestGoalId(null)
    addLog('Test doel opgeruimd')
    await loadGoals()
  }

  // --- Demo mode (no auth) ---
  const demoGoals: TestGoal[] = [
    {
      id: 'demo-1',
      user_id: 'demo',
      name: 'Noodfonds opbouwen',
      description: 'Demo: spaardoel €10.000, huidig €2.000 (20%)',
      goal_type: 'savings',
      target_value: 10000,
      current_value: 2000,
      target_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      linked_asset_id: null,
      linked_debt_id: null,
      icon: 'Target',
      color: 'teal',
      is_completed: false,
      completed_at: null,
      sort_order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _source: 'demo',
    },
    {
      id: 'demo-2',
      user_id: 'demo',
      name: 'Noodfonds opbouwen (bijgewerkt)',
      description: 'Demo: spaardoel €10.000, huidig €3.500 (35%)',
      goal_type: 'savings',
      target_value: 10000,
      current_value: 3500,
      target_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      linked_asset_id: null,
      linked_debt_id: null,
      icon: 'Target',
      color: 'emerald',
      is_completed: false,
      completed_at: null,
      sort_order: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _source: 'demo',
    },
  ]

  const displayGoals = isAuthenticated ? goals : demoGoals

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">
        Feature #72: Goal Progress Tracks Real current_value Changes
      </h1>
      <p className="text-sm text-zinc-500 mb-6">
        Verifies that goal progress updates when current_value changes — from 20% to 35%.
      </p>

      {/* Auth status */}
      <div className={`mb-6 rounded-lg border p-4 ${
        isAuthenticated ? 'border-emerald-200 bg-emerald-50' :
        isAuthenticated === false ? 'border-amber-200 bg-amber-50' :
        'border-zinc-200 bg-zinc-50'
      }`}>
        <p className="text-sm font-medium">
          {isAuthenticated === null ? '⏳ Auth status controleren...' :
           isAuthenticated ? '✅ Ingelogd — live database test beschikbaar' :
           '⚠️ Niet ingelogd — demonstratiemodus (berekeningen gecontroleerd, geen DB)'}
        </p>
      </div>

      {/* Test controls (authenticated only) */}
      {isAuthenticated && (
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={runFullTest}
            disabled={testPhase === 'creating' || testPhase === 'updating' || testPhase === 'verifying'}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {testPhase === 'idle' ? 'Start volledige test' :
             testPhase === 'done' ? 'Test opnieuw uitvoeren' :
             testPhase === 'error' ? 'Opnieuw proberen' :
             'Bezig...'}
          </button>
          {testGoalId && (
            <button
              onClick={cleanupTest}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Test doel opruimen
            </button>
          )}
        </div>
      )}

      {/* Progress calculation verification */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">
          Voortgangsberekening verificatie
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Step 1: Initial state (20%) */}
          <ProgressVerification
            label="Stap 1: Initieel (€2.000 / €10.000)"
            currentValue={2000}
            targetValue={10000}
            expectedPct={20}
          />
          {/* Step 2: Updated state (35%) */}
          <ProgressVerification
            label="Stap 2: Bijgewerkt (€3.500 / €10.000)"
            currentValue={3500}
            targetValue={10000}
            expectedPct={35}
          />
        </div>
      </section>

      {/* Goal cards with progress bars */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">
          {isAuthenticated ? 'Database doelen' : 'Demo doelen'}
        </h2>
        {displayGoals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
            Geen doelen gevonden. {isAuthenticated ? 'Klik "Start volledige test" om te beginnen.' : ''}
          </div>
        ) : (
          <div className="space-y-3">
            {displayGoals.map(goal => (
              <GoalProgressCard key={goal.id} goal={goal} />
            ))}
          </div>
        )}
      </section>

      {/* Test log */}
      {log.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">
            Test log
          </h2>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 font-mono text-xs space-y-1 max-h-80 overflow-y-auto">
            {log.map((line, i) => (
              <p key={i} className={
                line.includes('✅') ? 'text-emerald-600' :
                line.includes('❌') ? 'text-red-600' :
                line.includes('ERROR') ? 'text-red-600' :
                line.includes('WARNING') ? 'text-amber-600' :
                'text-zinc-600'
              }>
                {line}
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function ProgressVerification({
  label,
  currentValue,
  targetValue,
  expectedPct,
}: {
  label: string
  currentValue: number
  targetValue: number
  expectedPct: number
}) {
  const mockGoal: Goal = {
    id: 'verify',
    user_id: 'verify',
    name: 'Verification',
    description: null,
    goal_type: 'savings',
    target_value: targetValue,
    current_value: currentValue,
    target_date: null,
    linked_asset_id: null,
    linked_debt_id: null,
    icon: 'Target',
    color: 'teal',
    is_completed: false,
    completed_at: null,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const progress = computeGoalProgress(mockGoal)
  const pass = progress.pct === expectedPct

  return (
    <div className={`rounded-xl border p-4 ${pass ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
      <p className="text-sm font-medium text-zinc-700 mb-2">{label}</p>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-zinc-500">
          {formatCurrency(currentValue)} / {formatCurrency(targetValue)}
        </span>
        <span className="text-xs font-bold">
          {progress.pct}%
        </span>
        <span className={`text-xs font-medium ${pass ? 'text-emerald-600' : 'text-red-600'}`}>
          {pass ? '✅ PASS' : `❌ FAIL (verwacht ${expectedPct}%)`}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
        <div
          className={`h-full rounded-full transition-all duration-500 ${pass ? 'bg-emerald-500' : 'bg-red-500'}`}
          style={{ width: `${progress.pct}%` }}
        />
      </div>
    </div>
  )
}

function GoalProgressCard({ goal }: { goal: Goal }) {
  const { current, target, pct, onTrack, eta } = computeGoalProgress(goal)
  const colors = getGoalColorClasses(goal.color)
  const isFreedm = goal.goal_type === 'freedom_days'

  return (
    <div className={`rounded-xl border bg-white p-4 ${colors.border}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors.bgLight}`}>
            <span className={`text-sm ${colors.text}`}>{goal.icon}</span>
          </div>
          <div>
            <h3 className="font-medium text-zinc-900">{goal.name}</h3>
            {goal.description && (
              <p className="text-xs text-zinc-500">{goal.description}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold text-zinc-700">{pct}%</span>
          {!onTrack && goal.target_date && (
            <p className="text-[10px] font-medium text-red-600">Achterstand</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-medium text-zinc-600">
          {isFreedm
            ? `${Math.round(current)} / ${Math.round(target)} dagen`
            : `${formatCurrency(current)} / ${formatCurrency(target)}`}
        </span>
        {eta && <span className="text-zinc-400">{eta}</span>}
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
