import { Body, Controller, Get, Module, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators';
import { BranchDirectory } from '../common/branch-directory.service';

export class CreateBranchDto {
  /** 3 xaraf/god: BO1, BO2, WAJ … — rasiidyada ayuu ka muuqdaa */
  @Matches(/^[A-Z][A-Z0-9]{2}$/) code: string;
  @IsString() @Length(2, 60) name: string;
  @IsString() @Length(2, 60) city: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) phones?: string[];
  /** Lambarka Zaad / eDahab ee laanta — meesha macmiilku lacagta u soo diro */
  @IsOptional() @Matches(/^\+?[0-9 ]{6,20}$/) zaadNumber?: string;
  @IsOptional() @Matches(/^\+?[0-9 ]{6,20}$/) edahabNumber?: string;
}
export class UpdateBranchDto extends PartialType(CreateBranchDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('branches')
@ApiBearerAuth()
@Controller('branches')
export class BranchesController {
  constructor(private readonly prisma: PrismaService, private readonly dir: BranchDirectory) {}

  /** Dhammaan shaqaaluhu way arki karaan (laanta loo dirayo ayay dooranayaan). */
  @Get()
  list() {
    return this.prisma.branch.findMany({ orderBy: { name: 'asc' } });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.prisma.branch.findUniqueOrThrow({ where: { id } });
  }

  @Roles(Role.SUPER_ADMIN)
  @Post()
  async create(@Body() dto: CreateBranchDto) {
    const b = await this.prisma.branch.create({ data: { ...dto, phones: dto.phones ?? [] } });
    this.dir.invalidate();
    return b;
  }

  @Roles(Role.SUPER_ADMIN)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    const b = await this.prisma.branch.update({ where: { id }, data: dto });
    this.dir.invalidate();
    return b;
  }
}

@Module({ controllers: [BranchesController] })
export class BranchesModule {}
