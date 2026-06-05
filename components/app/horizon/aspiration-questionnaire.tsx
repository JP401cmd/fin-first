'use client'

import { useState } from 'react'
import {
  Plane,
  Car,
  UtensilsCrossed,
  Sparkles,
  HeartPulse,
  Compass,
  Plus,
  X,
} from 'lucide-react'
import { Kicker, CardEditorial, FiguresStrip } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { formatMaskedCurrency } from '@/lib/format'
import {
  TRAVEL_TIERS,
  CAR_TIERS,
  CARE_TIERS,
  HOBBY_SUGGESTIONS,
  LIFESTYLE_MULTIPLIERS,
  NURSING_TOPUP_YEARLY,
  computeAspirationTotal,
  type AspirationAnswers,
  type TravelTierId,
  type CarTierId,
  type CareTierId,
  type LifestyleId,
} from '@/lib/retirement-aspirations'

/**
 * Lifestyle-temperatuur copy. Eén bron van waarheid: dit bestand. De parent
 * (uitgaven-client.tsx) importeert deze export voor de eindbedrag-bijschrift,
 * zodat label + multiplier overal consistent zijn.
 */
export const LIFESTYLE_COPY: Record<LifestyleId, { label: string; line: string }> = {
  lean: { label: 'Lean', line: 'Rustig, lokaal, met aandacht voor wat je hebt.' },
  comfort: { label: 'Comfort', line: 'Ontspannen kunnen wat je leuk vindt.' },
  gul: { label: 'Gul', line: 'Ruim leven en delen.' },
}

/**
 * AspirationQuestionnaire — de reflectieve "Zelf samenstellen"-flow voor de
 * uitgave ná pensioen, herbruikbaar buiten de standalone route. Bevat de zes
 * vragen-secties, de receipt/samenvatting en het handmatige-override-blok.
 *
 * Bewust géén save-blok of error-blok: die blijven bij de consument (de
 * persoonlijke uitgaven-client levert ze inline; de huishoud-pane levert ze in
 * de BottomSheet-footer). De component berekent de breakdown zelf voor weergave.
 */
