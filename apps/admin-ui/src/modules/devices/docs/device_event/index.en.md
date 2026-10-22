# Device events

A **device event** records a change on a device. The health check writes one
when a device's health changes:

- **Went offline**: the device could not be reached.
- **Back online**: it answered again after an outage.
- **No frames**: it answered but delivered no video frame.

**Configuration changed**, **Rebooted** and **Firmware updated** record
maintenance on the device. Each event has a message and machine-readable
**Details** (such as the previous health or the measured latency). Events are
written by the platform only: they cannot be added, changed or deleted here.

A device's **Events** tab shows its events as a timeline, newest first.
**Device events** in the sidebar lists the events of every device; pick an
event type above the list, filter by device or time, or search the messages.
The list does not count its rows on every page: ask for the count in the
footer when you need it. Offline and online changes also raise platform
events and notifications.

## Facility filter

The facility picked in the sidebar does **not** narrow this list: it shows
every facility's devices. Filter by **Device** to see one device; a device's
own tab shows only its records.
