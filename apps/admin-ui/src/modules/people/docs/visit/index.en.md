# Visits

A **visit** is a visitor expected by a host in a time window. **People →
Visits** lists them with the **Code**, **Visitor**, **Host**, **Company**,
the expected window and the **Status**. The sidebar facility picker narrows
the list to one facility; a visit with no facility shows under every facility.

## Scheduling a visit

**+ Create** (here, on a visitor's or host's **Visits** tab, or on a
company's **Visits** tab, which fill in the person or the company) asks for:

- **Visitor**: a profile of type Visitor. Create the visitor's profile first
  when they come for the first time.
- **Host**: the person the visitor comes to see: an employee, contractor or
  VIP, never another visitor.
- **Company**: the company the visit is for, usually the host's tenant.
- **Facility**: where the visitor is expected; left empty, the visitor seen at
  any facility is linked to the visit.
- **Purpose**, **Expected from** and **Expected until** (it must end after it
  starts), and an optional **Badge**.

Pickers show people by last name only; type to search. A scheduled visit can
be edited. Once it is checked in, cancelled or marked no-show, **Edit** is
disabled with the reason. Visits are never deleted: they are the visitor
history.

## Check-in, check-out and cancelling

Each step is offered only when it applies:

- **Check in** (scheduled visits): records the arrival now, with the
  **Badge** handed out. Left empty, the badge already on the visit is kept.
- **Check out** (checked-in visits): records the departure now, after a
  confirmation.
- **Cancel visit** (scheduled visits): calls the visit off, with an optional
  **Reason** shown on the visit. A cancelled visit cannot be checked in.

Checked out, cancelled and no-show are final. A visit nobody checked in by the
end of its expected window is marked **No-show** by the daily lifecycle job.
If the status changed in the meantime (for example, another receptionist
checked the visitor in), the step is refused on the form and nothing changes.

While a visit is scheduled or checked in, the cameras link the visitor's
movements on that day to it. They show on the identity's timeline as
check-in and check-out.

## Saved views

- **Today**: visits whose expected window overlaps today, earliest first.
- **Expected now**: scheduled visits whose expected window covers the moment
  the console was opened (due, not checked in yet).
- **No-shows**: visits marked no-show, newest first.

"Today" and "now" are fixed when the console is opened. Reload it to move them
on.

## On other pages

- A visitor's profile lists their visits on its **Visits** tab. Anyone else's
  profile lists the visits they host there.
- A company's page lists the visits for the company on its **Visits** tab.
