import { attachmentsOfTrip, getManualOffline, offlineStatus, storedBlobIds, wantedOffline } from '../data/offline';
import type { Trip } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { todayLocal } from '../domain/agenda';

export interface TripOffline {
  wanted: boolean;
  manual: boolean | undefined;
  total: number;
  missing: number;
  pendingUpload: number;
}

export function useTripOffline(trip: Trip | undefined): TripOffline | undefined {
  return useLiveQuery(async () => {
    if (!trip) {
      return undefined;
    }
    const manual = await getManualOffline(trip.id);
    const status = offlineStatus(await attachmentsOfTrip(trip.id), await storedBlobIds());
    return { wanted: wantedOffline(trip, todayLocal(), manual), manual, ...status };
  }, [trip?.id, trip?.startDate, trip?.endDate]);
}

export function OfflineBadge({ state }: { state: TripOffline | undefined }) {
  if (!state) {
    return null;
  }
  if (state.total === 0) {
    return <span className="badge">Sin adjuntos</span>;
  }
  if (state.missing === 0) {
    return <span className="badge ok">✅ Listo sin conexión</span>;
  }
  if (state.wanted) {
    return <span className="badge warn">⚠️ Faltan {state.missing} de {state.total}</span>;
  }
  return <span className="badge">{state.total - state.missing} de {state.total} en el móvil</span>;
}
