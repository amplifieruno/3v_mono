# Analytics

The **Analytics** page shows how the facilities are used: how many people come,
when they are there, where they go, and how the platform around them is doing.
Choose a facility in the sidebar first; the charts are of that facility. The key
figures, the segment trends and the notification deliveries are of the whole
organization, and the incidents and device health of every facility when the
sidebar shows all facilities.

## Where the figures come from

Nothing on the page is counted from raw camera detections. Every hour the
platform **aggregates** the tracking history (visits, and the areas each person
was seen in) into three tables, which are also lists of their own under
Analytics:

- **Daily figures**: one row per facility and day: people present (known and
  unknown), visits and how long they lasted, guest visits, and the peak with
  the hour it was reached.
- **Hourly figures**: one row per hour and area, plus one for the facility as a
  whole: people present, entries, exits, time spent and the peak. Only hours
  with someone present have a row.
- **Moves between areas**: how many times people went from one area straight to
  another, per day.

A day still in progress counts everything recorded so far, so today's figures
grow during the day. People are counted once even when their faces were merged
from several identities.

## Days and hours are the facility's

A facility's **days run from midnight to midnight in its own time zone** (set
on the facility). "Last 7 days" is the facility's last seven calendar days,
today included, cut at the facility's midnight, not yours; the hours of the busy
hours chart and of the hourly occupancy are the facility's clock hours. Each
chart says which time zone it uses. The lists of hourly figures show each hour
in your own time zone.

## The page

- **Key figures**: visitors today, people on site now, open incidents (and how
  many are critical), devices offline and notifications that failed in the last
  24 hours; the open incidents by severity and the segments whose size changed
  most since yesterday. These are computed when the page is read.
- **The period tabs** (last 7 days, last 24 hours, last 30 days; the open tab is
  kept in the address):
  - **Occupancy over time**: the distinct people present per hour (periods of up
    to 7 days) or per day, and the entries and exits as columns above and below
    a line. The peak of the period is written above.
  - **Busy hours**: for each area, the average number of people present in each
    hour of the facility's day over the period; darker is busier.
  - **Movement between areas**: a matrix of the moves from the area of each row
    to the area of each column, for the busiest areas, and the most frequent
    moves.
  - **Segment trends**: the member count per day of the largest segments.
  - **Notification deliveries**: what was sent, delivered, failed or given up,
    per channel. The full table is on the **Delivery report** page.
- **Open incidents**: the newest incidents not yet resolved or closed; each
  opens the incident.
- **Device health**: the devices in service by health at their last check, and
  the ones needing attention (offline first).

Every chart on this page can also be placed on a **dashboard** as a widget.

## Good to know

- An empty chart usually means nobody was tracked in that facility over the
  period, or the hourly aggregation has not run since: figures appear within the
  hour.
- Removing an area removes its figures; the facility's totals stay.
- A person's own movements are on the identity's **Timeline** tab.
