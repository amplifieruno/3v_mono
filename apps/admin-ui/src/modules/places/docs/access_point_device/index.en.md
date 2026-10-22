# Bound devices

A **bound device** links one device of a facility (a camera, access terminal
or sensor) to one access point of the same facility, with the **role** it plays
there:

- **Camera**: watches the access point; its detections are placed at it, and a
  face-credential door decides access from them.
- **Access terminal**: decides and opens the passage, and receives the access
  policies of the organization.
- **Sensor**: reports the passage state, such as a door contact.

Bindings are listed, added and removed on the access point's **Devices** tab
and on the device's **Access points** tab; they have no page of their own. A device is bound at most once per access
point, and must belong to the access point's facility; the database refuses
anything else. Only the role of an existing binding can be changed; to bind
another device, add a new binding.
