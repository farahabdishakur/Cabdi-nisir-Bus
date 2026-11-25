import { Injectable } from '@nestjs/common';
import { filter, interval, map, merge, Observable, Subject } from 'rxjs';
import { AuthUser, isSuperAdmin } from '../common/auth-user';
import { BranchDirectory } from '../common/branch-directory.service';

export type AppEventType =
  | 'SEAT_CHANGED' // tigidh la iibiyay / void / transfer / hold → seat map cusboonaysii
  | 'TRIP_STATUS'
  | 'PARCEL_CHANGED' // alaab cusub / status → "alaabta imanaysa" cusboonaysii
  | 'VOID_REQUEST' // manager-ka ogeysii
  | 'CASH_SESSION' // sanduuq la xiray → manager ansixi
  | 'DISPATCH'; // safka gaadiidka isbeddelay

export interface AppEvent {
  type: AppEventType;
  /** Laamaha khuseeya — kaliya shaqaalaha laamahan (iyo Super Admin) ayaa helaya */
  branchIds: string[];
  data: Record<string, unknown>;
}

/**
 * Live updates (SSE). Hal server = in-memory bus. Haddii mustaqbalka server badan la isticmaalo,
 * kaliya halkan ayaa loo beddelayaa Postgres LISTEN/NOTIFY ama Redis pub/sub.
 * Xog shakhsi ah (magac, taleefan) lama diro — kaliya id + status; website-ku wuu soo akhriyaa.
 */
@Injectable()
export class EventsService {
  private readonly bus = new Subject<AppEvent>();

  constructor(private readonly dir: BranchDirectory) {}

  publish(type: AppEventType, branchIds: (string | null | undefined)[], data: Record<string, unknown>) {
    let ids = branchIds.filter((b): b is string => !!b);
    // Safarada waa la wadaagaa magaalada dhexdeeda → seat map-ka laamaha walaalaha ah sidoo kale
    if (type === 'SEAT_CHANGED' || type === 'TRIP_STATUS') ids = ids.flatMap((b) => this.dir.mates(b));
    this.bus.next({ type, branchIds: [...new Set(ids)], data });
  }

  stream(user: AuthUser): Observable<{ type: string; data: object }> {
    const events = this.bus.pipe(
      filter((e) => isSuperAdmin(user) || (!!user.branchId && e.branchIds.includes(user.branchId))),
      map((e) => ({ type: e.type, data: e.data })),
    );
    // heartbeat: proxies/routers ma xiraan xiriirka
    const ping = interval(25_000).pipe(map(() => ({ type: 'PING', data: { t: Date.now() } })));
    return merge(events, ping);
  }
}
