'use client'

// Bezwaar tegen de Krant op de achtergrond (grondslag gerechtvaardigd belang,
// /privacy 2.4 §3 en §8: "maak bezwaar onderaan je Krant"). Eén component voor
// beide Kranten: de tijdlijn (TijdlijnClient) en de Krant met AI
// (/nieuws, bron 'ai'). Alleen de uitleg verschilt, want het gevolg verschilt:
// in de tijdlijn stopt het automatisch bijwerken; bij de Krant met AI stoppen
// de proefedities en wissen we ook het afgeleide nieuwsprofiel
// (lib/krant/tijdlijn-keuzes.ts: zetBezwaar → wisBandenZonderDoel).
// Security-run R1 🟡-2: de knop stond alleen in de tijdlijn.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/editorial/button'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'

export type BezwaarContext = 'tijdlijn' | 'ai'

interface BezwaarTekst {
  /** Onder de kop, zolang er geen bezwaar is. */
  uitleg: string
  /** Onder de kop, na een bezwaar. */
  gemaakt: string
  /** In de bevestiging van "Bezwaar maken". */
  gevolgMaken: string
  /** In de bevestiging van "Bezwaar intrekken". */
  gevolgIntrekken: string
}

const TEKST: Record<BezwaarContext, BezwaarTekst> = {
  tijdlijn: {
    uitleg: 'Op de achtergrond houden we je nieuwsprofiel bij om de Krant te verbeteren. Wil je dat niet, dan kun je bezwaar maken.',
    gemaakt: 'Je hebt bezwaar gemaakt: we werken je Krant niet meer automatisch bij. Vernieuwen doe je zelf.',
    gevolgMaken: 'We werken je Krant dan niet meer automatisch bij. Vernieuwen doe je zelf.',
    gevolgIntrekken: 'We houden je nieuwsprofiel dan weer op de achtergrond bij, zodat je Krant vanzelf bijgewerkt wordt.',
  },
  ai: {
    uitleg: 'Voor proefedities van de Krant leiden we op de achtergrond een nieuwsprofiel af uit je gegevens. Wil je dat niet, dan kun je bezwaar maken.',
    gemaakt: 'Je hebt bezwaar gemaakt: we maken geen proefedities meer en leiden geen nieuwsprofiel meer af.',
    gevolgMaken: 'We stoppen dan het werk op de achtergrond en wissen je proefedities en je nieuwsprofiel.',
    gevolgIntrekken: 'We maken dan weer proefedities en leiden daarvoor je nieuwsprofiel af.',
  },
}

async function leesFout(res: Response, standaard: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: unknown } | null
  return typeof data?.error === 'string' ? data.error : standaard
}

export function KrantBezwaar({ bezwaar, context }: { bezwaar: boolean; context: BezwaarContext }) {
  const router = useRouter()
  const tekst = TEKST[context]
  const [open, setOpen] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function bevestig() {
    setBezig(true)
    setFout(null)
    try {
      const res = await fetch('/api/krant/bezwaar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bezwaar: !bezwaar }),
      })
      if (!res.ok) {
        setFout(await leesFout(res, 'Opslaan is niet gelukt. Probeer het later opnieuw.'))
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setFout('Opslaan is niet gelukt. Probeer het later opnieuw.')
    } finally {
      setBezig(false)
    }
  }

  const actie = bezwaar ? 'Bezwaar intrekken' : 'Bezwaar maken'

  return (
    <div className="space-y-2">
      <p>{bezwaar ? tekst.gemaakt : tekst.uitleg}</p>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setFout(null)
          setOpen(true)
        }}
      >
        {actie}
      </Button>

      <ShellOverlay
        kind="confirm"
        open={open}
        onClose={() => {
          if (!bezig) setOpen(false)
        }}
        title={`${actie}?`}
        footer={
          <ModalFooter
            primary={{ label: actie, onClick: () => void bevestig(), loading: bezig }}
            secondary={{ label: 'Annuleren', onClick: () => setOpen(false), disabled: bezig }}
          />
        }
      >
        <div className="space-y-3 px-5 py-4 text-[14px] leading-relaxed text-[var(--ink-2)]">
          <p>{bezwaar ? tekst.gevolgIntrekken : tekst.gevolgMaken}</p>
          {fout && (
            <p role="alert" className="text-[13px] text-[var(--negative)]">
              {fout}
            </p>
          )}
        </div>
      </ShellOverlay>
    </div>
  )
}
