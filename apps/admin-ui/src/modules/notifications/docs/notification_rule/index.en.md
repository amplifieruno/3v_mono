# Notification rules

A **notification rule** decides who is told about which events, how and
when. **Notifications → Notification rules** lists them with their
**Priority**, **Delivery** (immediately or as a digest), whether they are
**Active**, their **Recipients** and when they last triggered.

## What a rule reacts to

1. **Event types** (tab of the same name): the kinds of events the rule
   looks at, such as *Blacklist match*, *Restricted area entry* or *Device
   offline*. A rule without event types reacts to nothing. Add and remove
   them on the tab.
2. **Conditions**: which of those events count. Each condition is "any" or
   one choice, and every condition set must hold:
   - **Facility**: only events in that facility.
   - **Area**: only events in that area or an area inside it. With a
     facility chosen, only its areas are offered; changing the facility
     clears an area outside it.
   - **Segment**: only events about a person or face that is a member of the
     segment when the event happens.
   - **Minimum severity**: only events at least that severe.

   With every condition on "any", each event of the rule's types counts. A
   condition naming a facility, area or segment that was deleted is flagged
   on its row: choose another or set it back to "any".

## Who is told, and how

- **Recipients**: a recipient group. Each member is notified on the rule's
  **Channels** (tab of the same name) they are listed with in the group; a
  member on vacation is replaced by their delegate, an inactive member gets
  nothing. Channels are in-app, email, SMS and push; webhooks are not a rule
  channel (they have subscriptions of their own).
- **Template**: the wording. The template's name picks, for each channel, the
  template of that name for the channel, in the recipient's language when
  there is one. Without a template a plain line is sent.
- **Priority**: critical notifications are delivered at once, even during a
  recipient's quiet hours; the others wait until the quiet hours end.
- **Delivery**: immediately, or gathered into an hourly or daily digest per
  recipient and channel. The in-app inbox always gets each match at once.
- **Escalation policy**: given to the incident an event opened when it has
  none yet, so the people of the policy are paged while nobody acknowledges
  it.

## Test rule

**Test rule** tries the rule against the organization's latest events (20,
50 or 100), as if it were active, and writes and sends nothing. It says how
many events would match and how many notifications would go to how many
recipients, then lists each event with the outcome:

- **Would notify**, with every recipient and channel;
- **Other event type**: the rule does not look at that kind of event;
- **Conditions not met**: the event is of a type the rule looks at, but a
  condition did not hold.

Change the rule and choose **Test again** to see the effect before switching
it on.

## Switching off and deleting

**Active** off stops a rule without losing anything; it can still be tested.
A rule that has notified people cannot be deleted (its deliveries name it):
switch it off instead. A rule that never matched can be deleted with its
event types and channels.
