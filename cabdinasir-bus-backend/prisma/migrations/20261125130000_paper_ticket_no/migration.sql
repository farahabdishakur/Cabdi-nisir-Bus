-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "paperTicketNo" TEXT;


-- Tigidh warqad ah hal mar oo keliya laan kasta (xataa haddii la void-gareeyo — warqaddaas waa la gubay)
CREATE UNIQUE INDEX "bookings_paper_ticket_branch" ON "bookings"("branchId", "paperTicketNo") WHERE "paperTicketNo" IS NOT NULL;
