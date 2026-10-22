# Merging, splitting, verifying and relating identities

Cameras sometimes make two identities of one person (a new angle, a hat,
poor light) or put two people's faces into one identity. These tools on the
identity page fix that, confirm who an identity is and record how people are
related. Every change goes through the platform, which refuses what would
break the data and says why on the form.

## Merge into this identity

**More → Merge into this identity** keeps the identity you are on and merges
others of the same person into it. Choose the **Identities to merge** (not
merged ones, and only real with real or synthetic with synthetic) and an
optional **Reason**. The dialog compares them side by side (photo, status,
profile, photos, face templates, watch-list entries, open duplicate pairs,
pending verifications) and says what the merge does:

- their photos, face templates, watch-list entries and manual segment
  memberships move to the kept identity;
- they become **Merged**: frozen with their history, left out of matching and
  unlinked from their profile;
- the kept identity takes over their profile when it had none;
- their open duplicate pairs close and their pending verification requests
  are cancelled.

The platform never moves a face to another person silently: identities linked
to two different profiles are refused (unlink one first, or merge the two
profiles). The comparison says so before you send. After a review step and a
confirmation, the merge runs. It is recorded in **People → Identity merges**
and can be rolled back.

A merge of several identities selected in the list is not offered: the list's
bulk actions cannot ask which identity to keep, so a merge always starts from
the identity that stays (or from a pair in **Identity duplicates**).

## Split

**More → Split** is for an identity that holds two people's photos. Click the
photos that show the other person (they are marked; the line under them says
how many photos and face templates move and how many stay), review and
confirm. A new identity (source **Split**, unverified, not linked to a
profile) takes those photos with their face templates, and opens. A split is
not undone by a rollback; merge the two again instead.

## Timeline

The **Timeline** tab lists where and when the identity was, newest first and
grouped by day: arriving at and leaving a facility (or being lost from sight),
entering or moving through areas, its events (access granted or denied,
alerts, with their severity) and its visits' check-in and check-out. Each
entry names the place (facility, area, access point) and the camera.
Entries of identities merged into this one are included, marked *as a merged
identity*. **Show older** reads 50 more, up to 500.

## Relationships

The **Relationships** tab lists the identities this one is related to, with
the **Relation** (companion: usually seen together; related: family or
colleagues; other), the **Confidence** from 0 to 1 and a **Note**.
**More → Add relationship** adds one. A relationship is stored once for the
two identities, so it shows on both, and adding the same two again is
refused. **Open** on a row shows the relationship, where it is edited or
deleted.

## Verification

The **Verification** tab lists the identity's verification requests;
**+ Create** asks for one. See *Verification requests*.

## Merges

The **Merges** tab lists the merges that kept this identity and, for a merged
identity, the merge it went into; each opens the merge, where it can be rolled
back.
