ALTER TABLE "ccos_contents" DROP CONSTRAINT "ccos_contents_ads_authorized_lifecycle";
ALTER TABLE "ccos_contents" DROP CONSTRAINT "ccos_contents_ad_authorization_expiry";
ALTER TABLE "ccos_contents" DROP CONSTRAINT "ccos_contents_ad_authorization_details";
ALTER TABLE "ccos_contents" DROP COLUMN "ad_authorization_expires_at";
ALTER TABLE "ccos_contents" DROP COLUMN "ad_authorization_created_at";
ALTER TABLE "ccos_contents" DROP COLUMN "ad_authorization_code";
ALTER TABLE "ccos_contents" DROP COLUMN "ad_authorization_status";
DROP TYPE "public"."ccos_ad_authorization_status";
