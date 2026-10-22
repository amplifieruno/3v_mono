# Consent

A profile's **Consent** tab lists the person's consent decisions. Each record
is one consent for one **Purpose**:

- **Biometric processing**: face recognition and the storage of face
  templates.
- **Tracking**: following the person's movement between areas.
- **Analytics**: use of the person's data in analytics and reports.
- **Marketing**: marketing communication.

A record says how the consent was given (**Method**: paper form, electronic
form or verbal), when it was **Granted** and, once withdrawn, when it was
**Withdrawn**. A signed form attached by an import opens from **Signed form**
(audited, like a document); upload a new signed form as a document of the
profile.

## Recording a consent

**Create** on the Consent tab records a granted consent for the person: choose
the purpose and the method and add notes if needed. Nothing can be recorded
for an erased profile.

## Withdrawing

**Withdraw** records that the person withdrew the consent. The record is kept,
marked withdrawn, as evidence of both decisions; records are never deleted.

Withdrawing **biometric processing** has an effect at once: none of the
person's identities is matched any more. Cameras stop recognising the person,
face authentication refuses them and face search leaves them out. Their face
templates are kept until the consent retention period (Organization settings)
has passed, then deleted.

## Granting again

To record a new consent after a withdrawal, create a new record. For biometric
processing the **latest** record decides: a new grant after a withdrawal
switches face matching back on for the person's identities, as long as their
templates were not deleted yet. A person with no biometric record at all is
matched.

When two profiles are merged, the consents of the merged profile move to the
kept one, and the kept profile's latest biometric record decides for all of
the identities.
