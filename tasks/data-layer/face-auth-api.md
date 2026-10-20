# Face authentication API: integrator guide

Base path `/v1/auth` on the ITAP backend (dev: `http://127.0.0.1:3001`). The machine-readable contract is `GET /v1/auth/openapi.json` (OpenAPI 3.1, no key needed); generate clients from it. All bodies are JSON, all timestamps ISO 8601 UTC.

## 1. Concepts

- **Client application**: configured in the console (modes, permitted attributes, bound segments / facilities / access points, thresholds, liveness). The application, not the request, decides who can be authenticated.
- **Key**: `key=<8-character prefix>` plus a secret shown once when created (`rotate_client_key`). An application has at most 2 active keys (rotation overlap). Keys can expire or be revoked.
- **Session**: one authentication transaction (5 minutes). A session carries the mode, an optional claimed identity and access point, and up to 2 recaptures.
- **Sandbox application**: `is_sandbox`; works only against the synthetic test identities of its bound segment (binding a segment is required: without one the population is empty), never sees production people, emits no events.

## 2. Integration sequence

1. `POST /v1/auth/sessions` `{mode, claimed_identity_id?, access_point_id?, device_ref}` returns `{session_id, nonce (base64), expires_at}`. `device_ref` identifies the capture device (1 to 128 characters). An application bound to access points must name one of them in every session (`400 access_point_required` otherwise); an application without bindings must not send one.
2. Capture 3 to 5 frames (JPEG or PNG, base64, at most 5 MB decoded in total) from the live camera, a fraction of a second apart. Do not send a still photo or a repeated frame.
3. Compute the binding (section 4) and `POST /v1/auth/authenticate`.
4. Handle `outcome` and `next_step`:
   - `success` / `next_step: none`: done. Use `identity.id`, `confidence` and `identity.attributes` (only the attributes the application is allowed to read; `photo` is `{url, expires_at}`).
   - `partial_match`: the match was close but not conclusive. Identification: `next_step: recapture` -> `POST /v1/auth/sessions/{id}/recapture` with a new sequence (new binding). Verification: `next_step: second_factor` from the first partial match on -> your own second check, then `POST /v1/auth/sessions/{id}/second-factor` (a recapture is still accepted instead). After the last recapture a partial match goes to manual review (`next_step: review`): poll `GET /v1/auth/sessions/{id}` until `status` is `succeeded` or `failed`.
   - `failure` with `failure.retryable` and `next_step: recapture`: a quality problem (`no_face`, `multiple_faces`, `low_quality`, `blur`, `poor_lighting`). Show `failure.guidance` and recapture.
   - any other `failure`, `next_step: none`: stop; offer another sign-in method. The response never says who was the closest match. A detected attack (`attack_detected`) closes the session even when the frames were also unusable: it takes precedence over a quality failure.
5. Never retry a request with the same signature (it is refused as replayed); build a new request.

Identification mode: the person is unknown to the caller; the service searches the application's population. Verification mode: the caller names `claimed_identity_id` (repeat it in every `authenticate` / `recapture` body; the session stores only a hash) and the service compares against that identity only. A second factor exists only in verification: in identification a partial match goes recapture, then review.

## 3. Request signing

Header: `Authorization: ITAP-HMAC key=<prefix>, ts=<unix seconds>, sig=<hex>`.

`sig` = lowercase hex HMAC-SHA256 with the key secret (UTF-8 string) over this exact string:

```
METHOD \n PATH \n TS \n hex(sha256(raw body)) [ \n X-Request-Id ]
```

- `METHOD` upper case; `PATH` the request path with any query string exactly as sent (for example `/v1/auth/sessions`); `TS` the same unix seconds as in the header; the body hash is over the exact bytes sent (empty body: sha256 of the empty string).
- When you send an `X-Request-Id` header (a UUID is echoed as `request_id`; anything else is replaced by a generated id), its trimmed value is appended as a fifth line, so it is signed too. If you do not send the header, there is no fifth line.
- The timestamp must be within 300 s of the server clock (`401 timestamp_skew`, retryable once the clock is fixed). Each signature is accepted once: it is remembered until `ts + 301 s`, when the timestamp check takes over, so two identical requests in the same second need distinct `X-Request-Id` values. A request refused for an expired key, an inactive application or the rate limit is not remembered (it can be sent again unchanged while its timestamp is valid).
- A missing, malformed or unknown key, bad signature or tampered body all give the same `401 unauthorized`. A revoked key answers `401 key_revoked` by its prefix alone: revocation deletes the server's copy of the secret, so its signatures can no longer be checked.
- Rate limit: 30 requests burst, 10 per second per key; `429` carries `Retry-After`.

