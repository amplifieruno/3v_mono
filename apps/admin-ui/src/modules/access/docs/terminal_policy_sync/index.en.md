# Terminals and their policy sync

Access terminals decide at their doors from a copy of the organization's
access rule set: the policies in force, the reusable grants and the active
emergency overrides that concern their doors. Every change to them raises the
rule set's version, its **epoch**, and terminals are brought up to it:

- within seconds when access narrows (a deny, a revoked grant, an override
  started or ended): an **urgent** change, which every terminal must receive
  within the organization's revocation bound;
- otherwise within 15 minutes: the sync that runs every minute pushes a
  terminal that is behind once its last sync is 15 minutes old.

## Terminals page

**Access control → Terminals** lists every access terminal of the facility
selected in the sidebar (or of every facility) with its state:

- **Current**: it holds the current epoch;
- **Behind**: it holds an older epoch and receives the current one within
  15 minutes (within seconds for an urgent change);
- **Never synced**;
- **Unreachable**: the terminal is offline or unhealthy; it keeps its older
  rule set and is tried again by the sync (every minute while an urgent
  change is pending for it).

Each row shows the epoch held, the last sync and any error, an urgent change
still pending (and for how long) and whether the terminal is outside the
revocation bound. A terminal's own page shows the same on its **Access
policies** tab, with its sync log.

## Publish policy to terminals

**Publish policy to terminals** (in the header, the command palette and on the
Terminals page) pushes the current rule set now to every terminal of the
facility selected in the sidebar, or of every facility when none is,
whatever epoch they hold. The page then shows each terminal by name with its
result (**Synced**, **Unreachable**, **Failed**, or skipped when it already
had a newer one) and the epoch published. Publishing again is harmless.

## Terminal sync log

**Access control → Terminal sync log** lists every push, newest first: when,
the terminal, the **Result**, the **Epoch**, whether it was **Urgent** or
**Published by hand**, and the error. A repeated failure is logged once, when
it starts. The log is history: never changed, paged by keyset, and counted
only on demand. The views **Not delivered** and **Published by hand** narrow
it.
