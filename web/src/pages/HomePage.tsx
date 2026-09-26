import { Link } from 'react-router-dom';
import { formatDay, formatRange, timeOf, zoneLabel } from '../data/localTime';
import { listAllBookings, listAttachments, listTrips } from '../data/repo';
import { useSyncStatus } from '../data/syncClient';
import type { Trip } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { nextBooking, sortTrips, todayLocal, TYPE_INFO } from '../domain/agenda';
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
  const next = useLiveQuery(async () => {
    const booking = nextBooking(await listAllBookings(), Date.now());
    if (!booking) {
      return null;
    }
    const attachments = await listAttachments(booking.id);
    return { booking, qr: attachments.some((a) => a.qrText) };
  }, []);

  if (!next) {
    return null;
  }
  const { booking, qr } = next;
  const info = TYPE_INFO[booking.type];
  return (
    <section className="card highlight">
      <div className="muted small">Lo siguiente</div>
      <h3>
        {info.icon} {booking.title}
      </h3>
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
  );
}

export function HomePage() {
  const trips = useLiveQuery(listTrips, []);
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
