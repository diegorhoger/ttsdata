DO $$ BEGIN
 CREATE TYPE "public"."ccos_ad_authorization_status" AS ENUM('pending', 'authorized', 'unavailable');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "ccos_contents" ADD COLUMN "ad_authorization_status" "ccos_ad_authorization_status";--> statement-breakpoint
ALTER TABLE "ccos_contents" ADD COLUMN "ad_authorization_code" varchar(255);--> statement-breakpoint
ALTER TABLE "ccos_contents" ADD COLUMN "ad_authorization_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ccos_contents" ADD COLUMN "ad_authorization_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ccos_contents" ADD CONSTRAINT "ccos_contents_ad_authorization_details" CHECK (
  ("ad_authorization_status" = 'authorized' AND "ad_authorization_code" IS NOT NULL AND "ad_authorization_created_at" IS NOT NULL)
  OR ("ad_authorization_status" IN ('pending', 'unavailable') AND "ad_authorization_code" IS NULL
      AND "ad_authorization_created_at" IS NULL AND "ad_authorization_expires_at" IS NULL)
  OR ("ad_authorization_status" IS NULL AND "ad_authorization_code" IS NULL
      AND "ad_authorization_created_at" IS NULL AND "ad_authorization_expires_at" IS NULL)
);--> statement-breakpoint
ALTER TABLE "ccos_contents" ADD CONSTRAINT "ccos_contents_ad_authorization_expiry" CHECK (
  "ad_authorization_expires_at" IS NULL OR "ad_authorization_expires_at" >= "ad_authorization_created_at"
);
