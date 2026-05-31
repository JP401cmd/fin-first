import { Header } from '@/components/landing/header'
import { Hero } from '@/components/landing/hero'
import { Features } from '@/components/landing/features'
import { Pricing } from '@/components/landing/pricing'
import { Faq } from '@/components/landing/faq'
import { Footer } from '@/components/landing/footer'

export default function Home() {
  return (
    <div className="bg-[var(--bg)] text-[var(--ink)]">
      <Header />
      <main>
        <Hero />
        <Features />
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </div>
  )
}
