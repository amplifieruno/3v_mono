DROP TRIGGER identities_sync_centroid ON itap.identities;
DROP FUNCTION itap.identities_sync_centroid();
DROP TRIGGER identity_embeddings_sync_centroid ON itap.identity_embeddings;
DROP FUNCTION itap.identity_embeddings_sync_centroid();
DROP FUNCTION itap.refresh_identity_centroid(uuid);
DROP TABLE itap.identity_centroids;
