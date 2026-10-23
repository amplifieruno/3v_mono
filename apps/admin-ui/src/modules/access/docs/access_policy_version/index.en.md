# Policy versions

A **policy version** is one state of an access policy: its **Effect**,
**Priority**, **Schedule**, validity, **Maximum risk**, and whom (**Who**) and
where (**Where**) it names. Its **Status** is **Draft** while edited,
**Pending approval** once submitted, **Published** while in force (one per
policy) and **Superseded** once a later version was approved.

**Access control → Policy versions** lists the versions of every policy; the
view **Awaiting approval** lists what is waiting for a second member.

## Editing a draft

Only a draft can be edited or discarded. On its **Who** tab each kind of
subject has its own list (people, segments, profile types, minimum access
levels); on its **Where** tab each kind of target (facilities, areas, access
points). Add rows with each list's create button and remove them from the
list. A version waiting for approval is frozen, so the approver approves
exactly what was submitted: its tabs show every subject and target, read only,
and **Edit** says why it is not offered. A published or superseded version is
history and never changes. Once the policy is archived, none of its versions
can be edited, submitted or rolled back any more (the buttons say why).

## Approval

**Submit for approval**, **Approve** and **Reject** work as described under
*Access policies*. The **Approval** tab says who submitted the version and
when, who approved it, and the reason of its last rejection (a version
rejected because its policy was archived reads `policy_archived`).

## Decisions

A version's **Decisions** tab lists the decisions it decided at the doors,
newest first; each opens with how it was decided.

## Simulate

**Simulate** (on drafts, versions waiting for approval and superseded
versions) evaluates the doors' past decisions again, each at its own time:
once with the policies in force today and once with this version in force
instead (or added, for a new policy). It says how many decisions would be
denied instead of granted, granted instead of denied, or decided for another
reason, and lists them: when, who, which door, what the door decided then,
what today's policies decide and what they decide with this version. Choose
the last 24 hours, 7 days or 30 days and how many changes to list.

Nothing is decided, recorded or sent. Some limits: when a period holds more
than 2 500 decisions an evenly spaced sample is evaluated; decisions whose
person or door changed since are skipped; and **Changed since** marks
decisions that would come out differently today even without this version
(the policies or the people changed since then). Crowding and device health
are read as they are now.
