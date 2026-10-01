import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookingCard } from '../components/BookingCard';
import { OfflineBadge, useTripOffline } from '../components/OfflineBadge';
import { TypeChips } from '../components/TypeChips';
import { formatDay, formatLongDay, formatRange, timeOf, zoneLabel } from '../data/localTime';
import { listAttachments, listBookings, listInbox, listTrips } from '../data/repo';
import { useSyncStatus } from '../data/syncClient';
import type { BookingType, Trip } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { groupByDay, isInProgress, sortTrips, todayLocal, TYPE_INFO, upcomingBookings } from '../domain/agenda';

function TripCard({ trip, done = false }: { trip: Trip; done?: boolean }) {
  const offline = useTripOffline(trip);
  return (
    <Link className={`card${done ? ' done' : ''}`} to={`/trips/${trip.id}`}>
      <div className="row between">
        <div className="grow">
          <h3>
            {trip.title}
            {done && <span className="badge done">Realizado</span>}
          </h3>
          <div className="muted small">
            {[trip.destination, formatRange(trip.startDate, trip.endDate)].filter(Boolean).join(' · ')}
          </div>
        </div>
        {!done && <OfflineBadge state={offline} />}
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
    const year = (trip.endDate ?? trip.startDate ?? '').slice(0, 4) || 'Sin fecha';
    years.set(year, [...(years.get(year) ?? []), trip]);
  }
  return (
    <>
      <h2>Histórico</h2>
      {!open ? (
        <button className="btn block" type="button" onClick={() => setOpen(true)}>
          Ver el histórico ({trips.length} {trips.length === 1 ? 'viaje realizado' : 'viajes realizados'})
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
            Plegar el histórico
          </button>
        </>
      )}
    </>
  );
}

const PREVIEW = 3;

/**
 * El viaje que toca, entero en Inicio: cabecera (enlace al viaje para editarlo o guardarlo en el móvil), la próxima
 * reserva destacada con su QR, las dos siguientes y, plegadas, todas las reservas del viaje por días.
 */
function CurrentTrip({ trip, inProgress }: { trip: Trip; inProgress: boolean }) {
  const offline = useTripOffline(trip);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<BookingType | null>(null);
  const data = useLiveQuery(async () => {
    const all = await listBookings(trip.id);
    const bookings = filter ? all.filter((b) => b.type === filter) : all;
    const upcoming = upcomingBookings(bookings, Date.now(), PREVIEW);
    const next = upcoming[0];
    const qr = next ? (await listAttachments(next.id)).some((a) => a.qrText) : false;
    return { all, bookings, upcoming, qr };
  }, [trip.id, filter]);

  if (!data) {
    return null;
  }
  const { all, bookings, upcoming, qr } = data;
  const typesPresent = new Set(all.map((b) => b.type));
  const [next, ...after] = upcoming;
  const info = next ? TYPE_INFO[next.type] : null;
  const hidden = bookings.length - upcoming.length;

  return (
    <section className="trip-group" aria-label={trip.title}>
      <Link className="trip-head" to={`/trips/${trip.id}`}>
        <div className="row between">
          <div className="grow">
            <div className="eyebrow">{inProgress ? 'Viaje en curso' : 'Próximo viaje'}</div>
            <h3>{trip.title}</h3>
            <div className="muted small">
              {[trip.destination, formatRange(trip.startDate, trip.endDate)].filter(Boolean).join(' · ')}
            </div>
          </div>
          <OfflineBadge state={offline} />
          <span className="muted">›</span>
        </div>
      </Link>

      <TypeChips types={typesPresent} value={filter} onChange={setFilter} />

      {next && info && (
        <section className={`card highlight type-${next.type}`}>
          <div className="small eyebrow-type">{isInProgress(next, Date.now()) ? 'En curso' : 'Lo siguiente'} · {info.label}</div>
          <h3>
            {info.icon} {next.title}
          </h3>
          {next.changeNote && <div className="error small" style={{ whiteSpace: 'pre-line' }}>⚠️ {next.changeNote}</div>}
          <div>
            {formatDay(next.startLocal)} · {timeOf(next.startLocal)} hora de {zoneLabel(next.startTz)}
            {next.startPlace && ` · ${next.startPlace}`}
          </div>
          <div className="actions">
            {qr && (
              <Link className="btn primary" to={`/bookings/${next.id}/qr`}>
                Ver QR
              </Link>
            )}
            <Link className="btn" to={`/bookings/${next.id}`}>
              Ver reserva
            </Link>
          </div>
        </section>
      )}

      {all.length === 0 && (
        <p className="muted small">
          Este viaje no tiene reservas todavía.{' '}
          <Link to={`/trips/${trip.id}/bookings/new`}>Añadir la primera</Link>
        </p>
      )}
      {all.length > 0 && bookings.length === 0 && <p className="muted small">No hay reservas de ese tipo en este viaje.</p>}

      {!expanded && after.length > 0 && (
        <>
          <div className="muted small after">Después, en este viaje</div>
          {after.map((booking) => (
            <BookingCard key={booking.id} booking={booking} showDay={formatDay(booking.startLocal)} />
          ))}
        </>
      )}

      {expanded &&
        groupByDay(bookings).map((day) => (
          <section key={day.date}>
            <div className="day">{formatLongDay(day.date)}</div>
            {day.bookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </section>
        ))}

      {bookings.length > 0 && (hidden > 0 || expanded) && (
        <button className="btn block" type="button" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Mostrar menos' : `Ver las ${bookings.length} reservas${filter ? " de este tipo" : ""} por días`}
        </button>
      )}
    </section>
  );
}

export function HomePage() {
  const trips = useLiveQuery(listTrips, []);
  const inboxCount = useLiveQuery(async () => (await listInbox()).length, []) ?? 0;
  const sync = useSyncStatus();
  const today = todayLocal();
  const sorted = trips ? sortTrips(trips, today) : null;
  // El viaje que toca (en curso, o el más cercano) va arriba con sus reservas; los demás, debajo.
  const [current, ...others] = sorted?.active ?? [];
  const inProgress = !!current && !!current.startDate && current.startDate <= today && (!current.endDate || current.endDate >= today);

  return (
    <main className="page">
      <div className="topbar">
        <h1 className="two-words">Viajes y reservas</h1>
        <Link className="btn primary add" to="/trips/new" aria-label="Nuevo viaje">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 7v10M7 12h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          Nuevo viaje
        </Link>
      </div>
      {sync.pending > 0 && (
        <p className="muted small">
          {sync.pending} {sync.pending === 1 ? 'cambio pendiente' : 'cambios pendientes'} de enviar
          {sync.incomplete ? ' · sin conexión con el servidor' : ''}
        </p>
      )}
      {inboxCount > 0 && (
        <Link className="card highlight" to="/inbox">
          <div className="row between">
            <span>
              ✉️ {inboxCount} {inboxCount === 1 ? 'correo por revisar' : 'correos por revisar'}
            </span>
            <span className="muted">›</span>
          </div>
        </Link>
      )}
      {current && <CurrentTrip trip={current} inProgress={inProgress} />}
      {sorted && sorted.active.length === 0 && sorted.past.length === 0 && (
        <div className="empty">
          <p>Todavía no hay viajes.</p>
          <Link className="btn primary" to="/trips/new">
            Crear el primer viaje
          </Link>
        </div>
      )}
      {others.length > 0 && (
        <>
          <h2>Más adelante</h2>
          {others.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </>
      )}
      {sorted && <History trips={sorted.past} />}
    </main>
  );
}
