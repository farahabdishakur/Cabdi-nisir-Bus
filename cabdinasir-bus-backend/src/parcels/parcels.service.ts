import { Injectable } from '@nestjs/common';
import { ParcelStatus, Payer, PaymentKind, PaymentMethod, Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomInt } from 'crypto';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuthUser, isSuperAdmin } from '../common/auth-user';
import { Errors } from '../common/errors';
import { effectiveBranch } from '../common/branch-scope';
import { assertTransition, PARCEL_TRANSITIONS } from '../common/state-machine';
import { nextNumber } from '../common/sequences';
import { isUniqueViolation } from '../common/idempotency';
import { businessDayRange } from '../common/time';
import { pageArgs, paged } from '../common/pagination';
import { parcelPrice } from '../pricing/pricing';
import { SettingsService } from '../settings/settings.service';
import { CashService } from '../cash/cash.service';
import { AuditService } from '../audit/audit.service';
import { TripsService } from '../trips/trips.service';
import { NotificationsService } from '../notifications/notifications.service';
import { formatUsd } from '../common/money';
import { BranchDirectory } from '../common/branch-directory.service';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { isUuid } from '../bookings/bookings.service';
import {
  ArriveBatchDto, CorrectParcelDto, CreateParcelDto, DeliverParcelDto, ParcelQuery, QuoteParcelDto, VoidParcelDto,
} from './parcels.dto';

const include = {
  fromBranch: true,
  toBranch: true,
  category: true,
  payments: true,
  trip: { select: { id: true, departureAt: true, status: true, vehicle: { select: { plate: true } } } },
} satisfies Prisma.ParcelInclude;

const INCOMING: ParcelStatus[] = ['LOADED', 'IN_TRANSIT', 'ARRIVED', 'MISSING', 'DAMAGED'];
const OUTGOING: ParcelStatus[] = ['REGISTERED', 'LOADED'];
const DAY_MS = 86400_000;
const MAX_PIN_FAILURES = 5;
/** PIN 4-god ah: ilaalintu waa xiritaanka 5 isku day — hash fudud ayaa ku filan (sync degdeg ah). */
const PIN_HASH = { memoryCost: 4096, timeCost: 2, parallelism: 1 };
const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

type ParcelFull = Prisma.ParcelGetPayload<{ include: typeof include }>;

/** pickupPinHash weligiis looma celiyo client-ka. */
function strip<T extends { pickupPinHash?: string }>(p: T): Omit<T, 'pickupPinHash'> {
  const { pickupPinHash: _h, ...rest } = p;
  return rest;
}

