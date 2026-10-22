# Areas and the area tree

An **area** is a part of a facility: a building, a floor, a zone, a room, a
sector, an entrance, a corridor, a parking level, or a **virtual zone** (a
geofence drawn on a floor plan, not tied to walls). Areas form a tree inside
their facility: a room sits inside a floor, a floor inside a building.

## The area tree

The facility page's **Areas** tab shows the facility's whole tree, whatever is
selected in the sidebar facility picker. Every level is open at first; the
arrow beside an area hides or shows the areas inside it, and *Expand all* /
*Collapse all* act on the whole tree. Each row shows the area's type, how many
people are inside now against its capacity (red when over capacity), a link to
the area's page and a **+** that adds an area inside it. *Add area* adds one to
the facility; leave **Inside** empty for a top-level area. The tab reads the
first 100 areas of a facility and says so when there are more; the **Areas**
list shows them all.

The **Areas** list in the sidebar follows the facility picker: with a facility
selected it lists only that facility's areas, with *All facilities* every area
of the organization.

## Inside and path

- **Facility** is chosen when the area is created and cannot change later.
- **Inside** is the enclosing area. Only areas of the same facility are
  offered. Moving an area moves everything inside it.
- An area **cannot be moved inside itself or inside one of its own
  sub-areas**: the form says so as soon as such an area is chosen, and the
  database refuses to save it.
- The **path** (the chain of areas from the top level down) and the **depth**
  (0 for a top-level area) are kept by the system.

## Access levels

From open to most protected: **Public**, **Restricted**, **Secure**,
**Classified**. Each level matches a profile clearance (*standard* for
Restricted, *elevated* for Secure, *admin* for Classified). Where no access
policy governs an area, a person whose clearance is below the area's level
raises a **restricted area entry** event on entering it. Where an access
policy covers the area, the policy decides instead.

## Capacity and occupancy

**Capacity** is how many people the area holds; empty means no limit. **Inside
now** counts the people the tracker currently places in the area or in any
area inside it, each person once. When the count passes the capacity of an
area (or of an enclosing one), an **occupancy exceeded** event is raised.

## Loitering

**Loitering after (seconds)** turns on the loitering check for the area: a
person who stays in it that long raises a **loitering** event. The check runs
every minute, so an event may come up to a minute after the threshold. Empty
means no loitering check.

## Shape and floor plan

An area's **Shape** is its outline on a floor plan: a polygon or a circle,
drawn in the form over the plan the area lies on (its own plan, else the plan
of the nearest area it lies inside). A virtual zone is only its shape. See
*Floor plans and area shapes* for drawing. An area that carries a floor plan
shows it on a **Floor plan** tab, with the shapes of the areas inside it.

## Sub-areas

The **Sub-areas** tab lists the areas directly inside this one. The **Events**
tab lists the events raised in the area, newest first (see *Events*).

## Status and deleting

**Active**, **Under maintenance** or **Inactive** (kept for its history). An
area that still has areas inside it, devices or access points cannot be
deleted; set it **Inactive** instead. Deleting an area deletes its floor plan.
