# Webhooks

A **webhook** sends events to another system (a SIEM, a building
management system) over HTTP. For each event of one of its **event types**
the platform POSTs the event as JSON to the **URL** and keeps a
**webhook delivery** in the log. A webhook without event types is sent
nothing; add them on its **Event types** tab.

## The signed request

Each call carries the headers `x-itap-event` (the event type),
`x-itap-delivery` (the delivery's id) and `x-itap-signature`:
`sha256=` followed by the HMAC-SHA256 of the body with the webhook's
**signing secret**. The receiver computes the same value to know the call
is genuine. The secret is 16 to 256 characters, stored but never shown; on
a saved webhook leave the box empty to keep it, or type a new one to replace
it.

## Which addresses are allowed

- The database refuses an address that is not `http://` or `https://`, one
  with a user name or password, and link-local or cloud metadata addresses
  (169.254.x.x, fe80::, 0.0.0.0). The form says so before saving.
- **Loopback and private network addresses** (localhost, 127.x, 10.x,
  172.16–31.x, 192.168.x, fc00::/7) can be saved, and the form warns. The
  sender checks the address again before every attempt, after resolving the
  host name: outside development (where `WEBHOOK_ALLOW_PRIVATE_TARGETS` is
  off) it refuses them, and the delivery **fails** with
  `blocked_address: <ip>` without retries. A host name that resolves to a
  private address is only found out at that point, so look at the
  deliveries after saving.

## Deliveries

A delivery is **Pending** until its first attempt and **Sent** once the
receiver answers with a 2xx status. An error status or a timeout makes it
**Retrying**, with a growing pause, up to five attempts; then it is a
**Dead letter**. A blocked address or a switched-off webhook makes it
**Failed** at once. Each delivery shows the **Request** (the JSON body and
its signature) and the **Response** (the status code, attempts and error).
The webhook's **Last delivery** columns show how its latest attempt ended;
the **Failing** view lists webhooks whose last delivery did not go through.

Switching a webhook off keeps its log; deleting it deletes its deliveries
too. Webhook deliveries are not in the notification delivery log; the
delivery report counts them on its webhook row.