export function AspirationQuestionnaire({
  answers,
  setAnswers,
}: {
  answers: AspirationAnswers
  setAnswers: (a: AspirationAnswers) => void
}) {
  const { masked } = useMaskedAmounts()
  const breakdown = computeAspirationTotal(answers)

  /** Eindbedrag dat we tonen: handmatige override wint van berekend totaal. */
  const finalAmount = answers.manualOverride != null && answers.manualOverride > 0
    ? answers.manualOverride
    : breakdown.total

  return (
    <div className="space-y-6">
      <ReisSection answers={answers} setAnswers={setAnswers} subtotal={breakdown.travel} />
      <VervoerSection answers={answers} setAnswers={setAnswers} subtotal={breakdown.transport} />
      <UitEtenSection answers={answers} setAnswers={setAnswers} subtotal={breakdown.dining} />
      <HobbySection answers={answers} setAnswers={setAnswers} subtotal={breakdown.hobbies} />
      <ZorgSection answers={answers} setAnswers={setAnswers} subtotal={breakdown.care} />
      <LifestyleSection answers={answers} setAnswers={setAnswers} />

      {/* Receipt */}
      <div className="mt-10">
        <Kicker>Samenvatting</Kicker>
        <h3
          className="mt-2 text-2xl sm:text-3xl font-black tracking-[-0.02em]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >
          Jouw pensioenleven, opgeteld
        </h3>
        <FiguresStrip
          cols={4}
          figures={[
            {
              kicker: 'Reizen',
              amount: <MaskedAmount value={breakdown.travel} tone="horizon" monoWhenVisible={false} />,
            },
            {
              kicker: 'Vervoer',
              amount: <MaskedAmount value={breakdown.transport} tone="horizon" monoWhenVisible={false} />,
            },
            {
              kicker: 'Genieten',
              amount: (
                <MaskedAmount value={breakdown.dining + breakdown.hobbies} tone="horizon" monoWhenVisible={false} />
              ),
            },
            {
              kicker: 'Zorg',
              amount: <MaskedAmount value={breakdown.care} tone="horizon" monoWhenVisible={false} />,
            },
          ]}
        />
        <div className="mt-6 text-center">
          <div className="text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)] mb-2">
            {answers.manualOverride != null && answers.manualOverride > 0
              ? 'Eindbedrag · handmatig aangepast'
              : `Eindbedrag · ${LIFESTYLE_COPY[answers.lifestyle].label} ×${LIFESTYLE_MULTIPLIERS[answers.lifestyle].toFixed(2)}${answers.unexpectedBuffer ? ' · +10% buffer' : ''}`}
          </div>
          <div
            className="text-[56px] sm:text-[80px] font-black leading-none tracking-[-0.025em]"
            style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
          >
            <MaskedAmount value={finalAmount} tone="horizon" monoWhenVisible={false} />
          </div>
          <div className="text-[var(--ink-3)] italic text-sm mt-3" style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}>
            per jaar — ofwel ≈ {formatMaskedCurrency(Math.round(finalAmount / 12), masked)} per
            maand, {formatMaskedCurrency(Math.round(finalAmount / 365), masked)} per dag.
          </div>
        </div>

        {/* ── Handmatige override ───────────────────────────────── */}
        <div className="mt-8 border-t border-dashed border-[var(--border-ed)] pt-5">
          <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
            <label
              htmlFor="manual-override"
              className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]"
            >
              Eigen bedrag (overschrijft de berekening)
            </label>
            {answers.manualOverride != null && (
              <button
                type="button"
                onClick={() => setAnswers({ ...answers, manualOverride: null })}
                className="text-[11px] underline text-[var(--ink-3)] hover:text-[var(--ink)]"
              >
                Reset naar berekend bedrag
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-mono text-[var(--ink-3)]">€</span>
            <input
              id="manual-override"
              type="number"
              min={0}
              step={500}
              inputMode="numeric"
              placeholder={String(breakdown.total)}
              value={answers.manualOverride ?? ''}
              onChange={e => {
                const v = e.target.value
                setAnswers({
                  ...answers,
                  manualOverride: v === '' ? null : Math.max(0, Number(v) || 0),
                })
              }}
              className="flex-1 px-3 py-2 border border-[var(--border-md)] rounded-lg font-mono tabular-nums text-lg bg-[var(--paper)] focus:border-[var(--module-active-700)] focus:outline-none"
            />
            <span className="text-sm text-[var(--ink-3)]">/jr</span>
          </div>
          <p className="mt-2 text-xs text-[var(--ink-3)]">
            {answers.manualOverride != null && answers.manualOverride > 0
              ? `Berekend totaal was ${formatMaskedCurrency(breakdown.total, masked)} — je hebt het aangepast.`
              : 'Laat leeg om het berekende bedrag te gebruiken. Vul iets in om alleen het eindbedrag aan te passen zonder de antwoorden hierboven te wijzigen.'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Sectie-wrapper ───────────────────────────────────────────────

function Section({
  icon,
  number,
  title,
  question,
  microcopy,
  subtotal,
  children,
}: {
  icon: React.ReactNode
  number: string
  title: string
  question: string
  microcopy: string
  subtotal: number
  children: React.ReactNode
}) {
  return (
    <CardEditorial accent className="p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--module-active-50)] text-[var(--module-active-700)]">
            {icon}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
              {number} · {title}
            </div>
            <h3
              className="mt-1 text-xl sm:text-2xl italic font-normal leading-tight"
              style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
            >
              {question}
            </h3>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[9px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
            Bijdrage
          </div>
          <div className="font-mono tabular-nums font-bold text-[var(--module-active-700)] text-base sm:text-lg">
            <MaskedAmount value={subtotal} tone="horizon" />
          </div>
        </div>
      </div>
      <p className="text-sm text-[var(--ink-2)] leading-relaxed mb-5">{microcopy}</p>
      {children}
    </CardEditorial>
  )
}

// ─── 1. Reizen ────────────────────────────────────────────────────

function ReisSection({
  answers,
  setAnswers,
  subtotal,
}: {
  answers: AspirationAnswers
  setAnswers: (next: AspirationAnswers) => void
  subtotal: number
}) {
  return (
    <Section
      icon={<Plane className="h-5 w-5" aria-hidden />}
      number="01"
      title="Reizen"
      question="Hoe vaak wil je weg?"
      microcopy="Een vakantie per jaar, of een leven onderweg? Kies wat het dichtst bij komt — je kunt het later bijstellen."
      subtotal={subtotal}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {TRAVEL_TIERS.map(t => {
          const active = answers.travel === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setAnswers({ ...answers, travel: t.id as TravelTierId, travelCustomWeeks: null })}
              className={`text-left p-3 border rounded-lg transition-colors ${
                active
                  ? 'border-[var(--module-active-700)] bg-[var(--module-active-50)]'
                  : 'border-[var(--border-ed)] hover:border-[var(--border-md)]'
              }`}
            >
              <div className="font-semibold text-sm">{t.label}</div>
              <div className="text-xs text-[var(--ink-3)] mt-0.5">{t.sublabel}</div>
              <div className="text-[10px] font-mono tabular-nums text-[var(--module-active-700)] mt-2">
                €{t.dailyPp}/dag p.p.
              </div>
            </button>
          )
        })}
      </div>
      <div className="mt-4 flex items-center gap-3 text-sm flex-wrap">
        <label className="text-[var(--ink-3)]">Aantal reizigers</label>
        <input
          type="number"
          min={1}
          max={6}
          value={answers.travelersCount}
          onChange={e =>
            setAnswers({ ...answers, travelersCount: Math.max(1, Number(e.target.value) || 1) })
          }
          className="w-16 px-2 py-1 border border-[var(--border-md)] rounded font-mono tabular-nums text-center"
        />
      </div>
    </Section>
  )
}

// ─── 2. Auto & vervoer ───────────────────────────────────────────

function VervoerSection({
  answers,
  setAnswers,
  subtotal,
}: {
  answers: AspirationAnswers
  setAnswers: (next: AspirationAnswers) => void
  subtotal: number
}) {
  return (
    <Section
      icon={<Car className="h-5 w-5" aria-hidden />}
      number="02"
      title="Auto & vervoer"
      question="Hoe wil je je verplaatsen?"
      microcopy="Bezit, comfort en flexibiliteit hebben elk hun prijs. Bedragen zijn jaartotalen volgens Nibud (afschrijving, brandstof, verzekering, onderhoud)."
      subtotal={subtotal}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {CAR_TIERS.map(t => {
          const active = answers.car === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setAnswers({ ...answers, car: t.id as CarTierId })}
              className={`text-left p-3 border rounded-lg transition-colors ${
                active
                  ? 'border-[var(--module-active-700)] bg-[var(--module-active-50)]'
                  : 'border-[var(--border-ed)] hover:border-[var(--border-md)]'
              }`}
            >
              <div className="font-semibold text-sm">{t.label}</div>
              <div className="text-xs text-[var(--ink-3)] mt-0.5">{t.sublabel}</div>
              <div className="text-[10px] font-mono tabular-nums text-[var(--module-active-700)] mt-2">
                €{t.yearly.toLocaleString('nl-NL')}/jr
              </div>
            </button>
          )
        })}
      </div>
    </Section>
  )
}

