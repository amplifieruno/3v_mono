DROP FUNCTION itap.dashboard_kpis(json);
DROP TABLE itap_results.dashboard_kpi_rows;
DROP FUNCTION itap.flow_matrix(json, uuid, timestamptz, timestamptz);
DROP TABLE itap_results.flow_matrix_rows;
DROP FUNCTION itap.occupancy_series(json, uuid, timestamptz, timestamptz, text);
DROP TABLE itap_results.occupancy_series_rows;
DROP FUNCTION itap.facility_occupancy_now(json, uuid);
DROP TABLE itap_results.facility_occupancy_rows;
