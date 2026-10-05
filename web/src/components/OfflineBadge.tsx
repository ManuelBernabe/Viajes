import { attachmentsOfTrip, getManualOffline, offlineStatus, storedBlobIds, wantedOffline } from '../data/offline';
import type { Trip } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { todayLocal } from '../domain/agenda';
import { t } from '../i18n';

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
    return <span className="badge">{t('Sin adjuntos')}</span>;
  }
  if (state.missing === 0) {
    return <span className="badge ok">✅ {t('Listo sin conexión')}</span>;
  }
  if (state.wanted) {
    return <span className="badge warn">⚠️ {t('Faltan {missing} de {total}', { missing: state.missing, total: state.total })}</span>;
  }
  return <span className="badge">{t('{n} de {total} en el móvil', { n: state.total - state.missing, total: state.total })}</span>;
}
