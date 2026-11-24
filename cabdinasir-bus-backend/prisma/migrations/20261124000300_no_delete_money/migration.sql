-- Kharashka, deposits-ka iyo codsiyada void lama tirtiro
CREATE TRIGGER expenses_no_delete BEFORE DELETE ON "expenses" FOR EACH ROW EXECUTE FUNCTION prevent_delete();
CREATE TRIGGER deposits_no_delete BEFORE DELETE ON "deposits" FOR EACH ROW EXECUTE FUNCTION prevent_delete();
CREATE TRIGGER void_requests_no_delete BEFORE DELETE ON "void_requests" FOR EACH ROW EXECUTE FUNCTION prevent_delete();
-- Hal codsi void oo sugaya hal shay kasta
CREATE UNIQUE INDEX "void_requests_one_pending" ON "void_requests" ("entity", "entityId") WHERE "status" = 'PENDING';
