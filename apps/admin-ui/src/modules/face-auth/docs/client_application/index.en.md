# Client applications

A **client application** is a system allowed to call the face authentication
API: a lobby kiosk, an HR portal, a visitor check-in app, a partner's server.
**Face authentication → Client applications** lists them with their **Code**,
**Platform**, **Status**, **Threshold**, whether **Liveness** is required and
whether they are a **Sandbox**; the views **Active**, **Suspended**,
**Sandbox** and **Revoked** narrow the list.

The application decides who can be authenticated, never the request: a caller
cannot widen the population or lower a threshold.

## Who it may authenticate (Population tab)

- **Segments**: the members of each bound segment, at the moment of the
  request. An archived segment counts no one.
- **Facilities**: the people of each bound facility, that is people an access
  policy or grant lets in there, or who were tracked there in the last 30 days.
- Segments and facilities add up: a person in either may be authenticated, if
  their profile is active and their face can be matched (not restricted, no
  consent withdrawn).
- **Access points**: narrow the population to people the access rules let
  through that door at that moment. An application bound to access points must
  name one of them in every session; one without them must not name any.
- **Only people on shift**: narrows the population to people whose work
  schedule has them on shift at the moment of the request.

Each list is added to with the matching action of the **More** menu: **Add
segment**, **Add facility**, **Add access point**. A row is removed from its
list. Adding a segment, facility or door that is already bound is refused with
the reason.

## How it authenticates

- **Modes** (Modes and attributes tab, **Allow mode**): **Identification**
  searches the whole population ("who is this?"); **Verification** compares the
  face with one claimed identity ("is this the claimed person?"). A session in a
  mode the application is not allowed is refused; with no mode, every session is
  refused.
- **Thresholds**: face similarity from 0 to 1, with **Minimum threshold** ≤
  **Threshold** ≤ **Maximum threshold** (the form refuses any other order). The
  service raises the threshold for large populations: 0.50 up to 100 people,
  0.55 up to 1 000, 0.60 up to 10 000 and 0.65 beyond (verification: at least
  0.55). A request may raise the threshold up to the maximum, never lower it. A
  score up to 0.08 below the threshold is a partial match: recapture, a second
  factor or manual review.
- **Liveness required**: every capture must pass the liveness check; a capture
  whose liveness was not checked fails.

## What it receives (attributes)

On a success the application receives the identity's id, the confidence and
exactly the **Attributes** shared with it (**Share attribute**): display name,
photo (a short-lived link), profile type, company, department, employee ID,
access level, or the names of its bound segments the person belongs to. Nothing
else, and never who was the closest match after a failure.

## Sandbox applications

A **Sandbox** application is for integration tests. It authenticates only the
synthetic test identities (faces of people who do not exist) of its bound
segment, never real people, and raises no events or notifications. Bind it the
segment of test identities: without a segment no one can be authenticated.

A sandbox binds no facilities or access points: the Population tab does not
show them and **Add facility** and **Add access point** are not offered. Sent
anyway, such a binding is refused by the platform with the reason. Whether an
application is a sandbox is chosen when it is registered and never changes.

## Status: suspend, reactivate, revoke

- **Suspend** (More menu) pauses an active application: every request is
  refused as "application inactive" until **Reactivate**. Keys, bindings and
  history stay as they are.
- **Revoke** retires an application for good: every request is refused and it
  can never be reactivated (the platform refuses it). Its settings, bindings
  and keys no longer change (a key can still be revoked); register a new
  application for a new integration.
- **Delete** is for an application that never authenticated anyone. One with
  sessions or attempts keeps them as history and is refused with the reason:
  revoke it instead.

## Keys

The **Keys** tab lists the application's API keys. **Rotate key** (More menu)
creates one and shows its secret once; **Revoke key** on a row retires one for
good. At most two keys are active. A revoked application gets no new keys. See
the **API keys** article.

How an integrator calls the API is in the **Integration** article.
