# Organization settings

**Settings** in the Organization section holds the thresholds and time limits
the platform applies to the whole organization. There is exactly one settings
record per organization; it is created with the organization and cannot be
deleted. Administrators change it in place with **Edit**.

Every value has a fixed range. A value outside it is refused in the form,
with the range in the message, before anything is saved.

## Recognition

- **Recognition threshold** is the largest face distance that still counts
  as the same person. Live recognition matches a face to the nearest enrolled
  identity only when it is at least this close. A *lower* value is stricter:
  fewer wrong matches, but known people more often stay unrecognized. A
  *higher* value is looser: more people are recognized, and more of them
  wrongly. Saving a value below 0.35 or above 0.65 asks for confirmation.
  Face search uses 1 minus this value as its default similarity.
- **Duplicate threshold at enrollment** decides when new photos are reported
  as an identity that already exists instead of creating a new one.
- **Detection counter interval** limits how often an identity's detection
  count and last-seen time are updated. Every detection is still stored.

## Tracking and events

- **Tracking timeout**: a person not seen for this many seconds has left. The
  next detection opens a new tracking session; sessions of people who never
  come back are closed by a background job (completed after an exit door,
  otherwise lost).
- **Tailgating window**: around a granted passage, more people at the door
  than granted decisions raise a tailgating event.
- **Abnormal movement**: a move between two areas that happened at most
  *rare transition* times in the previous 30 days raises an event, when both
  areas have at least the *minimum traffic*.

## Data lifecycle

- **Archive unknown identities after**: unknown identities not seen for this
  many days are archived by the daily lifecycle job and no longer matched.
- **Face templates after consent withdrawal**: matching stops at once when
  consent is withdrawn; the templates are purged after this many days unless a
  retention policy for withdrawn templates says otherwise.
- **Default retention** is not used. How long data is kept is set by retention
  policies; data without a policy is kept.

## Physical access

- **Revocation bound**: a change that narrows access (a revoked grant, a
  published deny, an emergency override) is pushed to terminals at once; a
  terminal that has not applied it within this many seconds is reported late.
- **Face credential cooldown**: at a door whose camera acts as a credential
  reader, a person standing in view is decided once per this many seconds.
- **Policy version** and **Urgent policy version** are counters the access
  engine raises on every relevant change; terminals report the version they
  have applied. They are shown for diagnosis and cannot be edited.
