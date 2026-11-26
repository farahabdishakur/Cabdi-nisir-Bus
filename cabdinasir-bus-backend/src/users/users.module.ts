import { Body, Controller, Get, HttpCode, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { STRONG_PASSWORD, STRONG_PASSWORD_MSG } from '../auth/auth.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, MANAGERS, Roles } from '../common/decorators';
import { AuthUser, isSuperAdmin } from '../common/auth-user';
import { assertBranch, branchFilter } from '../common/branch-scope';
import { Errors } from '../common/errors';
import { blockData } from '../common/block';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';

export class CreateUserDto {
  @IsString() @Length(2, 80) name: string;
  @IsString() @Length(6, 20) phone: string;
  @IsString() @Matches(STRONG_PASSWORD, { message: STRONG_PASSWORD_MSG }) password: string;
  @IsEnum(Role) role: Role;
  @IsOptional() @IsUUID() branchId?: string;
}
export class UpdateUserDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** Sababta xannibaadda (waajib marka isActive=false) */
  @IsOptional() @IsString() @Length(3, 200) blockReason?: string;
}
export class ResetPasswordDto {
  @IsString() @Matches(STRONG_PASSWORD, { message: STRONG_PASSWORD_MSG }) password: string;
}
class UserQuery {
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
}

/** Branch Manager wuxuu abuuri karaa CASHIER iyo DRIVER laantiisa oo keliya. */
const MANAGER_CAN_CREATE: Role[] = [Role.CASHIER, Role.DRIVER];

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService) {}

  list(user: AuthUser, q: UserQuery) {
    return this.prisma.user
      .findMany({ where: { branchId: branchFilter(user, q.branchId), role: q.role }, include: { branch: true }, orderBy: { name: 'asc' } })
      .then((rows) => rows.map((u) => AuthService.publicUser(u)));
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    this.checkRoleBranch(actor, dto.role, dto.branchId);
    const u = await this.prisma.user.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        role: dto.role,
        branchId: dto.role === Role.SUPER_ADMIN ? null : dto.branchId!,
        passwordHash: await AuthService.hashPassword(dto.password),
        mustChangePassword: true,
      },
    });
    return AuthService.publicUser(u);
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const target = await this.load(actor, id);
    const role = dto.role ?? target.role;
    const branchId = dto.branchId ?? target.branchId ?? undefined;
    if (dto.role || dto.branchId) this.checkRoleBranch(actor, role, branchId);
    if (target.id === actor.id && dto.isActive === false) throw Errors.bad('CANNOT_DEACTIVATE_SELF', 'You cannot deactivate yourself');
    const u = await this.prisma.user.update({
      where: { id },
      data: { name: dto.name, ...blockData(dto), role, branchId: role === Role.SUPER_ADMIN ? null : branchId },
    });
    if (dto.isActive === false || dto.role || dto.branchId) await this.auth.revokeAll(id);
    return AuthService.publicUser(u);
  }

  async resetPassword(actor: AuthUser, id: string, password: string) {
    await this.load(actor, id);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await AuthService.hashPassword(password), mustChangePassword: true, failedLogins: 0, lockedUntil: null },
    });
    await this.auth.revokeAll(id);
  }

  private async load(actor: AuthUser, id: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw Errors.notFound('User', id);
    if (!isSuperAdmin(actor)) {
      assertBranch(actor, target.branchId);
      if (!MANAGER_CAN_CREATE.includes(target.role) && target.id !== actor.id) {
        throw Errors.forbidden('Managers can only manage cashiers and drivers');
      }
    }
    return target;
  }

  private checkRoleBranch(actor: AuthUser, role: Role, branchId?: string) {
    if (role !== Role.SUPER_ADMIN && !branchId) throw Errors.bad('BRANCH_REQUIRED', 'Branch staff must have a branch');
    if (isSuperAdmin(actor)) return;
    if (!MANAGER_CAN_CREATE.includes(role)) throw Errors.forbidden('Managers can only create cashiers and drivers');
    assertBranch(actor, branchId);
  }
}

@ApiTags('users')
@ApiBearerAuth()
@Roles(...MANAGERS)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: UserQuery) {
    return this.users.list(user, q);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(user, id, dto);
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  async reset(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ResetPasswordDto) {
    await this.users.resetPassword(user, id, dto.password);
  }
}

@Module({ imports: [AuthModule], controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
