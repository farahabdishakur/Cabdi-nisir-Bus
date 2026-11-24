import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, MANAGERS, Roles } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { branchFilter } from '../common/branch-scope';
import { PageQuery, pageArgs, paged } from '../common/pagination';

class AuditQuery extends PageQuery {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() entity?: string;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsString() userId?: string;
}

@ApiTags('audit')
@ApiBearerAuth()
@Roles(...MANAGERS)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() q: AuditQuery) {
    const where = {
      branchId: branchFilter(user, q.branchId),
      entity: q.entity,
      entityId: q.entityId,
      userId: q.userId,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paged(data, total, q);
  }
}
