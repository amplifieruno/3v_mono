# Verification requests

A verification request asks an administrator to confirm who an identity is,
for example by checking an ID card against its photos. **People →
Verification requests** lists them with the identity, **Status**, the
**Reviewer** asked to decide, who requested it and when it was requested and
decided. The **Pending** saved view shows the open ones.

## Asking

**+ Create** (here or on the identity's **Verification** tab) takes the
**Identity**, an optional **Reviewer** (an active member) and a **Reason**.
While the request is open an unverified identity shows **Pending
verification**. An identity has at most one open request. A pending request
can be edited (reviewer, reason); a decided one is kept as it is.

## Deciding

- **Approve** confirms the identity: it becomes **Verified**. A reason is
  optional.
- **Reject** needs a reason: the identity goes back to **Unverified**.

Both record who decided and when, and write the audit log. A suspended or
archived identity cannot be approved (set it back to unverified first, or
reject). A request becomes **Cancelled** when its identity is merged into
another one; a rollback does not reopen it.
