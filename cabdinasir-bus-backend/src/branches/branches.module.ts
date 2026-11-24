import { Body, Controller, Get, Module, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators';

export class CreateBranchDto {
  /** 3 xaraf waaweyn: BOR, WAJ … — rasiidyada ayuu ka muuqdaa */
  @Matches(/^[A-Z]{3}$/) code: string;
  @IsString() @Length(2, 60) name: string;
  @IsString() @Length(2, 60) city: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) phones?: string[];
}
export class UpdateBranchDto extends PartialType(CreateBranchDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('branches')
@ApiBearerAuth()
@Controller('branches')
export class BranchesController {
  constructor(private readonly prisma: PrismaService) {}

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
  create(@Body() dto: CreateBranchDto) {
    return this.prisma.branch.create({ data: { ...dto, phones: dto.phones ?? [] } });
  }

  @Roles(Role.SUPER_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.prisma.branch.update({ where: { id }, data: dto });
  }
}

@Module({ controllers: [BranchesController] })
export class BranchesModule {}
