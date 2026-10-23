# Access grants

An **access grant** lets one person through one place for a limited time,
beside the access policies: a visitor's meeting room, a contractor's plant
room for the afternoon, a courier's loading dock once. **Access control →
Access grants** lists them; the views **Not revoked**, **Single use,
unused**, **Used** and **Revoked** narrow the list. A person's and an access
point's **Access** tab list their grants too, and create one for them.

## Granting

Choose the **Person**, then exactly one place:

- an **Area**: every door leading into the area or into the areas inside it;
- or an **Access point**: one single door, turnstile or gate.

Then **Valid from** and **Valid until** (until after from), whether it is
**Single use**, and the **Reason**. Terminals receive reusable grants with
their validity and enforce the end themselves.

A grant is looked at only when no emergency override, no refusal of the
person (unknown face, inactive profile) and no policy decided at the door. A
policy that denies the person there wins over any grant.

## Single use

A **Single use** grant opens one door once: the first door it decides at uses
it up. Its **Use** reads **Unused** until then and **Used** with the moment
afterwards; a reusable grant reads **Reusable**. Single-use grants are checked
centrally only and never sent to terminals.

## Revoking, never editing

A grant never changes once created: to change a person's access, revoke the
grant and grant again. **Revoke** asks for a reason and ends the grant now; it
opens no door from then on and terminals are told at once. **Revoke** is not
offered on a grant already revoked or used up, and is disabled (it says why)
once the grant has expired. The revocation, its member and its reason stay on
the grant and in the audit log.

## Decisions

A grant's **Decisions** tab lists the decisions it made, newest first. A used
grant is never deleted: its decisions keep pointing at it.
