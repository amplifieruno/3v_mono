# Tracking sessions

A **tracking session** is one stay of a person in a facility as the cameras
followed it. The first detection of the person in the facility opens a
session; every later detection extends it. **Monitoring → Tracking sessions**
lists them newest first with the arrival time, the **Identity** and
**Person**, the **Facility**, the **Status**, the **Last area**, when the
person was **Last seen** and the **Duration**. The sidebar facility picker
narrows the list.

## How a session ends

- **Active**: cameras keep seeing the person.
- **Completed**: no camera saw the person for the tracking timeout, and the
  last place was an exit of the facility.
- **Lost**: no camera saw the person for the tracking timeout anywhere else.
  The stale-session job closes it within two minutes.
- **Error**: closed by a processing error.

A visitor's session is linked to the visit of that day (**Visit** on the
session's page).

## The path

The session's **Path** tab lists its locations, newest first: each area the
person entered and each door passed, with the camera that saw it. A session
writes a location only when the person changes area or door, not for every
detection.

## Saved views

- **Active now**: people in a facility right now.
- **Lost from sight**: sessions that ended without an exit.
- **With a visit**: sessions of visitors linked to a visit.

Sessions are written by the tracking pipeline only and cannot be changed here.
