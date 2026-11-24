import { Injectable } from '@nestjs/common';
import { filter, interval, map, merge, Observable, Subject } from 'rxjs';
import { AuthUser, isSuperAdmin } from '../common/auth-user';

export type AppEventType =
  | 'SEAT_CHANGED' // tigidh la iibiyay / void / transfer / hold → seat map cusboonaysii
  | 'TRIP_STATUS'
  | 'PARCEL_CHANGED' // alaab cusub / status → "alaabta imanaysa" cusboonaysii
  | 'VOID_REQUEST' // manager-ka ogeysii
  | 'CASH_SESSION'; // sanduuq la xiray → manager ansixi

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

  publish(type: AppEventType, branchIds: (string | null | undefined)[], data: Record<string, unknown>) {
    this.bus.next({ type, branchIds: [...new Set(branchIds.filter((b): b is string => !!b))], data });
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
