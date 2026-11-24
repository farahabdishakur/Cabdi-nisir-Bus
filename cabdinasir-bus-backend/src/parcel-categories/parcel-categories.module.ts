import { Body, Controller, Get, Module, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, PartialType } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators';

export class CreateCategoryDto {
  @IsString() @Length(2, 60) nameSo: string;
  @IsString() @Length(2, 60) nameEn: string;
  @IsInt() @Min(0) baseFeeCents: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) perKgMultiplier?: number;
  /** Alaab khatar ah — nidaamku wuu diidaa (Shuruudda #4) */
  @IsOptional() @IsBoolean() isProhibited?: boolean;
}
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('parcel-categories')
@ApiBearerAuth()
@Controller('parcel-categories')
export class ParcelCategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.parcelCategory.findMany({ orderBy: { nameSo: 'asc' } });
  }

  @Roles(Role.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.prisma.parcelCategory.create({ data: dto });
  }

  @Roles(Role.SUPER_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.prisma.parcelCategory.update({ where: { id }, data: dto });
  }
}

@Module({ controllers: [ParcelCategoriesController] })
export class ParcelCategoriesModule {}
