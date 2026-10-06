import { useState } from 'react';
import { Link } from 'react-router-dom';
import { OfflineBadge, useTripOffline } from '../components/OfflineBadge';
import { formatDay, formatRange, timeOf } from '../data/localTime';
import { listAllBookings, listInbox, listTrips } from '../data/repo';
import { useSyncStatus } from '../data/syncClient';
import type { Booking, Trip } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { isInProgress, nextBookings, sortTrips, todayLocal, tripStatus, TYPE_INFO } from '../domain/agenda';
import { SyncButton } from '../components/SyncButton';
import { t } from '../i18n';

/** Resumen de las reservas de un viaje para su tarjeta: cuántas hay y cuál es la siguiente. */
interface TripSummary {
  count: number;
  /** La próxima reserva y las que empiezan con ella (en la misma hora). */
  next: Booking[];
  inProgress: boolean;
}

function TripCard({ trip, summary, done = false, current = false }: { trip: Trip; summary?: TripSummary; done?: boolean; current?: boolean }) {
  const offline = useTripOffline(trip);
  const next = summary?.next ?? [];
  return (
    <Link className={`card${done ? ' done' : ''}${current ? ' highlight' : ''}`} to={`/trips/${trip.id}`}>
      <div className="row between">
        <div className="grow">
          <h3>
            {trip.title}
            {done && <span className="badge done">{t('Realizado')}</span>}
            {current && <span className="badge">{t('En curso')}</span>}
          </h3>
          <div className="muted small">
            {[trip.destination, formatRange(trip.startDate, trip.endDate)].filter(Boolean).join(' · ')}
          </div>
          {!done &&
            next.map((booking, index) => (
              <div key={booking.id} className="small" style={{ marginTop: index === 0 ? 4 : 0 }}>
                {index === 0 ? `${summary?.inProgress ? t('En curso') : t('Lo siguiente')}: ` : '+ '}
                {TYPE_INFO[booking.type].icon} {booking.title} · {formatDay(booking.startLocal)} {timeOf(booking.startLocal)}
              </div>
            ))}
          {summary && (
            <div className="muted small">
              {summary.count === 0 ? t('Sin reservas todavía') : summary.count === 1 ? t('1 reserva') : t('{n} reservas', { n: summary.count })}
            </div>
          )}
        </div>
        {!done && <OfflineBadge state={offline} />}
        <span className="muted">›</span>
      </div>
    </Link>
  );
}

/** Los viajes realizados, plegados al final y agrupados por año, del más reciente al más antiguo. */
function History({ trips }: { trips: Trip[] }) {
  const [open, setOpen] = useState(false);
  if (trips.length === 0) {
    return null;
  }
  const years = new Map<string, Trip[]>();
  for (const trip of trips) {
    const year = (trip.endDate ?? trip.startDate ?? '').slice(0, 4) || t('Sin fecha');
    years.set(year, [...(years.get(year) ?? []), trip]);
  }
  return (
    <>
      <h2>{t('Histórico')}</h2>
      {!open ? (
        <button className="btn block" type="button" onClick={() => setOpen(true)}>
          {trips.length === 1 ? t('Ver el histórico (1 viaje realizado)') : t('Ver el histórico ({n} viajes realizados)', { n: trips.length })}
        </button>
      ) : (
        <>
          {[...years.entries()].map(([year, list]) => (
            <section key={year}>
              <div className="year">{year}</div>
              {list.map((trip) => (
                <TripCard key={trip.id} trip={trip} done />
              ))}
            </section>
          ))}
          <button className="btn block" type="button" onClick={() => setOpen(false)}>
            {t('Plegar el histórico')}
          </button>
        </>
      )}
    </>
  );
}

export function HomePage() {
  const trips = useLiveQuery(listTrips, []);
  const summaries = useLiveQuery(async () => {
    const now = Date.now();
    const byTrip = new Map<string, Booking[]>();
    for (const booking of await listAllBookings()) {
      byTrip.set(booking.tripId, [...(byTrip.get(booking.tripId) ?? []), booking]);
    }
    const result = new Map<string, TripSummary>();
    for (const [tripId, bookings] of byTrip) {
      const next = nextBookings(bookings, now);
      result.set(tripId, { count: bookings.length, next, inProgress: next.some((b) => isInProgress(b, now)) });
    }
    return result;
  }, []);
  const inboxCount = useLiveQuery(async () => (await listInbox()).length, []) ?? 0;
  const sync = useSyncStatus();
  const today = todayLocal();
  const sorted = trips ? sortTrips(trips, today) : null;
  const current = sorted?.active.filter((t) => tripStatus(t, today) === 'current') ?? [];
  const upcoming = sorted?.active.filter((t) => tripStatus(t, today) !== 'current') ?? [];
  const summaryOf = (trip: Trip): TripSummary => summaries?.get(trip.id) ?? { count: 0, next: [], inProgress: false };

  return (
    <main className="page">
      <div className="topbar">
        <h1 className="two-words">{t('Viajes y reservas')}</h1>
        <SyncButton />
        <Link className="btn primary add" to="/trips/new" aria-label={t('Nuevo viaje')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 7v10M7 12h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          {t('Nuevo viaje')}
        </Link>
      </div>
      {sync.pending > 0 && (
        <p className="muted small">
          {sync.pending === 1 ? t('1 cambio pendiente de enviar') : t('{n} cambios pendientes de enviar', { n: sync.pending })}
          {sync.incomplete ? ` · ${t('sin conexión con el servidor')}` : ''}
        </p>
      )}
      {inboxCount > 0 && (
        <Link className="card highlight" to="/inbox">
          <div className="row between">
            <span>
              ✉️ {inboxCount === 1 ? t('1 correo por revisar') : t('{n} correos por revisar', { n: inboxCount })}
            </span>
            <span className="muted">›</span>
          </div>
        </Link>
      )}
      {sorted && sorted.active.length === 0 && sorted.past.length === 0 && (
        <div className="empty">
          <p>{t('Todavía no hay viajes.')}</p>
          <Link className="btn primary" to="/trips/new">
            {t('Crear el primer viaje')}
          </Link>
        </div>
      )}
      {current.length > 0 && (
        <>
          <h2>{t('En curso')}</h2>
          {current.map((trip) => (
            <TripCard key={trip.id} trip={trip} summary={summaryOf(trip)} current />
          ))}
        </>
      )}
      {upcoming.length > 0 && (
        <>
          <h2>{t('Próximos viajes')}</h2>
          {upcoming.map((trip) => (
            <TripCard key={trip.id} trip={trip} summary={summaryOf(trip)} />
          ))}
        </>
      )}
      {sorted && <History trips={sorted.past} />}
    </main>
  );
}
