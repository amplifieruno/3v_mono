# Integration

What a developer needs to connect a client application to the face
authentication API. The full integrator guide, with worked examples in Node and
curl, is `tasks/data-layer/face-auth-api.md` in the ITAP repository; the
machine-readable contract is `GET /v1/auth/openapi.json` on the ITAP backend
(OpenAPI 3.1, no key needed): generate clients from it.

## Keys

The application calls the API with a key: an 8-character **prefix** and a
**secret** shown once, when the key is created. An application has at most two
active keys, so a new key can be rolled out before the old one is revoked. Keys
can expire or be revoked; an administrator rotates and revokes them on the
application's **Keys** tab (the **API keys** article). The secret must never
ship inside a browser or mobile app: capture devices send their frames to the
integrator's own server, which signs the requests.

## The sequence

1. **Open a session**: `POST /v1/auth/sessions` with the mode, the claimed
   identity (verification only), the access point (required when the
   application is bound to access points) and a device reference. The answer
   carries the session id and a nonce. A session lives 5 minutes.
2. **Capture** 3 to 5 frames from the live camera, a fraction of a second apart
   (JPEG or PNG, at most 5 MB together). A still photo or repeated frames are
   refused as an attack.
3. **Authenticate**: `POST /v1/auth/authenticate` with the frames and their
   binding to the session (an HMAC over the nonce, the frames and the device
   reference, made with the key secret).
4. **Act on the answer**:
   - `success`: the identity's id, the confidence and the attributes shared
     with the application;
   - `partial_match`: recapture (at most twice), or in verification confirm
     with a second factor of your own; after the last recapture an
     identification goes to manual review in the console;
   - a quality `failure` (no face, several faces, low quality, blur, poor
     lighting): show the guidance and recapture;
   - any other `failure`: stop and offer another sign-in method. The answer
     never says who was the closest match.

Every request is signed: `Authorization: ITAP-HMAC key=<prefix>, ts=<unix
seconds>, sig=<hex>`, an HMAC-SHA256 with the key secret over the method, the
path, the timestamp, the body's hash and an optional `X-Request-Id`. The clock
may be at most 300 seconds off, and a signature is accepted once.

## What the console settings mean for the caller

| Setting | The caller sees |
|---|---|
| Status Suspended or Revoked | `403 application_inactive` on every request |
| Mode not allowed | `403 mode_not_allowed` |
| Bound to access points | `400 access_point_required` without one, `403 access_point_not_bound` for another door |
| Population, threshold | `below_threshold` for anyone outside the population (indistinguishable on purpose) |
| Liveness required | `liveness_failed` when the capture's liveness was not checked |
| Attributes | exactly those keys in `identity.attributes` |
| Sandbox | only synthetic test identities; real people read `below_threshold`; no events |

Requests are limited to bursts of 30 and 10 per second per key (`429` with
`Retry-After`).

## What is detected, and what is not

The binding proves the caller holds the key secret, nothing more. Exact replays
of a sequence and repeated frames are refused. The liveness check is a cheap
heuristic: a sequence whose face does not move reads as a printed photo, but a
video replayed on a screen or a mask may pass. Treat face authentication as one
factor and require a second one for anything sensitive.
