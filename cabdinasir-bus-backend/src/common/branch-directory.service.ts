import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface BranchInfo {
  id: string;
  code: string;
  city: string;
}

const TTL_MS = 30_000;

/**
 * Laamaha iyo magaalooyinkooda (cache yar). Boorama waxay leedahay 2 laamood:
 * laamaha isku magaalada ah waxay WADAAGAAN safarada (iib tigidh, rar alaab, seat map)
 * marka `shareTripsWithinCity = 1` (default). Lacagta/alaabta mid kasta waa laanteeda gaarka ah.
 */
@Injectable()
export class BranchDirectory implements OnModuleInit {
  private byId = new Map<string, BranchInfo>();
  private share = true;
  private loadedAt = 0;
  private loading: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refresh();
  }

  /** Hubi in xogtu cusub tahay oo laamahan la yaqaan (haddii kale dib u soo rar). */
  async ensure(...ids: (string | null | undefined)[]) {
    const missing = ids.some((id) => id && !this.byId.has(id));
    if (missing || Date.now() - this.loadedAt > TTL_MS) await this.refresh();
  }

  invalidate() {
    this.loadedAt = 0;
  }

  refresh(): Promise<void> {
    this.loading ??= (async () => {
      try {
        const [branches, setting] = await Promise.all([
          this.prisma.branch.findMany({ select: { id: true, code: true, city: true } }),
          this.prisma.pricingSetting.findUnique({ where: { key: 'shareTripsWithinCity' } }),
        ]);
        this.byId = new Map(branches.map((b) => [b.id, { ...b, city: b.city.trim().toLowerCase() }]));
        this.share = setting?.value === undefined || setting.value === null ? true : Number(setting.value) !== 0;
        this.loadedAt = Date.now();
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  city(id: string | null | undefined): string | null {
    return id ? (this.byId.get(id)?.city ?? null) : null;
  }

  /** Isku magaalo (laamaha wadaaga) — `a === b` mar walba waa run. */
  sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
    if (!a || !b) return false;
    if (a === b) return true;
    if (!this.share) return false;
    const ca = this.city(a);
    return !!ca && ca === this.city(b);
  }

  /** Laamaha la wadaaga safarada (ay ku jirto laanta laftigeeda). */
  mates(id: string | null | undefined): string[] {
    if (!id) return [];
    if (!this.share) return [id];
    const c = this.city(id);
    if (!c) return [id];
    return [...this.byId.values()].filter((b) => b.city === c).map((b) => b.id);
  }

  /** Magaalooyin kala duwan? (route / alaab isku magaalo lama oggola) */
  differentCities(a: string, b: string): boolean {
    const ca = this.city(a);
    const cb = this.city(b);
    return a !== b && !(ca && cb && ca === cb);
  }
}

@Global()
@Module({ providers: [BranchDirectory], exports: [BranchDirectory] })
export class BranchDirectoryModule {}
