/**
 * /overzicht/bezittingen/[type] — re-export van legacy /core/assets/[type].
 *
 * Hergebruikt de bestaande server-page voor asset-categorieën zodat:
 *  - /overzicht/bezittingen?type=cash → segmented-control link naar
 *    /overzicht/bezittingen/cash
 *  - /overzicht/bezittingen/investment → toont beleggingen-detail
 *  - /overzicht/bezittingen/eigen_huis → toont eigen-huis-detail
 *  - /overzicht/bezittingen/retirement → toont pensioen-detail
 *
 * Bij definitieve route-migratie wordt /core/assets/[type] verwijderd
 * en verhuist de loader naar deze plek. Voor nu re-export = nul code-
 * duplicatie + alle bestaande data-loaders blijven werken.
 */
export { default } from '../../../core/assets/[type]/page'
