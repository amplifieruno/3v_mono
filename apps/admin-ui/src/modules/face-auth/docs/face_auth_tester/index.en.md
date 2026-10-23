# Authenticate a face

**Authenticate a face** (Face authentication) runs a face authentication from
the console exactly as a client application would, and shows the answer the
API gives it. Use it to check an application's settings: its population,
modes, thresholds and the attributes it receives.

## Running a test

1. Choose an active **Application** and a **Mode**. In verification, choose the
   **Claimed identity** too (for a sandbox application only its synthetic
   test identities are offered). If the application is bound to doors, choose one
   of them as **Access point**. A **Threshold** may raise the application's
   threshold up to its maximum, never lower it.
2. Add **3 to 5 frames** of one face: take them with the camera (**Use camera**,
   then **Take photo** a moment apart) or upload image files. Fewer than 3 are
   refused before anything is sent. Identical frames, or a still picture held
   to the camera, are refused as an attack; sending the same frames twice reads
   as a replayed sequence. The frames are stored as your own search images:
   visible to you only, never to the rest of the organization, and deleted
   within minutes of the test, whatever its outcome.
3. **Authenticate**. The form makes way for the decision.

## The decision

The decision lists the fields the API returns: whether the person was
**authenticated**, the **outcome**, the **confidence** (with a success), the
recognised **identity** and the **attributes** the application may receive,
the **attack check** (a photo attribute is a short-lived link, or says why
there is none), the **failure** with its message and the guidance shown
to the person, and the **next step** the application would take. Links open the
recorded attempt (threshold used, population size, latency, evidence) and its
session.

Every test is recorded like any request of the application: a console session
(device `console:<member>`, no API key) and its attempt, and events for a
production application. A test opens a new session each time, so it never
recaptures and never waits for a review.

If the answer is lost (the network failed), the console cannot tell whether the
test ran; look for your console session in **Authentication sessions** before
trying again.