// ─── 3. Uit eten & cultuur ───────────────────────────────────────

function UitEtenSection({
  answers,
  setAnswers,
  subtotal,
}: {
  answers: AspirationAnswers
  setAnswers: (next: AspirationAnswers) => void
  subtotal: number
}) {
  return (
    <Section
      icon={<UtensilsCrossed className="h-5 w-5" aria-hidden />}
      number="03"
      title="Uit eten & cultuur"
      question="Hoe vaak ga je het huis uit voor genieten?"
      microcopy="Restaurant met vrienden, theater of concert: deze kleine momenten geven een pensioenleven kleur. Standaard: €60 per uit-eten p.p., €45 per cultuur-bezoek p.p."
      subtotal={subtotal}
    >
      <div className="space-y-5">
        <SliderRow
          label="Uit eten per maand"
          value={answers.diningPerMonth}
          min={0}
          max={20}
          unit="× / mnd"
          onChange={v => setAnswers({ ...answers, diningPerMonth: v })}
        />
        <SliderRow
          label="Theater / concert / museum per maand"
          value={answers.culturePerMonth}
          min={0}
          max={15}
          unit="× / mnd"
          onChange={v => setAnswers({ ...answers, culturePerMonth: v })}
        />
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <label className="text-[var(--ink-3)]">Aantal personen</label>
          <input
            type="number"
            min={1}
            max={6}
            value={answers.diningPersons}
            onChange={e =>
              setAnswers({ ...answers, diningPersons: Math.max(1, Number(e.target.value) || 1) })
            }
            className="w-16 px-2 py-1 border border-[var(--border-md)] rounded font-mono tabular-nums text-center"
          />
        </div>
      </div>
    </Section>
  )
}

// ─── 4. Hobby's & dromen ─────────────────────────────────────────

