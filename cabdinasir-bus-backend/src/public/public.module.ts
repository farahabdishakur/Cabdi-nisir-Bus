import { Controller, Get, Module, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, Matches } from 'class-validator';
import { businessDate, businessDayRange } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators';
import { Errors } from '../common/errors';

class TrackQuery {
  /** 4-ta god ee ugu dambeeya taleefanka qaataha ama diraha */
  @Matches(/^\d{4}$/) phone: string;
}

/**
 * Bogga dadweynaha: raadinta alaabta (Phase 3 website) — login la'aan.
 * Magac / taleefan lama muujiyo; waxaa loo baahan yahay koodhka + 4 god oo taleefan ah.
 */
class TripsQuery {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @Matches(/^[A-Z0-9]{3}$/) from?: string;
  @IsOptional() @Matches(/^[A-Z0-9]{3}$/) to?: string;
}

@ApiTags('public')
@Public()
@Controller('public')
export class PublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('track/:code')
  async track(@Param('code') code: string, @Query() q: TrackQuery) {
    const p = await this.prisma.parcel.findUnique({
      where: { trackingCode: code.toUpperCase() },
      include: { fromBranch: true, toBranch: true, history: { orderBy: { createdAt: 'asc' } } },
    });
    const ok = p && (p.receiverPhone.endsWith(q.phone) || p.senderPhone.endsWith(q.phone));
    if (!p || !ok) throw Errors.notFound('Parcel', code); // isku jawaab — koodh sax ah lama ogaan karo
    const branches = new Map([[p.fromBranchId, p.fromBranch.name], [p.toBranchId, p.toBranch.name]]);
    return {
      trackingCode: p.trackingCode,
      status: p.status,
      from: p.fromBranch.name,
      to: p.toBranch.name,
      pieces: p.pieces,
      registeredAt: p.offlineCreatedAt ?? p.createdAt,
      arrivedAt: p.arrivedAt,
      deliveredAt: p.deliveredAt,
      amountDueCents: p.payer === 'RECEIVER' && !p.paidAt ? p.feeCents : 0,
      history: p.history.map((h) => ({ status: h.toStatus, at: h.createdAt, branch: h.branchId ? branches.get(h.branchId) ?? null : null })),
    };
  }

  /** Jadwalka safarada + kuraasta bannaan (macmiilku wuu arkaa ka hor intuu iman) */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('trips')
  async trips(@Query() q: TripsQuery) {
    const { start, end } = businessDayRange(q.date ?? businessDate());
    const trips = await this.prisma.trip.findMany({
      where: {
        departureAt: { gte: start, lt: end },
        status: { in: ['SCHEDULED', 'BOARDING'] },
        route: { fromBranch: q.from ? { code: q.from } : undefined, toBranch: q.to ? { code: q.to } : undefined },
      },
      include: {
        route: { include: { fromBranch: true, toBranch: true } },
        vehicle: { select: { capacity: true } },
        _count: { select: { bookings: { where: { status: { not: 'VOIDED' } } } } },
      },
      orderBy: { departureAt: 'asc' },
    });
    return trips.map((t) => ({
      departureAt: t.departureAt,
      from: t.route.fromBranch.name,
      to: t.route.toBranch.name,
      priceCents: t.route.ticketPriceCents,
      seatsAvailable: Math.max(0, t.vehicle.capacity - t._count.bookings),
      status: t.status,
    }));
  }

  /** Laamaha iyo taleefannada (bogga xiriirka) */
  @Get('branches')
  branches() {
    return this.prisma.branch.findMany({ where: { isActive: true }, select: { code: true, name: true, city: true, phones: true }, orderBy: { name: 'asc' } });
  }
}

@Module({ controllers: [PublicController] })
export class PublicModule {}
