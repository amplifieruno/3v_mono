# Events

An **event** is a state change the platform noticed: an unknown person arrived,
a blacklisted person was seen, a door refused someone, someone stayed too long
in an area, a camera went offline. **Monitoring → Events** lists them newest
first with **When**, **Severity**, **Event**, **Title**, **Area**, **Person**
and **Device**. The sidebar facility picker narrows the list to one facility.

Events are written by the platform only: they cannot be created, edited or
deleted here. The list refreshes itself every 15 seconds while it is open
(**Auto-refresh** in the toolbar pauses it), loads 50 at a time and does not
count all rows on every page (ask for the count when you need it).

## One event per state, not per frame

A person standing in front of a camera produces one arrival, not one per
frame: every event carries a **deduplication key** naming the state it stands
for (the stay, the type and the area, or a time bucket), and the same state
never raises a second event.

## Severity

**Info**, **Low**, **Medium**, **High** and **Critical**, in that order. Each
event type has its own severity; a published event rule that matches the event
sets it instead (the most severe rule wins), and the event names that rule's
**Rule version**. The saved views **Critical**, **High and above** and
**Medium and above** follow this order; **Matched by a rule** shows the events
a rule matched.

## What an event links to

- **Place**: the facility, area, door and device it happened at.
- **Person**: the identity and, when it was linked, the person; the tracking
  **Session** (the stay in the facility) and the **Detection** that raised it.
- **Origin**: the rule version that matched it, the access decision or face
  sign-in attempt that raised it, and the **Details**: the facts as they were
  then (the threshold, the watch list, the matched rule versions).

The pages of facilities, areas, devices, identities and people have an
**Events** tab with their own events. Incidents opened by rules link their
events; see *Event rules*.
