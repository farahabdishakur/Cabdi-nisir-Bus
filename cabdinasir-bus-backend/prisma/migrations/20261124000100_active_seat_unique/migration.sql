-- Hal kursi = hal booking firfircoon (BUSINESS_RULES §3). Database-ka ayaa damaanad qaada.
CREATE UNIQUE INDEX "bookings_active_seat" ON "bookings" ("tripId", "seatNo") WHERE "status" <> 'VOIDED';

-- Lacag / tigidh / alaab lama tirtiro (CLAUDE.md §3.4)
CREATE OR REPLACE FUNCTION prevent_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Delete lama oggola table-kan (%): isticmaal VOID', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_no_delete BEFORE DELETE ON "payments" FOR EACH ROW EXECUTE FUNCTION prevent_delete();
CREATE TRIGGER bookings_no_delete BEFORE DELETE ON "bookings" FOR EACH ROW EXECUTE FUNCTION prevent_delete();
CREATE TRIGGER parcels_no_delete BEFORE DELETE ON "parcels" FOR EACH ROW EXECUTE FUNCTION prevent_delete();
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION prevent_delete();
