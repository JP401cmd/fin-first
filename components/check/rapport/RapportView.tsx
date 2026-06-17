import type { CheckReportData } from '@/lib/check/types'
import { ReadingProgress } from './ReadingProgress'
import { DownloadButton } from './DownloadButton'
import { Masthead } from './Masthead'
import { LifeGrid } from './LifeGrid'
import { NavIndex } from './NavIndex'
import { FotoVanNu } from './FotoVanNu'
import { Gezondheidsgetal } from './Gezondheidsgetal'
import { TweeToekomsten } from './TweeToekomsten'
import { Toekomst } from './Toekomst'
import { RapportNieuws } from './RapportNieuws'
import { WillZetten } from './WillZetten'
import { SectionTrigger } from './SectionTrigger'
import { CtaSection } from './CtaSection'
import { RapportFooter } from './RapportFooter'

/**
 * Het volledige vrijheidsrapport — consumeert één `CheckReportData` en zet de
 * ontwerp-secties op volgorde neer. Pure compositie; alle data komt uit de DTO.
 *
 * Sectievolgorde: 1 Foto van nu · 2 Gezondheidsgetal · 3 Twee toekomsten ·
 * 4 De toekomst (kruising + levenspad samengevoegd) · 5 Uit het nieuws ·
 * 6 Will's zetten.
 */
export function RapportView({ report }: { report: CheckReportData }) {
  return (
    <>
      <ReadingProgress />
      <DownloadButton />
      <Masthead masthead={report.masthead} />
      <LifeGrid data={report.lifeGrid} />
      <NavIndex report={report} />
      <FotoVanNu
        snapshot={report.snapshot}
        dualBars={report.dualBars}
        monthBalance={report.monthBalance}
        houseInclusion={report.houseInclusion}
      />
      <SectionTrigger
        href={report.cta.signupHref}
        label="Houd je foto van nu actueel — koppel je rekeningen en zie je vermogen, sparen en uitgaven dagelijks meebewegen."
      />
      <Gezondheidsgetal health={report.health} benchmark={report.benchmark} />
      <SectionTrigger
        href={report.cta.signupHref}
        label="Laat ook je budgetten en je dagelijkse omgang met geld meetellen in je financiële gezondheid."
      />
      <TweeToekomsten
        twoFutures={report.twoFutures}
        fireCards={report.fireCards}
        sensitivity={report.sensitivity}
        withdrawalStrategies={report.withdrawalStrategies}
        lifeGrid={report.lifeGrid}
      />
      <SectionTrigger
        href={report.cta.signupHref}
        label="Speel met je toekomst — schuif aan je spaarquote, rendement en uitgaven en zie je vrijheidsdatum direct verschuiven."
      />
      <Toekomst lifePath={report.lifePath} />
      <SectionTrigger
        href={report.cta.signupHref}
        label="Sleep je levensgebeurtenissen op de tijdlijn — kind, sabbatical, erfenis, woningverkoop — en je vrijheidslijn herrekent live."
      />
      <RapportNieuws news={report.news} />
      <SectionTrigger
        href={report.cta.signupHref}
        label="Zie welk financieel nieuws jóuw vrijheid raakt — gefilterd op jouw situatie."
      />
      <WillZetten will={report.will} />
      <SectionTrigger
        href={report.cta.signupHref}
        label="Will geeft je doorlopend gerichte suggesties en inzichten om je eigen financiële keuzes te verbeteren."
      />
      <CtaSection cta={report.cta} />
      <RapportFooter disclaimers={report.disclaimers} />
      <div className="sticky-cta">
        <a href={report.cta.signupHref}>
          Maak gratis account <span className="arr">→</span>
        </a>
      </div>
    </>
  )
}
