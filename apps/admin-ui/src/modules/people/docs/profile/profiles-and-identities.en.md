# Profiles and identities

The platform keeps two records about people, and they answer different
questions.

## A profile is who someone is

A **profile** is written by people: an administrator, an HR import, a visit
registration. It holds the person's name, company, type (employee, visitor,
contractor, VIP), dates, clearance and custom attributes. Access policies,
visits, segments of known people and reports work on profiles.

A profile alone cannot be recognised: it has no face.

## An identity is a face the platform tracks

An **identity** is created by the platform around a face:

- by **enrolment**, when someone uploads or captures photos of a person's face;
- by **recognition**, when a camera meets a face that matches no identity yet
  (a new, unknown person);
- by a **merge** or a **split** of existing identities.

Each identity keeps its face photos and the face templates recognition matches
against, and it accumulates detections, locations and tracking sessions. An
identity can be unverified, waiting for verification, verified, suspended,
archived (out of matching) or merged into another.

## Linking the two

Linking an identity to a profile tells the platform that this face is this
person. From then on a camera that recognises the face reports the person by
name, face authentication can sign the person in, and the person's activity
(visits, last seen, most visited area) is rolled up on the profile.

- One profile can have **several identities** (for example a face enrolled at
  the desk and one first seen by a camera before the two were merged or
  linked). **Identities** on the profile counts them.
- An identity **without a profile** is an unknown person. An unverified
  unknown identity that is not seen again is archived by the daily lifecycle
  job after the number of days the organization settings give for archiving
  unknown identities.
- A profile **without an identity** is *pending face link*: the **Pending face
  link** view of the profile list shows the active ones, so their faces can be
  enrolled.

## What follows from the split

- Deleting is different: a profile is never deleted (its status ends access),
  while identities are merged, split or archived.
- Restricting processing of a person acts on the profile and through it on
  every linked identity: none of them is matched while the restriction holds,
  and no identity can be linked or unlinked.
- A blacklist entry names the person (the profile) or the face (an identity):
  a blacklisted identity without a profile can still raise alerts, and a
  profile counts as blacklisted when any of its linked identities is.
