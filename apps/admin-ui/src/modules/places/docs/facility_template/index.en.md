# Facility templates

A **facility template** is a reusable tree of areas, such as a standard office
floor (lobby, open office with focus booths, meeting rooms, kitchen). Applying
it to a facility creates all of its areas in one step, which speeds up setting
up similar sites.

## The structure

The structure is written as a JSON list of areas. Each area has:

- `name` (required, at most 200 characters),
- `area_type` (required): `building`, `floor`, `zone`, `room`, `sector`,
  `entrance`, `corridor`, `parking` or `virtual_zone`,
- `access_level` (optional, *public* when left out): `public`, `restricted`,
  `secure` or `classified`,
- `capacity` (optional): a whole number of at least 0,
- `children` (optional): the areas inside it, written the same way.

No other keys are allowed; a template has at most 6 levels and 200 areas. For
example:

```json
[
  { "name": "Elevator Lobby", "area_type": "corridor", "capacity": 30 },
  {
    "name": "Open Office",
    "area_type": "zone",
    "access_level": "restricted",
    "children": [{ "name": "Focus Booths", "area_type": "room", "capacity": 8 }]
  }
]
```

The form checks the structure as the database does and names the first area
in error by its position (*Area 2.1* is the first area inside the second). The
template page shows the structure as a tree with how many areas it creates.

## Applying a template

Templates are applied from the facility page (**Apply template**), at the
facility's top level or inside one of its areas. Every area is created, even
where an area of the same name already exists, so applying a template twice
doubles it; the form warns about names already there before you apply. Shapes
are not part of a template: draw them on the floor plan afterwards.

Template names are unique within the organization.
