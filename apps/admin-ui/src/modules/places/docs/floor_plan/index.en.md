# Floor plans and area shapes

A **floor plan** is the drawing of one area of a facility, usually a floor
(a parking level or a lobby can have one too), with its size in pixels. The
shapes of the areas inside that area, and the positions of access points and
devices, are drawn in the plan's pixels.

## Adding a plan

Under **Floor plans**, choose the facility and the **Area** the plan shows
(one plan per area), give it a name and, if useful, the building **Level**
(0 = ground floor, negative = underground). **Upload** the image (PNG, JPEG,
SVG or WebP, up to 20 MB); it is stored in the organization's files. When
**Width** and **Height** are empty they are taken from the image. If you
replace the image with one of another size, the form offers to take over the
new size; shapes already drawn keep their pixel coordinates, so redraw them
if the drawing moved. **Scale** says how many metres one pixel covers
(0.05 = 5 cm per pixel).

Deleting an area deletes its floor plan; the image file is kept.

## Which plan an area is drawn on

An area that has a plan of its own is drawn on that plan (a floor's own
outline). Any other area is drawn on the plan of the **nearest area it lies
inside** that has one: a room inside a wing inside a floor uses the floor's
plan. An area that lies on no plan cannot be drawn yet; the form says so.

## Drawing a shape

Edit the area and use the **Shape** field:

- **Polygon**: click on the plan to add the outline points in order. *Remove
  last point* undoes the last click. A shape needs at least **3 different
  points**.
- **Circle**: click to place the centre, click again to set the radius.
- Drag a point (or the centre) to move it. *Clear shape* removes the shape.

Drawing needs a mouse, pen or touch: points cannot yet be typed in or moved
with the keyboard (the tool buttons and *Clear shape* can be used with the
keyboard).

Every point, and the whole of a circle, must lie **on the plan image**; the
form refuses a shape that reaches outside it, or a polygon with fewer than 3
points, before saving. The other
shapes on the plan are shown faintly to help you place the new one. On the
area page the shape shows as a small preview.

## The floor plan view

The plan's page (and the **Floor plan** tab of the area that carries it)
shows the image with every shaped area on it, coloured by access level
(green public, amber restricted, orange secure, red classified), labelled with
its name and how many people are inside against its capacity. An area over
capacity is outlined in red. The list under the plan links to each area.

Access points with a position are drawn as an icon of their kind (door,
turnstile, gate, elevator, reception desk) on the plan of the area they lead
into; hover one to see its name.
