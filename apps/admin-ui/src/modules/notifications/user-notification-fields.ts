import { f } from '@burojs/field-types';
import { EVENT_RESOURCE, INCIDENT_RESOURCE, NOTIFICATION_DELIVERY_RESOURCE } from '../../data/resource-names';
import { enumField } from '../../enums/field';
import { NOTIFICATION_PRIORITIES, NOTIFICATION_PRIORITY_ENUM } from '../../enums/notifications';
import { dateTime } from '../../fields/date-time';

const shown = ['list', 'show'] as const;
const showOnly = ['show'] as const;

/**
 * Columns of `itap.user_notifications` the `org_admin` role reads: the session user's own in-app
 * notifications only (the database filters by user). Written by the platform with the in-app
 * delivery; the owner only marks them read (`mark_notifications_read`) and acknowledges them
 * (`acknowledge_notification`), so every field is the system's.
 */
export const userNotificationFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  created_at: dateTime({
    system: true,
    in: [...shown],
    texts: { label: 'Received', doc: { summary: 'When the notification landed in your inbox.' } },
  }),
  title: f.string({
    system: true,
    in: [...shown],
    texts: { label: 'Title', doc: { summary: 'The notification’s title as its template rendered it.' } },
  }),
  body: f.text({
    system: true,
    in: [...showOnly],
    texts: { label: 'Message', doc: { summary: 'The notification’s text as its template rendered it.' } },
  }),
  priority: enumField(NOTIFICATION_PRIORITIES, NOTIFICATION_PRIORITY_ENUM, {
    system: true,
    in: [...shown],
    texts: { label: 'Priority', doc: { summary: 'The priority of the rule or escalation that sent it; critical ones ignore quiet hours.' } },
  }),
  read_at: dateTime({
    system: true,
    in: [...shown],
    texts: {
      label: 'Read',
      doc: { summary: 'When you marked it read (or acknowledged it); empty while it is unread and counted on the bell.' },
    },
  }),
  acknowledged_at: dateTime({
    system: true,
    in: [...shown],
    texts: {
      label: 'Acknowledged',
      doc: {
        summary:
          'When you acknowledged it. Acknowledging an escalation page also acknowledges its incident while that is still open and unacknowledged, which stops the escalation.',
      },
    },
  }),
  event_id: f.relation({
    to: EVENT_RESOURCE,
    system: true,
    nullable: true,
    in: [...shown],
    open: 'page',
    texts: { label: 'Event', doc: { summary: 'The event it is about; empty for escalation pages and reports.' } },
  }),
  incident_id: f.relation({
    to: INCIDENT_RESOURCE,
    system: true,
    nullable: true,
    in: [...shown],
    open: 'page',
    providerOptions: { relationship: 'incident' },
    texts: { label: 'Incident', doc: { summary: 'The incident it is about, when there is one.' } },
  }),
  delivery_id: f.relation({
    to: NOTIFICATION_DELIVERY_RESOURCE,
    system: true,
    nullable: true,
    in: [...showOnly],
    open: 'page',
    texts: { label: 'Delivery', doc: { summary: 'The delivery that brought it, in the delivery log (origin, rule or escalation step).' } },
  }),
};
