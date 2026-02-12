'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Upload, FileText, Check, AlertTriangle, X,
  ChevronRight, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { parseMT940 } from '@/lib/parsers/mt940'
import { parseCSV, getCSVHeaders, getCSVPreview } from '@/lib/parsers/csv'
import { parseOFX } from '@/lib/parsers/ofx'
import { detectFormat, CSV_PRESETS, type CSVPreset } from '@/lib/parsers/index'
import type { ParsedTransaction } from '@/lib/parsers/shared'
import { categorizeTransaction } from '@/lib/parsers/categorize'
import type { Budget } from '@/lib/budget-data'

type Account = {
  id: string
  name: string
  iban: string | null
}

type ImportRow = ParsedTransaction & {
  budget_id: string | null
  budgetName: string | null
  confidence: number
  isDuplicate: boolean
  skipImport: boolean
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export default function ImportPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState(1)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [budgetGroups, setBudgetGroups] = useState<{ parent: Budget; children: Budget[] }[]>([])
  const [rows, setRows] = useState<ImportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [detectedFormat, setDetectedFormat] = useState<'mt940' | 'csv' | 'ofx' | 'unknown'>('mt940')
  const [fileContent, setFileContent] = useState('')
  const [csvPreset, setCsvPreset] = useState<CSVPreset>(CSV_PRESETS[0])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvPreview, setCsvPreview] = useState<string[][]>([])
  const [showColumnMapping, setShowColumnMapping] = useState(false)

  useEffect(() => {
    async function init() {
      const supabase = createClient()

      const [accountsRes, budgetsRes] = await Promise.all([
        supabase.from('bank_accounts').select('id, name, iban').eq('is_active', true).order('sort_order'),
        supabase.from('budgets').select('*').order('sort_order'),
      ])

      if (accountsRes.data) {
        setAccounts(accountsRes.data as Account[])
        if (accountsRes.data.length > 0) {
          setSelectedAccountId(accountsRes.data[0].id)
        }
      }

      if (budgetsRes.data) {
        const allBudgets = budgetsRes.data as Budget[]
        setBudgets(allBudgets)
        const parents = allBudgets.filter((b) => !b.parent_id)
        const children = allBudgets.filter((b) => b.parent_id && Number(b.default_limit) > 0)
        setBudgetGroups(parents.map((p) => ({
          parent: p,
          children: children.filter((c) => c.parent_id === p.id),
        })))
      }

      setLoading(false)
    }

    init()
  }, [])

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setParsing(true)
    setError('')

    try {
      const content = await file.text()
      setFileContent(content)
      const format = detectFormat(content, file.name)
      setDetectedFormat(format)

      if (format === 'csv') {
        // For CSV: detect delimiter and show column mapping
        const semiCount = (content.split('\n')[0]?.match(/;/g) || []).length
        const commaCount = (content.split('\n')[0]?.match(/,/g) || []).length
        const tabCount = (content.split('\n')[0]?.match(/\t/g) || []).length

        let bestPreset = CSV_PRESETS.find(p => p.id === 'custom')!
        if (semiCount > commaCount && semiCount > tabCount) {
          bestPreset = CSV_PRESETS.find(p => p.id === 'ing') ?? bestPreset
        } else if (tabCount > commaCount) {
          bestPreset = CSV_PRESETS.find(p => p.id === 'abn') ?? bestPreset
        }

        setCsvPreset(bestPreset)
        setCsvHeaders(getCSVHeaders(content, bestPreset.delimiter))
        setCsvPreview(getCSVPreview(content, bestPreset.delimiter, bestPreset.hasHeader))
        setShowColumnMapping(true)
        setParsing(false)
        return
      }

      let parsed: ParsedTransaction[] = []
      if (format === 'mt940') {
        parsed = await parseMT940(content)
      } else if (format === 'ofx') {
        parsed = await parseOFX(content)
      } else {
        setError('Onbekend bestandsformaat. Ondersteunde formaten: MT940 (.sta), CSV (.csv), OFX (.ofx/.qfx)')
        setParsing(false)
        return
      }

      if (parsed.length === 0) {
        setError(`Geen transacties gevonden in dit bestand. Controleer of het een geldig ${format.toUpperCase()}-bestand is.`)
        setParsing(false)
        return
      }

      // Auto-categorize
      const importRows: ImportRow[] = parsed.map((tx) => {
        const cat = categorizeTransaction(tx.description, tx.counterparty_name, tx.amount, budgets)
        return {
          ...tx,
          budget_id: cat.budget_id,
          budgetName: cat.budgetName,
          confidence: cat.confidence,
          isDuplicate: false,
          skipImport: false,
        }
      })

      setRows(importRows)
      setStep(2)
    } catch (err) {
      setError('Fout bij het verwerken van het bestand. Controleer het formaat.')
      console.error(err)
    }

    setParsing(false)
  }

  async function handleCSVParse() {
    setParsing(true)
    setError('')
    setShowColumnMapping(false)

    try {
      const parsed = await parseCSV(fileContent, csvPreset)

      if (parsed.length === 0) {
        setError('Geen transacties gevonden. Controleer de kolom-toewijzingen.')
        setParsing(false)
        return
      }

      const importRows: ImportRow[] = parsed.map((tx) => {
        const cat = categorizeTransaction(tx.description, tx.counterparty_name, tx.amount, budgets)
        return {
          ...tx,
          budget_id: cat.budget_id,
          budgetName: cat.budgetName,
          confidence: cat.confidence,
          isDuplicate: false,
          skipImport: false,
        }
      })

      setRows(importRows)
      setStep(2)
    } catch (err) {
      setError('Fout bij het verwerken van het CSV-bestand.')
      console.error(err)
    }

    setParsing(false)
  }

  function updateCSVPreset(presetId: string) {
    const preset = CSV_PRESETS.find(p => p.id === presetId) ?? CSV_PRESETS[CSV_PRESETS.length - 1]
    setCsvPreset(preset)
    setCsvHeaders(getCSVHeaders(fileContent, preset.delimiter))
    setCsvPreview(getCSVPreview(fileContent, preset.delimiter, preset.hasHeader))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) {
      // Trigger via a synthetic change
      const dt = new DataTransfer()
      dt.items.add(file)
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files
        fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }
  }

  function updateRowBudget(index: number, budgetId: string) {
    setRows((prev) => prev.map((r, i) => {
      if (i !== index) return r
      const budget = budgets.find((b) => b.id === budgetId)
      return {
        ...r,
        budget_id: budgetId || null,
        budgetName: budget?.name ?? null,
        confidence: budgetId ? 1.0 : 0,
      }
    }))
  }

  function toggleSkip(index: number) {
    setRows((prev) => prev.map((r, i) =>
      i === index ? { ...r, skipImport: !r.skipImport } : r
    ))
  }

  async function checkDuplicates() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const hashes = rows.map((r) => r.import_hash)
    const { data: existing } = await supabase
      .from('transactions')
      .select('import_hash')
      .eq('user_id', user.id)
      .in('import_hash', hashes)

    if (existing) {
      const existingSet = new Set(existing.map((e) => e.import_hash))
      setRows((prev) => prev.map((r) => ({
        ...r,
        isDuplicate: existingSet.has(r.import_hash),
        skipImport: existingSet.has(r.import_hash) ? true : r.skipImport,
      })))
    }

    setStep(3)
  }

  async function handleImport() {
    setImporting(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Niet ingelogd')
      setImporting(false)
      return
    }

    const toImport = rows.filter((r) => !r.skipImport)

    const insertRows = toImport.map((r) => ({
      user_id: user.id,
      account_id: selectedAccountId,
      date: r.date,
      amount: r.amount,
      description: r.description,
      counterparty_name: r.counterparty_name,
      counterparty_iban: r.counterparty_iban,
      budget_id: r.budget_id,
      is_income: r.amount > 0,
      category_source: r.budget_id ? 'rule' : 'import',
      import_hash: r.import_hash,
      reference: r.reference,
      transaction_type: r.transaction_type,
    }))

    // Insert in batches
    for (let i = 0; i < insertRows.length; i += 50) {
      const { error: insertError } = await supabase
        .from('transactions')
        .insert(insertRows.slice(i, i + 50))

      if (insertError) {
        setError(`Fout bij importeren: ${insertError.message}`)
        setImporting(false)
        return
      }
    }

    setStep(4)
    setImporting(false)
  }

  const newCount = rows.filter((r) => !r.isDuplicate).length
  const dupCount = rows.filter((r) => r.isDuplicate).length
  const toImportCount = rows.filter((r) => !r.skipImport).length
  const totalBij = rows.filter((r) => !r.skipImport && r.amount > 0).reduce((s, r) => s + r.amount, 0)
  const totalAf = rows.filter((r) => !r.skipImport && r.amount < 0).reduce((s, r) => s + r.amount, 0)

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Back */}
      <div className="mb-6">
        <Link
          href="/core/cash"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar Cash
        </Link>
      </div>

      <h1 className="mb-2 text-2xl font-bold text-zinc-900">Transacties importeren</h1>
      <p className="mb-8 text-sm text-zinc-500">Upload een bankbestand (MT940, CSV of OFX) van je bank.</p>

      {/* Steps indicator */}
      <div className="mb-8 flex items-center gap-2 text-sm">
        {['Upload', 'Categoriseer', 'Dubbelingen', 'Klaar'].map((label, i) => {
          const stepNum = i + 1
          const isActive = step === stepNum
          const isDone = step > stepNum

          return (
            <div key={i} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="h-4 w-4 text-zinc-300" />}
              <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                isActive ? 'bg-amber-100 text-amber-700' :
                isDone ? 'bg-emerald-100 text-emerald-700' :
                'bg-zinc-100 text-zinc-400'
              }`}>
                {isDone ? <Check className="h-3 w-3" /> : <span>{stepNum}</span>}
                <span>{label}</span>
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Account selector */}
          <div>
            <label htmlFor="import-account" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Bankrekening
            </label>
            <select
              id="import-account"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full max-w-sm rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}{a.iban ? ` (${a.iban})` : ''}</option>
              ))}
            </select>
          </div>

          {/* File upload */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-12 hover:border-amber-400 hover:bg-amber-50/30"
          >
            {parsing ? (
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            ) : (
              <>
                <FileText className="h-10 w-10 text-zinc-400" />
                <p className="mt-4 text-sm font-medium text-zinc-700">
                  Sleep een MT940-bestand hierheen
                </p>
                <p className="mt-1 text-xs text-zinc-500">of</p>
                <label className="mt-3 cursor-pointer rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
                  <Upload className="mr-2 inline h-4 w-4" />
                  Bestand kiezen
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".sta,.txt,.mt940,.940,.csv,.ofx,.qfx"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
                <p className="mt-3 text-xs text-zinc-400">Ondersteunde formaten: MT940 (.sta, .mt940), CSV (.csv), OFX (.ofx, .qfx)</p>
              </>
            )}
          </div>

          {/* CSV Column Mapping */}
          {showColumnMapping && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-800">
                  CSV-bestand gedetecteerd: <strong>{fileName}</strong>
                </p>
                <p className="mt-1 text-xs text-amber-600">Kies een preset of wijs kolommen handmatig toe.</p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Bank preset</label>
                <select
                  value={csvPreset.id}
                  onChange={(e) => updateCSVPreset(e.target.value)}
                  className="w-full max-w-sm rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                >
                  {CSV_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>

              {csvPreset.id === 'custom' && csvHeaders.length > 0 && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Datum kolom</label>
                    <select
                      value={csvPreset.dateColumn}
                      onChange={(e) => setCsvPreset(prev => ({ ...prev, dateColumn: parseInt(e.target.value) }))}
                      className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-xs text-zinc-900 outline-none focus:border-amber-500"
                    >
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>{h || `Kolom ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Bedrag kolom</label>
                    <select
                      value={csvPreset.amountColumn}
                      onChange={(e) => setCsvPreset(prev => ({ ...prev, amountColumn: parseInt(e.target.value) }))}
                      className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-xs text-zinc-900 outline-none focus:border-amber-500"
                    >
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>{h || `Kolom ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Beschrijving kolom</label>
                    <select
                      value={csvPreset.descriptionColumn}
                      onChange={(e) => setCsvPreset(prev => ({ ...prev, descriptionColumn: parseInt(e.target.value) }))}
                      className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-xs text-zinc-900 outline-none focus:border-amber-500"
                    >
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>{h || `Kolom ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Datum formaat</label>
                    <select
                      value={csvPreset.dateFormat}
                      onChange={(e) => setCsvPreset(prev => ({ ...prev, dateFormat: e.target.value }))}
                      className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-xs text-zinc-900 outline-none focus:border-amber-500"
                    >
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      <option value="YYYYMMDD">YYYYMMDD</option>
                      <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Preview */}
              {csvPreview.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-500">Preview (eerste {csvPreview.length} regels)</p>
                  <div className="overflow-x-auto rounded-lg border border-zinc-200">
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-50">
                        <tr>
                          {csvHeaders.map((h, i) => (
                            <th key={i} className="px-3 py-1.5 text-left font-medium text-zinc-500">
                              {h || `Kolom ${i + 1}`}
                              {i === csvPreset.dateColumn && <span className="ml-1 text-amber-500">📅</span>}
                              {i === csvPreset.amountColumn && <span className="ml-1 text-amber-500">💰</span>}
                              {i === csvPreset.descriptionColumn && <span className="ml-1 text-amber-500">📝</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {csvPreview.map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td key={ci} className={`max-w-[150px] truncate px-3 py-1.5 ${
                                ci === csvPreset.dateColumn || ci === csvPreset.amountColumn || ci === csvPreset.descriptionColumn
                                  ? 'bg-amber-50/50 font-medium text-zinc-900'
                                  : 'text-zinc-600'
                              }`}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <button
                onClick={handleCSVParse}
                disabled={parsing}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                Transacties importeren
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Preview + categorization */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-600">
              <strong>{rows.length}</strong> transacties gevonden in <strong>{fileName}</strong>
            </p>
            <button
              onClick={checkDuplicates}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              Volgende: dubbelingen checken
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium text-zinc-500">Datum</th>
                  <th className="px-4 py-2 font-medium text-zinc-500">Beschrijving</th>
                  <th className="px-4 py-2 font-medium text-zinc-500">Bedrag</th>
                  <th className="px-4 py-2 font-medium text-zinc-500">Budget</th>
                  <th className="px-4 py-2 font-medium text-zinc-500 text-center">Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-zinc-50">
                    <td className="whitespace-nowrap px-4 py-2 text-zinc-700">
                      {new Date(row.date + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="max-w-[300px] truncate px-4 py-2 text-zinc-900">
                      {row.description}
                      {row.counterparty_name && (
                        <span className="ml-1 text-xs text-zinc-500">({row.counterparty_name})</span>
                      )}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-2 font-medium ${
                      row.amount > 0 ? 'text-emerald-600' : 'text-zinc-900'
                    }`}>
                      {row.amount > 0 ? '+' : ''}{formatCurrency(row.amount)}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={row.budget_id ?? ''}
                        onChange={(e) => updateRowBudget(idx, e.target.value)}
                        className="w-full max-w-[200px] rounded border border-zinc-200 px-2 py-1 text-xs outline-none focus:border-amber-500"
                      >
                        <option value="">Niet gecategoriseerd</option>
                        {budgetGroups
                          .filter((group) => group.children.length > 0)
                          .map((group) => (
                          <optgroup key={group.parent.id} label={group.parent.name}>
                            {group.children.map((child) => (
                              <option key={child.id} value={child.id}>{child.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {row.confidence >= 0.9 ? (
                        <Check className="mx-auto h-4 w-4 text-emerald-500" />
                      ) : row.confidence >= 0.5 ? (
                        <AlertTriangle className="mx-auto h-4 w-4 text-orange-500" />
                      ) : (
                        <X className="mx-auto h-4 w-4 text-red-400" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Step 3: Duplicate detection */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-4 text-sm">
              <span className="text-emerald-600"><strong>{newCount}</strong> nieuwe</span>
              <span className="text-orange-600"><strong>{dupCount}</strong> duplicaten</span>
            </div>
            <button
              onClick={handleImport}
              disabled={importing || toImportCount === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importeren...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  {toImportCount} transacties importeren
                </>
              )}
            </button>
          </div>

          {dupCount > 0 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-700">
              <strong>{dupCount}</strong> transactie(s) bestaan al in de database en worden overgeslagen. Je kunt ze handmatig selecteren om toch te importeren.
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium text-zinc-500">Importeer</th>
                  <th className="px-4 py-2 font-medium text-zinc-500">Datum</th>
                  <th className="px-4 py-2 font-medium text-zinc-500">Beschrijving</th>
                  <th className="px-4 py-2 font-medium text-zinc-500">Bedrag</th>
                  <th className="px-4 py-2 font-medium text-zinc-500">Budget</th>
                  <th className="px-4 py-2 font-medium text-zinc-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row, idx) => (
                  <tr key={idx} className={`${row.skipImport ? 'bg-zinc-50 opacity-60' : 'hover:bg-zinc-50'}`}>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={!row.skipImport}
                        onChange={() => toggleSkip(idx)}
                        className="h-4 w-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-zinc-700">
                      {new Date(row.date + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="max-w-[250px] truncate px-4 py-2 text-zinc-900">
                      {row.description}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-2 font-medium ${
                      row.amount > 0 ? 'text-emerald-600' : 'text-zinc-900'
                    }`}>
                      {row.amount > 0 ? '+' : ''}{formatCurrency(row.amount)}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-600">
                      {row.budgetName ?? 'Niet gecategoriseerd'}
                    </td>
                    <td className="px-4 py-2">
                      {row.isDuplicate ? (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                          Duplicaat
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Nieuw
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Step 4: Success */}
      {step === 4 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-6 w-6 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900">Import geslaagd!</h2>
          <p className="mt-2 text-sm text-zinc-600">
            <strong>{toImportCount}</strong> transacties geïmporteerd.
          </p>
          <div className="mt-2 flex justify-center gap-6 text-sm text-zinc-500">
            <span>Totaal bij: <strong className="text-emerald-600">{formatCurrency(totalBij)}</strong></span>
            <span>Totaal af: <strong className="text-red-600">{formatCurrency(Math.abs(totalAf))}</strong></span>
          </div>
          <div className="mt-6">
            <Link
              href="/core/cash"
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-6 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              Naar Cash overzicht
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
