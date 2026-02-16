-- Seed demo data: facility, areas, devices, and health metrics
-- This migration is self-contained with prerequisite data

-- Insert demo facility (skip if exists)
INSERT INTO "itap"."facilities" ("name", "description", "address", "timezone", "status")
SELECT 'ITAP HQ', 'Main demonstration facility', '123 Demo Street, Tech City', 'UTC', 'active'
WHERE NOT EXISTS (SELECT 1 FROM "itap"."facilities" WHERE "name" = 'ITAP HQ');

-- Insert demo areas (skip if exists)
INSERT INTO "itap"."areas" ("facility_id", "name", "description", "area_type", "access_level", "status")
SELECT f."id", a."name", a."description", a."area_type", a."access_level", 'active'
FROM "itap"."facilities" f
CROSS JOIN (VALUES
  ('Main Entrance', 'Primary building entrance', 'entrance', 'public'),
  ('Lobby', 'Main lobby area', 'zone', 'public'),
  ('Parking Lot', 'Outdoor parking area', 'zone', 'public'),
  ('Server Room', 'IT infrastructure room', 'zone', 'restricted'),
  ('Warehouse', 'Storage warehouse', 'zone', 'restricted')
) AS a("name", "description", "area_type", "access_level")
WHERE f."name" = 'ITAP HQ'
  AND NOT EXISTS (
    SELECT 1 FROM "itap"."areas" ar
    WHERE ar."name" = a."name" AND ar."facility_id" = f."id"
  );

-- Insert demo devices
INSERT INTO "itap"."devices" ("name", "device_type", "area_id", "stream_url", "resolution", "fps", "status", "health_status", "last_seen", "configuration")
VALUES
  (
    'Main Entrance Camera',
    'static_video_camera',
    (SELECT "id" FROM "itap"."areas" WHERE "name" = 'Main Entrance' LIMIT 1),
    'rtsp://mediamtx:8554/entrance',
    '1920x1080',
    30,
    'active',
    'healthy',
    now() - interval '2 minutes',
    '{"motion_detection": true, "night_vision": "auto"}'::jsonb
  ),
  (
    'Lobby PTZ Camera',
    'ptz_camera',
    (SELECT "id" FROM "itap"."areas" WHERE "name" = 'Lobby' LIMIT 1),
    'rtsp://mediamtx:8554/lobby',
    '2560x1440',
    25,
    'active',
    'healthy',
    now() - interval '1 minute',
    '{"pan_range": 360, "tilt_range": 90, "zoom_levels": 20, "auto_tracking": true}'::jsonb
  ),
  (
    'Parking Sensor Array',
    'sensor',
    (SELECT "id" FROM "itap"."areas" WHERE "name" = 'Parking Lot' LIMIT 1),
    NULL,
    NULL,
    NULL,
    'active',
    'warning',
    now() - interval '15 minutes',
    '{"sensor_type": "occupancy", "capacity": 200}'::jsonb
  ),
  (
    'Server Room Camera',
    'static_video_camera',
    (SELECT "id" FROM "itap"."areas" WHERE "name" = 'Server Room' LIMIT 1),
    'rtsp://mediamtx:8554/serverroom',
    '1920x1080',
    15,
    'active',
    'healthy',
    now() - interval '30 seconds',
    '{"motion_detection": true, "tamper_detection": true}'::jsonb
  ),
  (
    'Warehouse Camera',
    'static_video_camera',
    (SELECT "id" FROM "itap"."areas" WHERE "name" = 'Warehouse' LIMIT 1),
    'rtsp://mediamtx:8554/warehouse',
    '1280x720',
    15,
    'inactive',
    'unknown',
    NULL,
    '{"motion_detection": false}'::jsonb
  );

-- Insert sample health metrics for active devices (10 data points each, spread over last 10 minutes)
INSERT INTO "itap"."device_health_metrics" ("device_id", "timestamp", "cpu_usage", "memory_usage", "disk_usage", "network_latency", "frame_rate", "error_count")
SELECT
  d."id",
  now() - (n || ' minutes')::interval,
  20 + random() * 40,
  30 + random() * 30,
  40 + random() * 20,
  5 + random() * 45,
  d."fps" - floor(random() * 5),
  CASE WHEN random() > 0.8 THEN floor(random() * 3)::integer ELSE 0 END
FROM "itap"."devices" d
CROSS JOIN generate_series(0, 9) AS n
WHERE d."status" = 'active' AND d."device_type" != 'sensor';
