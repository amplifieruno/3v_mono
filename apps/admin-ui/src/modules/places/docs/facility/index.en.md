# Facilities

A **facility** is one physical site of the organization: a building, a
campus, a warehouse. Its areas (floors, zones, rooms), floor plans, access
points and devices all belong to it. The **facility picker** in the sidebar
narrows those lists to one facility; *All facilities* shows everything.

## The facility page

The header shows the facility's code and status and three figures computed when
the page opens:

- **On site now**: distinct people currently placed in an area of the
  facility. Merged identities count once.
- **Occupied areas**: areas where at least one person is placed directly.
- **Areas over capacity**: areas with a capacity that now hold more people than
  it, people in their sub-areas included.

The tabs below hold the details, the area tree and the access points.

## Details

- **Code**: assigned by the system on create (`FACILITY-00001`), never reused.
- **Name**: unique within the organization.
- **Status**: *Active*, *Under maintenance* (temporarily out of normal
  operation) or *Inactive* (kept for its history).
- **Address**, **latitude** and **longitude**: where the site is. Latitude is
  from −90 to 90, longitude from −180 to 180.
- **Time zone**: an IANA zone such as `Europe/Moscow`. Operating hours,
  schedules and the daily statistics of the facility are read in it. A stored
  legacy zone the browser knows but does not list (such as `EST`) is kept; new
  zones are picked from the list.
- **Operating hours**: the weekly windows the site is open, in its time zone.
  A window such as `22:00–06:00` ends the next morning. Presence outside the
  windows raises **after-hours** events, except for people inside their own
  work schedule. **No windows means always open**: no after-hours events.
- **Contact**: free-form contact details as a JSON object, for example
  `{"phone": "+7 495 000-00-00", "email": "desk@example.com", "person": "Security desk"}`.
  `{}` means none.
- **Areas** and **On site now** in the list are counted by the system.

## Custom attributes

The organization's own facility attributes (Organization → *Custom
attributes*, applies to *Facilities*) appear in the form, one control per
active attribute in their sort order: text, number, date, yes/no or one of the
options of a select attribute.

- A **required** attribute must be filled whenever the custom attributes are
  saved; the form refuses to save without it. An existing facility saved
  without touching its custom attributes is not checked, so a newly required
  attribute never blocks other edits.
- An **inactive** attribute is not offered. A value already stored under it is
  kept as it is and listed as a kept value.
- A value whose attribute was **deleted** is kept too, but the database refuses
  to save custom attributes that still hold it: remove it with its remove
  button, or set the attribute inactive instead of deleting it.

## Deleting a facility

A facility that still has areas, devices or other records cannot be deleted;
set it **Inactive** instead. Deleting is meant for a facility created by
mistake.
