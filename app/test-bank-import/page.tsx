'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parseCSV } from '@/lib/parsers/csv'
import { parseMT940 } from '@/lib/parsers/mt940'
import { parseOFX } from '@/lib/parsers/ofx'
import { detectFormat, CSV_PRESETS } from '@/lib/parsers/index'
import { categorizeTransaction } from '@/lib/parsers/categorize'
import type { ParsedTransaction } from '@/lib/parsers/shared'
import type { Budget } from '@/lib/budget-data'

type TestResult = {
  step: string
  status: 'pass' | 'fail' | 'skip' | 'running'
  detail: string
}

// ING CSV test data
const TEST_ING_CSV = `Datum;Naam / Omschrijving;Rekening;Tegenrekening;Code;Af Bij;Bedrag (EUR);Mutatiesoort;Mededelingen
20260201;Albert Heijn;NL91INGB0001234567;NL20INGB0009876543;GT;Af;45,50;Betaalautomaat;Betaling Albert Heijn 1234
20260203;Salaris Werkgever BV;NL91INGB0001234567;NL55RABO0123456789;OV;Bij;3250,00;Overschrijving;Salaris februari 2026
20260205;Vattenfall Energie;NL91INGB0001234567;NL44ABNA0567890123;IC;Af;185,00;Incasso;Maandtermijn energie feb 2026
20260207;Shell Tankstation;NL91INGB0001234567;NL33INGB0007654321;GT;Af;72,30;Betaalautomaat;Tankbeurt Shell A12
20260210;Jumbo Supermarkt;NL91INGB0001234567;NL88RABO0998877665;GT;Af;38,90;Betaalautomaat;TEST_IMPORT_84 Jumbo boodschappen
20260212;Etos Drogisterij;NL91INGB0001234567;NL77ABNA0112233445;GT;Af;23,45;Betaalautomaat;Huishoudelijke artikelen
20260215;NS Reizen;NL91INGB0001234567;NL66INGB0005544332;IC;Af;156,80;Incasso;NS Flex maandabonnement feb 2026`

// MT940 test data - proper SWIFT MT940 format
const TEST_MT940 = `:20:STARTUMS
:25:NL91INGB0001234567EUR
:28C:00000/001
:60F:C260131EUR5000,00
:61:2602010201D45,50NTRFNONREF//TRCD00001
:86:/NAME/Albert Heijn/IBAN/NL20INGB0009876543/REMI/Betaling Albert Heijn MT940
:61:2602030203C3250,00NTRFNONREF//TRCD00002
:86:/NAME/Salaris Werkgever BV/IBAN/NL55RABO0123456789/REMI/Salaris februari 2026 MT940
:61:2602050205D185,00NTRFNONREF//TRCD00003
:86:/NAME/Vattenfall Energie/IBAN/NL44ABNA0567890123/REMI/Maandtermijn energie feb 2026 MT940
:62F:C260215EUR8019,50`

