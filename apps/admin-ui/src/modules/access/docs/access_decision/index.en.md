# Access decisions

Every time a door asks, the access engine answers with an **access
decision**: **Granted** or **Denied**, the **Reason** (the step that
decided), the **Risk** score, and the person, the door, and the policy
version, grant or override that decided. **Access control → Access
decisions** lists them newest first; the views **Denied**, **Granted**,
**Decided by a grant**, **Decided by an override** and **Unknown faces**
narrow the list. The decision log is history: nothing in it is ever changed
or deleted by hand, and the list does not count all rows on every page (ask
for the count when you need it).

## How it was decided

A decision's page shows, on its **How it was decided** tab, the engine's
trace as steps, in the order the engine went through them:

1. **Emergency overrides** covering the door at that moment, and which one
   decided (an evacuation opens exits even under a lock).
2. The door itself: an inactive door or one under maintenance refuses
   everyone.
3. The **Person**: nobody presented (no face, no person) or a profile that
   is not active is refused before any policy. A face without a profile goes
   on: only a policy naming a segment of faces (identities) can match it.
4. **Policy versions in force**, in evaluation order (highest priority first,
   a deny before an allow at equal priority): whom each names (the person, a
   segment, the profile type, the access level), where (the whole facility,
   an area, this access point), whether it applied at that moment (validity,
   schedule), and its outcome: **Decided**, **Does not name the person**,
   **Does not cover this door**, **Outside its schedule**, or **Matched; a
   version before it decided**.
5. **Access grants** of the person, looked at only when no policy decided.
6. **Risk**: what added to the score (an unknown face 0.40, each recent
   denial in the last 10 minutes 0.15 up to 0.45, a crowded area 0.30, the
   health of the door's device up to 0.30). An allow with a **Maximum risk**
   refuses above it (**Risk too high**).

Its **Details** tab links the person or face, the facility, the door, the
device, the detection, and the policy version, grant or override that decided.

## Testing a door

**Test access** on an access point asks the engine now, as the door's terminal
would, for a person or a recognised face, and shows the answer with its trace
in the dialog. It is not a dry run: the decision is recorded like any other,
with its access event, and a single-use grant that decides is used up. To try
a policy change without deciding anything, use **Simulate** on a policy
version instead.
