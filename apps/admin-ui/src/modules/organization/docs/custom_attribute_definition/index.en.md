# Custom attributes

**Custom attributes** in the Organization section adds the organization's own
fields to profiles, identities, facilities and devices, such as a badge number,
a parking spot or a shift. A record keeps the values in its custom fields under
each attribute's **key**, and the database checks them against the definitions
every time a record's custom fields are saved.

## Defining an attribute

- **Applies to**: profiles, identities, facilities or devices.
- **Key**: the name the value is stored under, such as `badge_number`:
  lowercase letters, digits and underscores, starting with a letter, at most 63
  characters, unique for its entity. Segment conditions and exports refer to it
  as `custom_fields.<key>`.
- **Label**: the name people see on forms and in segment conditions.
- **Data type**: what a value must be.
  - **Text**, **Number**, **Yes / no**.
  - **Date**: a real calendar date, written `YYYY-MM-DD`.
  - **Select**: one of the attribute's **options**. Options appear only for this
    type and at least one is required. A stored value must match an option
    exactly, so options are distinct and not empty.
- **Required**: a record cannot save custom fields that leave the attribute
  empty.
- **Sort order**: attributes are listed lowest number first.

**Applies to** and **Key** cannot change after the attribute is created: create
a new attribute instead and stop using the old one.

## Changing an attribute

The database checks a record's custom fields only when they are written. A
change to a definition (a new required attribute, another data type, removed
options) does not touch values already stored; the next save of such a record's
custom fields must satisfy the new definition. Changing a select attribute to
another data type keeps its options stored but no longer uses them.

## Active, inactive and deleting

An **inactive** attribute is no longer offered or checked, and values already
stored under its key are kept and still accepted. Set an attribute inactive
rather than deleting it: once it is deleted, a record that still has a value
under its key cannot save its custom fields until that value is removed.

## Segments

Active profile attributes appear in segment conditions under their label:
segments can test them for equal, not equal, one of, none of and empty; a select
attribute offers its options as the values.

## Reserved rules

**Validation rules** and **Visible when** take a JSON object each. They are
stored for later use and not applied yet; leave them empty.
