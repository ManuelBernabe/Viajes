import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BackLink } from '../app/Layout';
import { BookingCard } from '../components/BookingCard';
import { OfflineBadge, useTripOffline } from '../components/OfflineBadge';
import { formatLongDay, formatRange } from '../data/localTime';
import { downloadMissing, dropBlobs, setManualOffline } from '../data/offline';
import { deleteTrip, getTrip, listBookings } from '../data/repo';
import { downloadAttachment } from '../data/syncClient';
import type { BookingType } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { groupByDay, TYPE_INFO } from '../domain/agenda';

export function TripPage() {
  const { tripId = '' } = useParams();
  const navigate = useNavigate();
  const trip = useLiveQuery(() => getTrip(tripId), [tripId]);
  const bookings = useLiveQuery(() => listBookings(tripId), [tripId]);
  const offline = useTripOffline(trip);
  const [filter, setFilter] = useState<BookingType | null>(null);
  const [busy, setBusy] = useState('');

  if (trip === undefined || bookings === undefined) {
    return <main className="page muted">Cargando…</main>;
  }
  if (!trip) {
    return (
      <main className="page">
        <div className="topbar">
          <BackLink to="/" />
          <h1>Viaje</h1>
        </div>
        <p className="empty">Este viaje ya no existe.</p>
      </main>
    );
  }

  const typesPresent = new Set(bookings.map((b) => b.type));
  const visible = filter ? bookings.filter((b) => b.type === filter) : bookings;
  const days = groupByDay(visible);

  async function toggleOffline() {
    if (!offline) {
      return;
    }
    const wanted = !offline.wanted;
    await setManualOffline(tripId, wanted);
    if (wanted) {
      setBusy('Bajando adjuntos…');
      const result = await downloadMissing(tripId, downloadAttachment);
      setBusy(result.failed ? 'No se han podido bajar todos: sin conexión.' : '');
    } else {
      await dropBlobs(tripId);
    }
  }

  async function retryDownload() {
    setBusy('Bajando adjuntos…');
    const result = await downloadMissing(tripId, downloadAttachment);
    setBusy(result.failed ? 'No se han podido bajar todos: sin conexión.' : '');
  }

  async function remove() {
    if (!confirm(`¿Borrar el viaje «${trip!.title}» con todas sus reservas?`)) {
      return;
    }
    await deleteTrip(tripId);
    navigate('/', { replace: true });
  }

  return (
    <main className="page">
      <div className="topbar">
        <BackLink to="/" />
        <h1>{trip.title}</h1>
        <Link className="btn small" to={`/trips/${tripId}/edit`}>
          Editar
        </Link>
      </div>
      <div className="muted">{[trip.destination, formatRange(trip.startDate, trip.endDate)].filter(Boolean).join(' · ')}</div>

      <section className="card">
        <div className="row between">
          <OfflineBadge state={offline} />
          {offline && offline.total > 0 && (
            <button className="btn small" onClick={() => void toggleOffline()}>
              {offline.wanted ? 'Quitar del móvil' : 'Guardar en el móvil'}
            </button>
          )}
        </div>
        {offline && offline.wanted && offline.missing > 0 && (
          <button className="btn small" style={{ marginTop: 8 }} onClick={() => void retryDownload()}>
            Bajar lo que falta
          </button>
        )}
        {offline && offline.pendingUpload > 0 && (
          <p className="muted small">{offline.pendingUpload} adjunto{offline.pendingUpload > 1 ? 's' : ''} pendiente{offline.pendingUpload > 1 ? 's' : ''} de subir.</p>
        )}
        {busy && <p className="muted small">{busy}</p>}
      </section>

      <Link className="btn primary block" to={`/trips/${tripId}/bookings/new`}>
        + Añadir reserva
      </Link>

      {typesPresent.size > 1 && (
        <div className="chips" style={{ marginTop: 12 }}>
          <button className={filter === null ? 'on' : ''} onClick={() => setFilter(null)}>
            Todo
          </button>
          {[...typesPresent].map((type) => (
            <button key={type} className={filter === type ? 'on' : ''} onClick={() => setFilter(filter === type ? null : type)}>
              {TYPE_INFO[type].icon} {TYPE_INFO[type].label}
            </button>
          ))}
        </div>
      )}

      {days.length === 0 && <p className="empty">Sin reservas todavía.</p>}
      {days.map((day) => (
        <section key={day.date}>
          <div className="day">{formatLongDay(day.date)}</div>
          {day.bookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} />
          ))}
        </section>
      ))}

      <div className="spacer" />
      <button className="btn danger block" onClick={() => void remove()}>
        Borrar viaje
      </button>
    </main>
  );
}
