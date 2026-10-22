# Profiles

A **profile** is a known person: an employee of a tenant, a visitor, a
contractor or a VIP. **People → Profiles** lists the organization's profiles
with their code, name, type, company, status and two badges: **Face linked**
(the person can be recognised) and **Blacklisted**. Search looks in the last
name, first name, email, code and employee ID; the filters narrow by type,
status, company, access level, the two badges, a processing restriction and
the dates.

A profile describes the person; the faces the cameras recognise are
**identities**, linked to the profile. See *Profiles and identities* for how
the two fit together.

## Adding a profile

**Create** first asks for the **type**. The type decides which fields the
profile has and is fixed afterwards in the console:

- **Employee**: every field, including **Employee ID**, **Department**, **Job
  title** and **Work schedule** (the weekly hours attendance and after-hours
  rules compare with).
- **Contractor**: no employee ID or department. The **End date** is when the
  contract access stops.
- **Visitor**: no employment fields. **Start date** and **End date** usually
  cover the visit days; the host is named on the visit itself.
- **VIP**: no employee ID or work schedule; department and job title stay.

Every profile has a **First name** and **Last name**, optional **Email** and
**Phone**, a **Company** (the tenant, vendor or visitor organization it
belongs to), an **Access level** (its clearance on the 4-step scale access
policies compare with areas: basic, standard, elevated, administrative), the
dates, an **External ID** (its key in an HR system it was imported from),
**Notes** and the organization's **Custom attributes** (Organization → Custom
attributes; required ones must be filled). The end date cannot be before the
start date.

**Photo** is a portrait for the profile page (PNG, JPEG or WebP up to 2 MB).
It is only a picture: recognition uses the face photos of the person's
identities, not this one.

## Status instead of deleting

Profiles are never deleted, because detections, events, visits and access
decisions keep referring to them. End a person's access with the **Status**:

- **Active**: expected on site.
- **Inactive**: no longer expected. The daily lifecycle job sets visitors and
  contractors whose end date has passed to inactive, and merging two profiles
  sets the merged one inactive.
- **Suspended**: temporarily without access.
- **Terminated**: the employment or contract ended.

A profile leaving active, or a lowered access level, narrows door access on the
terminals at once.

## Restricting processing

**Restrict processing** in the profile's menu restricts the processing of the
person's data (a data subject's right to restriction, for example while the
accuracy of the data is contested). It asks for a **Reason**, which goes to the
audit log and onto the profile, and a confirmation. While the restriction
holds:

- the person's faces are left out of recognition, face authentication, search
  and dynamic segments;
- their open tracking sessions and manual segment memberships are closed;
- identities cannot be linked to or unlinked from the profile, no face can be
  enrolled (**Enroll face** is disabled with the reason), and the profile
  cannot be merged with another;
- nothing is deleted, and the profile's own fields can still be corrected.

The profile shows a yellow box above the details with when, by whom and why
the restriction was set (a data subject request's restriction reads `dsr:` and
the request code). **Lift restriction** ends it, again with a reason: the
person is recognised, searched and segmented again, while the sessions and
memberships the restriction closed stay closed.

## Erased profiles

An **erased** profile (a data subject's erasure request) is shown with a red
box. Its personal data is gone and it stays as a tombstone for the history
that points at it. The database refuses any change to it, so the console
disables **Edit**, **Enroll face**, **Upload document**, the restriction flows and every field
of the edit form, each with the reason. Its restriction is never lifted.

## The profile page

- **Details**: the fields above, with the photo, the custom attributes and
  whether processing is restricted.
- **Identities**: the person's identities (tracked faces) with their photo,
  status, link strength, last sighting and detection count; the primary one
  is marked. **Enroll face** in the page header adds face photos for the
  person (see *Identities*).
- **Documents**: the person's documents; **Upload document** adds one and
  **Open file** opens it (audited). See *Profile documents*.
- **Consent**: the person's consent decisions per purpose, recorded and
  withdrawn there. Withdrawing biometric consent stops face matching for the
  person. See *Consent*.
- **Activity**: the person's last 30 days, computed hourly from the tracking
  sessions of the linked identities: **Visits in 30 days** (each facility and
  day counts once), **Average stay**, **After-hours visits**, **Last seen**,
  the **Most visited area** and when the figures were computed. A person never
  seen has no figures yet; figures of a restricted person stop at the
  restriction.

A company's page lists its people on its **People** tab. Possible duplicate
profiles wait in **People → Profile duplicates**, where two profiles of the
same person are merged.

## Saved views

Above the list:

- **Employees**: profiles of type employee.
- **Visitors today**: visitors whose start date is on or before today and whose
  end date is on or after it. "Today" is the day the console was opened:
  reload it after midnight.
- **Blacklisted**: people with an active entry on a blacklist watch list, for
  the profile or for one of its linked identities.
  Blacklisted is not a type; a blacklisted contractor stays a contractor.
- **Pending face link**: active profiles without any linked identity, so no
  camera can recognise them yet.
