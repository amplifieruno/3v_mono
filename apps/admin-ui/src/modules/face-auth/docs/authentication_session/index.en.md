# Authentication sessions

A client application opens an **authentication session** for each person it
wants to authenticate, then sends one or more captures of the face to it. The
**Authentication sessions** page (Face authentication) lists them newest first;
an application's own sessions are also on its **Sessions** tab. Each test run
from **Authenticate a face** opens a console session (device `console:<member>`,
no API key).

The log is append-only: sessions are written by the face authentication service
and never edited or deleted here. It pages with Next and Previous and does not
count every row on every page.

## Status

- **Open**: still accepting captures. After a partial match or a quality
  failure the application may capture again (a **recapture**, at most two per
  session), and a verification may confirm the person with a **second factor**.
- **Waiting for review**: the last recapture ended on a partial match again; an
  administrator approves or rejects the attempt (see **Authentication attempts**).
- **Succeeded** / **Failed**: closed with or without a confirmed person.
- **Expired**: not completed within its five minutes.

A closed session never opens again.

## The page of a session

The **Attempts** tab lists the session's captures in order, with their outcome,
failure reason, confidence and threshold; each opens its attempt. **Details**
shows the next step, the counts, the claimed identity (verification) and door,
the expiry and closing times, the API key that opened it and where the request
came from.
