# Authentication attempts and review

Each capture a client application sends to a session is an **authentication
attempt**: the frames are checked (one face, quality, presentation attacks),
compared with the application's population, and decided. The **Authentication
attempts** page lists them newest first; an application's and a session's own
attempts are also on their pages. The log is append-only: nothing is edited or
deleted here, and only the review of a partial match adds to an attempt.

## What an attempt shows

- **Outcome**: success (matched at or above the threshold), partial match (the
  best score fell within 0.08 under the threshold) or failure.
- **Failure reason**: no face, several faces, low quality, blurred, poor
  lighting, no candidate, below threshold, liveness failed, attack detected or
  second factor failed. **Not in population** is a verification of someone the
  application may not authenticate: nothing was compared, and the application
  was told "below threshold" so it cannot learn who is enrolled.
- **Confidence** and **Threshold used**: how similar the face was to the best
  candidate, against the threshold in force. The threshold is the
  application's, raised for a large population or by the request, never
  lowered. A failure outside the population has no confidence.
- **Population**: how many identities the application could authenticate at that
  moment (segments, facilities, shifts and the door applied).
- **Attack check**: what the presentation attack checks found (passed, still
  picture, injection, ...).
- **Latency (ms)**: how long the decision took; **Details** splits the two
  comparison stages.
- **Evidence**: one frame of a capture that did not succeed (a success keeps
  none). It is sensitive: **Open file** asks the platform for a short-lived
  link, and every opening is written to the audit log.

## Review of partial matches

A session that ends on a partial match after its last recapture waits for an
administrator. The saved view **Waiting for review** is the review queue: the
partial matches whose review is pending.

On such an attempt, **Approve** or **Reject** asks for a **note** (why the
person was or was not accepted). Approving confirms the matched person: the
session succeeds and closes, and the authentication success event is raised,
so notification rules and webhooks see it. Rejecting fails and closes the
session and raises the failure event. A sandbox application raises no events.
The attempt then shows **Reviewed by**, **Reviewed** and the **Review note** on
its Review tab; the decision is also in the audit log.

Only a pending partial match can be reviewed. If someone else decided it first,
the platform refuses the second decision with the reason.
