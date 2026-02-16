'use client'

import { useState, useRef } from 'react'
import { FileText, Upload, AlertTriangle, Check, X } from 'lucide-react'
import { detectFormat } from '@/lib/parsers/index'
import { parseMT940 } from '@/lib/parsers/mt940'
import { parseOFX } from '@/lib/parsers/ofx'
import { parseCSV, getCSVHeaders, getCSVPreview } from '@/lib/parsers/csv'
import { CSV_PRESETS } from '@/lib/parsers/index'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

export default function TestImportValidation() {
  const [results, setResults] = useState<TestResult[]>([])
  const [running, setRunning] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadFileName, setUploadFileName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Simulate the handleFileSelect logic from the real import page
  async function testFileUpload(content: string, fileName: string): Promise<string | null> {
    const format = detectFormat(content, fileName)
    const fileExt = fileName.split('.').pop()?.toLowerCase() || ''

    if (format === 'unknown') {
      return (
        `Ongeldig bestandsformaat${fileExt ? ` (.${fileExt})` : ''}. ` +
        'Dit bestand wordt niet herkend als een geldig bankbestand. ' +
        'Ondersteunde formaten: MT940 (.sta, .mt940), CSV (.csv), OFX (.ofx, .qfx).'
      )
    }

    if (format === 'csv') {
      // Test CSV parsing
      const bestPreset = CSV_PRESETS.find(p => p.id === 'custom')!
      try {
        const parsed = await parseCSV(content, bestPreset)
        if (parsed.length === 0) {
          return (
            'Geen geldige transacties gevonden in het CSV-bestand. ' +
            'Het bestand is mogelijk beschadigd of de kolom-toewijzingen kloppen niet. ' +
            'Controleer of het bestand geldige datum- en bedragkolommen bevat.'
          )
        }
      } catch (err) {
        return (
          'Fout bij het verwerken van het CSV-bestand. ' +
          'Het bestand lijkt beschadigd of heeft een onverwacht formaat. ' +
          'Controleer of het een geldig CSV-bestand van je bank is.'
        )
      }
    }

    if (format === 'mt940') {
      try {
        const parsed = await parseMT940(content)
        if (parsed.length === 0) {
          return `Geen transacties gevonden in dit bestand. Controleer of het een geldig MT940-bestand is.`
        }
      } catch (err) {
        return (
          'Fout bij het verwerken van het MT940-bestand. ' +
          'Het bestand lijkt beschadigd of heeft een ongeldig formaat. ' +
          'Controleer of het een geldig MT940-bankafschrift is.'
        )
      }
    }

    if (format === 'ofx') {
      try {
        const parsed = await parseOFX(content)
        if (parsed.length === 0) {
          return `Geen transacties gevonden in dit bestand. Controleer of het een geldig OFX-bestand is.`
        }
      } catch (err) {
        return (
          'Fout bij het verwerken van het OFX-bestand. ' +
          'Het bestand lijkt beschadigd of heeft een ongeldig formaat. ' +
          'Controleer of het een geldig OFX/QFX-bankafschrift is.'
        )
      }
    }

    return null // No error = valid file
  }

  async function runAllTests() {
    setRunning(true)
    const testResults: TestResult[] = []

    // Test 1: .txt file with random content should be rejected
    try {
      const txtContent = 'This is just random text content.\nNo financial data here.\nJust plain text.'
      const error = await testFileUpload(txtContent, 'random-file.txt')
      testResults.push({
        name: 'TXT met willekeurige inhoud wordt afgewezen',
        pass: error !== null && error.includes('Ongeldig bestandsformaat') && error.includes('.txt'),
        detail: error || 'Geen foutmelding (onverwacht)',
      })
    } catch (e) {
      testResults.push({ name: 'TXT met willekeurige inhoud wordt afgewezen', pass: false, detail: String(e) })
    }

    // Test 2: .pdf file should be rejected
    try {
      const pdfContent = '%PDF-1.4 some binary content here'
      const error = await testFileUpload(pdfContent, 'statement.pdf')
      testResults.push({
        name: 'PDF-bestand wordt afgewezen',
        pass: error !== null && error.includes('Ongeldig bestandsformaat'),
        detail: error || 'Geen foutmelding (onverwacht)',
      })
    } catch (e) {
      testResults.push({ name: 'PDF-bestand wordt afgewezen', pass: false, detail: String(e) })
    }

    // Test 3: .docx file should be rejected
    try {
      const docxContent = 'PK\x03\x04 some zip-like content'
      const error = await testFileUpload(docxContent, 'document.docx')
      testResults.push({
        name: 'DOCX-bestand wordt afgewezen',
        pass: error !== null && error.includes('Ongeldig bestandsformaat'),
        detail: error || 'Geen foutmelding (onverwacht)',
      })
    } catch (e) {
      testResults.push({ name: 'DOCX-bestand wordt afgewezen', pass: false, detail: String(e) })
    }

    // Test 4: Corrupted CSV should show helpful error
    try {
      const corruptedCSV = 'This is not valid CSV data\nrandom garbage here &*#@!$^\nno headers, no delimiters\njust corrupted file content'
      const error = await testFileUpload(corruptedCSV, 'corrupted.csv')
      testResults.push({
        name: 'Beschadigd CSV toont nuttige foutmelding',
        pass: error !== null && (error.includes('beschadigd') || error.includes('Geen geldige transacties')),
        detail: error || 'Geen foutmelding (onverwacht)',
      })
    } catch (e) {
      testResults.push({ name: 'Beschadigd CSV toont nuttige foutmelding', pass: false, detail: String(e) })
    }

    // Test 5: .txt with MT940-like content should be detected as MT940 (edge case)
    try {
      const mt940Content = ':20:STARTUMS\n:25:NL91ABNA0417164300\n:28C:0\n:60F:C230101EUR0,00\n:62F:C230101EUR0,00\n-'
      const format = detectFormat(mt940Content, 'statement.txt')
      testResults.push({
        name: 'TXT met MT940 markers wordt als MT940 gedetecteerd',
        pass: format === 'mt940',
        detail: `Gedetecteerd formaat: ${format}`,
      })
    } catch (e) {
      testResults.push({ name: 'TXT met MT940 markers wordt als MT940 gedetecteerd', pass: false, detail: String(e) })
    }

    // Test 6: Empty file should be rejected
    try {
      const error = await testFileUpload('', 'empty.txt')
      testResults.push({
        name: 'Leeg bestand wordt afgewezen',
        pass: error !== null,
        detail: error || 'Geen foutmelding (onverwacht)',
      })
    } catch (e) {
      testResults.push({ name: 'Leeg bestand wordt afgewezen', pass: false, detail: String(e) })
    }

    // Test 7: Error message mentions supported formats
    try {
      const error = await testFileUpload('random data', 'test.xyz')
      testResults.push({
        name: 'Foutmelding vermeldt ondersteunde formaten',
        pass: error !== null && error.includes('MT940') && error.includes('CSV') && error.includes('OFX'),
        detail: error || 'Geen foutmelding (onverwacht)',
      })
    } catch (e) {
      testResults.push({ name: 'Foutmelding vermeldt ondersteunde formaten', pass: false, detail: String(e) })
    }

    // Test 8: Valid CSV should not show error
    try {
      const validCSV = 'Datum,Bedrag,Beschrijving\n2024-01-15,125.50,Salaris januari\n2024-01-16,-45.00,Boodschappen AH'
      const error = await testFileUpload(validCSV, 'transactions.csv')
      testResults.push({
        name: 'Geldig CSV-bestand geeft geen foutmelding',
        pass: error === null,
        detail: error || 'Geen foutmelding (correct!)',
      })
    } catch (e) {
      testResults.push({ name: 'Geldig CSV-bestand geeft geen foutmelding', pass: false, detail: String(e) })
    }

    setResults(testResults)
    setRunning(false)
  }

  // Handle manual file upload for interactive testing
  async function handleManualUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadFileName(file.name)
    setUploadError('')

    try {
      const content = await file.text()
      const error = await testFileUpload(content, file.name)
      if (error) {
        setUploadError(error)
      } else {
        setUploadError('Bestand is geldig! Geen foutmelding.')
      }
    } catch (err) {
      setUploadError(`Onverwachte fout: ${String(err)}`)
    }
  }

  const passCount = results.filter(r => r.pass).length
  const totalCount = results.length

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">Import Validatie Tests</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Test dat ongeldige bestanden correct worden afgewezen bij het importeren.
      </p>

      {/* Automated tests */}
      <div className="mb-8">
        <button
          onClick={runAllTests}
          disabled={running}
          className="rounded-lg bg-amber-600 px-6 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {running ? 'Tests uitvoeren...' : 'Alle tests uitvoeren'}
        </button>

        {results.length > 0 && (
          <div className="mt-4">
            <div className={`mb-4 rounded-lg p-3 text-sm font-medium ${
              passCount === totalCount
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {passCount}/{totalCount} tests geslaagd
            </div>

            <div className="space-y-2">
              {results.map((r, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 ${
                    r.pass
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {r.pass ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <X className="h-4 w-4 text-red-600" />
                    )}
                    <span className={`text-sm font-medium ${r.pass ? 'text-emerald-800' : 'text-red-800'}`}>
                      {r.name}
                    </span>
                  </div>
                  <p className="mt-1 ml-6 text-xs text-zinc-600">{r.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Manual upload test */}
      <div className="border-t border-zinc-200 pt-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">Handmatige upload test</h2>
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-8">
          <FileText className="h-8 w-8 text-zinc-400" />
          <label className="mt-3 cursor-pointer rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
            <Upload className="mr-2 inline h-4 w-4" />
            Bestand kiezen
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleManualUpload}
              className="hidden"
            />
          </label>
          <p className="mt-2 text-xs text-zinc-400">Upload elk bestand om de validatie te testen</p>
        </div>

        {uploadFileName && (
          <div className="mt-4">
            <p className="text-sm text-zinc-700">
              Bestand: <strong>{uploadFileName}</strong>
            </p>
            {uploadError && (
              <div className={`mt-2 rounded-lg border p-3 text-sm ${
                uploadError.includes('geldig!') || uploadError.includes('Geen foutmelding')
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}>
                {uploadError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
