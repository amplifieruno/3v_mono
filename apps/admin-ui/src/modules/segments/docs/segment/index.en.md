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

## Conditions

The conditions editor builds a tree. The top group says how its conditions
combine: **All of these hold**, **Any of these holds**, or **Not**, which turns
one condition (or one group) around. Groups nest up to seven levels deep and
hold up to 100 conditions each; **Add condition** and **Add group** add to a
group, and each condition or group can be moved up, moved down or removed.

A condition is a **field**, an **operator** and a **value**. The fields are the
server's catalog for what the members are: profile columns, custom fields,
company, work schedule, visits and other figures of the last 30 days, the most
visited area, membership in a manual segment, and for identities the status,
age, first seen and so on. Each field offers only its own operators (a list
field takes "is one of" with up to 500 values; numbers and dates take ranges;
a field that may be empty takes "is empty or not"). Dates can be a fixed date
or a number of days from the day the segment is evaluated (negative = ago), so
"End date is between today and in 30 days" keeps moving.

A missing value never matches a comparison: someone never seen does not have
"Visits (30 days) is at least 2", and "not" of it matches them; use "is empty
or not" to ask for a missing value on purpose.

Every condition is checked as the server checks it, before the save, and a
problem is shown on the condition it concerns. A condition on a field the
catalog no longer offers (a custom field switched off) stays in the tree,
marked: change its field or remove it. Above the tree, **Reads** gives the
whole set as one sentence, as the segment page shows it.

### Preview

The form of a dynamic segment has a **Preview** under the conditions: it asks
the server who the conditions on screen match right now, says how many and
names the first ten (each opens its profile or identity). Nothing is saved,
so it also works for a segment that does not exist yet. When the conditions
change afterwards, the answer stays but says so: choose **Preview again**. A
condition the server refuses is named, as the save would name it.

## When a segment holds members

Only an **Active** segment is evaluated. **Inactive** keeps the segment but
closes its rule memberships until it is active again; **Archived** retires it
with its history: no members can be added while it is archived. Setting the
status back to active brings it back. **Active from** and **Active until** bound when a
dynamic segment holds its rule members at all, and the **Schedule** narrows
that to weekly hours in the organization's time zone (no windows = always).

**Members** is the count now; **Last evaluated** says when the conditions were
last applied. When an evaluation fails (for example, a condition names a
custom field that was switched off), the members stay as they were and the
**Evaluation error** says why; the **Evaluation failing** view lists such
segments.

## Members

The **Members** tab lists the **Current members** and, below, the
**Earlier memberships**: every membership is kept when it ends, so the
segment's history is never lost. Each row says its **Source**:

- **Manual**: added by hand, with **Add members** on the segment (several
  people or faces at once) or **Add to segment** on a profile or an identity.
  It lasts until someone removes it: open the row and choose **Remove from
  segment**.
- **Rule**: added by the evaluation of a dynamic segment's conditions, and
  ended by it when they stop holding (or outside the active window and
  schedule). It cannot be removed by hand.

People can be added by hand to a dynamic segment too: they stay members
whatever the conditions say. Adding someone who is already a member by rule
turns the membership into a manual one: the rule membership ends and a
manual one starts at the same moment (the trend counts neither). Removing
such a person while the conditions still match them brings them back by rule
at the next evaluation. An archived segment takes no members; people whose
processing is restricted, and merged identities, cannot join any segment.

### Evaluate now

The server evaluates dynamic segments every hour and shortly after their
inputs change. **Evaluate now** on an active dynamic segment does it at
once and says how many joined and left by rule and how many members the
segment has now. If a newer evaluation had already run, it says that this one
changed nothing. When the conditions are no longer valid (a custom field was
switched off), it says which condition and nothing changes.

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
the people it held. The question covers event rule scopes only; notification
rules, access policies and reports naming the segment are not checked.
