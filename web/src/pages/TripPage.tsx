import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BackLink } from '../app/Layout';
import { BookingCard } from '../components/BookingCard';
import { OfflineBadge, useTripOffline } from '../components/OfflineBadge';
import { TypeChips } from '../components/TypeChips';
import { formatDay, formatLongDay, formatRange, timeOf, zoneLabel } from '../data/localTime';
import { downloadMissing, dropBlobs, setManualOffline } from '../data/offline';
import { deleteTrip, getTrip, listAttachments, listBookings } from '../data/repo';
import { downloadAttachment } from '../data/syncClient';
import type { BookingType } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { groupByDay, isInProgress, isPast, nextBooking, TYPE_INFO } from '../domain/agenda';

export function TripPage() {
  const { tripId = '' } = useParams();
  const navigate = useNavigate();
  const trip = useLiveQuery(() => getTrip(tripId), [tripId]);
  const bookings = useLiveQuery(() => listBookings(tripId), [tripId]);
  // La próxima reserva vigente del viaje, destacada arriba con su QR (lo que antes iba en Inicio).
  const highlight = useLiveQuery(async () => {
    const next = nextBooking(await listBookings(tripId), Date.now());
    const qr = next ? (await listAttachments(next.id)).some((a) => a.qrText) : false;
    return { next, qr };
  }, [tripId]);
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
  // Lo que queda, por días; debajo, el histórico con lo ya terminado, del día más reciente al más antiguo.
  const now = Date.now();
  const days = groupByDay(visible.filter((b) => !isPast(b, now)));
  const pastDays = groupByDay(visible.filter((b) => isPast(b, now))).reverse();

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

      {highlight?.next && (
        <section className={`card highlight type-${highlight.next.type}`}>
          <div className="small eyebrow-type">
            {isInProgress(highlight.next, Date.now()) ? 'En curso' : 'Lo siguiente'} · {TYPE_INFO[highlight.next.type].label}
          </div>
          <h3>
            {TYPE_INFO[highlight.next.type].icon} {highlight.next.title}
          </h3>
          {highlight.next.changeNote && <div className="error small" style={{ whiteSpace: 'pre-line' }}>⚠️ {highlight.next.changeNote}</div>}
          <div>
            {formatDay(highlight.next.startLocal)} · {timeOf(highlight.next.startLocal)} hora de {zoneLabel(highlight.next.startTz)}
            {highlight.next.startPlace && ` · ${highlight.next.startPlace}`}
          </div>
          <div className="actions">
            {highlight.qr && (
              <Link className="btn primary" to={`/bookings/${highlight.next.id}/qr`}>
                Ver QR
              </Link>
            )}
            <Link className="btn" to={`/bookings/${highlight.next.id}`}>
              Ver reserva
            </Link>
          </div>
        </section>
      )}

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

      <div style={{ marginTop: 12 }}>
        <TypeChips types={typesPresent} value={filter} onChange={setFilter} />
      </div>

      {visible.length === 0 && <p className="empty">Sin reservas todavía.</p>}
      {visible.length > 0 && days.length === 0 && <p className="muted small">No queda ninguna reserva por delante en este viaje.</p>}
      {days.map((day) => (
        <section key={day.date}>
          <div className="day">{formatLongDay(day.date)}</div>
          {day.bookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} />
          ))}
        </section>
      ))}

      {pastDays.length > 0 && (
        <>
          <h2>Histórico</h2>
          {pastDays.map((day) => (
            <section key={day.date}>
              <div className="day">{formatLongDay(day.date)}</div>
              {[...day.bookings].reverse().map((booking) => (
                <BookingCard key={booking.id} booking={booking} past />
              ))}
            </section>
          ))}
        </>
      )}

      <div className="spacer" />
      <button className="btn danger block" onClick={() => void remove()}>
        Borrar viaje
      </button>
    </main>
  );
}
