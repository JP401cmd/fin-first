'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, HelpCircle } from 'lucide-react'

/* ── FAQ data ──────────────────────── */

interface FaqItem {
  question: string
  answer: string
  link?: { label: string; href: string }
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Hoe importeer ik mijn transacties?',
    answer:
      'Ga naar De Kern \u2192 Kas en klik op \u201cImporteren\u201d. Je kunt MT940-, CSV- en OFX-bestanden uploaden die je bij je bank kunt downloaden. Na het uploaden worden transacties automatisch gecategoriseerd.',
    link: { label: 'Ga naar import', href: '/core/cash/import' },
  },
  {
    question: 'Wat betekent mijn FIRE-getal precies?',
    answer:
      'Je FIRE-leeftijd is het moment waarop je vermogen groot genoeg is om je jaarlijkse uitgaven te dekken via de safe withdrawal rate (3,4% voor Nederland). Vanaf dat moment is werken optioneel \u2014 je geld werkt voor jou.',
    link: { label: 'Bekijk je prognose', href: '/horizon' },
  },
  {
    question: 'Hoe pas ik mijn dashboard aan?',
    answer:
      'Ga naar Identiteit \u2192 Instellingen \u2192 Widgets. Daar kun je widgets aan- of uitzetten, en op het dashboard kun je ze verslepen om de volgorde te wijzigen. Er zijn meer dan 25 widgets beschikbaar.',
    link: { label: 'Widget-instellingen', href: '/mijn/geavanceerd' },
  },
  {
    question: 'Is mijn financiële data veilig?',
    answer:
      'Je data wordt versleuteld opgeslagen in Supabase (PostgreSQL) en is alleen toegankelijk met jouw inloggegevens. Er worden geen gegevens gedeeld met derden. Je kunt in de privacy-instellingen precies instellen wat zichtbaar is.',
    link: { label: 'Privacy-instellingen', href: '/mijn/privacy' },
  },
  {
    question: 'Wat is de maandelijkse check-in?',
    answer:
      'Elke maand herinnert TriFinity je om je vermogen bij te werken. Door je saldi actueel te houden, blijven je FIRE-berekening en vrijheidstijd accuraat. Het kost minder dan 5 minuten.',
  },
  {
    question: 'Wat zijn widgets en hoe werken ze?',
    answer:
      'Widgets zijn compacte inzichtkaarten op je dashboard. Elke widget toont een specifieke metric \u2014 van vermogensgroei tot FIRE-countdown. Je kunt ze aan- of uitzetten en naar wens herschikken.',
    link: { label: 'Beheer widgets', href: '/mijn/geavanceerd' },
  },
  {
    question: 'Wat is een kassabon?',
    answer:
      'Tik op een bedrag in de app en je opent de kassabon \u2014 een transparante breakdown van hoe dat getal is berekend. Elke stap is zichtbaar, zodat je altijd begrijpt waar je cijfers vandaan komen.',
  },
  {
    question: 'Hoe voeg ik een partner toe?',
    answer:
      'Ga naar Identiteit \u2192 Profiel en vul de partnergegevens in bij het huishoudprofiel. Na activatie zie je gecombineerde vermogensoverzichten, per-partner splits bij schulden, en een gezamenlijke FIRE-berekening.',
    link: { label: 'Profiel bewerken', href: '/identity/profiel' },
  },
  {
    question: 'Wat als ik niet voor FIRE ga?',
    answer:
      'Niet iedereen streeft naar vroeg stoppen met werken \u2014 en dat hoeft ook niet. Schakel de pensioen-modus in via de strategie-instellingen op De Horizon. In deze modus berekent TriFinity je verwachte vermogen op je AOW-leeftijd en hoeveel je daaruit maandelijks kunt onttrekken. Je kunt altijd wisselen tussen FIRE en Pensioen \u2014 je data blijft bewaard.',
    link: { label: 'Strategie-instellingen', href: '/horizon?strategie=open' },
  },
  {
    question: 'Telt mijn eigen woning mee in de FIRE-berekening?',
    answer:
      'Standaard wel \u2014 maar dat is niet helemaal eerlijk: je woont in dat geld en kunt er niet zomaar uit putten. Internationale FIRE-canon sluit het primaire huis vaak uit. TriFinity laat je kiezen uit vier strategie\u00ebn: volledig meetellen (huidig), uitsluiten, verkopen op een gekozen leeftijd (downsizen), of een opeethypotheek/verzilverhypotheek. Bij downsizen of opeethypotheek wordt ook de nieuwe woonlast meegerekend, zodat het plaatje realistisch blijft.',
    link: { label: 'Stel je eigen-woning-strategie in', href: '/toekomst' },
  },
  {
    question: 'Wat is een opeethypotheek / verzilverhypotheek?',
    answer:
      'Met een opeethypotheek leen je een deel (meestal 35\u201365%) van de overwaarde van je huis terwijl je blijft wonen. Je krijgt maandelijks een uitkering of een bedrag in \u00e9\u00e9n keer. Je betaalt geen maandlast \u2014 de rente stapelt zich op tegen je toekomstige schuld, die wordt afgelost bij verkoop of overlijden. Voordeel: je verzilvert je vermogen zonder te verhuizen. Nadeel: je teert in op de erfenis en de rente ligt vaak hoger dan een gewone hypotheek. TriFinity modelleert deze optie via de eigen-woning-strategie.',
    link: { label: 'Strategie instellen', href: '/toekomst' },
  },
]

/* ── FAQ accordion item ──────────────────────── */

function FaqAccordionItem({
  item,
  open,
  onToggle,
}: {
  item: FaqItem
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-b border-[var(--border-ed)] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 py-3 px-1 min-h-[44px] text-left transition-colors hover:bg-[var(--subtle)]/40"
        aria-expanded={open}
      >
        <span className="flex-1 text-sm font-semibold text-[var(--ink)]">
          {item.question}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[var(--ink-4)] transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-1 pb-3">
            <p className="text-base leading-relaxed text-[var(--ink-2)]">
              {item.answer}
            </p>
            {item.link && (
              <Link
                href={item.link.href}
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
              >
                {item.link.label} &rarr;
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main component ──────────────────────── */

export default function GuideFaq() {
  const [openId, setOpenId] = useState<number | null>(null)

  return (
    <div className="mt-6 mb-1">
      <div className="flex items-center gap-2 mb-3">
        <HelpCircle className="h-4 w-4 text-[var(--ink-3)]" />
        <p className="label-editorial text-[var(--ink-3)]">Veelgestelde vragen</p>
      </div>
      <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3">
        {FAQ_ITEMS.map((item, i) => (
          <FaqAccordionItem
            key={i}
            item={item}
            open={openId === i}
            onToggle={() => setOpenId(openId === i ? null : i)}
          />
        ))}
      </div>
    </div>
  )
}
