# On-call schedules

An **on-call schedule** is a rotation: people take turns being on call, one
shift each. Escalation steps that page "the person on call" page whoever is
on call in the schedule when the step runs.

## The rotation

- **Rotation start**: when the first shift begins; the person at the lowest
  position holds it.
- **Shift length (hours)**: how long each shift lasts (24 for daily shifts,
  168 for weekly ones). Every shift starts a shift length after the one
  before, counted in hours, so a daylight-saving change never moves a
  hand-over.
- **Time zone**: the zone the team plans the rotation in.

The **Rotation** tab lists the people by **Position**, from the lowest up;
after the highest the rotation starts again. There is no dragging: to move a
person, change their position. Each position and each person once per
schedule; leaving gaps (10, 20, 30) makes room to insert someone later.

A member who is deactivated, or whose membership expired, keeps their place:
their shifts pass to the next active person, so the others' shifts do not
move.

## Who is on call now

**On call now** is the person whose shift it is, computed by the server the
way the escalation job picks them (the next active member when the shift's
owner is deactivated or expired). It is empty when nobody in the rotation is
active, and **Shift ends** is then not shown. A vacation delegate, if the
person has one, is applied when a page is sent: the page goes to the
delegate, while this page still names the person on call.

The **Escalation steps paging it** tab lists the steps that use the schedule.
A schedule a step uses cannot be deleted until that step pages someone else.
