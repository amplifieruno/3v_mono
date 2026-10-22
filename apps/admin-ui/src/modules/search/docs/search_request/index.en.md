# Face and attribute search

**Search** (under Search in the sidebar) finds the identities the platform
knows: by the face in a photo, by what is known about them, or both. Every
search you run is kept in your **Search history**, which only you can see.

## Three kinds of search

- **Face**: compares one photo with every enrolled face of the organization and
  lists the closest identities, best first.
- **Attributes**: no photo. Lists the identities that match the filters, most
  recently seen first.
- **Face and attributes**: compares the photo, but only with identities that
  also match the filters.

## The photo

Upload a JPEG, PNG or WebP file, or take the photo with the camera. The photo
is stored for you alone: other members cannot open it.

The platform reads the photo before it searches:

- **No face found**: nothing is searched, and the search says so.
- **Several faces**: the largest face is searched, and the result says how many
  faces the photo showed. Crop the photo to search for someone else in it.
- **A face too small, blurred, dark or turned away**: nothing is searched; use
  a sharper, frontal photo.

A search that could not run still appears in your history, marked failed, with
the reason.

## Filters

Every filter you fill in must hold; empty filters search everyone. You can
filter by the identity's status, whether it is linked to a profile, the
profile's type and company, the gender and age the platform estimated from the
best photo, when the person was first or last seen, and whether they were
tracked in a facility (optionally within a time window).

## Threshold and match types

The **threshold** is the lowest face similarity listed as a match, from 0.2
(loose) to 0.95 (strict). It starts at the organization's default: 1 minus the
**recognition threshold** in the organization settings (0.5 when that is 0.5).

Each face match is marked:

- **Exact**: at least 0.15 above the threshold.
- **Partial**: at or just above the threshold; check the photo before acting.
- **Fuzzy**: up to 0.1 below the threshold, listed only when you ask for
  fuzzy matches. A lead, not a match.

An attribute search marks every identity it lists as exact. **Results at
most** limits the list (1 to 100, 20 by default).

## Who is never found

- People whose **processing is restricted** or who **withdrew biometric
  consent**: their faces and records are left out of every search.
- Identities **merged** into another: the search finds the identity they were
  merged into, never the merged one.
- Synthetic test identities.

## Results

Each result card shows the identity's best photo, its code and status, the
person (or "Unknown person" for an identity without a profile), the similarity
and the match type. The code opens the identity, the name opens the profile.

## Search history

Your history lists every search you ran, by hand or through your saved
searches, newest first. A search's page shows its outcome and results again,
and how it was run. **Run again** repeats it with the same photo and filters
against today's identities; you can adjust the threshold, the number of results
and fuzzy matches first. A face search whose photo was deleted cannot be run
again.