## 4. Sequence binding

Proves the frames were taken for this session and device. After the session is created:

```
binding = hex( HMAC-SHA256(secret, nonce_bytes || sha256(frame_1_bytes || ... || frame_n_bytes) || utf8(device_ref)) )
```

`nonce_bytes` is the base64-decoded nonce (32 bytes); the frame bytes are the decoded images in the order sent (a `data:image/...;base64,` prefix is accepted and ignored). A wrong binding, byte-identical frames or a replayed sequence give `attack_outcome: injection`, `failure.code: attack_detected`.

The binding needs the key secret, which must never ship inside a browser or mobile app. A capture kit sends its frames to the integrator's own server, which computes the binding and signs the request (section 4a).

## 4a. What is detected (and what is not)

Be precise about the guarantees before relying on them:

- **Binding** proves possession of the application's key secret, nothing more: whoever holds the secret can bind any frames, including injected ones. Keep the secret server-side; capture devices send frames to the integrator's server to bind and sign.
- **Replay** (`injection` with `replay: true`): the service keeps a digest of every sequence and refuses a byte-identical sequence. Re-encoding, cropping or any one-bit change makes a different digest: only exact replays are caught.
- **Duplicate frames** (`injection`): byte-identical frames inside one sequence.
- **Liveness** is a cheap heuristic: a sequence whose face box does not change between frames is `printed_photo`. Non-identical stills (a slightly moved photo, a video replayed on a screen, a mask) pass it. A perfectly still live person can be flagged.
- `screen_replay` and `mask` exist in the enum but are never produced today; there is no depth, texture or challenge-response liveness.
- Acceptance risk: the SA_6 presentation attack test set (printed photos, screens, masks, injected streams) has not been run against this service; expect screen and mask attacks to pass. Treat face authentication as one factor and require a second factor for anything sensitive.

## 5. Endpoints

| Method and path | Purpose | Body |
|---|---|---|
| `POST /v1/auth/sessions` | open a session (201) | `mode`, `claimed_identity_id?` (verification only), `access_point_id?`, `device_ref` |
| `POST /v1/auth/authenticate` | first capture | `session_id`, `frames[3..5]`, `binding`, `claimed_identity_id?`, `threshold?`, `timeout_ms?` |
| `POST /v1/auth/sessions/{id}/recapture` | further capture (at most 2) | same without `session_id` |
| `POST /v1/auth/sessions/{id}/second-factor` | verification only, after a partial match | `result` (`passed`/`failed`), `method` (1 to 64 characters) |
| `GET /v1/auth/sessions/{id}` | status / review polling (`next_step: capture` on a session without a capture yet) | none |
| `GET /v1/auth/health` | service and dependency health (no key) | none |
| `GET /v1/auth/openapi.json` | OpenAPI 3.1 (no key) | none |

Authenticate response (200): `request_id`, `session_id`, `timestamp`, `outcome` (`success|partial_match|failure`), `authenticated` (bool), `confidence?` and `identity {id, attributes}` (success only), `attack_outcome` (`passed|printed_photo|screen_replay|mask|injection|not_checked`), `failure {code, message, guidance, retryable}?`, `next_step` (`none|recapture|second_factor|review`; the status endpoint can also answer `capture`). A partial match or failure contains no identity and no score.

Parameters and limits: `threshold` can only raise the required similarity (a lower value is ignored); `timeout_ms` default 5000, range 100 to 10000 (an expired request answers `504 timeout` and nothing is recorded); at most 2 recaptures per session; session lifetime 5 minutes; frames 3 to 5, 5 MB total decoded.

## 6. Population and thresholds (server side)

