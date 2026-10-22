# Devices

A **device** is a camera, access terminal or sensor installed in a facility.
Cameras deliver the video the platform recognises people in; access terminals
decide and open passages; sensors report states such as a door contact. The
**Devices** list shows every device of the facility chosen in the sidebar, with
its type, status and health, and re-reads itself every 30 seconds (the pause
button in the toolbar stops that).

## Adding a device

**Create** first asks for the **type**: static, PTZ or thermal camera, access
terminal or sensor. The type decides which fields the device has and cannot be
changed afterwards (delete the device and add it again with the right type).

- **Facility** and **Area**: where the device is installed. The facility is
  fixed once the device exists; the area must belong to it. A camera's
  detections place people in its area (or at the access point it watches).
- **Manufacturer**, **Model**, **Firmware** and **IP address** (IPv4 or IPv6)
  are for maintenance.
- **Credentials**: the **User name** and **New password** the platform signs
  in to the device with. The password is **write-only**: it is stored but
  never shown or read back. The password box is always empty; leave it empty to
  keep the current password, type into it to set a new one. Saving any other
  change never touches the stored password.
- **Configuration**: free-form device settings as a JSON object (`{}` for
  none).
- **Custom attributes**: the organization's own device attributes
  (Organization → Custom attributes).

### Cameras

A camera also has its **Stream** settings:

- **Stream URL**: the address of the video stream, such as
  `rtsp://10.0.0.20/stream1`. Never put the user name and password into the
  address (`rtsp://user:pw@host/...`): the form and the database refuse it;
  enter them under Credentials instead. The last part of the address is the
  stream id the live view and the health check use.
- **Resolution** and **Frame rate** describe the stream.
- **Recognition rate**: frames per second analysed while recognition runs,
  from 1 to 5.
- **Recognition on** shows whether face recognition is running on the camera.
  It is not edited with the device: recognition is started and stopped on its
  own.

### Access terminals

A terminal receives the organization's access policies. Its **Access
policies** tab shows the policy version it last confirmed, when, and the error
of the last failed push. These are kept by the platform and not edited.

## Position and coverage

Edit the device and click on the floor plan of its area to place it under
**Position**; draw what it sees under **Coverage** (a polygon or a circle).
The plan is the one of its area, or of the nearest area that area lies inside
which has a plan. A device without an area is drawn on no plan. The floor plan
view then shows the device with its type's icon, ringed in its health colour
(green healthy, amber no frames, red offline, grey unknown), and its coverage
as a dashed outline.

## Areas and access points

- **Also covers** lists further areas the device sees besides its own. Add and
  remove them on the **Areas** tab; each must belong to the device's facility.
- **Access points** lists the doors, turnstiles and gates the device is bound
  to, with its role there. Bind it on the **Access points** tab or on the
  access point's **Devices** tab.

## Status and health

- **Status** is the device's state in service: active, under maintenance,
  error, inactive, or **connection error**, which the health check sets on an
  active camera it cannot reach (and sets back to active when it answers). Set
  a retired device **inactive** instead of deleting it: a device that
  detections, events or decisions refer to cannot be deleted.
- **Health** is the result of the last health check, every minute, for active
  cameras: **healthy**, **warning** (reachable, but no frame), **offline**
  (unreachable) or **unknown** (not checked yet; terminals and sensors are not
  checked). **Last seen** is when the check last reached it.

The saved views **Offline** (health offline) and **Cameras** (the three camera
types) are offered above the list.
