import { redirect } from 'next/navigation'

/**
 * /mijn/geavanceerd — redirect-stub naar legacy /identity/instellingen
 * (modules + export + RESET). Per agent-plan worden deze restant-
 * onderdelen in een latere refactor naar een eigen page geëxtraheerd.
 */
export default function MijnGeavanceerdPage() {
  redirect('/identity/instellingen?tab=gegevens')
}
