# Emergency overrides

An **emergency override** takes over the doors of a facility for a limited
time: it decides before any access policy or grant. **Access control →
Emergency overrides** lists them, newest first; the views **Active** and
**Ended** narrow the list, and the facility selected in the sidebar narrows it
to that site.

While an override is active, a red banner heads every page of the console for
the facility selected in the sidebar (every facility when none is selected),
with its mode, facility and planned end, and a link to it.

## Modes

- **Lock all**: every covered door refuses everyone, access grants included.
- **Unlock all**: every covered door opens for everyone.
- **Evacuation**: exits open for everyone, even under a lock; entries keep
  deciding as usual.

When several overrides cover a door, an evacuation at an exit decides first,
then a lock, then an unlock.

## Starting an override

**Start override** on the list asks for:

- the **Facility** (the one selected in the sidebar to start with);
- the **Mode**;
- optionally **Areas**: the override then covers only the doors leading into
  those areas and the areas inside them; none means the whole facility;
- **Ends**: in the future and at most 24 hours from now. The doors return to
  their policies by themselves at that moment;
- a **Justification** of at least 10 characters.

The form refuses a short justification or an end outside the next 24 hours
before anything is sent, as the database does. The override starts at once:
supervisors are notified through the notification rules on override events,
terminals are told within seconds, and its page opens.

## Ending it early

**End now** on an active override asks for a **Reason** and ends it at once:
the doors decide by their policies and grants again, supervisors are
notified, and the end, its member and its reason stay on the override and in
the audit log. **End now** is not offered on an ended override and is disabled
(it says why) once the override has run out: a job closes it within a minute,
with the reason "expired". An override is never edited or deleted.

## Terminals

An override's **Terminals** tab lists every access terminal of its facility
and whether each has received the override (synced since it started) or,
once ended, its end (synced since it ended). It reads again every few
seconds. Unlocks and evacuations, and their ends, reach terminals within
seconds; the end of a lock reaches them with the minute sync. An unreachable
terminal gets it when it is back online; terminals also stop applying an
override at its planned end by themselves.

## Areas and decisions

The **Areas** tab lists the areas the override is limited to (empty: the whole
facility). The **Decisions** tab lists the door decisions it made.
