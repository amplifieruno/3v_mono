# Identity merges

**People → Identity merges** lists every merge of identities, newest first:
when it ran, the **Kept identity**, its **Status** (**Completed** or **Rolled
back**), the **Reason**, who merged and when it was rolled back. The
**Completed** saved view shows the merges that stand.

A merge's page shows the kept identity, the profile it took over (when it had
none) and whether it became its profile's primary identity, and lists the
**Merged identities** with the status and profile link each had before.

Merges are made from an identity (**Merge into this identity**) or from a
pair in **Identity duplicates**; this page never creates or deletes one.

## Rolling back

**Roll back** undoes a completed merge exactly. The dialog says what comes
back before anything is sent:

- each merged identity gets back its status and profile link (and is primary
  again unless another identity of the profile became primary since);
- the photos, face templates, watch-list entries and segment memberships each
  one brought go back to it; the kept identity keeps its own and those added
  after the merge;
- the kept identity gives up the profile it took over in the merge;
- the duplicate pairs the merge closed reopen;
- verification requests the merge cancelled stay cancelled.

After a review step and a confirmation the rollback runs. The platform
refuses, saying why and changing nothing, when:

- the kept identity was itself merged into another one later: merges are
  undone newest first, so roll back that later merge first;
- photos or templates the merge moved have left the kept identity since (for
  example by a split): the merge can no longer be undone exactly;
- the merge was already rolled back.
