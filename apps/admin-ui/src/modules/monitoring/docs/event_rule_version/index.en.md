# Rule versions

A **rule version** is one state of an event rule's behaviour: its
**Parameters** (by rule type), **Severity**, whether it **Opens an
incident**, and its **Scope**. Its **Status** is **Draft** while edited,
**Published** while in force (one per rule) and **Superseded** once a later
version was published.

Only a draft (or a version pending approval) can be edited, discarded or have
its scope changed; **Publish** puts it in force. A superseded version offers
**Roll back to this version**. The **Events** tab lists the events the
version matched.

See *Event rules* for the whole cycle.
