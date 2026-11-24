import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Roles, STAFF } from '../common/decorators';

class LookupQuery {
  @Matches(/^\+?[0-9 ]{6,20}$/) phone: string;
}

/**
 * Autofill: karraanigu marka uu taleefan qoro, magacyadii hore loo isticmaalay ayaa soo baxa.
 * Table gaar ah ma jiro — waxaa laga soo saaraa tigidhada iyo alaabta.
 */
@ApiTags('customers')
@ApiBearerAuth()
@Roles(...STAFF)
@Controller('customers')
export class CustomersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('lookup')
  async lookup(@Query() q: LookupQuery) {
    const phone = q.phone.replace(/\s/g, '');
    const rows = await this.prisma.$queryRaw<{ name: string; last_used: Date; times: bigint }[]>`
      SELECT name, MAX(at) AS last_used, COUNT(*)::bigint AS times FROM (
        SELECT "passengerName" AS name, "createdAt" AS at FROM "bookings" WHERE "passengerPhone" = ${phone}
        UNION ALL SELECT "senderName", "createdAt" FROM "parcels" WHERE "senderPhone" = ${phone}
        UNION ALL SELECT "receiverName", "createdAt" FROM "parcels" WHERE "receiverPhone" = ${phone}
      ) x GROUP BY name ORDER BY MAX(at) DESC LIMIT 5`;
    return { phone, names: rows.map((r) => ({ name: r.name, lastUsed: r.last_used, times: Number(r.times) })) };
  }
}

@Module({ controllers: [CustomersController] })
export class CustomersModule {}
