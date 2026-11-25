'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { getAccessToken, refreshSession } from './api';

/**
 * Live updates (SSE `GET /events`): seat map, alaabta imanaysa, codsiyada void, sanduuqyada.
 * fetch-event-source → Authorization header (token-ka URL-ka laguma rido). Xiriirku go'o → dib u xiriir.
 * Event kasta → queries-ka khuseeya waa la cusboonaysiiyaa (refresh la'aan).
 */
export function useLiveEvents(enabled: boolean) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    let stopped = false;

    const run = async () => {
      while (!stopped) {
        try {
          await fetchEventSource('/api/v1/events', {
            signal: ctrl.signal,
            headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
            openWhenHidden: true,
            async onopen(res) {
              if (res.status === 401) {
                await refreshSession();
                throw new Error('retry');
              }
              if (!res.ok) throw new Error(`SSE ${res.status}`);
              setConnected(true);
            },
            onmessage(ev) {
              let data: Record<string, unknown> = {};
              try {
                data = ev.data ? JSON.parse(ev.data) : {};
              } catch {
                /* ignore */
              }
              switch (ev.event) {
                case 'SEAT_CHANGED':
                case 'TRIP_STATUS':
                  qc.invalidateQueries({ queryKey: ['trips'] });
                  if (data.tripId) qc.invalidateQueries({ queryKey: ['trip', data.tripId] });
                  if (data.targetTripId) qc.invalidateQueries({ queryKey: ['trip', data.targetTripId] });
                  if (data.previousTripId) qc.invalidateQueries({ queryKey: ['trip', data.previousTripId] });
                  qc.invalidateQueries({ queryKey: ['bookings'] });
                  break;
                case 'PARCEL_CHANGED':
                  qc.invalidateQueries({ queryKey: ['parcels'] });
                  break;
                case 'VOID_REQUEST':
                  qc.invalidateQueries({ queryKey: ['void-requests'] });
                  break;
                case 'CASH_SESSION':
                  qc.invalidateQueries({ queryKey: ['cash'] });
                  break;
              }
            },
            onclose() {
              setConnected(false);
              throw new Error('closed'); // dib u xiriir
            },
            onerror(err) {
              setConnected(false);
              throw err; // loop-ka sare ayaa maamula sugitaanka
            },
          });
        } catch {
          setConnected(false);
          if (stopped) return;
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    };
    void run();
    return () => {
      stopped = true;
      ctrl.abort();
    };
  }, [enabled, qc]);

  return connected;
}