The caller cannot widen the population or lower a threshold. The population is: identities linked to an active profile that belong to the application's bound segments, or to its bound facilities (the profile has an allow policy or grant there, or was tracked there in the last 30 days), narrowed to the shift roster when the application uses work schedules and to people allowed at the bound access point. A sandbox application's population is its synthetic identities.

Effective threshold = the largest of the application threshold, the population floor and the request value, capped at the application maximum, except that the floor always wins:

| Population size | Floor (cosine) |
|---|---|
| up to 100 | 0.50 |
| up to 1 000 | 0.55 |
| up to 10 000 | 0.60 |
| more | 0.65 |

Verification uses a fixed floor of 0.55. A score within 0.08 below the threshold is a partial match. A verification whose claimed identity is outside the population compares nothing: no score is computed or stored.

### Performance limits

- Measured populations (seeded Nova Tower): Lobby Kiosk 6 (roster-narrowed, 0 after hours), HR Portal 6, Visitor Check-in 1, Developer Sandbox 20; decision p95 ~17 ms in SQL, ~274 ms end to end with 3 frames (InsightFace dominates).
- The population is evaluated on every capture. Access point narrowing calls the access engine once per identity of the population: about 1.3 ms per identity (132 identities at a turnstile: ~170 ms; the review measured ~184 ms for 137). The spec target of 50 000 identities within 2 s is not met with narrowing: that would take about a minute. Without an access point, segment and facility scoping stay in the tens of milliseconds at the demo sizes, but have not been measured beyond a few hundred identities.
- Future work: narrow lazily (match the top candidates first, then check access for those only) and cache populations per application.

## 7. Outcomes and failure codes

`failure.code` values: `no_face`, `multiple_faces`, `low_quality`, `blur`, `poor_lighting` (retryable while recaptures remain), `below_threshold` (no match; also returned for claims outside the population, unknown or malformed ids: indistinguishable on purpose), `attack_detected`, `liveness_failed`, `second_factor_failed`, `partial_match`.

## 8. Error codes

Every non-2xx body: `{request_id, session_id?, error: {code, message, retryable, guidance}}`.

| HTTP | code | Retryable | Guidance |
|---|---|---|---|
| 400 | `invalid_request` | no | Fix the body (unknown field, wrong type, claim in identification, missing claim in verification, bad threshold) |
| 400 | `invalid_sequence` | no | 3 to 5 base64 JPEG/PNG frames |
| 401 | `unauthorized` | no | Missing/malformed header, unknown key, bad signature |
| 401 | `timestamp_skew` | yes | Fix the clock (limit 300 s) |
| 401 | `replayed_request` | no | Sign a new request (vary `X-Request-Id`) |
| 401 | `key_revoked` / `key_expired` | no | Use a current key |
| 403 | `application_inactive` | no | Application suspended or revoked |
| 403 | `mode_not_allowed` | no | The application may not use this mode |
| 400 | `access_point_required` | no | The application is bound to access points: send `access_point_id` |
| 403 | `access_point_not_bound` | no | The access point is not served by the application |
| 404 | `session_not_found` | no | Unknown session for this application |
| 409 | `session_closed` / `session_expired` | no | Open a new session |
| 409 | `session_mismatch` | no | Mode, claim and access point must equal the session |
| 409 | `session_step_invalid` | no | `authenticate` only on a fresh session, `recapture` only after an attempt |
| 409 | `recapture_limit` | no | No recapture left |
| 409 | `second_factor_not_allowed` | no | Only after a partial match in verification |
| 413 | `sequence_too_large` | no | Send smaller frames |
| 429 | `rate_limited` | yes | Wait `Retry-After` seconds |
| 500 | `internal` | yes | Retry |
| 503 | `face_service_unavailable`, `service_degraded`, `service_not_configured` | yes | Retry later |
| 504 | `timeout` | yes | Retry the capture |

## 9. Sandbox

Create a sandbox application in the console (modes, and the segment "Sandbox test identities": binding a segment of synthetic identities is required, a sandbox app without one has an empty population). It authenticates only the synthetic test identities (the seed creates 20: blends of two faces plus a mirror, i.e. people who do not exist), reports `below_threshold` for production people, and creates no events or notifications. Use it for integration tests with the same flow and keys as production.

