import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddVectorEmbedding1700000000002 implements MigrationInterface {
  name = 'AddVectorEmbedding1700000000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure pgvector extension is installed
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector;`)

    // Add embedding column for vector similarity search
    await queryRunner.query(`
      ALTER TABLE "identities"
      ADD COLUMN IF NOT EXISTS "embedding" vector(512)
    `)

    // Migrate existing embeddings to vector column (average multiple embeddings)
    await queryRunner.query(`
      UPDATE "identities"
      SET "embedding" = subquery.avg_embedding::vector(512)
      FROM (
        SELECT
          id,
          ARRAY(
            SELECT AVG(elem)
            FROM generate_series(0, 511) AS i,
            LATERAL (
              SELECT AVG((embeddings->j->>i)::float) AS elem
              FROM generate_series(0, jsonb_array_length(embeddings) - 1) AS j
            ) AS avg_vals
          ) AS avg_embedding
        FROM "identities"
        WHERE embeddings IS NOT NULL
          AND jsonb_array_length(embeddings) > 0
      ) AS subquery
      WHERE "identities".id = subquery.id
    `)

    // Create index for fast cosine similarity search
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_identities_embedding_cosine"
      ON "identities"
      USING ivfflat ("embedding" vector_cosine_ops)
      WITH (lists = 100)
      WHERE "embedding" IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_identities_embedding_cosine"`)

    // Drop embedding column
    await queryRunner.query(`ALTER TABLE "identities" DROP COLUMN IF EXISTS "embedding"`)
  }
}