export default function TestBankImportPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [running, setRunning] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginSuccess, setLoginSuccess] = useState(false)

  function addResult(step: string, status: TestResult['status'], detail: string) {
    setResults(prev => {
      const existing = prev.findIndex(r => r.step === step)
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = { step, status, detail }
        return updated
      }
      return [...prev, { step, status, detail }]
    })
  }

  async function handleLogin() {
    setLoginError('')
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) {
      setLoginError(error.message)
      return
    }
    setUserId(data.user?.id ?? null)
    setLoginSuccess(true)
  }

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient()
      const { data } = await supabase.auth.getUser()
      if (data.user) {
        setUserId(data.user.id)
        setLoginSuccess(true)
      }
    }
    checkAuth()
  }, [])

  async function runTests() {
    setRunning(true)
    setResults([])
    const supabase = createClient()

    // ── Step 1: Test format detection ──
    addResult('Format Detection', 'running', 'Testing format detection...')
    try {
      const csvFormat = detectFormat(TEST_ING_CSV, 'test.csv')
      const mt940Format = detectFormat(TEST_MT940, 'test.sta')
      if (csvFormat === 'csv' && mt940Format === 'mt940') {
        addResult('Format Detection', 'pass', `CSV detected as "${csvFormat}", MT940 detected as "${mt940Format}"`)
      } else {
        addResult('Format Detection', 'fail', `Expected csv/mt940, got ${csvFormat}/${mt940Format}`)
      }
    } catch (e: any) {
      addResult('Format Detection', 'fail', `Error: ${e.message}`)
    }

    // ── Step 2: Test CSV parsing (ING format) ──
    addResult('CSV Parsing (ING)', 'running', 'Parsing ING CSV...')
    let csvTransactions: ParsedTransaction[] = []
    try {
      csvTransactions = await parseCSV(TEST_ING_CSV, CSV_PRESETS[0]) // ING preset
      if (csvTransactions.length === 7) {
        // Check sign handling
        const salary = csvTransactions.find(t => t.description.includes('Salaris'))
        const albertHeijn = csvTransactions.find(t => t.description.includes('Albert Heijn'))
        const signCorrect = salary && salary.amount > 0 && albertHeijn && albertHeijn.amount < 0

        if (signCorrect) {
          addResult('CSV Parsing (ING)', 'pass',
            `Parsed ${csvTransactions.length} transactions. Salary: +€${salary!.amount.toFixed(2)}, AH: €${albertHeijn!.amount.toFixed(2)}. Sign handling correct.`)
        } else {
          addResult('CSV Parsing (ING)', 'fail',
            `Sign handling incorrect. Salary amount: ${salary?.amount}, AH amount: ${albertHeijn?.amount}`)
        }
      } else {
        addResult('CSV Parsing (ING)', 'fail', `Expected 7 transactions, got ${csvTransactions.length}`)
      }
    } catch (e: any) {
      addResult('CSV Parsing (ING)', 'fail', `Error: ${e.message}`)
    }

    // ── Step 3: Test MT940 parsing ──
    addResult('MT940 Parsing', 'running', 'Parsing MT940 file...')
    let mt940Transactions: ParsedTransaction[] = []
    try {
      mt940Transactions = await parseMT940(TEST_MT940)
      if (mt940Transactions.length >= 2) {
        const salary = mt940Transactions.find(t => t.description.includes('Salaris'))
        const ah = mt940Transactions.find(t => t.description.includes('Albert Heijn'))

        addResult('MT940 Parsing', 'pass',
          `Parsed ${mt940Transactions.length} transactions. ` +
          `Counterparty extraction: ${ah?.counterparty_name ?? 'N/A'}. ` +
          `IBAN: ${ah?.counterparty_iban ?? 'N/A'}`)
      } else {
        addResult('MT940 Parsing', 'fail', `Expected 3+ transactions, got ${mt940Transactions.length}`)
      }
    } catch (e: any) {
      addResult('MT940 Parsing', 'fail', `Error: ${e.message}`)
    }

    // ── Step 4: Test categorization ──
    addResult('Categorization', 'running', 'Testing auto-categorization...')
    try {
      const { data: budgets } = await supabase.from('budgets').select('*').order('sort_order')
      const allBudgets = (budgets ?? []) as Budget[]

      if (allBudgets.length === 0) {
        addResult('Categorization', 'skip', 'No budgets in database - categorization requires budgets to be set up first')
      } else {
        let categorized = 0
        const catResults: string[] = []
        for (const tx of csvTransactions) {
          const cat = categorizeTransaction(tx.description, tx.counterparty_name, tx.amount, allBudgets)
          if (cat.budget_id) {
            categorized++
            catResults.push(`"${tx.counterparty_name || tx.description.substring(0, 20)}" → ${cat.budgetName} (${(cat.confidence * 100).toFixed(0)}%)`)
          }
        }
        addResult('Categorization', categorized > 0 ? 'pass' : 'fail',
          `${categorized}/${csvTransactions.length} auto-categorized. ${catResults.slice(0, 3).join('; ')}`)
      }
    } catch (e: any) {
      addResult('Categorization', 'fail', `Error: ${e.message}`)
    }

    // ── Step 5: Test duplicate detection (hash computation) ──
    addResult('Duplicate Detection', 'running', 'Testing hash computation...')
    try {
      const hashes = csvTransactions.map(t => t.import_hash)
      const uniqueHashes = new Set(hashes)
      if (uniqueHashes.size === csvTransactions.length) {
        addResult('Duplicate Detection', 'pass',
          `All ${csvTransactions.length} transactions have unique hashes. Hash sample: ${hashes[0]?.substring(0, 16)}...`)
      } else {
        addResult('Duplicate Detection', 'fail',
          `Hash collision: ${uniqueHashes.size} unique hashes for ${csvTransactions.length} transactions`)
      }
    } catch (e: any) {
      addResult('Duplicate Detection', 'fail', `Error: ${e.message}`)
    }

    // ── Step 6: Test database import (requires auth) ──
    if (!userId) {
      addResult('Database Import', 'skip', 'Login required for database import test')
      addResult('Transaction Visibility', 'skip', 'Login required')
      addResult('Budget Actuals', 'skip', 'Login required')
      addResult('Cleanup', 'skip', 'Login required')
      setRunning(false)
      return
    }

    addResult('Database Import', 'running', 'Creating test bank account and importing transactions...')
    try {
      // Create a test bank account
      const { data: account, error: accError } = await supabase
        .from('bank_accounts')
        .insert({
          user_id: userId,
          name: 'TEST_IMPORT_84 Bank Account',
          iban: 'NL91INGB0001234567',
          bank_name: 'ING',
          account_type: 'checking',
          balance: 5000,
          sort_order: 999,
        })
        .select('id')
        .single()

      if (accError) throw new Error(`Account creation failed: ${accError.message}`)
      const accountId = account.id

      // Get budgets for categorization
      const { data: budgets } = await supabase.from('budgets').select('*').order('sort_order')
      const allBudgets = (budgets ?? []) as Budget[]

      // Import transactions
      const importRows = csvTransactions.map(tx => {
        const cat = allBudgets.length > 0
          ? categorizeTransaction(tx.description, tx.counterparty_name, tx.amount, allBudgets)
          : { budget_id: null, budgetName: null, confidence: 0 }

        return {
          user_id: userId,
          account_id: accountId,
          date: tx.date,
          amount: tx.amount,
          description: tx.description,
          counterparty_name: tx.counterparty_name,
          counterparty_iban: tx.counterparty_iban,
          budget_id: cat.budget_id,
          is_income: tx.amount > 0,
          category_source: cat.budget_id ? 'rule' : 'import',
          import_hash: tx.import_hash,
          reference: tx.reference,
          transaction_type: tx.transaction_type,
        }
      })

      const { error: insertError } = await supabase
        .from('transactions')
        .insert(importRows)

      if (insertError) throw new Error(`Import failed: ${insertError.message}`)

      addResult('Database Import', 'pass',
        `Imported ${importRows.length} transactions into account "${account.id.substring(0, 8)}..."`)

      // ── Step 7: Verify transactions visible ──
      addResult('Transaction Visibility', 'running', 'Checking imported transactions...')
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('id, date, amount, description, budget_id, import_hash')
        .eq('account_id', accountId)
        .order('date', { ascending: false })

      if (txError) throw new Error(`Query failed: ${txError.message}`)
      const importedTxs = txData ?? []
      const testMarker = importedTxs.find(t => t.description.includes('TEST_IMPORT_84'))

      addResult('Transaction Visibility', importedTxs.length === 7 ? 'pass' : 'fail',
        `Found ${importedTxs.length}/7 transactions. Test marker present: ${testMarker ? 'YES' : 'NO'}. ` +
        `Date range: ${importedTxs[importedTxs.length - 1]?.date} to ${importedTxs[0]?.date}`)

      // ── Step 8: Verify budget actuals ──
      addResult('Budget Actuals', 'running', 'Checking budget spending aggregation...')
      const categorizedTxs = importedTxs.filter(t => t.budget_id)
      if (categorizedTxs.length > 0) {
        const spendingByBudget: Record<string, number> = {}
        for (const t of categorizedTxs) {
          spendingByBudget[t.budget_id!] = (spendingByBudget[t.budget_id!] ?? 0) + Math.abs(Number(t.amount))
        }

        const budgetNames: string[] = []
        for (const [budgetId, amount] of Object.entries(spendingByBudget)) {
          const budget = allBudgets.find(b => b.id === budgetId)
          budgetNames.push(`${budget?.name ?? budgetId.substring(0, 8)}: €${amount.toFixed(2)}`)
        }

        addResult('Budget Actuals', 'pass',
          `${categorizedTxs.length} categorized transactions across ${Object.keys(spendingByBudget).length} budgets. ${budgetNames.join('; ')}`)
      } else {
        addResult('Budget Actuals', allBudgets.length > 0 ? 'fail' : 'skip',
          allBudgets.length > 0
            ? 'No transactions were categorized - rules may not match test data'
            : 'No budgets in database - budget actuals verification skipped')
      }

      // ── Step 9: Test duplicate detection on re-import ──
      addResult('Re-Import Duplicate Detection', 'running', 'Testing duplicate detection on re-import...')
      const hashes = csvTransactions.map(t => t.import_hash)
      const { data: existingHashes } = await supabase
        .from('transactions')
        .select('import_hash')
        .eq('user_id', userId)
        .in('import_hash', hashes)

      const dupCount = existingHashes?.length ?? 0
      addResult('Re-Import Duplicate Detection', dupCount === 7 ? 'pass' : 'fail',
        `${dupCount}/7 transactions detected as duplicates on re-import attempt`)

      // ── Step 10: Cleanup ──
      addResult('Cleanup', 'running', 'Cleaning up test data...')
      await supabase.from('transactions').delete().eq('account_id', accountId)
      await supabase.from('bank_accounts').delete().eq('id', accountId)
      addResult('Cleanup', 'pass', 'Test account and transactions removed')

    } catch (e: any) {
      addResult('Database Import', 'fail', `Error: ${e.message}`)
    }

    setRunning(false)
  }

  const passCount = results.filter(r => r.status === 'pass').length
  const failCount = results.filter(r => r.status === 'fail').length
  const skipCount = results.filter(r => r.status === 'skip').length
  const totalSteps = results.length

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">Test: Bank Import Workflow (#84)</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Tests the complete flow: upload bank file → parse → categorize → import → verify transactions → verify budget actuals
      </p>

      {/* Auth section */}
      {!loginSuccess && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-800 mb-2">Login (optional - enables database tests)</h2>
          <div className="flex gap-2 items-end">
            <div>
              <label className="block text-xs text-amber-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="rounded border border-amber-300 px-2 py-1 text-sm"
                placeholder="test@example.com"
              />
            </div>
            <div>
              <label className="block text-xs text-amber-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="rounded border border-amber-300 px-2 py-1 text-sm"
              />
            </div>
            <button
              onClick={handleLogin}
              className="rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700"
            >
              Inloggen
            </button>
          </div>
          {loginError && <p className="mt-1 text-xs text-red-600">{loginError}</p>}
          <p className="mt-2 text-xs text-amber-600">Without login, only parser tests run (no database operations).</p>
        </div>
      )}

      {loginSuccess && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Ingelogd als user {userId?.substring(0, 8)}... — alle tests beschikbaar
        </div>
      )}

      <button
        onClick={runTests}
        disabled={running}
        className="mb-6 rounded-lg bg-amber-600 px-6 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {running ? 'Tests lopen...' : 'Start alle tests'}
      </button>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          <div className="mb-4 flex gap-4 text-sm">
            <span className="text-emerald-600 font-semibold">{passCount} pass</span>
            <span className="text-red-600 font-semibold">{failCount} fail</span>
            <span className="text-zinc-500">{skipCount} skip</span>
            <span className="text-zinc-400">/ {totalSteps} total</span>
          </div>

          {results.map((r, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 ${
                r.status === 'pass' ? 'border-emerald-200 bg-emerald-50' :
                r.status === 'fail' ? 'border-red-200 bg-red-50' :
                r.status === 'skip' ? 'border-zinc-200 bg-zinc-50' :
                'border-amber-200 bg-amber-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold ${
                  r.status === 'pass' ? 'text-emerald-600' :
                  r.status === 'fail' ? 'text-red-600' :
                  r.status === 'skip' ? 'text-zinc-400' :
                  'text-amber-600'
                }`}>
                  {r.status === 'pass' ? '✓' : r.status === 'fail' ? '✗' : r.status === 'skip' ? '○' : '⟳'}
                </span>
                <span className="text-sm font-medium text-zinc-900">{r.step}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-600">{r.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
