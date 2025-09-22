import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1758534503102 implements MigrationInterface {
    name = 'InitialSchema1758534503102'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."identities_status_enum" AS ENUM('verified', 'unverified', 'archived')`);
        await queryRunner.query(`CREATE TABLE "identities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "embeddings" jsonb, "attributes" jsonb, "photos" text array NOT NULL DEFAULT '{}', "confidence" numeric(3,2) NOT NULL DEFAULT '0.8', "status" "public"."identities_status_enum" NOT NULL DEFAULT 'unverified', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "firstSeen" TIMESTAMP, "lastSeen" TIMESTAMP, "detectionCount" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_7b2f8cccf4ac6a2d7e6e9e8b1f6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."profiles_accesslevel_enum" AS ENUM('basic', 'standard', 'elevated', 'admin')`);
        await queryRunner.query(`CREATE TYPE "public"."profiles_status_enum" AS ENUM('active', 'inactive', 'suspended', 'terminated')`);
        await queryRunner.query(`CREATE TABLE "profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "identityId" uuid NOT NULL, "firstName" character varying NOT NULL, "lastName" character varying NOT NULL, "email" character varying, "phone" character varying, "employeeId" character varying, "department" character varying, "role" character varying, "accessLevel" "public"."profiles_accesslevel_enum" NOT NULL DEFAULT 'standard', "startDate" date, "endDate" date, "status" "public"."profiles_status_enum" NOT NULL DEFAULT 'active', "customFields" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "REL_b286219bb094719ebb68ca8b6c" UNIQUE ("identityId"), CONSTRAINT "PK_8e520eb4da7dc01d0e190447c8e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."facilities_status_enum" AS ENUM('active', 'inactive', 'maintenance')`);
        await queryRunner.query(`CREATE TABLE "facilities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" text, "address" character varying, "latitude" numeric(10,7), "longitude" numeric(10,7), "timezone" character varying NOT NULL DEFAULT 'UTC', "createdBy" uuid NOT NULL, "status" "public"."facilities_status_enum" NOT NULL DEFAULT 'active', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_2e6c685b2e1195e6d6394a22bc7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."areas_areatype_enum" AS ENUM('building', 'floor', 'room', 'zone', 'sector')`);
        await queryRunner.query(`CREATE TYPE "public"."areas_accesslevel_enum" AS ENUM('public', 'restricted', 'secure', 'classified')`);
        await queryRunner.query(`CREATE TYPE "public"."areas_status_enum" AS ENUM('active', 'inactive', 'maintenance')`);
        await queryRunner.query(`CREATE TABLE "areas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "facilityId" uuid NOT NULL, "parentId" uuid, "name" character varying NOT NULL, "description" text, "areaType" "public"."areas_areatype_enum" NOT NULL DEFAULT 'room', "coordinates" jsonb, "accessLevel" "public"."areas_accesslevel_enum" NOT NULL DEFAULT 'public', "status" "public"."areas_status_enum" NOT NULL DEFAULT 'active', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5110493f6342f34c978c084d0d6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."devices_devicetype_enum" AS ENUM('static_video_camera', 'ptz_camera', 'sensor')`);
        await queryRunner.query(`CREATE TYPE "public"."devices_status_enum" AS ENUM('active', 'inactive', 'error', 'maintenance')`);
        await queryRunner.query(`CREATE TYPE "public"."devices_healthstatus_enum" AS ENUM('healthy', 'warning', 'critical', 'unknown')`);
        await queryRunner.query(`CREATE TABLE "devices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "deviceType" "public"."devices_devicetype_enum" NOT NULL DEFAULT 'static_video_camera', "areaId" uuid NOT NULL, "streamUrl" character varying, "credentials" jsonb, "resolution" character varying, "fps" integer, "status" "public"."devices_status_enum" NOT NULL DEFAULT 'active', "healthStatus" "public"."devices_healthstatus_enum" NOT NULL DEFAULT 'unknown', "lastSeen" TIMESTAMP, "configuration" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b1514758245c12daf43486dd1f0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."segments_status_enum" AS ENUM('active', 'inactive', 'archived')`);
        await queryRunner.query(`CREATE TABLE "segments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" text, "conditions" jsonb NOT NULL, "isDynamic" boolean NOT NULL DEFAULT true, "memberCount" integer NOT NULL DEFAULT '0', "createdBy" uuid NOT NULL, "lastEvaluated" TIMESTAMP, "status" "public"."segments_status_enum" NOT NULL DEFAULT 'active', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_beff1eec19679fe8ad4f291f04e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."tracking_sessions_status_enum" AS ENUM('active', 'completed', 'lost', 'error')`);
        await queryRunner.query(`CREATE TABLE "tracking_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "identityId" uuid NOT NULL, "facilityId" uuid NOT NULL, "startTime" TIMESTAMP NOT NULL DEFAULT now(), "endTime" TIMESTAMP, "duration" integer, "path" jsonb, "status" "public"."tracking_sessions_status_enum" NOT NULL DEFAULT 'active', CONSTRAINT "PK_e05480a9ee8114dfd102272b8fe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."identity_locations_movementtype_enum" AS ENUM('entry', 'exit', 'movement', 'stationary')`);
        await queryRunner.query(`CREATE TABLE "identity_locations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "identityId" uuid NOT NULL, "areaId" uuid NOT NULL, "deviceId" uuid NOT NULL, "latitude" numeric(10,7), "longitude" numeric(10,7), "confidence" numeric(3,2) NOT NULL, "movementType" "public"."identity_locations_movementtype_enum" NOT NULL DEFAULT 'movement', "sessionId" uuid, "timestamp" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0295b82e5caece21425b1319ba3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'operator', 'viewer')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "passwordHash" character varying NOT NULL, "firstName" character varying NOT NULL, "lastName" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'viewer', "isActive" boolean NOT NULL DEFAULT true, "lastLoginAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "profiles" ADD CONSTRAINT "FK_b286219bb094719ebb68ca8b6cd" FOREIGN KEY ("identityId") REFERENCES "identities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "areas" ADD CONSTRAINT "FK_691e9b4b5435b8a5f4403b774c5" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "areas" ADD CONSTRAINT "FK_9bf50a18e0290c26f42fadecc2a" FOREIGN KEY ("parentId") REFERENCES "areas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "devices" ADD CONSTRAINT "FK_911d95ba4b8753be7117fd69932" FOREIGN KEY ("areaId") REFERENCES "areas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "identity_locations" ADD CONSTRAINT "FK_c82ab6312b5585cba2b50a1c968" FOREIGN KEY ("sessionId") REFERENCES "tracking_sessions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "identity_locations" DROP CONSTRAINT "FK_c82ab6312b5585cba2b50a1c968"`);
        await queryRunner.query(`ALTER TABLE "devices" DROP CONSTRAINT "FK_911d95ba4b8753be7117fd69932"`);
        await queryRunner.query(`ALTER TABLE "areas" DROP CONSTRAINT "FK_9bf50a18e0290c26f42fadecc2a"`);
        await queryRunner.query(`ALTER TABLE "areas" DROP CONSTRAINT "FK_691e9b4b5435b8a5f4403b774c5"`);
        await queryRunner.query(`ALTER TABLE "profiles" DROP CONSTRAINT "FK_b286219bb094719ebb68ca8b6cd"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP TABLE "identity_locations"`);
        await queryRunner.query(`DROP TYPE "public"."identity_locations_movementtype_enum"`);
        await queryRunner.query(`DROP TABLE "tracking_sessions"`);
        await queryRunner.query(`DROP TYPE "public"."tracking_sessions_status_enum"`);
        await queryRunner.query(`DROP TABLE "segments"`);
        await queryRunner.query(`DROP TYPE "public"."segments_status_enum"`);
        await queryRunner.query(`DROP TABLE "devices"`);
        await queryRunner.query(`DROP TYPE "public"."devices_healthstatus_enum"`);
        await queryRunner.query(`DROP TYPE "public"."devices_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."devices_devicetype_enum"`);
        await queryRunner.query(`DROP TABLE "areas"`);
        await queryRunner.query(`DROP TYPE "public"."areas_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."areas_accesslevel_enum"`);
        await queryRunner.query(`DROP TYPE "public"."areas_areatype_enum"`);
        await queryRunner.query(`DROP TABLE "facilities"`);
        await queryRunner.query(`DROP TYPE "public"."facilities_status_enum"`);
        await queryRunner.query(`DROP TABLE "profiles"`);
        await queryRunner.query(`DROP TYPE "public"."profiles_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."profiles_accesslevel_enum"`);
        await queryRunner.query(`DROP TABLE "identities"`);
        await queryRunner.query(`DROP TYPE "public"."identities_status_enum"`);
    }

}
