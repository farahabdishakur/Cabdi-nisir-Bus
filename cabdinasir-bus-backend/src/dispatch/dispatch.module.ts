import { Body, Controller, Get, Global, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Length, Matches, ValidateNested } from 'class-validator';
import { CurrentUser, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { DispatchService } from './dispatch.service';

class RosterItemDto {
  @IsUUID() vehicleId: string;
  @IsUUID() driverId: string;
}
export class EnqueueDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => RosterItemDto) items: RosterItemDto[];
  @IsOptional() @IsString() @Length(0, 200) note?: string;
}
class MoveDto {
  @IsIn(['up', 'down']) direction: 'up' | 'down';
}
class RemoveDto {
  @IsString() @Length(3, 200) reason: string;
}
class BoardQuery {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
}

@ApiTags('dispatch')
@ApiBearerAuth()
@Roles(...STAFF)
@Controller('dispatch')
export class DispatchController {
  constructor(private readonly svc: DispatchService) {}

  /** Dhammaan wadooyinka: gaariga hadda buuxsamaya + inta sugaysa (laan kasta way aragtaa) */
  @Get()
  overview(@Query() q: BoardQuery) {
    return this.svc.overview(q.date);
  }

  /** Gaadiidka diyaarka ah (aan saf ku jirin) — talo kala horreyn cadaalad ah */
  @Get('candidates')
  candidates() {
    return this.svc.candidates();
  }

  @Get(':routeId')
  board(@Param('routeId') routeId: string, @Query() q: BoardQuery) {
    return this.svc.board(routeId, q.date);
  }

  /** Bilow maalinta / ku dar gaadiid safka (kala horreynta liiska) — maamule */
  @Post(':routeId/enqueue')
  enqueue(@CurrentUser() u: AuthUser, @Param('routeId') routeId: string, @Body() dto: EnqueueDto) {
    return this.svc.enqueue(u, routeId, dto.items, dto.note);
  }

  @Post('entries/:id/move')
  move(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: MoveDto) {
    return this.svc.move(u, id, dto.direction);
  }

  @Post('entries/:id/remove')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: RemoveDto) {
    return this.svc.remove(u, id, dto.reason);
  }
}

@Global()
@Module({ controllers: [DispatchController], providers: [DispatchService], exports: [DispatchService] })
export class DispatchModule {}
