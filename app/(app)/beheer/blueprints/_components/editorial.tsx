/**
 * Re-export van de production editorial primitives.
 *
 * De blueprints-showcase gebruikte aanvankelijk eigen lokale primitives
 * tijdens de plan-review-fase. Inmiddels zijn de echte primitives gemaakt
 * in `@/components/editorial`. Deze file re-exporteert ze zodat de
 * preview-bestanden hun bestaande imports (`import { Kicker, HighlightMark }
 * from './editorial'`) niet hoeven te wijzigen.
 *
 * Wanneer de showcase wordt verwijderd (Fase 10), verdwijnt deze file
 * samen met de rest van `/beheer/blueprints/`.
 */

export * from '@/components/editorial'
