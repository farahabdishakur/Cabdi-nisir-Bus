import { Injectable } from '@nestjs/common';
import { ClaimStatus, MediaKind, MediaStage, ParcelStatus, Prisma, Role } from '@prisma/client';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, open, rename, unlink } from 'fs/promises';
import { join, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, isSuperAdmin } from '../common/auth-user';
import { Errors } from '../common/errors';
import { nextNumber } from '../common/sequences';
import { normalizePhone } from '../common/phone';
import { pageArgs, paged } from '../common/pagination';
import { formatUsd } from '../common/money';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ClaimQuery, OpenClaimDto, ResolveClaimDto } from './evidence.dto';

/** Noocyada la oggol yahay + calaamadda bilowga file-ka (magic bytes) — mimetype-ka client-ka keliya laguma kalsoonaan karo. */
const TYPES: Record<string, { ext: string; kind: MediaKind; sniff: (b: Buffer) => boolean }> = {
  'image/jpeg': { ext: 'jpg', kind: 'PHOTO', sniff: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', kind: 'PHOTO', sniff: (b) => b.subarray(0, 4).toString('hex') === '89504e47' },
  'image/webp': { ext: 'webp', kind: 'PHOTO', sniff: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  'video/mp4': { ext: 'mp4', kind: 'VIDEO', sniff: (b) => b.subarray(4, 8).toString() === 'ftyp' },
  'video/quicktime': { ext: 'mov', kind: 'VIDEO', sniff: (b) => b.subarray(4, 8).toString() === 'ftyp' || b.subarray(4, 8).toString() === 'moov' },
  'video/3gpp': { ext: '3gp', kind: 'VIDEO', sniff: (b) => b.subarray(4, 8).toString() === 'ftyp' },
  'video/webm': { ext: 'webm', kind: 'VIDEO', sniff: (b) => b.subarray(0, 4).toString('hex') === '1a45dfa3' },
};
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = Number(process.env.MEDIA_MAX_VIDEO_MB ?? 40) * 1024 * 1024;

/** Marxaladda caadiga ah ee xaaladda alaabta */
const STAGE_FOR: Partial<Record<ParcelStatus, MediaStage>> = {
  REGISTERED: 'REGISTER', LOADED: 'LOAD', IN_TRANSIT: 'LOAD', ARRIVED: 'ARRIVE', DELIVERED: 'DELIVER', DAMAGED: 'DAMAGE', MISSING: 'OTHER',
};

const DECISION_SO: Record<'ACCEPTED' | 'REJECTED', string> = { ACCEPTED: 'waa la aqbalay', REJECTED: 'waa la diiday' };

@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private get uploadDir() {
    return resolve(process.env.UPLOAD_DIR ?? './uploads');
  }

  /** Laanta diraha ama qaataha (ama Super Admin) kaliya; darawal maya. */
  private assertParcelAccess(user: AuthUser, p: { fromBranchId: string; toBranchId: string }) {
    if (isSuperAdmin(user)) return;
    if (user.role === Role.DRIVER) throw Errors.forbidden();
    if (user.branchId !== p.fromBranchId && user.branchId !== p.toBranchId) throw Errors.forbiddenBranch();
  }

  private async parcelFor(user: AuthUser, id: string) {
    const p = await this.prisma.parcel.findUnique({ where: { id }, select: { id: true, trackingCode: true, status: true, fromBranchId: true, toBranchId: true, senderPhone: true, receiverPhone: true } });
    if (!p) throw Errors.notFound('Parcel', id);
    this.assertParcelAccess(user, p);
    return p;
  }

  // ------------------------------------------------------------------ media

  async addMedia(user: AuthUser, parcelId: string, file: { path: string; mimetype: string; size: number } | undefined, opts: { stage?: MediaStage; note?: string; claimId?: string }) {
    if (!file) throw Errors.bad('FILE_REQUIRED', 'Upload a photo or video in field "file"');
    try {
      return await this.storeMedia(user, parcelId, file, opts);
    } finally {
      await unlink(file.path).catch(() => undefined); // faylka ku-meel-gaarka ah (haddii la guuriyay, ma jiro)
    }
  }

  private async storeMedia(user: AuthUser, parcelId: string, file: { path: string; mimetype: string; size: number }, opts: { stage?: MediaStage; note?: string; claimId?: string }) {
    const type = TYPES[file.mimetype];
    const head = Buffer.alloc(16);
    const fh = await open(file.path, 'r');
    await fh.read(head, 0, 16, 0).finally(() => fh.close());
    if (!type || !type.sniff(head)) throw Errors.bad('INVALID_FILE_TYPE', 'Only JPEG/PNG/WEBP photos or MP4/MOV/3GP/WEBM videos are allowed');
    if (file.size > (type.kind === 'PHOTO' ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES)) {
      throw Errors.bad('FILE_TOO_LARGE', 'File is too large', { maxBytes: type.kind === 'PHOTO' ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES });
    }
    const p = await this.parcelFor(user, parcelId);
    if (p.status === 'VOIDED') throw Errors.invalidState('Parcel', p.status, 'MEDIA');
    if (opts.claimId) {
      const c = await this.prisma.parcelClaim.findUnique({ where: { id: opts.claimId } });
      if (!c || c.parcelId !== p.id) throw Errors.notFound('Claim', opts.claimId);
    }
    const stage: MediaStage = opts.claimId ? 'CLAIM' : opts.stage ?? STAGE_FOR[p.status] ?? 'OTHER';
    this.assertStage(user, p, stage);
    const sha256 = await new Promise<string>((ok, fail) => {
      const h = createHash('sha256');
      createReadStream(file.path).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', fail);
    });
    const dir = join(this.uploadDir, 'evidence', p.id);
    await mkdir(dir, { recursive: true });
    const name = `${Date.now()}-${stage.toLowerCase()}-${sha256.slice(0, 12)}.${type.ext}`;
    await rename(file.path, join(dir, name));
    const media = await this.prisma.parcelMedia.create({
      data: {
        parcelId: p.id, stage, kind: type.kind, mimeType: file.mimetype, path: `evidence/${p.id}/${name}`, sizeBytes: file.size, sha256,
        note: opts.note?.trim() || null, branchId: user.branchId, takenById: user.id, claimId: opts.claimId ?? null,
      },
    });
    await this.audit.log(this.prisma, user, 'ADD_MEDIA', 'parcels', p.id, null, { mediaId: media.id, stage, kind: type.kind, sha256 });
    return media;
  }

  /**
   * Marxaladda waa inay la jaanqaadaa xaaladda alaabta + laanta: sawir "dhiibid" ah lama soo gelin karo
   * markii la diiwaangelinayay, sawir "diiwaangelin" ahna lama soo gelin karo kadib (caddayn been ah).
   */
  private assertStage(user: AuthUser, p: { status: ParcelStatus; fromBranchId: string; toBranchId: string }, stage: MediaStage) {
    const rule: Partial<Record<MediaStage, { statuses: ParcelStatus[]; side: 'from' | 'to' }>> = {
      REGISTER: { statuses: ['REGISTERED'], side: 'from' },
      LOAD: { statuses: ['REGISTERED', 'LOADED', 'IN_TRANSIT'], side: 'from' },
      ARRIVE: { statuses: ['ARRIVED', 'DAMAGED', 'MISSING'], side: 'to' },
      DELIVER: { statuses: ['ARRIVED', 'DAMAGED', 'DELIVERED'], side: 'to' },
    };
    const r = rule[stage];
    if (!r) return; // DAMAGE / CLAIM / OTHER: marxalad kasta
    const sideOk = isSuperAdmin(user) || user.branchId === (r.side === 'from' ? p.fromBranchId : p.toBranchId);
    if (!r.statuses.includes(p.status) || !sideOk) throw Errors.bad('INVALID_STAGE', `Stage ${stage} is not allowed while the parcel is ${p.status}`, { stage, status: p.status });
  }

  async listMedia(user: AuthUser, parcelId: string) {
    await this.parcelFor(user, parcelId);
    return this.mediaWithNames(await this.prisma.parcelMedia.findMany({ where: { parcelId }, orderBy: { createdAt: 'asc' } }));
  }

  private async mediaWithNames<T extends { takenById: string; branchId: string | null }>(rows: T[]) {
    const [users, branches] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.takenById))] } }, select: { id: true, name: true } }),
      this.prisma.branch.findMany({ select: { id: true, code: true } }),
    ]);
    return rows.map((r) => ({ ...r, takenBy: users.find((u) => u.id === r.takenById)?.name ?? null, branchCode: branches.find((b) => b.id === r.branchId)?.code ?? null }));
  }

  async mediaFile(user: AuthUser, mediaId: string) {
    const m = await this.prisma.parcelMedia.findUnique({ where: { id: mediaId }, include: { parcel: { select: { fromBranchId: true, toBranchId: true } } } });
    if (!m) throw Errors.notFound('Media', mediaId);
    this.assertParcelAccess(user, m.parcel);
    return { path: resolve(this.uploadDir, m.path), mimeType: m.mimeType };
  }

  /** Dejinta: alaabta waa in sawir laga qaadaa marka la dhiibayo (deliver) */
  async hasDeliveryMedia(parcelId: string, after?: Date | null) {
    return (await this.prisma.parcelMedia.count({ where: { parcelId, stage: 'DELIVER', ...(after && { createdAt: { gte: after } }) } })) > 0;
  }

  // ------------------------------------------------------------------ claims

  async openClaim(user: AuthUser, parcelId: string, dto: OpenClaimDto) {
    const p = await this.parcelFor(user, parcelId);
    if (p.status === 'VOIDED') throw Errors.invalidState('Parcel', p.status, 'CLAIM');
    const branchId = user.branchId ?? p.toBranchId;
    const branch = await this.prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const claimNo = await nextNumber(tx, branch.id, branch.code, 'CLAIM');
        const claim = await tx.parcelClaim.create({
          data: {
            claimNo, parcelId: p.id, type: dto.type, description: dto.description.trim(), claimantName: dto.claimantName.trim(),
            claimantPhone: normalizePhone(dto.claimantPhone), claimedAmountCents: dto.claimedAmountCents ?? null, branchId, openedById: user.id,
          },
        });
        await this.notifications.enqueue(tx, claim.claimantPhone, 'CLAIM_OPENED', { claim: claimNo, code: p.trackingCode }, p.id);
        await this.audit.log(tx, user, 'OPEN_CLAIM', 'parcels', p.id, null, { claimId: claim.id, claimNo, type: dto.type });
        return claim;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw Errors.conflict('CLAIM_ALREADY_OPEN', 'This parcel already has an open claim');
      throw e;
    }
  }

  private claimScope(user: AuthUser): Prisma.ParcelClaimWhereInput {
    return isSuperAdmin(user) ? {} : { parcel: { OR: [{ fromBranchId: user.branchId! }, { toBranchId: user.branchId! }] } };
  }

  async listClaims(user: AuthUser, q: ClaimQuery) {
    const where: Prisma.ParcelClaimWhereInput = { ...this.claimScope(user), ...(q.status ? { status: q.status } : {}), ...(q.parcelId ? { parcelId: q.parcelId } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.parcelClaim.findMany({
        where, orderBy: { createdAt: 'desc' }, ...pageArgs(q),
        include: { parcel: { select: { id: true, trackingCode: true, status: true, senderName: true, receiverName: true, fromBranchId: true, toBranchId: true, feeCents: true, declaredValueCents: true } } },
      }),
      this.prisma.parcelClaim.count({ where }),
    ]);
    return paged(rows, total, q);
  }

  /**
   * Faylka go'aanka: cabashada + alaabta + caddaynta (sawir/video marxalad kasta) + taariikhda xaaladda.
   * `checks` = su'aalaha maamuluhu ku go'aamiyo (sawir markii la diiwaangeliyay? sawir markii la dhiibay? PIN?).
   */
  async claimFile(user: AuthUser, id: string) {
    const c = await this.prisma.parcelClaim.findFirst({
      where: { id, ...this.claimScope(user) },
      include: { parcel: { include: { category: true, fromBranch: true, toBranch: true, history: { orderBy: { createdAt: 'asc' } } } } },
    });
    if (!c) throw Errors.notFound('Claim', id);
    const media = await this.mediaWithNames(await this.prisma.parcelMedia.findMany({ where: { parcelId: c.parcelId }, orderBy: { createdAt: 'asc' } }));
    // Hubinta: caddaynta KA HOR cabashada kaliya (sawir la soo geliyay kadib cabashada go'aanka ma beddeli karo)
    const stages = new Set(media.filter((m) => m.createdAt <= c.createdAt).map((m) => m.stage));
    const p = c.parcel;
    const { pickupPinHash: _pin, ...parcel } = p;
    return {
      ...c,
      parcel,
      media,
      checks: {
        registerMedia: stages.has('REGISTER'),
        loadMedia: stages.has('LOAD'),
        arriveMedia: stages.has('ARRIVE'),
        deliverMedia: stages.has('DELIVER'),
        deliveredWithPin: p.status === 'DELIVERED' && !!p.deliveredAt,
        deliveredToName: p.deliveredToName,
        fragileDeclared: p.isFragile,
        declaredValueCents: p.declaredValueCents,
        claimAfterDeliveryHours: p.deliveredAt ? Math.round((c.createdAt.getTime() - p.deliveredAt.getTime()) / 3_600_000) : null,
      },
    };
  }

  async resolveClaim(user: AuthUser, id: string, dto: ResolveClaimDto) {
    const c = await this.prisma.parcelClaim.findFirst({ where: { id, ...this.claimScope(user) }, include: { parcel: { select: { trackingCode: true } } } });
    if (!c) throw Errors.notFound('Claim', id);
    if (dto.decision === 'REJECTED' && dto.compensationCents) throw Errors.bad('NO_COMPENSATION_ON_REJECT', 'A rejected claim has no compensation');
    return this.prisma.$transaction(async (tx) => {
      const done = await tx.parcelClaim.updateMany({
        where: { id, status: ClaimStatus.OPEN },
        data: { status: dto.decision, resolution: dto.resolution.trim(), compensationCents: dto.compensationCents ?? null, resolvedById: user.id, resolvedAt: new Date() },
      });
      if (done.count === 0) throw Errors.conflict('CLAIM_NOT_OPEN', 'Claim already resolved');
      const note = dto.decision === 'ACCEPTED' && dto.compensationCents ? `Magdhow: ${formatUsd(dto.compensationCents)}.` : '';
      await this.notifications.enqueue(tx, c.claimantPhone, 'CLAIM_RESOLVED', { claim: c.claimNo, code: c.parcel.trackingCode, decision: DECISION_SO[dto.decision], note }, c.parcelId);
      await this.audit.log(tx, user, 'RESOLVE_CLAIM', 'parcels', c.parcelId, { status: c.status }, { claimId: id, ...dto });
      return tx.parcelClaim.findUniqueOrThrow({ where: { id } });
    });
  }
}
