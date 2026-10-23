# API keys

A client application signs every request with an **API key**: a public
8-character **prefix** and a **secret**. The application's **Keys** tab lists
its keys with their **Prefix**, **Created**, **Expires**, **Last used** and
**Revoked** times. The secret is never listed: the platform keeps only a
fingerprint and an encrypted copy that no one can read back, not even an
administrator.

## Rotate key

**Rotate key** (More menu) creates a new key. Choose an **Expires** time if the
key should stop working by itself, or leave it empty for a key that works until
it is revoked; the expiry must be in the future.

The new key's prefix and secret are shown **once**, right after the rotation,
with a **Copy secret** button and a warning. Copy the secret into the
integration's secret store before closing the dialog: once the dialog is closed
or the page reloaded, the secret is gone for good. A lost secret cannot be
recovered: revoke that key and rotate again.

An application has **at most two active keys** (not revoked, not expired), so a
new key can be rolled out while the old one still works. A third rotation is
refused with the reason: revoke the key the integration no longer uses first.
A revoked application gets no new keys.

If the answer to a rotation is lost (the network failed), the console cannot
tell whether the key was created, and the secret could not be shown. Look at the
Keys tab: a new key you did not receive the secret of is revoked from its row.

## Revoke key

**Revoke key** (on a key's row) retires the key for good: every request signed
with it is refused at once and the platform drops its encrypted copy of the
secret. A revoked key is never used again and cannot be restored; it stays in
the list as history. Revoke a key after a rotation, once the integration signs
with the new key, or at once if its secret leaked.

## A rotation, step by step

1. **Rotate key** and copy the new secret into the integration's secret store.
2. Switch the integration to the new prefix and secret; both keys work
   meanwhile.
3. Check that **Last used** of the new key moves.
4. **Revoke key** on the old one.
