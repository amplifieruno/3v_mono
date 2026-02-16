-- Remove seed health metrics
DELETE FROM "itap"."device_health_metrics"
WHERE "device_id" IN (
  SELECT "id" FROM "itap"."devices"
  WHERE "name" IN (
    'Main Entrance Camera',
    'Lobby PTZ Camera',
    'Parking Sensor Array',
    'Server Room Camera',
    'Warehouse Camera'
  )
);

-- Remove seed devices
DELETE FROM "itap"."devices"
WHERE "name" IN (
  'Main Entrance Camera',
  'Lobby PTZ Camera',
  'Parking Sensor Array',
  'Server Room Camera',
  'Warehouse Camera'
);

-- Remove seed areas
DELETE FROM "itap"."areas"
WHERE "name" IN ('Main Entrance', 'Lobby', 'Parking Lot', 'Server Room', 'Warehouse')
  AND "facility_id" = (SELECT "id" FROM "itap"."facilities" WHERE "name" = 'ITAP HQ' LIMIT 1);

-- Remove seed facility
DELETE FROM "itap"."facilities" WHERE "name" = 'ITAP HQ';
