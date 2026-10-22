# Detections

A **detection** is one face a camera with recognition on saw: when, by which
camera, in which area, and what recognition made of it. **Monitoring →
Detections** lists them newest first with the **Face**, **Detected** time,
**Identity**, **Person**, **Camera**, **Area** and **Confidence**. The sidebar
facility picker narrows the list to one facility.

Detections are written by recognition only: they cannot be created, edited or
deleted here. The list is a log: it loads 50 at a time with **Load more** and
does not count all rows on every page (ask for the count when you need it).

## What the face column says

- A **photo** with **New identity**: the face matched no one and was good
  enough to become a new, unknown identity. The photo is the crop it was
  created from; the **Identity** link opens it.
- **—**: the face was matched to a known identity. A matched face keeps no crop
  of its own; the identity's page has its photos.
- **Unidentified**: the face was neither matched nor good enough to keep.
- **Erased**: the person's data was erased on request, or the detection was
  anonymized by a retention policy, or the photo file is gone. The row stays
  for the statistics; who it was is not shown any more.

**Person** is the profile the identity is linked to now (computed from the
identity, so a later link shows on older detections too). **Confidence** is
how sure the face detector was that this is a face; the match's
**Similarity** and the face's **Quality** are on the detection's page.

## Filters and saved views

Filter by **Facility**, **Area**, **Camera**, **Detected** time, **Person**,
**Identity** or **New identity**. The saved views:

- **Known people**: faces of identities linked to a person.
- **Unknown people**: faces of identities linked to no one.
- **New identities**: faces that created an identity.
- **Unidentified faces**: faces recognition did not keep.

## On other pages

An identity's page and a person's profile have a **Detections** tab with the
faces of that identity (or of every identity of the person), and a
**Sessions** tab with their tracking sessions.
