ALTER TABLE "ccos_products" ADD COLUMN "price_amount" numeric(20, 6);--> statement-breakpoint
ALTER TABLE "ccos_products" ADD COLUMN "currency" varchar(3);--> statement-breakpoint
ALTER TABLE "ccos_products" ADD COLUMN "commission_rate" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "ccos_products" ADD COLUMN "commission_amount" numeric(20, 6);--> statement-breakpoint
ALTER TABLE "ccos_products" ADD COLUMN "stock_state" varchar(64);