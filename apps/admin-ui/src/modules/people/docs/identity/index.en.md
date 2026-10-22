# Identities

An **identity** is a face the platform tracks: the face photos and templates
cameras match against, and when and how often the face was seen. Linked to a
profile it is a known person; without one it is an unknown person. See
*Profiles and identities* on the profile help for how the two fit together.

**People → Identities** lists them with the primary photo, code, status,
profile, source, last sighting and number of detections, newest sighting
first. Search looks in the code; the filters narrow by status, source,
profile, matching, synthetic and the first and last sighting.

## Where identities come from

The **Source** says how an identity came to be:

- **Camera**: recognition met a face that matched no identity.
- **Enrollment**: **Enroll face** on a profile created it.
- **Manual**: **Create identity from photos** created it.
- **Import**: another system, such as an access control export.
- **Merge** and **Split**: the merge and split of identities.

Identities are never created by a plain form and never deleted: their
**Status** ends their use.

## Photos and enrollment

Three flows give the platform face photos. Each takes **one to five photos**,
uploaded as JPEG, PNG or WebP files (up to 15 MB each) or taken with the
browser camera (**Use camera**, then **Take photo**; the browser asks for
permission first). The chosen photos show as numbered thumbnails; **×** under
one removes it.

- **Create identity from photos** (identity list): a new unknown identity.
  If the face already belongs to an identity, nothing is created and the form
  names that identity.
- **Add photos** (identity page): more photos of the same face, which helps
  recognition in other light and from other angles. Not offered on a merged
  or archived identity, and disabled while matching is off.
- **Enroll face** (profile page): the photos go to the person's primary
  identity, or to an unlinked identity whose face matches (which is then
  linked to the profile), or to a new identity linked to the profile. Enrolling
  again adds to the same identity, never a second one. Disabled on an erased
  profile and while processing is restricted.

The platform checks every photo, not the browser. A photo is **refused** when:

- no face is found;
- there is more than one face (use a photo of the person alone);
- the face is too small, blurred, dark or turned away (low quality);
- the file is not a readable image;
- (Add photos only) the face matches a different identity: merge the two if
  they are the same person.

When at least one photo is good, the good ones are saved and the result lists
each refused photo by its number with the reason, so nothing is half done
silently: retake those and use **Add photos**. When no photo is good, nothing
is saved and the form says, photo by photo, why. A request is also refused as
a whole, with nothing saved, when the face belongs to a person whose
processing is restricted or who withdrew biometric consent, or (Enroll face)
when it belongs to an identity linked to another profile: then check whether
the two profiles are the same person.

The platform keeps its own crop of each accepted face. The uploaded originals
are ordinary files of the organization (kind `face_source`).

## The identity page

- **Details**: the primary photo (the best-quality crop), the profile link
  with its strength and who linked it, the first and last sighting, the
  number of detections, the estimated age, the last match confidence, the
  attributes (such as `{"age": 34, "gender": "F"}`) and the organization's
  custom identity attributes.
- **Photos**: every face crop, newest first, with its kind (camera capture,
  enrollment, uploaded), the quality score the platform gave it, when it was
  taken and by which camera; the primary photo is marked.

A red box marks a **merged** identity: it is frozen with its history, and
**Edit** and **Add photos** are disabled until the merge is rolled back. A
yellow box marks an identity whose **matching is off** because the person
withdrew biometric consent.

## Editing

**Edit** changes:

- **Status**: unverified, suspended or archived. Pending verification and
  verified come from verification requests, merged from a merge; the form
  refuses them.
- **Profile link**: the **Profile**, the **Link strength** (0 to 1; 1 when
  confirmed) and **Primary for profile** (the identity enrolling adds to; a
  profile has at most one, and only a linked identity can be primary).
  Linking or unlinking is refused while the person's processing is
  restricted. A **synthetic** identity (a test identity of the face
  authentication sandbox) is never linked, so these fields are disabled on it.
- **Attributes** and **Custom attributes**.

## Saved views

- **Unknown people**: identities without a profile that are still matched
  (not archived or merged), synthetic ones left out.
- **Known people**: identities linked to a profile.
- **Matching off**: identities whose person withdrew biometric consent.
- **Synthetic**: the sandbox's test identities.
