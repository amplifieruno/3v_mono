import { defineCustomPage, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { occupancyNowBlock } from '../../blocks/occupancy-now/occupancy-now-block';
import { areaOccupancy, AREA_OCCUPANCY_COLUMNS } from './area-occupancy';

/**
 * "Occupancy now" in the sidebar: the facility chosen in the sidebar, its floor plans coloured
 * by how full each area is and the area tree with its figures (both from
 * `facility_occupancy_now`, read every 15 seconds), then who is where (the facility's
 * `area_occupancy` rows, the list narrowed by the sidebar facility).
 */
export const occupancyPage = defineCustomPage({
  name: 'occupancy-now',
  icon: NAV_ICONS.occupancyNow,
  path: '/occupancy',
  texts: 'Occupancy now',
  section: NAV_SECTIONS.monitoring,
  order: 5,
  body: (l) => [
    l.place(occupancyNowBlock, { key: 'occupancy', props: { facilityId: l.ref('scope', 'facility') } }),
    l.place(relatedList(areaOccupancy), {
      key: 'who-is-where',
      texts: { title: 'Who is where' },
      props: { columns: [...AREA_OCCUPANCY_COLUMNS], open: 'page' },
    }),
  ],
});
