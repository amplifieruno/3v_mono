# Access points

An **access point** is a passage between two areas of a facility: a door,
turnstile, gate, elevator or reception desk. People seen passing it are placed
in the area it **leads into**; access is decided at it; its devices watch,
control or sense it.

## Fields

- **Kind**: door, turnstile, gate, elevator or reception desk; also its icon on
  the floor plan.
- **Leads into** and **Leads from**: the area on the far side, and the area on
  the near side (empty when it leads in from outside). The two must differ, and
  both must belong to the access point's facility.
- **Direction**: entry only, exit only, or both.
- **Facility entry/exit**: marks a way into or out of the whole facility. When
  a person's tracking session closes and their last sighting was at such an
  access point, the session ends as *completed* (they left) rather than *lost*.
  It does not check a visitor out and does not change occupancy.
- **Face credential**: the door opens on a recognised face. A camera bound to
  the access point decides access by the access policies (with a short
  cooldown per person), and each decision is logged. The access point needs a
  camera among its devices for this to work.
- **Status**: active, under maintenance or inactive. Set an access point
  inactive instead of deleting it to keep its history.

## Position on the floor plan

Edit the access point and click on the floor plan to place it under
**Position**. The plan is the one of the area it leads into, or of the nearest
area that area lies inside which has a plan. A new click moves the point,
*Clear position* removes it. The position must lie on the plan image. The
floor plan view then shows the access point with its kind's icon.

## Devices

The **Devices** tab lists the devices bound to the access point, each with its
role: a **camera** watches it, an **access terminal** decides and opens it, a
**sensor** reports its state. **Create** binds a device chosen from the
devices of the same facility (each is bound once per access point); a binding
is removed from its row's menu. The details show the bound devices as links to
their pages. The devices themselves are managed under **Devices**, where each
device lists the access points it is bound to.

The sidebar facility picker narrows the list to one facility.
