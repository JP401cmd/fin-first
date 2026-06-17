import type { CheckReportData } from '@/lib/check/types'
import { ReadingProgress } from './ReadingProgress'
import { Masthead } from './Masthead'
import { LifeGrid } from './LifeGrid'
import { NavIndex } from './NavIndex'
import { FotoVanNu } from './FotoVanNu'
import { Gezondheidsgetal } from './Gezondheidsgetal'
import { DeKruising } from './DeKruising'
import { TweeToekomsten } from './TweeToekomsten'
import { BlikOpToekomst } from './BlikOpToekomst'
import { WillZetten } from './WillZetten'
import { CtaSection } from './CtaSection'
import { RapportFooter } from './RapportFooter'

/**
 * Het volledige vrijheidsrapport — consumeert één `CheckReportData` en zet de
 * ontwerp-secties op volgorde neer. Pure compositie; alle data komt uit de DTO.
 */
export function RapportView({ report }: { report: CheckReportData }) {
  return (
    <>
      <ReadingProgress />
      <Masthead masthead={report.masthead} />
      <LifeGrid data={report.lifeGrid} />
      <NavIndex report={report} />
      <FotoVanNu
        snapshot={report.snapshot}
        dualBars={report.dualBars}
        monthBalance={report.monthBalance}
      />
      <Gezondheidsgetal health={report.health} benchmark={report.benchmark} />
      <DeKruising
        kruising={report.kruising}
        savingsHistory={report.savingsHistory}
      />
      <TweeToekomsten
        twoFutures={report.twoFutures}
        fireCards={report.fireCards}
        sensitivity={report.sensitivity}
        withdrawalStrategies={report.withdrawalStrategies}
        lifeGrid={report.lifeGrid}
      />
      <BlikOpToekomst lifePath={report.lifePath} />
      <WillZetten will={report.will} />
      <CtaSection cta={report.cta} />
      <RapportFooter disclaimers={report.disclaimers} />
    </>
  )
}
