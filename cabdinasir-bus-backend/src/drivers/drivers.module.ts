import { Body, Controller, Get, Module, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { MANAGERS, Roles, STAFF } from '../common/decorators';

export class CreateDriverDto {
  @IsString() @Length(2, 80) name: string;
  @IsString() @Length(6, 20) phone: string;
  @IsOptional() @IsString() licenseNo?: string;
  /** User account (role DRIVER) si uu manifest-kiisa u arko — ikhtiyaari */
  @IsOptional() @IsUUID() userId?: string;
}
export class UpdateDriverDto extends PartialType(CreateDriverDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('drivers')
@ApiBearerAuth()
@Controller('drivers')
export class DriversController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles(...STAFF)
  @Get()
  list() {
    return this.prisma.driver.findMany({ orderBy: { name: 'asc' } });
  }

  @Roles(...MANAGERS)
  @Post()
  create(@Body() dto: CreateDriverDto) {
    return this.prisma.driver.create({ data: dto });
  }

  @Roles(...MANAGERS)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDriverDto) {
    return this.prisma.driver.update({ where: { id }, data: dto });
  }
}

@Module({ controllers: [DriversController] })
export class DriversModule {}