Caveat for real deployments: synthetic identities are enrolled by the seed (`is_synthetic`, never linked to a profile, never merged with production identities, excluded from search and dynamic segments). There is no console flow yet to enrol your own synthetic test faces; outside the demo seed, creating them needs an admin script, and the faces must be generated or licensed for testing (never photos of real people without consent).

## 10. Worked examples (curl and Node)

Dev keys: the seed prints `key=<prefix> secret=<secret>` for each app (once). Export `KEY`, `SECRET`, `BASE=http://127.0.0.1:3001`.

```js
// client.mjs  (node 20+)
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3001';
const KEY = process.env.KEY;
const SECRET = process.env.SECRET;
const sha256 = (data) => createHash('sha256').update(data).digest();

async function call(method, path, payload) {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  const requestId = randomUUID();
  const canonical = `${method}\n${path}\n${ts}\n${sha256(body).toString('hex')}\n${requestId}`;
  const sig = createHmac('sha256', SECRET).update(canonical).digest('hex');
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-request-id': requestId,
      authorization: `ITAP-HMAC key=${KEY}, ts=${ts}, sig=${sig}`,
    },
    body: method === 'GET' ? undefined : body,
  });
  return { status: res.status, body: await res.json() };
}

export async function authenticate(framePaths, deviceRef = 'kiosk-1') {
  const frames = framePaths.map((p) => readFileSync(p));
  const opened = await call('POST', '/v1/auth/sessions', { mode: 'identification', device_ref: deviceRef });
  const { session_id, nonce } = opened.body;
  const binding = (list) =>
    createHmac('sha256', SECRET)
      .update(Buffer.concat([Buffer.from(nonce, 'base64'), sha256(Buffer.concat(list)), Buffer.from(deviceRef)]))
      .digest('hex');
  const payload = (list) => ({ frames: list.map((f) => f.toString('base64')), binding: binding(list) });
  let result = await call('POST', '/v1/auth/authenticate', { session_id, ...payload(frames) });
  // partial match or a quality failure: capture again (new frames, new binding)
  while (result.body.next_step === 'recapture') {
    const next = await captureAgain(); // your capture code: returns 3 to 5 new Buffers
    result = await call('POST', `/v1/auth/sessions/${session_id}/recapture`, payload(next));
  }
  return result;
}
```

Success (identification, one capture):

```
POST /v1/auth/authenticate  -> 200
{"request_id":"...","session_id":"...","outcome":"success","authenticated":true,"confidence":0.81,
 "identity":{"id":"<identity uuid>","attributes":{"display_name":"...","employee_id":"..."}},
 "attack_outcome":"passed","next_step":"none"}
```

Partial match with recapture:

```
POST /v1/auth/authenticate  -> 200
{"outcome":"partial_match","authenticated":false,"attack_outcome":"passed",
 "failure":{"code":"partial_match","message":"The match was not conclusive; additional verification is required",
            "guidance":"Look straight at the camera in good light and capture again, or confirm with a second factor.","retryable":true},
 "next_step":"recapture"}
POST /v1/auth/sessions/{id}/recapture (new frames, new binding) -> 200 success, or partial_match again (second recapture),
then next_step "review" (identification). In verification the first partial match already answers next_step "second_factor".
```

Quality failure (the session stays open):

```
POST /v1/auth/authenticate  -> 200
{"outcome":"failure","authenticated":false,"attack_outcome":"not_checked",
 "failure":{"code":"blur","message":"The images are blurred",
            "guidance":"Hold still and keep the camera steady while the images are taken.","retryable":true},
 "next_step":"recapture"}
```

curl needs the signature computed first; with `openssl`:

```bash
BODY='{"mode":"identification","device_ref":"kiosk-1"}'
TS=$(date +%s); RID=$(uuidgen)
HASH=$(printf '%s' "$BODY" | openssl dgst -sha256 -hex | awk '{print $NF}')
SIG=$(printf 'POST\n/v1/auth/sessions\n%s\n%s\n%s' "$TS" "$HASH" "$RID" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')
curl -s "$BASE/v1/auth/sessions" -H "content-type: application/json" -H "x-request-id: $RID" \
  -H "authorization: ITAP-HMAC key=$KEY, ts=$TS, sig=$SIG" -d "$BODY"
```
