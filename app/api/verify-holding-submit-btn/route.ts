import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  // Read the HoldingForm component source
  const holdingsPagePath = path.join(
    process.cwd(),
    'app/(app)/core/assets/holdings/page.tsx'
  )

  let src = ''
  try {
    src = fs.readFileSync(holdingsPagePath, 'utf-8')
  } catch {
    return NextResponse.json({
      pass: false,
      results: [{ name: 'File exists', pass: false, detail: 'Could not read holdings page.tsx' }],
    })
  }

  // 1. HoldingForm component exists
  results.push({
    name: 'HoldingForm component exists',
    pass: src.includes('function HoldingForm('),
    detail: 'HoldingForm function component must be defined',
  })

  // 2. saving state variable exists
  results.push({
    name: 'saving state variable exists',
    pass: src.includes("const [saving, setSaving] = useState(false)"),
    detail: 'Must have useState(false) for saving state',
  })

  // 3. submitted state variable exists (prevents re-submission)
  results.push({
    name: 'submitted state variable exists',
    pass: src.includes("const [submitted, setSubmitted] = useState(false)"),
    detail: 'Must have useState(false) for submitted state',
  })

  // 4. setSaving(true) is called at start of handleSave
  results.push({
    name: 'setSaving(true) called on submit',
    pass: src.includes('setSaving(true)'),
    detail: 'handleSave must set saving=true to trigger loading state',
  })

  // 5. setSaving(false) in finally block
  results.push({
    name: 'setSaving(false) in finally block',
    pass: /finally\s*\{[^}]*setSaving\(false\)/s.test(src),
    detail: 'Finally block must reset saving to false',
  })

  // 6. Submit button is disabled when saving
  results.push({
    name: 'Button disabled during save',
    pass: /disabled=\{saving\s*\|\|\s*submitted/.test(src),
    detail: 'Button must have disabled={saving || submitted || ...}',
  })

  // 7. Button shows loading text "Opslaan..." when saving
  results.push({
    name: 'Button shows loading text',
    pass: src.includes("saving ? 'Opslaan...'"),
    detail: "Button text must show 'Opslaan...' during saving",
  })

  // 8. Button shows success text after submission
  results.push({
    name: 'Button shows success text after save',
    pass: src.includes("submitted ? 'Opgeslagen ✓'"),
    detail: "Button text must show 'Opgeslagen ✓' after successful save",
  })

  // 9. data-testid on submit button
  results.push({
    name: 'Submit button has data-testid',
    pass: src.includes('data-testid="holding-submit-btn"'),
    detail: 'Submit button must have data-testid="holding-submit-btn"',
  })

  // 10. setSubmitted(true) called after successful save
  results.push({
    name: 'setSubmitted(true) after successful save',
    pass: src.includes('setSubmitted(true)'),
    detail: 'Must set submitted=true after successful POST',
  })

  // 11. Guard at top of handleSave prevents re-entry
  results.push({
    name: 'Guard prevents re-entry when submitted',
    pass: /if\s*\(\s*!name\s*\|\|\s*submitted\s*\)\s*return/.test(src),
    detail: 'handleSave must return early if already submitted',
  })

  // 12. Button has disabled:opacity-50 styling
  results.push({
    name: 'Button has disabled styling',
    pass: src.includes('disabled:opacity-50'),
    detail: 'Disabled button must have visual feedback via opacity',
  })

  const allPass = results.every((r) => r.pass)

  return NextResponse.json({
    pass: allPass,
    passing: results.filter((r) => r.pass).length,
    total: results.length,
    results,
  })
}
