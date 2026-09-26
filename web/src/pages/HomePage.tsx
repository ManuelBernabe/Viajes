import { Link } from 'react-router-dom';
import { formatDay, formatRange, timeOf, zoneLabel } from '../data/localTime';
import { listAllBookings, listAttachments, listInbox, listTrips } from '../data/repo';
import { useSyncStatus } from '../data/syncClient';
import type { Trip } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { sortTrips, todayLocal, TYPE_INFO, upcomingBookings } from '../domain/agenda';
import { BookingCard } from '../components/BookingCard';
import { OfflineBadge, useTripOffline } from '../components/OfflineBadge';

function TripCard({ trip }: { trip: Trip }) {
  const offline = useTripOffline(trip);
  return (
    <Link className="card" to={`/trips/${trip.id}`}>
      <div className="row between">
        <div className="grow">
          <h3>{trip.title}</h3>
          <div className="muted small">
            {[trip.destination, formatRange(trip.startDate, trip.endDate)].filter(Boolean).join(' · ')}
          </div>
        </div>
        <OfflineBadge state={offline} />
      </div>
    </Link>
  );
}

function NextUp() {
  const upcoming = useLiveQuery(async () => {
    const bookings = upcomingBookings(await listAllBookings(), Date.now(), 3);
    return Promise.all(
      bookings.map(async (booking) => ({ booking, qr: (await listAttachments(booking.id)).some((a) => a.qrText) })),
    );
  }, []);

  if (!upcoming || upcoming.length === 0) {
    return null;
  }
  const [{ booking, qr }, ...rest] = upcoming;
  const info = TYPE_INFO[booking.type];
  return (
    <>
      <section className="card highlight">
        <div className="muted small">Lo siguiente</div>
        <h3>
          {info.icon} {booking.title}
        </h3>
        {booking.changeNote && <div className="error small" style={{ whiteSpace: 'pre-line' }}>⚠️ {booking.changeNote}</div>}
        <div>
          {formatDay(booking.startLocal)} · {timeOf(booking.startLocal)} hora de {zoneLabel(booking.startTz)}
          {booking.startPlace && ` · ${booking.startPlace}`}
        </div>
        <div className="actions">
          {qr && (
            <Link className="btn primary" to={`/bookings/${booking.id}/qr`}>
              Ver QR
            </Link>
          )}
          <Link className="btn" to={`/bookings/${booking.id}`}>
            Ver reserva
          </Link>
        </div>
      </section>
      {rest.length > 0 && (
        <>
          <div className="muted small" style={{ margin: '4px 0' }}>Después</div>
          {rest.map((item) => (
            <BookingCard key={item.booking.id} booking={item.booking} showDay={formatDay(item.booking.startLocal)} />
          ))}
        </>
      )}
    </>
  );
}

export function HomePage() {
  const trips = useLiveQuery(listTrips, []);
  const inboxCount = useLiveQuery(async () => (await listInbox()).length, []) ?? 0;
  const sync = useSyncStatus();
  const sorted = trips ? sortTrips(trips, todayLocal()) : null;

  return (
    <main className="page">
      <div className="topbar">
        <h1>Viajes</h1>
        <Link className="btn small primary" to="/trips/new">
          + Viaje
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
      <NextUp />
      {sorted && sorted.active.length === 0 && sorted.past.length === 0 && (
        <div className="empty">
          <p>Todavía no hay viajes.</p>
          <Link className="btn primary" to="/trips/new">
            Crear el primer viaje
          </Link>
        </div>
      )}
      {sorted && sorted.active.length > 0 && (
        <>
          <h2>Próximos</h2>
          {sorted.active.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </>
      )}
      {sorted && sorted.past.length > 0 && (
        <>
          <h2>Pasados</h2>
          {sorted.past.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </>
      )}
    </main>
  );
}
