import { Body, Controller, Get, Module, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser, MANAGERS, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { EvidenceService, MAX_VIDEO_BYTES } from './evidence.service';
import { ClaimQuery, MediaUploadDto, OpenClaimDto, ResolveClaimDto } from './evidence.dto';

const upload = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_VIDEO_BYTES, files: 1 } });

@ApiTags('evidence')
@ApiBearerAuth()
@Roles(...STAFF)
@Controller()
export class EvidenceController {
  constructor(private readonly svc: EvidenceService) {}

  /** Sawir/video caddayn ah (marxaladda: diiwaangelin, rar, gaadhay, dhiibid, dhaawac, cabasho) */
  @ApiConsumes('multipart/form-data')
  @Post('parcels/:id/media')
  @UseInterceptors(upload)
  add(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: MediaUploadDto, @UploadedFile() file?: Express.Multer.File) {
    return this.svc.addMedia(u, id, file, dto);
  }

  @Get('parcels/:id/media')
  list(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.listMedia(u, id);
  }

  /** File-ka (video: Range waa la taageeraa) */
  @Get('media/:id')
  async file(@CurrentUser() u: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const f = await this.svc.mediaFile(u, id);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(f.mimeType);
    res.sendFile(f.path);
  }

  @Post('parcels/:id/claims')
  open(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: OpenClaimDto) {
    return this.svc.openClaim(u, id, dto);
  }

  @Get('claims')
  claims(@CurrentUser() u: AuthUser, @Query() q: ClaimQuery) {
    return this.svc.listClaims(u, q);
  }

  @Get('claims/:id')
  claim(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.claimFile(u, id);
  }

  @Roles(...MANAGERS)
  @Post('claims/:id/resolve')
  resolve(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ResolveClaimDto) {
    return this.svc.resolveClaim(u, id, dto);
  }
}

@Module({ controllers: [EvidenceController], providers: [EvidenceService], exports: [EvidenceService] })
export class EvidenceModule {}
