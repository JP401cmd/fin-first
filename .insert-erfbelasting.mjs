import fs from 'fs'

const path = 'app/(app)/horizon/page.tsx'
let code = fs.readFileSync(path, 'utf8')

const marker = `{formType === 'early_retirement' && field.key === 'overbruggingsUitkering' && (() => {`

const insertion = `{formType === 'inheritance' && field.key === 'erfbelastingSchijf' && (() => {
                        const bruto = Number(formMetadata.brutoBedrag ?? 50000)
                        const relatie = String(formMetadata.erfbelastingSchijf ?? 'kind')
                        const erf = berekenErfbelasting(bruto, relatie)
                        const tariefLabel = { kind: '10\u201320%', partner: '10\u201320%', kleinkind: '18\u201336%', overig: '30\u201340%' }
                        return (
                          <div className="mt-2 space-y-1.5 rounded-lg border border-horizon-200 bg-horizon-50/50 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Erfbelasting berekening (2026)</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between"><span>Bruto erfenis</span><span className="font-mono tabular-nums">{formatCurrency(bruto)}</span></div>
                              <div className="flex justify-between text-emerald-600"><span>Vrijstelling ({relatie})</span><span className="font-mono tabular-nums">-{formatCurrency(erf.vrijstelling)}</span></div>
                              <div className="flex justify-between"><span>Belastbaar bedrag</span><span className="font-mono tabular-nums">{formatCurrency(erf.belastbaar)}</span></div>
                              {erf.belastingLaag > 0 && (<div className="flex justify-between text-[var(--ink-3)]"><span className="pl-3">Schijf 1 ({tariefLabel[relatie]})</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(erf.belastingLaag)}</span></div>)}
                              {erf.belastingHoog > 0 && (<div className="flex justify-between text-[var(--ink-3)]"><span className="pl-3">Schijf 2</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(erf.belastingHoog)}</span></div>)}
                              <div className="flex justify-between"><span>Totaal erfbelasting</span><span className={\`font-mono tabular-nums \${erf.totaalBelasting > 0 ? 'text-red-600' : ''}\`}>{erf.totaalBelasting > 0 ? \`-\${formatCurrency(erf.totaalBelasting)}\` : formatCurrency(0)}</span></div>
                              {erf.effectiefTarief > 0 && (<div className="flex justify-between text-[var(--ink-4)]"><span>Effectief tarief</span><span className="font-mono tabular-nums">{erf.effectiefTarief}%</span></div>)}
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold"><span>Netto erfenis</span><span className="font-mono tabular-nums text-emerald-600">+{formatCurrency(erf.netto)}</span></div>
                            </div>
                            {relatie === 'partner' && bruto <= erf.vrijstelling && (<p className="text-[10px] text-emerald-700">Volledig vrijgesteld: de partnervrijstelling ({formatCurrency(erf.vrijstelling)}) overschrijdt het bedrag.</p>)}
                          </div>
                        )
                      })()}
                      `

if (code.includes(marker)) {
  code = code.replace(marker, insertion + marker)
  fs.writeFileSync(path, code)
  console.log('OK: inserted erfbelasting breakdown card')
} else {
  console.log('ERROR: marker not found')
  // Try with reformatted version
  const marker2 = `{formType === 'early_retirement' &&`
  if (code.includes(marker2)) {
    console.log('Found reformatted marker at:', code.indexOf(marker2))
  }
}
