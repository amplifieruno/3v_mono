# Work schedules

A **work schedule** is the weekly hours people are expected on site, in one
time zone: office days, a night shift, a round-the-clock security roster.
Each person's profile can name one schedule.

## Windows

A schedule is a list of windows. Each window has its days of the week and a
start and end time, written `HH:MM`:

- `Mon–Fri 08:00–18:00` is a normal office day.
- A window whose end is **before** its start ends the next day:
  `22:00–06:00` on Monday runs from Monday 22:00 to Tuesday 06:00. The list
  shows it as *overnight*.
- `00:00–24:00` is the whole day; `24:00` is allowed only as an end.
- A window needs at least one day, and its start and end cannot be the same.
  The form refuses such a window before saving.

A schedule without windows means never on shift.

## Time zone

The windows are read in the schedule's **time zone** (an IANA zone such as
`Europe/Moscow`), daylight saving included. The list of zones shows each
zone's current offset from UTC. A stored zone the browser does not know is
shown as *Unknown time zone* and must be replaced before the schedule can be
saved.

## Who reads it

- **Segments** can select people who are on shift at the time of an event
  (exactly inside a window, no grace).
- **After-hours events** (at facilities with operating hours) do not fire for
  people with an active profile inside their schedule, with half an hour of
  grace on either side.
- **Attendance reports** compare presence with the schedule.
- **Face authentication**: a client application can narrow the people it
  matches to those on shift (active profiles, the same half hour of grace).
