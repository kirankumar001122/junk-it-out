-- Allow customers to submit a support ticket without an additional message.
ALTER TABLE "Complaint"
ALTER COLUMN "description" DROP NOT NULL;
