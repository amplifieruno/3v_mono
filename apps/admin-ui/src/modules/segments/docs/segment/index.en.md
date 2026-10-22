# Segments

A **segment** is a group of people (**profiles**) or faces (**identities**,
unknown ones included) that event rules, notification rules, access policies,
face authentication and reports can single out. What a segment holds is fixed
when it is created: its **Kind** and what its **Members are** never change.

## Manual and dynamic

- **Manual**: members are added and removed by hand. A manual segment has no
  conditions. Only manual segments can be named inside other segments'
  conditions.
- **Dynamic**: members are whoever matches the **Conditions**. The server
  evaluates them every hour and shortly after the data they read changes
  (a profile, an identity, a visit, a work schedule, another segment). People
  added by hand stay members as well.

The quickest way to a dynamic segment is a **segment template**: open
**Create from template** on the list, pick a template and choose **Create
segment**. The new segment starts with a copy of the template's conditions.

## When a segment holds members

Only an **Active** segment is evaluated. **Inactive** keeps the segment but
closes its rule memberships until it is active again; **Archived** retires it
for good, with its history. **Active from** and **Active until** bound when a
dynamic segment holds its rule members at all, and the **Schedule** narrows
that to weekly hours in the organization's time zone (no windows = always).

**Members** is the count now; **Last evaluated** says when the conditions were
last applied. When an evaluation fails (for example, a condition names a
custom field that was switched off), the members stay as they were and the
**Evaluation error** says why; the **Evaluation failing** view lists such
segments.

## Trend

The **Trend** tab charts the last 30 days: the member count per day, and the
people added (above the line) and removed (below it) per day, with the daily
figures underneath. A day without figures is a gap: they are recorded when the
segment is evaluated.

## Deleting and archiving

A segment that is in use or has history is **archived**, not deleted. Delete
is refused, with the reason, when:

- a notification rule's, another segment's or a template's conditions name it;
- an event rule version is scoped to it (the **Event rules scoped to it** tab);
- an access policy, a face-authentication application or a report names it;
- it has ever had members, or has daily figures.

Archiving is always possible. Archiving a segment that event rules are scoped
to asks first: archived, it gains no members, so those rules stop applying to
the people it held.