function HobbySection({
  answers,
  setAnswers,
  subtotal,
}: {
  answers: AspirationAnswers
  setAnswers: (next: AspirationAnswers) => void
  subtotal: number
}) {
  const [newDream, setNewDream] = useState('')
  const [newAmount, setNewAmount] = useState('')

  function toggleHobby(id: string, suggested: number) {
    const exists = answers.hobbies.find(h => h.id === id)
    if (exists) {
      setAnswers({ ...answers, hobbies: answers.hobbies.filter(h => h.id !== id) })
    } else {
      setAnswers({ ...answers, hobbies: [...answers.hobbies, { id, yearly: suggested }] })
    }
  }

  function updateHobbyAmount(id: string, yearly: number) {
    setAnswers({
      ...answers,
      hobbies: answers.hobbies.map(h => (h.id === id ? { ...h, yearly: Math.max(0, yearly) } : h)),
    })
  }

  function addDream() {
    if (!newDream.trim() || !newAmount) return
    const yearly = Number(newAmount) || 0
    setAnswers({
      ...answers,
      customDreams: [...answers.customDreams, { label: newDream.trim(), yearly }],
    })
    setNewDream('')
    setNewAmount('')
  }

  function removeDream(idx: number) {
    setAnswers({
      ...answers,
      customDreams: answers.customDreams.filter((_, i) => i !== idx),
    })
  }

  return (
    <Section
      icon={<Sparkles className="h-5 w-5" aria-hidden />}
      number="04"
      title="Hobby's & dromen"
      question="Stel: je hebt genoeg geld voor de rest van je leven. Wat ga je dan ook echt doen?"
      microcopy="Niet 'wat doe je nu', maar wat je écht zou willen. Tik aan wat je raakt — bedragen zijn een startpunt en kun je per categorie aanpassen."
      subtotal={subtotal}
    >
      <div className="flex flex-wrap gap-2 mb-5">
        {HOBBY_SUGGESTIONS.map(h => {
          const selected = answers.hobbies.find(s => s.id === h.id)
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => toggleHobby(h.id, h.suggested)}
              className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                selected
                  ? 'border-[var(--module-active-700)] bg-[var(--module-active-700)] text-[var(--paper)]'
                  : 'border-[var(--border-md)] hover:border-[var(--ink-3)]'
              }`}
            >
              {h.label}
            </button>
          )
        })}
      </div>

      {answers.hobbies.length > 0 && (
        <div className="space-y-3 mb-5 border-t border-[var(--rule-soft)] pt-4">
          {answers.hobbies.map(h => {
            const def = HOBBY_SUGGESTIONS.find(s => s.id === h.id)
            return (
              <div key={h.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1">{def?.label ?? h.id}</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={h.yearly}
                  onChange={e => updateHobbyAmount(h.id, Number(e.target.value))}
                  className="w-24 px-2 py-1 border border-[var(--border-md)] rounded font-mono tabular-nums text-right"
                />
                <span className="text-xs text-[var(--ink-3)]">/jr</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="border-t border-[var(--rule-soft)] pt-4">
        <div className="text-xs uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-3">
          Eigen droom
        </div>
        {answers.customDreams.map((d, idx) => (
          <div key={idx} className="flex items-center gap-3 text-sm mb-2">
            <span className="flex-1 italic">{d.label}</span>
            <span className="font-mono tabular-nums text-[var(--ink-2)]">
              €{d.yearly.toLocaleString('nl-NL')}
            </span>
            <button
              type="button"
              onClick={() => removeDream(idx)}
              className="text-[var(--ink-3)] hover:text-[var(--ink)]"
              aria-label={`Verwijder ${d.label}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-3">
          <input
            type="text"
            placeholder="Bijv. atelier, zeilboot, sabbatical"
            value={newDream}
            onChange={e => setNewDream(e.target.value)}
            className="flex-1 px-2 py-1.5 border border-[var(--border-md)] rounded text-sm"
          />
          <input
            type="number"
            placeholder="€/jr"
            value={newAmount}
            onChange={e => setNewAmount(e.target.value)}
            className="w-24 px-2 py-1.5 border border-[var(--border-md)] rounded text-sm font-mono tabular-nums"
          />
          <button
            type="button"
            onClick={addDream}
            disabled={!newDream.trim() || !newAmount}
            className="px-3 py-1.5 bg-[var(--ink)] text-[var(--paper)] rounded text-sm disabled:opacity-50"
            aria-label="Voeg droom toe"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Section>
  )
}

// ─── 5. Zorg & comfort ───────────────────────────────────────────

function ZorgSection({
  answers,
  setAnswers,
  subtotal,
}: {
  answers: AspirationAnswers
  setAnswers: (next: AspirationAnswers) => void
  subtotal: number
}) {
  return (
    <Section
      icon={<HeartPulse className="h-5 w-5" aria-hidden />}
      number="05"
      title="Zorg & comfort"
      question="Hoeveel ruimte wil je voor zorg en comfort?"
      microcopy="Zorgkosten stijgen na 65 — gemiddeld 3-4% per jaar. Plan je voor het minimum, of wil je rust dat alles gedekt is?"
      subtotal={subtotal}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        {CARE_TIERS.map(t => {
          const active = answers.care === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setAnswers({ ...answers, care: t.id as CareTierId })}
              className={`text-left p-3 border rounded-lg transition-colors ${
                active
                  ? 'border-[var(--module-active-700)] bg-[var(--module-active-50)]'
                  : 'border-[var(--border-ed)] hover:border-[var(--border-md)]'
              }`}
            >
              <div className="font-semibold text-sm">{t.label}</div>
              <div className="text-xs text-[var(--ink-3)] mt-0.5">{t.sublabel}</div>
              <div className="text-[10px] font-mono tabular-nums text-[var(--module-active-700)] mt-2">
                €{t.yearly.toLocaleString('nl-NL')}/jr
              </div>
            </button>
          )
        })}
      </div>
      <label className="flex items-start gap-3 p-3 border border-[var(--border-ed)] rounded-lg cursor-pointer hover:border-[var(--border-md)]">
        <input
          type="checkbox"
          checked={answers.nursingTopUp}
          onChange={e => setAnswers({ ...answers, nursingTopUp: e.target.checked })}
          className="mt-1"
        />
        <div className="flex-1">
          <div className="text-sm font-semibold">Reservering verzorgingstehuis-suppletie</div>
          <div className="text-xs text-[var(--ink-3)] mt-0.5">
            Extra €{NURSING_TOPUP_YEARLY.toLocaleString('nl-NL')}/jaar als gemiddelde reservering voor mogelijke
            zorgkosten boven de WLZ-eigen-bijdrage in de no-go fase (vanaf ~80).
          </div>
        </div>
      </label>
    </Section>
  )
}

