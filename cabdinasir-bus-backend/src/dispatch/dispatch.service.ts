import { Injectable, Logger } from '@nestjs/common';
import { DispatchStatus, Role, TripStatus } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuthUser, isSuperAdmin } from '../common/auth-user';
import { Errors } from '../common/errors';
import { businessDate } from '../common/time';
import { seatTaken } from '../common/booking-status';
import { isUniqueViolation } from '../common/idempotency';
import { BranchDirectory } from '../common/branch-directory.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../events/events.service';
import { parseSeatLayout } from '../vehicles/seat-layout';

const OPEN: DispatchStatus[] = ['WAITING', 'LOADING'];
/** Gaari safar firfircoon ku jira (wuu socdaa ama wuu buuxsamayaa) — saf kale lama gelin karo */
const BUSY_TRIP: TripStatus[] = ['SCHEDULED', 'BOARDING', 'DEPARTED'];

export interface RosterItem {
  vehicleId: string;
  driverId: string;
}

/**
 * Safka gaadiidka maalinta (BUSINESS_RULES §30):
 * - Subaxdii maamuluhu wuxuu doortaa gaadiidka shaqeynaya maanta (kuwa maqan waa laga reebaa) + kala horreynta
 *   (talo: kii ugu horreeyay ee baxay shalay → dabada; si cadaalad ah ayay u wareegaan).
 * - Gaariga koowaad = LOADING (safar BOARDING ah ayaa si toos ah loo sameeyaa) → iib.
 * - Marka uu buuxsamo → kan xiga si toos ah ayuu iib u furmaa (hore loo iibin karaa).
 * - Marka uu baxo → DEPARTED; marka uu gaadho magaalada kale → si toos ah ayuu safka soo laabashada u galaa.
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dir: BranchDirectory,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private async route(id: string) {
    const r = await this.prisma.route.findUnique({ where: { id }, include: { fromBranch: true, toBranch: true } });
    if (!r) throw Errors.notFound('Route', id);
    return r;
  }

  /** Maamulka safka: maamulaha laan kasta oo magaalada laga baxayo ah (Boorama 1 & 2) ama Super Admin */
  private assertManager(user: AuthUser, fromBranchId: string) {
    if (isSuperAdmin(user)) return;
    if (user.role !== Role.BRANCH_MANAGER || !this.dir.sameCity(user.branchId, fromBranchId)) throw Errors.forbidden('Only the branch manager can manage the queue');
  }

  private notify(fromBranchId: string, toBranchId: string, routeId: string) {
    this.events.publish('DISPATCH', [fromBranchId, toBranchId, ...this.dir.mates(fromBranchId)], { routeId });
    this.events.publish('TRIP_STATUS', [fromBranchId], { routeId });
  }

  // ------------------------------------------------------------------ read

  /** Safka maanta (wadada) + gaadiidka diyaarka ah ee aan saf ku jirin (talo: cadaalad) */
  async board(routeId: string, date = businessDate()) {
    const route = await this.route(routeId);
    const entries = await this.prisma.dispatchEntry.findMany({
      where: { routeId, OR: [{ serviceDate: date }, { status: 'LOADING' }] },
      include: { vehicle: { select: { id: true, plate: true, model: true, capacity: true } }, driver: { select: { id: true, name: true, phone: true } } },
      orderBy: [{ position: 'asc' }],
    });
    const tripIds = entries.map((e) => e.tripId).filter((x): x is string => !!x);
    const [taken, trips] = await Promise.all([
      this.prisma.booking.groupBy({ by: ['tripId'], where: { tripId: { in: tripIds }, status: seatTaken }, _count: true }),
      this.prisma.trip.findMany({ where: { id: { in: tripIds } }, select: { id: true, status: true, departureAt: true } }),
    ]);
    const rows = entries.map((e) => {
      const trip = trips.find((t) => t.id === e.tripId);
      const seats = taken.find((t) => t.tripId === e.tripId)?._count ?? 0;
      return { ...e, trip: trip ? { ...trip, taken: seats, capacity: e.vehicle.capacity, full: seats >= e.vehicle.capacity } : null };
    });
    const rank = (s: DispatchStatus) => ({ LOADING: 0, WAITING: 1, DEPARTED: 2, REMOVED: 3 })[s];
    rows.sort((a, b) => rank(a.status) - rank(b.status) || (a.status === 'DEPARTED' ? (b.departedAt?.getTime() ?? 0) - (a.departedAt?.getTime() ?? 0) : a.position - b.position));
    return {
      route: { id: route.id, from: route.fromBranch, to: route.toBranch, ticketPriceCents: route.ticketPriceCents },
      date,
      entries: rows,
      stats: {
        waiting: rows.filter((r) => r.status === 'WAITING').length,
        loading: rows.filter((r) => r.status === 'LOADING').length,
        departed: rows.filter((r) => r.status === 'DEPARTED' && r.serviceDate === date).length,
        passengers: rows.filter((r) => r.status === 'DEPARTED' && r.serviceDate === date).reduce((s, r) => s + (r.trip?.taken ?? 0), 0),
      },
      candidates: await this.candidates(),
    };
  }

  /**
   * Gaadiidka firfircoon ee aan saf furan ama safar socda ku jirin. Talada kala horreynta (cadaalad):
   * kii ugu dambeeyay ee baxay waa dabada; kuwa aan weli bixin (ama muddo dheer) ayaa hore.
   */
  async candidates() {
    const [vehicles, open, busy, last] = await Promise.all([
      this.prisma.vehicle.findMany({ where: { isActive: true }, include: { defaultDriver: { select: { id: true, name: true, isActive: true } } }, orderBy: { plate: 'asc' } }),
      this.prisma.dispatchEntry.findMany({ where: { status: { in: OPEN } }, select: { vehicleId: true, driverId: true } }),
      this.prisma.trip.findMany({ where: { status: { in: BUSY_TRIP } }, select: { vehicleId: true, driverId: true } }),
      this.prisma.dispatchEntry.groupBy({ by: ['vehicleId'], where: { status: 'DEPARTED' }, _max: { departedAt: true } }),
    ]);
    const blockedV = new Set([...open.map((o) => o.vehicleId), ...busy.map((b) => b.vehicleId)]);
    // darawal saf ama safar ku jira → talo ahaan lama dooranayo (maamuluhu mid kale ayuu dooranayaa)
    const blockedD = new Set([...open.map((o) => o.driverId), ...busy.map((b) => b.driverId)]);
    const lastAt = (id: string) => last.find((l) => l.vehicleId === id)?._max.departedAt?.getTime() ?? 0;
    return vehicles
      .filter((v) => !blockedV.has(v.id))
      .sort((a, b) => lastAt(a.id) - lastAt(b.id) || a.plate.localeCompare(b.plate))
      .map((v) => ({ vehicleId: v.id, plate: v.plate, model: v.model, capacity: v.capacity, defaultDriver: v.defaultDriver?.isActive && !blockedD.has(v.defaultDriver.id) ? v.defaultDriver : null, lastDepartedAt: lastAt(v.id) ? new Date(lastAt(v.id)) : null }));
  }

  /** Dhammaan wadooyinka (Super Admin / dashboard): gaariga hadda buuxsamaya + inta sugaysa */
  async overview(date = businessDate()) {
    const routes = await this.prisma.route.findMany({ where: { isActive: true }, include: { fromBranch: true, toBranch: true } });
    const out = [];
    for (const r of routes) {
      const b = await this.board(r.id, date);
      const loading = b.entries.filter((e) => e.status === 'LOADING');
      out.push({ route: b.route, loading: loading.map((e) => ({ plate: e.vehicle.plate, driver: e.driver.name, tripId: e.tripId, taken: e.trip?.taken ?? 0, capacity: e.vehicle.capacity })), stats: b.stats, next: b.entries.filter((e) => e.status === 'WAITING').slice(0, 3).map((e) => e.vehicle.plate) });
    }
    return { date, routes: out.filter((r) => r.loading.length || r.stats.waiting || r.stats.departed) };
  }

  // ------------------------------------------------------------------ manage

  /** Bilow / ku dar: gaadiidka maanta (kala horreynta la doortay) — kuwa hore ee safka ku jira waa la ilaaliyaa */
  async enqueue(user: AuthUser, routeId: string, items: RosterItem[], note?: string) {
    const route = await this.route(routeId);
    this.assertManager(user, route.fromBranchId);
    if (!route.isActive) throw Errors.bad('ROUTE_INACTIVE', 'Route is inactive');
    if (!items.length) throw Errors.bad('VALIDATION_ERROR', 'Choose at least one vehicle');
    const date = businessDate();
    await this.expireStale();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "routes" WHERE id = ${routeId} FOR UPDATE`; // laba maamule isku mar → kala horreyn sax ah
        const max = await tx.dispatchEntry.aggregate({ where: { routeId, serviceDate: date }, _max: { position: true } });
        let pos = (max._max.position ?? 0) + 1;
        for (const it of items) {
          const [v, d, busy] = await Promise.all([
            tx.vehicle.findUnique({ where: { id: it.vehicleId } }),
            tx.driver.findUnique({ where: { id: it.driverId } }),
            tx.trip.findFirst({ where: { status: { in: BUSY_TRIP }, OR: [{ vehicleId: it.vehicleId }, { driverId: it.driverId }] }, select: { id: true } }),
          ]);
          if (!v?.isActive) throw Errors.bad('VEHICLE_INACTIVE', 'Vehicle not found or inactive', { vehicleId: it.vehicleId });
          if (!d?.isActive) throw Errors.bad('DRIVER_INACTIVE', 'Driver not found or inactive', { driverId: it.driverId });
          if (busy) throw Errors.conflict('VEHICLE_BUSY', 'Vehicle or driver is on an active trip', { plate: v.plate, tripId: busy.id });
          await tx.dispatchEntry.create({ data: { routeId, serviceDate: date, vehicleId: v.id, driverId: d.id, position: pos++, addedById: user.id, note } });
        }
        await this.audit.log(tx, user, 'DISPATCH_ENQUEUE', 'routes', routeId, null, { items, date });
        await this.ensureOpen(tx, routeId, user.id);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw Errors.conflict('ALREADY_QUEUED', 'A vehicle or driver is already in a queue');
      throw e;
    }
    this.notify(route.fromBranchId, route.toBranchId, routeId);
    return this.board(routeId, date);
  }

  /** Kala horreynta: kor/hoos (kaliya kuwa sugaya) */
  async move(user: AuthUser, entryId: string, direction: 'up' | 'down') {
    const e = await this.prisma.dispatchEntry.findUnique({ where: { id: entryId }, include: { route: true } });
    if (!e) throw Errors.notFound('DispatchEntry', entryId);
    this.assertManager(user, e.route.fromBranchId);
    if (e.status !== 'WAITING') throw Errors.invalidState('DispatchEntry', e.status, 'MOVE');
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "routes" WHERE id = ${e.routeId} FOR UPDATE`;
      const other = await tx.dispatchEntry.findFirst({
        where: { routeId: e.routeId, serviceDate: e.serviceDate, status: 'WAITING', position: direction === 'up' ? { lt: e.position } : { gt: e.position } },
        orderBy: { position: direction === 'up' ? 'desc' : 'asc' },
      });
      if (!other) return;
      await tx.dispatchEntry.update({ where: { id: e.id }, data: { position: other.position } });
      await tx.dispatchEntry.update({ where: { id: other.id }, data: { position: e.position } });
    });
    this.notify(e.route.fromBranchId, e.route.toBranchId, e.routeId);
    return this.board(e.routeId, e.serviceDate);
  }

  /** Ka saar safka (darawal maqan, gaari xumaaday). Gaariga buuxsamaya: kaliya haddii aan tigidh lagu iibin (safarka waa la joojiyaa). */
  async remove(user: AuthUser, entryId: string, reason: string) {
    const e = await this.prisma.dispatchEntry.findUnique({ where: { id: entryId }, include: { route: true } });
    if (!e) throw Errors.notFound('DispatchEntry', entryId);
    this.assertManager(user, e.route.fromBranchId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "routes" WHERE id = ${e.routeId} FOR UPDATE`;
      const cur = await tx.dispatchEntry.findUniqueOrThrow({ where: { id: entryId } });
      if (!OPEN.includes(cur.status)) throw Errors.invalidState('DispatchEntry', cur.status, 'REMOVED');
      if (cur.status === 'LOADING' && cur.tripId) {
        const sold = await tx.booking.count({ where: { tripId: cur.tripId, status: seatTaken } });
        if (sold > 0) throw Errors.conflict('TRIP_HAS_BOOKINGS', 'Move or void the tickets first (Move bookings)', { active: sold });
        await tx.parcel.count({ where: { tripId: cur.tripId, status: 'LOADED' } }).then((n) => {
          if (n > 0) throw Errors.conflict('TRIP_HAS_PARCELS', 'Unload the parcels first', { parcels: n });
        });
        await tx.trip.update({ where: { id: cur.tripId }, data: { status: 'CANCELLED' } });
      }
      await tx.dispatchEntry.update({ where: { id: entryId }, data: { status: 'REMOVED', removedReason: reason } });
      await this.audit.log(tx, user, 'DISPATCH_REMOVE', 'routes', e.routeId, { entryId, status: cur.status }, { reason });
      await this.ensureOpen(tx, e.routeId, user.id);
    });
    this.notify(e.route.fromBranchId, e.route.toBranchId, e.routeId);
    return this.board(e.routeId, e.serviceDate);
  }

  /**
   * Hubi in gaari iib u furan yahay: haddii gaariga LOADING buuxsamay (ama ma jiro) → kan xiga ee sugaya
   * wuxuu noqdaa LOADING + safar BOARDING ah (departureAt = hadda). Waxaa la wacaa transaction gudaheed.
   */
  async ensureOpen(tx: Tx, routeId: string, userId: string) {
    const loading = await tx.dispatchEntry.findMany({ where: { routeId, status: 'LOADING' }, include: { vehicle: true } });
    for (const l of loading) {
      if (!l.tripId) continue;
      const taken = await tx.booking.count({ where: { tripId: l.tripId, status: seatTaken } });
      if (taken < l.vehicle.capacity) return; // weli kursi bannaan ayaa jira → hal gaari oo furan ayaa ku filan
    }
    const waiting = await tx.dispatchEntry.findMany({ where: { routeId, status: 'WAITING' }, orderBy: [{ serviceDate: 'asc' }, { position: 'asc' }], include: { vehicle: true, driver: true } });
    for (const w of waiting) {
      // gaari/darawal safar kale ku jira ama la joojiyay → ka bood (sugayaa)
      const busy = await tx.trip.findFirst({ where: { status: { in: BUSY_TRIP }, OR: [{ vehicleId: w.vehicleId }, { driverId: w.driverId }] }, select: { id: true } });
      if (busy || !w.vehicle.isActive || !w.driver.isActive) continue;
      parseSeatLayout(w.vehicle.seatLayout);
      // waqtiga bixitaanka = qiyaas (gaarigu wuxuu baxaa marka uu buuxsamo) → ballan taleefan waa suurtagal; marka uu baxo waqtiga dhabta ah ayaa la qoraa
      const { queueEstimatedMinutes } = await this.settings.get(tx);
      const trip = await tx.trip.create({ data: { routeId, vehicleId: w.vehicleId, driverId: w.driverId, departureAt: new Date(Date.now() + queueEstimatedMinutes * 60_000), status: 'BOARDING', createdById: userId } });
      await tx.dispatchEntry.update({ where: { id: w.id }, data: { status: 'LOADING', tripId: trip.id, loadingAt: new Date() } });
      return;
    }
  }

  // ------------------------------------------------------------------ hooks (trips / bookings)

  /** Tigidh / ballan kadib: haddii gaariga buuxsamay → kan xiga ha furmo */
  async afterSeatChange(tx: Tx, tripId: string, userId: string) {
    const e = await tx.dispatchEntry.findUnique({ where: { tripId } });
    if (e?.status === 'LOADING') await this.ensureOpen(tx, e.routeId, userId);
  }

  /** Safarka xaaladiisa: DEPARTED → saf DEPARTED + kan xiga; CANCELLED → REMOVED; ARRIVED → safka soo laabashada */
  async afterTripStatus(tx: Tx, trip: { id: string; routeId: string; vehicleId: string; driverId: string }, to: TripStatus, userId: string) {
    const e = await tx.dispatchEntry.findUnique({ where: { tripId: trip.id } });
    if (e && to === 'DEPARTED') {
      const now = new Date();
      await tx.dispatchEntry.update({ where: { id: e.id }, data: { status: 'DEPARTED', departedAt: now } });
      await tx.trip.update({ where: { id: trip.id }, data: { departureAt: now } }); // waqtiga dhabta ah (qiyaastii waa la beddelay)
      await this.ensureOpen(tx, e.routeId, userId);
    }
    if (e && to === 'CANCELLED' && OPEN.includes(e.status)) {
      await tx.dispatchEntry.update({ where: { id: e.id }, data: { status: 'REMOVED', removedReason: 'Trip cancelled' } });
      await this.ensureOpen(tx, e.routeId, userId);
    }
    if (to === 'ARRIVED' && (await this.settings.get(tx)).queueAutoReturn) {
      const route = await tx.route.findUniqueOrThrow({ where: { id: trip.routeId } });
      // wadada soo laabashada: laanta loo yimid → laanta laga yimid (ama laan kale oo isla magaaladaas ah)
      const back = await tx.route.findMany({ where: { fromBranchId: route.toBranchId, isActive: true } });
      const ret = back.find((r) => r.toBranchId === route.fromBranchId) ?? back.find((r) => this.dir.sameCity(r.toBranchId, route.fromBranchId));
      if (!ret) return null;
      const already = await tx.dispatchEntry.findFirst({ where: { status: { in: OPEN }, OR: [{ vehicleId: trip.vehicleId }, { driverId: trip.driverId }] } });
      if (already) return null;
      const date = businessDate();
      const max = await tx.dispatchEntry.aggregate({ where: { routeId: ret.id, serviceDate: date }, _max: { position: true } });
      await tx.dispatchEntry.create({ data: { routeId: ret.id, serviceDate: date, vehicleId: trip.vehicleId, driverId: trip.driverId, position: (max._max.position ?? 0) + 1, addedById: userId, note: 'AUTO_RETURN' } });
      await this.ensureOpen(tx, ret.id, userId);
      return ret.id;
    }
    return null;
  }

  /** Maalin cusub: kuwii shalay sugayay (aan la furin) waa la xiraa — maalin kasta saf cusub */
  async expireStale() {
    const r = await this.prisma.dispatchEntry.updateMany({ where: { status: 'WAITING', serviceDate: { lt: businessDate() } }, data: { status: 'REMOVED', removedReason: 'END_OF_DAY' } });
    if (r.count) this.logger.log(`Dispatch: ${r.count} stale waiting entries closed`);
    return r.count;
  }

}
