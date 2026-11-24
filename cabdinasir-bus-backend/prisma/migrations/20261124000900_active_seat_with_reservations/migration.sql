-- Kursi firfircoon = ballan (RESERVED) + la bixiyay (CONFIRMED) + la fuulay (BOARDED).
-- VOIDED iyo EXPIRED kursiga way sii daayaan. (Migration gaar ah: enum values cusub transaction kale ayay u baahan yihiin.)
DROP INDEX IF EXISTS "bookings_active_seat";
CREATE UNIQUE INDEX "bookings_active_seat" ON "bookings" ("tripId", "seatNo") WHERE "status" IN ('RESERVED', 'CONFIRMED', 'BOARDED');
