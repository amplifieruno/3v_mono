# Device health

The **health check** probes every active camera once a minute through the
stream server and stores one **health sample** per camera and check. Access
terminals and sensors report their own load (CPU, memory, disk) when they
send a heartbeat. Samples are written by the platform only: they cannot be
added, changed or deleted here.

Each sample holds:

- **Checked at**: when the check ran.
- **Latency (ms)**: how long the device took to answer. Empty when it did not
  answer at all (the device was offline).
- **Errors**: 0 for a healthy check, 1 when the device was unreachable or
  answered without delivering a frame.
- **CPU %**, **Memory %**, **Disk %**: the device's load, for devices that
  report it. Cameras do not.
- **Frame rate**: frames per second measured on the stream, when measured.

## The health chart

A device's **Health** tab shows its last 24 hours as small charts, one per
measure the device reports, each on its own scale starting at 0. Every point
is the average of a 15-minute period; a gap in the line is a period without a
sample. Red marks under a chart are periods with at least one failed check.
Hover a period to read its time and value. The samples themselves are listed
below the chart, newest first.

## The Device health list

**Device health** in the sidebar lists the samples of every device, newest
first, 50 per page; filter by device, time or errors. The list does not count
its rows on every page (there are many): ask for the count in the footer when
you need it.