// ─── 6. Lifestyle-temperatuur ────────────────────────────────────

function LifestyleSection({
  answers,
  setAnswers,
}: {
  answers: AspirationAnswers
  setAnswers: (next: AspirationAnswers) => void
}) {
  return (
    <Section
      icon={<Compass className="h-5 w-5" aria-hidden />}
      number="06"
      title="Lifestyle-temperatuur"
      question="Hoe leef je het liefst?"
      microcopy="Een eindkalibratie. Niet zozeer een keuze als wel een houding — die schaalt het hele bedrag mee."
      subtotal={0}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {(Object.keys(LIFESTYLE_MULTIPLIERS) as LifestyleId[]).map(id => {
          const active = answers.lifestyle === id
          const meta = LIFESTYLE_COPY[id]
          return (
            <button
              key={id}
              type="button"
              onClick={() => setAnswers({ ...answers, lifestyle: id })}
              className={`text-left p-4 border rounded-lg transition-colors ${
                active
                  ? 'border-[var(--module-active-700)] bg-[var(--module-active-50)]'
                  : 'border-[var(--border-ed)] hover:border-[var(--border-md)]'
              }`}
            >
              <div className="flex items-baseline justify-between mb-2">
                <div className="font-semibold">{meta.label}</div>
                <div className="text-xs font-mono tabular-nums text-[var(--module-active-700)]">
                  ×{LIFESTYLE_MULTIPLIERS[id].toFixed(2)}
                </div>
              </div>
              <div
                className="text-sm italic text-[var(--ink-2)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {meta.line}
              </div>
            </button>
          )
        })}
      </div>
      <label className="mt-5 flex items-start gap-3 p-3 border border-[var(--border-ed)] rounded-lg cursor-pointer hover:border-[var(--border-md)]">
        <input
          type="checkbox"
          checked={answers.unexpectedBuffer}
          onChange={e => setAnswers({ ...answers, unexpectedBuffer: e.target.checked })}
          className="mt-1"
        />
        <div className="flex-1">
          <div className="text-sm font-semibold">Reserveer +10% voor onverwachts</div>
          <div className="text-xs text-[var(--ink-3)] mt-0.5">
            Een algemene buffer voor wat je nu niet kunt voorzien. Wordt op het eindbedrag toegepast.
          </div>
        </div>
      </label>
    </Section>
  )
}

// ─── Slider helper ────────────────────────────────────────────────

function SliderRow({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  unit: string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="text-sm text-[var(--ink-2)]">{label}</label>
        <span className="font-mono tabular-nums text-sm text-[var(--ink)]">
          {value} <span className="text-[var(--ink-3)]">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-[var(--module-active-700)]"
      />
    </div>
  )
}
