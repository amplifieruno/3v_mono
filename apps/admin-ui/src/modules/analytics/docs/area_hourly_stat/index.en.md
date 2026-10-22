# Hourly figures

An **hourly figure** is one hour of one area, or of a whole facility when
**Area** is empty, computed every hour from the tracking history.

- **People**: distinct people present at some point of the hour.
- **Entries** and **Exits**: how many times someone came in or left during the
  hour. A visit still in progress has no exit yet.
- **Presence** and **Average presence**: the seconds people spent there within
  the hour, in total and per person.
- **Peak**: the most people there at the same instant.

An area's figures count the people located in that area itself; people in its
sub-areas are counted in their own rows. The facility row counts everyone on
site, whether placed in an area or not.

Hours are whole UTC hours. The list shows them in your own time zone; the
Analytics page charts them by the facility's clock. Only hours with someone
present have a row, so a quiet night simply has none.
