import { Body, Controller, Get, Module, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser, MANAGERS, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { IdempotencyKey } from '../common/idempotency';
import { toCsv } from '../common/csv';
import { LEDGER_IN_CATEGORIES, LEDGER_OUT_CATEGORIES, LedgerService } from './ledger.service';
import { BookQuery, LedgerEntryDto, VoidLedgerDto } from './ledger.dto';

const upload = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function csv(res: Response, name: string, rows: Record<string, unknown>[]) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
  return toCsv(rows);
}

@ApiTags('ledger')
@ApiBearerAuth()
@Roles(...MANAGERS)
@Controller()
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('ledger/categories')
  categories() {
    return { IN: LEDGER_IN_CATEGORIES, OUT: LEDGER_OUT_CATEGORIES };
  }

  /** Buugga laanta (si toos ah) — haraaga socda akoon kasta */
  @Get('ledger/branch')
  async branch(@CurrentUser() u: AuthUser, @Query() q: BookQuery, @Res({ passthrough: true }) res: Response) {
    const d = await this.ledger.branchBook(u, q);
    if (q.format !== 'csv') return d;
    return csv(res, `cashbook-${d.from}`, d.lines.map((l) => ({
      date: l.at.toISOString(), kind: l.kind, account: l.account, ref: l.ref ?? '', description: l.description ?? '', in: l.inAmount, out: l.outAmount, currency: l.currency, balance: l.balance,
    })));
  }

  /** Buugga xafiiska guud */
  @Roles(Role.SUPER_ADMIN)
  @Get('ledger/office')
  async office(@Query() q: BookQuery, @Res({ passthrough: true }) res: Response) {
    const d = await this.ledger.officeBook(q);
    if (q.format !== 'csv') return d;
    return csv(res, `office-book-${d.from}`, d.lines.map((l) => ({
      date: l.at.toISOString(), direction: l.direction, category: l.category, description: l.description, amount: l.amount, currency: l.currency, balance: l.balance ?? '', voided: l.voided,
    })));
  }

  @Roles(Role.SUPER_ADMIN)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @Post('ledger/entries')
  create(@CurrentUser() u: AuthUser, @Body() dto: LedgerEntryDto, @IdempotencyKey() key?: string) {
    return this.ledger.create(u, dto, key);
  }

  @Roles(Role.SUPER_ADMIN)
  @Post('ledger/entries/:id/void')
  void(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: VoidLedgerDto) {
    return this.ledger.void(u, id, dto.reason);
  }

  @Roles(Role.SUPER_ADMIN)
  @ApiConsumes('multipart/form-data')
  @Post('ledger/entries/:id/attachment')
  @UseInterceptors(upload)
  attachLedger(@CurrentUser() u: AuthUser, @Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.ledger.attach(u, 'ledger', id, file);
  }

  @Roles(Role.SUPER_ADMIN)
  @Get('ledger/entries/:id/attachment')
  async ledgerFile(@CurrentUser() u: AuthUser, @Param('id') id: string, @Res() res: Response) {
    res.sendFile(await this.ledger.attachmentPath(u, 'ledger', id));
  }

  /** Biilka kharashka (karraanigu wuu soo gelin karaa) */
  @Roles(...STAFF)
  @ApiConsumes('multipart/form-data')
  @Post('expenses/:id/attachment')
  @UseInterceptors(upload)
  attachExpense(@CurrentUser() u: AuthUser, @Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.ledger.attach(u, 'expense', id, file);
  }

  @Roles(...STAFF)
  @Get('expenses/:id/attachment')
  async expenseFile(@CurrentUser() u: AuthUser, @Param('id') id: string, @Res() res: Response) {
    res.sendFile(await this.ledger.attachmentPath(u, 'expense', id));
  }

  /** Faa'iido & khasaare (P&L) */
  @Get('reports/profit-loss')
  async pnl(@CurrentUser() u: AuthUser, @Query() q: BookQuery, @Res({ passthrough: true }) res: Response) {
    const d = await this.ledger.profitLoss(u, q);
    if (q.format !== 'csv') return d;
    return csv(res, `profit-loss-${d.from}`, [
      ...d.income.map((x) => ({ section: 'INCOME', item: x.key, usd: (x.usdCents / 100).toFixed(2) })),
      ...d.expenses.map((x) => ({ section: 'EXPENSE', item: x.key, usd: (-x.usdCents / 100).toFixed(2) })),
      { section: 'EXPENSE', item: 'DRIVER_PAY', usd: (-d.driverPayUsdCents / 100).toFixed(2) },
      { section: 'NET', item: 'NET_PROFIT', usd: (d.totals.netProfitUsdCents / 100).toFixed(2) },
    ]);
  }
}

@Module({ controllers: [LedgerController], providers: [LedgerService] })
export class LedgerModule {}
