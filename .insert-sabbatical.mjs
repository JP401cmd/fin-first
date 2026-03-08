import fs from 'fs'

const path = 'app/(app)/horizon/page.tsx'
let code = fs.readFileSync(path, 'utf8')

// Insert after the erfbelasting breakdown card, before early_retirement
const marker = `{formType === 'early_retirement' && field.key === 'overbruggingsUitkering' && (() => {`

const insertion = `{formType === 'sabbatical' && field.key === 'doorbetalingsPct' && (() => {
                        const nettoInkomen = Number(formMetadata.nettoInkomen ?? 3000)
                        const doorbetalingsPct = Math.min(100, Math.max(0, Number(formMetadata.doorbetalingsPct ?? 0)))
                        const inkomensverlies = Math.round(nettoInkomen * (1 - doorbetalingsPct / 100))
                        const doorbetaling = Math.round(nettoInkomen * doorbetalingsPct / 100)
                        const extraKosten = Number(formMetadata.extraKosten ?? 2000)
                        const durMnd = Number(formDuration) || 6
                        const totaalVerlies = (inkomensverlies * durMnd) + extraKosten
                        return (
                          <div className="mt-2 space-y-1.5 rounded-lg border border-horizon-200 bg-horizon-50/50 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Inkomensverlies berekening</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between"><span>Netto maandinkomen</span><span className="font-mono tabular-nums">{formatCurrency(nettoInkomen)}/mnd</span></div>
                              {doorbetalingsPct > 0 && (<div className="flex justify-between text-emerald-600"><span>Doorbetaling werkgever ({doorbetalingsPct}%)</span><span className="font-mono tabular-nums">+{formatCurrency(doorbetaling)}/mnd</span></div>)}
                              <div className="flex justify-between font-semibold"><span>Maandelijks inkomensverlies</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(inkomensverlies)}/mnd</span></div>
                              {extraKosten > 0 && (<div className="flex justify-between"><span>Extra kosten (eenmalig)</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(extraKosten)}</span></div>)}
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold"><span>Totaal impact ({durMnd} mnd)</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(totaalVerlies)}</span></div>
                            </div>
                            {doorbetalingsPct === 0 && (<p className="text-[10px] text-[var(--ink-4)]">Tip: vraag je werkgever naar sabbaticalregelingen. Sommige cao&#39;s bieden gedeeltelijke doorbetaling.</p>)}
                            {doorbetalingsPct === 100 && (<p className="text-[10px] text-emerald-700">Volledig doorbetaald sabbatical \u2014 alleen extra kosten zijn van toepassing.</p>)}
                          </div>
                        )
                      })()}
                      `

if (code.includes(marker)) {
  code = code.replace(marker, insertion + marker)
  fs.writeFileSync(path, code)
  console.log('OK: inserted sabbatical breakdown card')
} else {
  console.log('ERROR: marker not found')
}