@Injectable()
export class ParcelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly cash: CashService,
    private readonly audit: AuditService,
    private readonly trips: TripsService,
    private readonly notifications: NotificationsService,
    private readonly dir: BranchDirectory,
  ) {}

  /** Qiimaha alaabta — frontend-ku wuxuu wacaa ka hor diiwaangelinta (live quote). */
  async quote(user: AuthUser, dto: QuoteParcelDto, db: Tx | PrismaService = this.prisma) {
    const fromBranchId = effectiveBranch(user, dto.fromBranchId);
    if (fromBranchId === dto.toBranchId) throw Errors.bad('SAME_BRANCH', 'Destination must be a different branch');
    await this.dir.ensure(fromBranchId, dto.toBranchId);
    if (!this.dir.differentCities(fromBranchId, dto.toBranchId)) {
      throw Errors.bad('SAME_CITY', 'Parcels are only sent between cities (e.g. Boorama → Wajaale)');
    }
    const [route, category, settings] = await Promise.all([
      db.route.findUnique({ where: { fromBranchId_toBranchId: { fromBranchId, toBranchId: dto.toBranchId } } }),
      db.parcelCategory.findUnique({ where: { id: dto.categoryId } }),
      this.settings.get(db),
    ]);
    if (!route || !route.isActive) throw Errors.bad('ROUTE_NOT_FOUND', 'No active route between these branches');
    if (!category || !category.isActive) throw Errors.bad('CATEGORY_NOT_FOUND', 'Parcel category not found');
    if (category.isProhibited) {
      throw Errors.bad('PARCEL_PROHIBITED', 'Dangerous goods are not accepted', { category: category.nameSo });
    }
    if (dto.insured && !dto.declaredValueCents) throw Errors.bad('DECLARED_VALUE_REQUIRED', 'Insurance needs a declared value');
    const price = parcelPrice({
      baseFeeCents: category.baseFeeCents,
      perKgMultiplierPct: Math.round(Number(category.perKgMultiplier) * 100),
      parcelPerKgCents: route.parcelPerKgCents,
      parcelMinFeeCents: route.parcelMinFeeCents,
      weightKg: dto.weightKg,
      isFragile: !!dto.isFragile,
      fragileSurchargeCents: settings.fragileSurchargeCents,
      insured: !!dto.insured,
      declaredValueCents: dto.declaredValueCents ?? 0,
      insuranceBps: settings.insuranceBps,
    });
    return { fromBranchId, toBranchId: dto.toBranchId, category: { id: category.id, nameSo: category.nameSo }, ...price };
  }

  /**
   * Diiwaangelinta alaabta (BUSINESS_RULES §4). Natiijada: tracking code + rasiid + PIN-ka qaataha.
   * PIN-ka hal mar ayaa la soo celiyaa (rasiidka / SMS) — DB-ga waa hashed.
   */
  async create(
    user: AuthUser,
    dto: CreateParcelDto,
    idempotencyKey?: string,
    opts: { pickupPin?: string; offlineCreatedAt?: Date } = {},
  ) {
    if (idempotencyKey) {
      const prev = await this.prisma.parcel.findUnique({ where: { idempotencyKey }, include });
      if (prev && prev.registeredById !== user.id) throw Errors.conflict('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was used by another user');
      if (prev) return { ...strip(prev), pickupPin: null, replayed: true };
    }
    if (dto.payer === Payer.SENDER && !dto.payment) throw Errors.bad('PAYMENT_REQUIRED', 'Sender pays now: payment is required');
    // Offline: PIN-ka client-ka ayaa sameeyay si rasiidka offline-ka ah loogu daabaco
    const pickupPin = opts.pickupPin ?? String(randomInt(0, 10000)).padStart(4, '0');
    const pickupPinHash = await argon2.hash(pickupPin, PIN_HASH);
    try {
      const parcel = await this.prisma.$transaction(async (tx) => {
        const q = await this.quote(user, dto, tx);
        const branch = await tx.branch.findUniqueOrThrow({ where: { id: q.fromBranchId } });
        const trackingCode = await nextNumber(tx, branch.id, branch.code, 'TRACKING');
        const receiptNo = await nextNumber(tx, branch.id, branch.code, 'PARCEL');
        const p = await tx.parcel.create({
          data: {
            trackingCode,
            receiptNo,
            fromBranchId: q.fromBranchId,
            toBranchId: q.toBranchId,
            senderName: dto.senderName.trim(),
            senderPhone: dto.senderPhone.replace(/\s/g, ''),
            receiverName: dto.receiverName.trim(),
            receiverPhone: dto.receiverPhone.replace(/\s/g, ''),
            pickupPinHash,
            categoryId: dto.categoryId,
            pieces: dto.pieces,
            weightKg: new Prisma.Decimal(dto.weightKg),
            description: dto.description,
            declaredValueCents: dto.declaredValueCents,
            isFragile: !!dto.isFragile,
            insured: !!dto.insured,
            packagingOk: dto.packagingOk ?? true,
            payer: dto.payer,
            feeCents: q.totalCents,
            priceBreakdown: { lines: q.lines, totalCents: q.totalCents } as unknown as Prisma.InputJsonValue,
            paidAt: dto.payer === Payer.SENDER ? new Date() : null,
            registeredById: user.id,
            idempotencyKey,
            offlineCreatedAt: opts.offlineCreatedAt,
          },
        });
        await tx.parcelStatusHistory.create({
          data: { parcelId: p.id, toStatus: 'REGISTERED', branchId: q.fromBranchId, userId: user.id },
        });
        if (dto.payer === Payer.SENDER && q.totalCents > 0) {
          await this.cash.recordPayment(tx, user, q.fromBranchId, PaymentKind.PARCEL, q.totalCents, dto.payment!, { parcelId: p.id });
        }
        const full = await tx.parcel.findUniqueOrThrow({ where: { id: p.id }, include });
        await this.notifications.enqueue(tx, full.receiverPhone, 'PARCEL_REGISTERED', {
          sender: full.senderName, pieces: full.pieces, from: full.fromBranch.name, to: full.toBranch.name,
          code: full.trackingCode, pin: pickupPin, cod: this.codLine(full),
        }, full.id);
        return full;
      });
      return { ...strip(parcel), pickupPin };
    } catch (e) {
      if (idempotencyKey && isUniqueViolation(e, 'idempotencyKey')) {
        const prev = await this.prisma.parcel.findUniqueOrThrow({ where: { idempotencyKey }, include });
        if (prev.registeredById !== user.id) throw Errors.conflict('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was used by another user');
        return { ...strip(prev), pickupPin: null, replayed: true };
      }
      throw e;
    }
  }

  async list(user: AuthUser, q: ParcelQuery) {
    const branchId = isSuperAdmin(user) ? q.branchId : user.branchId!;
    if (!isSuperAdmin(user) && q.branchId && q.branchId !== user.branchId) throw Errors.forbiddenBranch();
    const where: Prisma.ParcelWhereInput = {
      status: q.status, tripId: q.tripId,
      ...(q.paidVia && { payments: { some: { method: q.paidVia, amount: { gt: 0 } } } }),
    };
    const dir = q.direction ?? 'all';
    if (branchId) {
      if (dir === 'incoming') where.toBranchId = branchId;
      else if (dir === 'outgoing') where.fromBranchId = branchId;
      else where.AND = [{ OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] }];
    }
    if (q.date) {
      const { start, end } = businessDayRange(q.date);
      where.createdAt = { gte: start, lt: end };
    }
    if (q.q) {
      const term = q.q.trim();
      where.OR = [
        { trackingCode: { contains: term, mode: 'insensitive' } },
        { receiptNo: { contains: term, mode: 'insensitive' } },
        { receiverPhone: { contains: term.replace(/\s/g, '') } },
        { senderPhone: { contains: term.replace(/\s/g, '') } },
        { receiverName: { contains: term, mode: 'insensitive' } },
        { senderName: { contains: term, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.parcel.findMany({ where, include, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      this.prisma.parcel.count({ where }),
    ]);
    return paged(data.map(strip), total, q);
  }

  /** Alaabta u imanaysa laantayda — waa la arkaa ka hor inta gaarigu iman. */
  async incoming(user: AuthUser, branchId?: string) {
    const to = effectiveBranch(user, branchId);
    const rows = await this.prisma.parcel.findMany({
      where: { toBranchId: to, status: { in: INCOMING } },
      include,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(strip);
  }

  /** Alaabta laantayda ka baxaysa oo aan wali la qaadin (rar sugaya ama la raray). */
  async outgoing(user: AuthUser, branchId?: string) {
    const from = effectiveBranch(user, branchId);
    const rows = await this.prisma.parcel.findMany({
      where: { fromBranchId: from, status: { in: OUTGOING } },
      include,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(strip);
  }

  async get(user: AuthUser, codeOrId: string) {
    const p = await this.prisma.parcel.findFirst({
      where: isUuid(codeOrId) ? { id: codeOrId } : { OR: [{ trackingCode: codeOrId.toUpperCase() }, { receiptNo: codeOrId.toUpperCase() }] },
      include: { ...include, history: { orderBy: { createdAt: 'asc' } } },
    });
    if (!p) throw Errors.notFound('Parcel', codeOrId);
    this.assertSide(user, p, 'any');
    const storage = await this.storageFee(p);
    return { ...strip(p), storageFeeCents: storage.cents, storageDays: storage.days };
  }

  /** Gaariga ku rar (laanta laga dirayo). */
  async load(user: AuthUser, id: string, tripId: string) {
    return this.prisma.$transaction(async (tx) => {
      const p = await this.loadFor(tx, id);
      this.assertSide(user, p, 'from');
      const trip = await this.trips.getForUser(tx, user, tripId);
      // Gaariga Boorama → Wajaale wuxuu qaadaa alaabta labada laamood ee Boorama
      if (!this.dir.sameCity(trip.route.fromBranchId, p.fromBranchId) || !this.dir.sameCity(trip.route.toBranchId, p.toBranchId)) {
        throw Errors.bad('TRIP_ROUTE_MISMATCH', 'This trip does not go to the parcel destination city');
      }
      if (!['SCHEDULED', 'BOARDING'].includes(trip.status)) throw Errors.conflict('TRIP_DEPARTED', 'Trip already departed');
      return this.transition(tx, user, p, 'LOADED', { tripId }, `Loaded on ${trip.vehicle.plate}`);
    });
  }

  /** Ka dejin gaariga ka hor bixitaanka. */
  async unload(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const p = await this.loadFor(tx, id);
      this.assertSide(user, p, 'from');
      return this.transition(tx, user, p, 'REGISTERED', { tripId: null }, 'Unloaded');
    });
  }

  async arrive(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const p = await this.loadFor(tx, id);
      this.assertSide(user, p, 'to');
      return this.transition(tx, user, p, 'ARRIVED', { arrivedAt: new Date() });
    });
  }

  /**
   * Gaarigu markuu yimaado: xaqiiji alaabta la helay. Wixii safarka ku jiray oo aan liiska ku jirin
   * waxaa lagu soo celiyaa `missing` — Manager-ka ayaa go'aamiya (mark-missing).
   */
  async arriveBatch(user: AuthUser, dto: ArriveBatchDto) {
    return this.prisma.$transaction(async (tx) => {
      const onTrip = await tx.parcel.findMany({ where: { tripId: dto.tripId, status: { in: ['IN_TRANSIT', 'MISSING'] } }, include });
      const arrived: string[] = [];
      for (const pid of dto.parcelIds) {
        const p = onTrip.find((x) => x.id === pid);
        if (!p) throw Errors.bad('PARCEL_NOT_ON_TRIP', 'Parcel is not in transit on this trip', { parcelId: pid });
        this.assertSide(user, p, 'to');
        await this.transition(tx, user, p, 'ARRIVED', { arrivedAt: new Date() });
        arrived.push(p.trackingCode);
      }
      const missing = onTrip
        .filter((p) => !dto.parcelIds.includes(p.id) && p.toBranchId === (user.branchId ?? p.toBranchId))
        .map((p) => ({ id: p.id, trackingCode: p.trackingCode, receiverName: p.receiverName, pieces: p.pieces }));
      return { arrived, missing };
    });
  }

  /** Ku wareejin qofka iska leh: PIN + magac; COD/kayd → lacag marka hore (BUSINESS_RULES §4.4). */
  async deliver(user: AuthUser, id: string, dto: DeliverParcelDto) {
    const p0 = await this.prisma.parcel.findUnique({ where: { id } });
    if (!p0) throw Errors.notFound('Parcel', id);
    this.assertSide(user, p0, 'to');
    // Isku day kasta waa la "xiraa" KA HOR hubinta (atomic) — requests isku mar ah 5-ta xad kama gudbi karaan
    const reserved = await this.prisma.parcel.updateMany({ where: { id, pinFailures: { lt: MAX_PIN_FAILURES } }, data: { pinFailures: { increment: 1 } } });
    if (reserved.count === 0) throw Errors.conflict('PIN_LOCKED', 'Too many wrong PINs — verify ID and reset the PIN');
    if (!(await argon2.verify(p0.pickupPinHash, dto.pin))) {
      const after = await this.prisma.parcel.findUniqueOrThrow({ where: { id }, select: { pinFailures: true } });
      await this.audit.log(this.prisma, user, 'PIN_FAILED', 'parcels', id, null, { failures: after.pinFailures });
      throw Errors.bad('INVALID_PIN', 'Pickup PIN is wrong', { attemptsLeft: Math.max(0, MAX_PIN_FAILURES - after.pinFailures) });
    }
    // PIN sax ah → isku daygan laguma tiriyo
    await this.prisma.parcel.update({ where: { id }, data: { pinFailures: 0 } });
    return this.prisma.$transaction(async (tx) => {
      const p = await this.loadFor(tx, id);
      this.assertSide(user, p, 'to');
      if (p.status !== 'ARRIVED' && p.status !== 'DAMAGED') throw Errors.invalidState('Parcel', p.status, 'DELIVERED');
      const storage = await this.storageFee(p, tx);
      const codDue = p.payer === Payer.RECEIVER && !p.paidAt ? p.feeCents : 0;
      if ((codDue > 0 || storage.cents > 0) && !dto.payment) {
        throw Errors.bad('PAYMENT_REQUIRED', 'Collect payment before handing over', { codDueCents: codDue, storageFeeCents: storage.cents });
      }
      if (codDue > 0) await this.cash.recordPayment(tx, user, p.toBranchId, PaymentKind.PARCEL, codDue, dto.payment!, { parcelId: p.id });
      if (storage.cents > 0) {
        await this.cash.recordPayment(tx, user, p.toBranchId, PaymentKind.STORAGE, storage.cents, dto.payment!, { parcelId: p.id });
      }
      return this.transition(tx, user, p, 'DELIVERED', {
        deliveredAt: new Date(),
        deliveredById: user.id,
        deliveredToName: dto.receivedByName.trim(),
        ...(codDue > 0 && { paidAt: new Date() }),
      });
    });
  }

  async void(user: AuthUser, id: string, dto: VoidParcelDto) {
    return this.prisma.$transaction(async (tx) => {
      const p = await this.loadFor(tx, id);
      this.assertSide(user, p, 'from');
      const paid = p.payments.reduce((s, x) => s + x.amountUsdCents, 0);
      const updated = await this.transition(tx, user, p, 'VOIDED', { voidReason: dto.reason }, dto.reason);
      if (dto.refund && paid > 0) {
        const orig = p.payments[0];
        const pay = dto.refundPayment ?? { method: orig?.method ?? PaymentMethod.CASH, currency: orig?.currency ?? 'USD', reference: orig?.reference ?? undefined, payerPhone: orig?.payerPhone ?? undefined };
        await this.cash.recordPayment(tx, user, p.fromBranchId, PaymentKind.REFUND, -paid, pay, { parcelId: p.id });
      }
      await this.audit.log(tx, user, 'VOID', 'parcels', id, { status: p.status }, { status: 'VOIDED', reason: dto.reason, refunded: dto.refund ? paid : 0 });
      return updated;
    });
  }

  async mark(user: AuthUser, id: string, to: 'MISSING' | 'DAMAGED', note: string) {
    return this.prisma.$transaction(async (tx) => {
      const p = await this.loadFor(tx, id);
      this.assertSide(user, p, 'any');
      const updated = await this.transition(tx, user, p, to, {}, note);
      await this.audit.log(tx, user, `MARK_${to}`, 'parcels', id, { status: p.status }, { status: to, note });
      return updated;
    });
  }

  /**
   * Sixitaan: laanta laga diray inta aan la wareejin; Manager laan kasta oo khusaysa.
   * Before/after audit ayaa la qoraa.
   */
  async correct(user: AuthUser, id: string, dto: CorrectParcelDto) {
    return this.prisma.$transaction(async (tx) => {
      const p = await this.loadFor(tx, id);
      if (['DELIVERED', 'VOIDED'].includes(p.status)) throw Errors.conflict('PARCEL_CLOSED', 'Parcel already delivered or voided');
      const isManager = user.role === Role.BRANCH_MANAGER || isSuperAdmin(user);
      this.assertSide(user, p, isManager ? 'any' : 'from');
      if (!isManager && !['REGISTERED', 'LOADED'].includes(p.status)) throw Errors.forbidden('Only a manager can correct a parcel in transit');
      const { reason, ...fields } = dto;
      const data = Object.fromEntries(
        Object.entries(fields)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, k.endsWith('Phone') ? String(v).replace(/\s/g, '') : String(v).trim()]),
      );
      if (!Object.keys(data).length) throw Errors.bad('NOTHING_TO_CHANGE', 'No fields to correct');
      const before = Object.fromEntries(Object.keys(data).map((k) => [k, (p as unknown as Record<string, unknown>)[k]]));
      await tx.parcel.update({ where: { id }, data });
      await tx.parcelStatusHistory.create({ data: { parcelId: id, fromStatus: p.status, toStatus: p.status, branchId: user.branchId, userId: user.id, note: `Correction: ${reason}` } });
      await this.audit.log(tx, user, 'CORRECT', 'parcels', id, before, { ...data, reason });
      return strip(await tx.parcel.findUniqueOrThrow({ where: { id }, include }));
    });
  }

  /** Qaataha PIN-ka wuu lumiyay: PIN cusub (SMS + rasiid). Shaqaaluhu waa inay hubiyaan aqoonsiga. */
  async resetPin(user: AuthUser, id: string, reason: string) {
    const pin = String(randomInt(0, 10000)).padStart(4, '0');
    const hash = await argon2.hash(pin, PIN_HASH);
    return this.prisma.$transaction(async (tx) => {
      const p = await this.loadFor(tx, id);
      this.assertSide(user, p, 'any');
      if (['DELIVERED', 'VOIDED'].includes(p.status)) throw Errors.conflict('PARCEL_CLOSED', 'Parcel already delivered or voided');
      await tx.parcel.update({ where: { id }, data: { pickupPinHash: hash, pinFailures: 0 } });
      await this.notifications.enqueue(tx, p.receiverPhone, 'PARCEL_PIN_RESET', { code: p.trackingCode, pin }, p.id);
      await this.audit.log(tx, user, 'RESET_PIN', 'parcels', id, null, { reason });
      return { parcelId: id, trackingCode: p.trackingCode, pickupPin: pin };
    });
  }

  async reprint(user: AuthUser, id: string) {
    const p = await this.prisma.parcel.findUnique({ where: { id } });
    if (!p) throw Errors.notFound('Parcel', id);
    this.assertSide(user, p, 'any');
    const updated = await this.prisma.parcel.update({ where: { id }, data: { printCount: { increment: 1 } }, include });
    await this.audit.log(this.prisma, user, 'REPRINT', 'parcels', id, { printCount: p.printCount }, { printCount: updated.printCount });
    return strip(updated);
  }

  /** Sawirka alaabta (caddayn haddii khilaaf dhaco). */
  async savePhoto(user: AuthUser, id: string, file: { buffer: Buffer; mimetype: string; size: number } | undefined) {
    if (!file) throw Errors.bad('FILE_REQUIRED', 'Upload an image in field "file"');
    const ext = PHOTO_TYPES[file.mimetype];
    if (!ext) throw Errors.bad('INVALID_FILE_TYPE', 'Only JPEG, PNG or WEBP images are allowed');
    const p = await this.prisma.parcel.findUnique({ where: { id } });
    if (!p) throw Errors.notFound('Parcel', id);
    this.assertSide(user, p, 'any');
    const dir = join(this.uploadDir, 'parcels');
    await mkdir(dir, { recursive: true });
    const name = `${p.id}-${Date.now()}.${ext}`;
    await writeFile(join(dir, name), file.buffer);
    const updated = await this.prisma.parcel.update({ where: { id }, data: { photoUrl: `parcels/${name}` }, include });
    return strip(updated);
  }

  async photoPath(user: AuthUser, id: string) {
    const p = await this.prisma.parcel.findUnique({ where: { id } });
    if (!p) throw Errors.notFound('Parcel', id);
    this.assertSide(user, p, 'any');
    if (!p.photoUrl) throw Errors.notFound('Photo', id);
    return resolve(this.uploadDir, p.photoUrl);
  }

  private get uploadDir() {
    return resolve(process.env.UPLOAD_DIR ?? './uploads');
  }

  // ---------------------------------------------------------------- helpers

  private codLine(p: { payer: Payer; paidAt: Date | null; feeCents: number }) {
    return p.payer === Payer.RECEIVER && !p.paidAt ? ' Lacagta rarista: ' + formatUsd(p.feeCents) + ' (marka aad qaadanayso).' : '';
  }

  private async loadFor(tx: Tx, id: string): Promise<ParcelFull> {
    const p = await tx.parcel.findUnique({ where: { id }, include });
    if (!p) throw Errors.notFound('Parcel', id);
    return p;
  }

  private async transition(tx: Tx, user: AuthUser, p: ParcelFull, to: ParcelStatus, data: Prisma.ParcelUncheckedUpdateInput, note?: string) {
    assertTransition('Parcel', PARCEL_TRANSITIONS, p.status, to);
    // Optimistic lock: haddii qof kale isla mar beddelay, waa la diidaa
    const res = await tx.parcel.updateMany({ where: { id: p.id, status: p.status }, data: { ...data, status: to } });
    if (res.count === 0) throw Errors.conflict('CONCURRENT_UPDATE', 'Parcel was changed by someone else, reload');
    await tx.parcelStatusHistory.create({
      data: { parcelId: p.id, fromStatus: p.status, toStatus: to, branchId: user.branchId, userId: user.id, note },
    });
    const updated = await tx.parcel.findUniqueOrThrow({ where: { id: p.id }, include });
    if (to === 'ARRIVED') {
      await this.notifications.enqueue(tx, updated.receiverPhone, 'PARCEL_ARRIVED', { code: updated.trackingCode, to: updated.toBranch.name, cod: this.codLine(updated) }, updated.id);
    } else if (to === 'DELIVERED') {
      await this.notifications.enqueue(tx, updated.senderPhone, 'PARCEL_DELIVERED', { code: updated.trackingCode, receiver: updated.receiverName }, updated.id);
    }
    return strip(updated);
  }

  /** from = laanta diraysa, to = laanta qaadanaysa, any = midkood. Manager-ka MISSING/DAMAGED kaliya. */
  private assertSide(user: AuthUser, p: { fromBranchId: string; toBranchId: string }, side: 'from' | 'to' | 'any') {
    if (isSuperAdmin(user)) return;
    if (user.role === Role.DRIVER) throw Errors.forbidden();
    const ok =
      side === 'from' ? user.branchId === p.fromBranchId
      : side === 'to' ? user.branchId === p.toBranchId
      : user.branchId === p.fromBranchId || user.branchId === p.toBranchId;
    if (!ok) throw Errors.forbiddenBranch();
  }

  /** Khidmadda kaydka: maalmaha ka dib `uncollectedDays` (BUSINESS_RULES §4.4). */
  private async storageFee(p: { arrivedAt: Date | null; status: ParcelStatus }, db: Tx | PrismaService = this.prisma) {
    if (!p.arrivedAt || p.status === 'DELIVERED') return { days: 0, cents: 0 };
    const s = await this.settings.get(db);
    const days = Math.max(0, Math.floor((Date.now() - p.arrivedAt.getTime()) / DAY_MS) - s.uncollectedDays);
    return { days, cents: days * s.storageFeePerDayCents };
  }
}
