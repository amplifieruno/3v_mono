# Watch lists

**Monitoring → Watch lists** holds the named lists of people the cameras
look out for. Each list has a **Kind**:

- **Watch**: someone to keep an eye on. A camera seeing them raises a
  *watch-list match* event.
- **Blacklist**: someone not allowed on the premises. A sighting raises a
  *blacklist match* event, and the person's profile shows **Blacklisted**.
- **VIP**: someone to welcome. Their arrival raises a *VIP arrival* event.

The **Severity** is the severity of those events; event rules of the
watch-list type and notification rules can react to it. The **Colour**
(`#rrggbb`) marks the list on screens. The name is unique in the
organization. Deleting a list deletes its entries.

## Who is on a list

An entry names exactly one subject:

- a **person** (profile): every identity linked to the profile counts, also
  identities linked later. Add one on the list's **People** tab, or on the
  profile's **Watch lists** tab.
- an **identity** (one tracked face): for someone without a profile, such as
  an unknown person seen on a camera. Add one on the list's **Identities**
  tab, or on the identity's **Watch lists** tab.

Each form asks only for its own subject, so an entry never names both or
neither. A person or an identity is on a list at most once.

An entry has a **Reason**, shown to the operator with the event, and an
optional **Expires** time. While the entry has no expiry, or its expiry is
still ahead, it is **Active** and counts; once expired it stays on the list
as history (and no longer marks a person blacklisted) until you delete it.
Only the reason and the expiry of an entry can change: to move someone to
another list, add a new entry and delete the old one. **Added by** is the
member who added the entry.

**Monitoring → Watch-list entries** lists the entries of every list, with
the views **Active** and **Expired**; open an entry there to change or
delete it.
