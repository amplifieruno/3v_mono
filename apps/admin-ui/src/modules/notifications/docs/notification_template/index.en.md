# Notification templates

A **notification template** is the wording of a notification for one
**Channel** (in-app, email, SMS, push) and one **Language**. Templates of the
same **Name** form a family: a notification rule chooses one template, and
each channel then uses the template of that name for its channel, in the
recipient's language when there is one, else in the chosen template's
language, else in any.

## Subject and body

The **Subject** is the email subject and the title of in-app and push
notifications; an email template needs one. The **Body** is the text.

Both take placeholders in double curly braces, replaced when the
notification is written:

| Placeholder | Filled with |
| --- | --- |
| `event_title`, `event_type`, `severity` | the event's title, type and severity |
| `facility`, `area`, `device` | where it happened and the camera or device |
| `profile_name`, `identity_code` | the person and the face identity |
| `incident_code` | the incident the event opened or joined |
| `occurred_at` | when it happened, in the organization's time zone |
| `rule_name`, `priority` | the notification rule and its priority |
| `incident_title`, `step`, `cycle`, `policy` | escalation pages only |

For example `[{{severity}}] {{event_title}} at {{facility}}`. Write names in
lowercase letters, digits, `_` and `.`; an unknown name is left empty.

## System templates

**System templates** come with the platform: the escalation pages
(`incident_escalation`) and the generic wording (`generic`). They are read
only; to change their wording, create a template of your own and choose it
on the rule.

A template's **Rules that chose it** tab lists the rules that name it.
