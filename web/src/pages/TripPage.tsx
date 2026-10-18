import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BackLink } from '../app/Layout';
import { BookingCard } from '../components/BookingCard';
import { ConnectionBookingCard, JourneyCard } from '../components/Connection';
import { idsOf, withConnections, type Leg } from '../domain/connections';
import { groupSameTrip } from '../domain/today';
import { OfflineBadge, useTripOffline } from '../components/OfflineBadge';
import { TripMerge } from '../components/TripMerge';
import { TripQuickActions } from '../components/QuickSetup';
import { TripReview } from '../components/TripReview';
import { TypeChips } from '../components/TypeChips';
import { DayWeatherBadge, useTripWeather, WeatherStrip } from '../components/WeatherStrip';
import { formatLongDay, formatRange } from '../data/localTime';
import { downloadMissing, dropBlobs, setManualOffline } from '../data/offline';
import { deleteTrip, getTrip, hiddenBookings, listAttachments, listBookings, listDocuments, listPlaces, setBookingHidden } from '../data/repo';
import { downloadAttachment } from '../data/syncClient';
import type { Booking, BookingType } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { groupByDay, isPast, nextBookings, todayLocal, type Day } from '../domain/agenda';
import { documentAlerts } from '../domain/documents';
import { t } from '../i18n';

export function TripPage() {
  const { tripId = '' } = useParams();
  const navigate = useNavigate();
  const trip = useLiveQuery(() => getTrip(tripId), [tripId]);
  const bookings = useLiveQuery(() => listBookings(tripId), [tripId]);
  const placeCount = useLiveQuery(async () => (await listPlaces(tripId)).filter((p) => !p.visited).length, [tripId]);
  // Lo siguiente del viaje, destacado arriba con su QR: la próxima reserva y las que empiezan con ella (en la misma hora).
  const highlights = useLiveQuery(async () => {
    const hiddenIds = await hiddenBookings();
    const all = (await listBookings(tripId)).filter((b) => !hiddenIds.has(b.id) && b.deletedAtMs === null);
    // Un vuelo con escala, entero en una tarjeta: también los tramos que no son «lo siguiente».
    const journeys = withConnections(groupSameTrip(nextBookings(all, Date.now())), all);
    const qr = new Set<string>();
    for (const booking of journeys.flat(2)) {
      if ((await listAttachments(booking.id)).some((a) => a.qrText)) {
        qr.add(booking.id);
      }
    }
    return { journeys, qr };
  }, [tripId]);
  // Documentos que caducan antes o durante este viaje (pasaportes con menos de 6 meses, etc.).
  const docAlerts = useLiveQuery(async () => {
    const current = await getTrip(tripId);
    return current ? documentAlerts(await listDocuments(), [current], todayLocal()).filter((a) => a.trip?.id === tripId) : [];
  }, [tripId]);
  const offline = useTripOffline(trip);
  const [filter, setFilter] = useState<BookingType | null>(null);
  const [busy, setBusy] = useState('');
  const hidden = useLiveQuery(hiddenBookings, []);
  const [showHidden, setShowHidden] = useState(false);
  const weather = useTripWeather(tripId);

  if (trip === undefined || bookings === undefined) {
    return <main className="page muted">{t('Cargando…')}</main>;
  }
  if (!trip) {
    return (
      <main className="page">
        <div className="topbar">
          <BackLink to="/trips" />
          <h1>{t('Viaje')}</h1>
        </div>
        <p className="empty">{t('Este viaje ya no existe.')}</p>
      </main>
    );
  }

  // Las que esta persona ha ocultado van aparte, plegadas, al final.
  const hiddenIds = hidden ?? new Set<string>();
  const hiddenList = bookings.filter((b) => hiddenIds.has(b.id));
  const shown = bookings.filter((b) => !hiddenIds.has(b.id));
  const typesPresent = new Set(shown.map((b) => b.type));
  const visible = filter ? shown.filter((b) => b.type === filter) : shown;
  const hide = (id: string) => (value: boolean) => void setBookingHidden(id, value);
  // Lo que queda, por días; debajo, el histórico con lo ya terminado, del día más reciente al más antiguo.
  const now = Date.now();
  const days = groupByDay(visible.filter((b) => !isPast(b, now)));
  const pastDays = groupByDay(visible.filter((b) => isPast(b, now))).reverse();
  // Los vuelos con escala, en una sola tarjeta el día en que empiezan (sin repetir el tramo en el día siguiente ni en el histórico).
  const upcomingJourneys = journeysByDay(days, shown, new Set());
  const pastJourneys = journeysByDay([...pastDays].reverse(), shown, idsOf([...upcomingJourneys.values()].flat()));
  const hideMany = (ids: string[], value: boolean) => ids.forEach((id) => void setBookingHidden(id, value));

  async function toggleOffline() {
    if (!offline) {
      return;
    }
    const wanted = !offline.wanted;
    await setManualOffline(tripId, wanted);
    if (wanted) {
      setBusy(t('Bajando adjuntos…'));
      const result = await downloadMissing(tripId, downloadAttachment);
      setBusy(result.failed ? t('No se han podido bajar todos: sin conexión.') : '');
    } else {
      await dropBlobs(tripId);
    }
  }

  async function retryDownload() {
    setBusy(t('Bajando adjuntos…'));
    const result = await downloadMissing(tripId, downloadAttachment);
    setBusy(result.failed ? t('No se han podido bajar todos: sin conexión.') : '');
  }

  async function remove() {
    if (!confirm(t('¿Borrar el viaje «{name}» con todas sus reservas?', { name: trip!.title }))) {
      return;
    }
    await deleteTrip(tripId);
    navigate('/trips', { replace: true });
  }

  return (
    <main className="page">
      <div className="topbar">
        <BackLink to="/trips" />
        <h1>{trip.title}</h1>
        <Link className="btn small" to={`/trips/${tripId}/edit`}>
          {t('Editar')}
        </Link>
      </div>
      <div className="muted">{[trip.destination, formatRange(trip.startDate, trip.endDate)].filter(Boolean).join(' · ')}</div>

      {highlights && highlights.journeys.map((legs) => <JourneyCard key={legs[0][0].id} legs={legs} qr={highlights.qr} now={Date.now()} />)}

      {docAlerts && docAlerts.length > 0 && (
        <Link className="card highlight" to="/documents" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <strong>⚠️ {t('Documentos')}</strong>
          {docAlerts.map((alert, index) => (
            <div key={index} className={`small${alert.level === 'danger' ? ' error' : ''}`}>
              {alert.message}
            </div>
          ))}
        </Link>
      )}

      <TripMerge trip={trip} mode="suggest" />
      <TripReview trip={trip} bookings={shown} />

      <WeatherStrip days={weather} />

      <section className="card">
        <div className="row between">
          <OfflineBadge state={offline} />
          {offline && offline.total > 0 && (
            <button className="btn small" onClick={() => void toggleOffline()}>
              {offline.wanted ? t('Quitar del móvil') : t('Guardar en el móvil')}
            </button>
          )}
        </div>
        {offline && offline.wanted && offline.missing > 0 && (
          <button className="btn small" style={{ marginTop: 8 }} onClick={() => void retryDownload()}>
            {t('Bajar lo que falta')}
          </button>
        )}
        {offline && offline.pendingUpload > 0 && (
          <p className="muted small">
            {offline.pendingUpload === 1 ? t('1 adjunto pendiente de subir.') : t('{n} adjuntos pendientes de subir.', { n: offline.pendingUpload })}
          </p>
        )}
        {busy && <p className="muted small">{busy}</p>}
      </section>

      <div className="actions" style={{ margin: '12px 0 0' }}>
        <Link className="btn primary" to={`/trips/${tripId}/bookings/new`}>
          {t('+ Añadir reserva')}
        </Link>

        <Link className="btn" to={`/trips/${tripId}/places`}>
          📍 {placeCount ? t('Lugares ({n})', { n: placeCount }) : t('Lugares')}
        </Link>

        <Link className="btn" to={`/trips/${tripId}/packing`}>
          🧳 {t('Equipaje')}
        </Link>

        <Link className="btn" to={`/trips/${tripId}/info`}>
          🌍 {t('Destino')}
        </Link>

        <Link className="btn" to={`/trips/${tripId}/journal`}>
          📔 {t('Diario')}
        </Link>

        <Link className="btn" to={`/trips/${tripId}/share`}>
          🔗 {t('Compartir')}
        </Link>

        <TripQuickActions />
      </div>

      <div style={{ marginTop: 12 }}>
        <TypeChips types={typesPresent} value={filter} onChange={setFilter} />
      </div>

      {visible.length === 0 && <p className="empty">{t('Sin reservas todavía.')}</p>}
      {visible.length > 0 && days.length === 0 && <p className="muted small">{t('No queda ninguna reserva por delante en este viaje.')}</p>}
      {days
        .filter((day) => (upcomingJourneys.get(day.date) ?? []).length > 0)
        .map((day) => (
          <section key={day.date}>
            <div className="day">
              {formatLongDay(day.date)}
              <DayWeatherBadge day={weather.find((w) => w.date === day.date)} />
            </div>
            {(upcomingJourneys.get(day.date) ?? []).map((legs) =>
              legs.length > 1 ? (
                <ConnectionBookingCard key={legs[0][0].id} legs={legs} onHide={hideMany} />
              ) : (
                legs[0].map((booking) => <BookingCard key={booking.id} booking={booking} onHide={hide(booking.id)} />)
              ),
            )}
          </section>
        ))}

      {pastDays.length > 0 && (
        <>
          <h2>{t('Histórico')}</h2>
          {pastDays
            .filter((day) => (pastJourneys.get(day.date) ?? []).length > 0)
            .map((day) => (
              <section key={day.date}>
                <div className="day">{formatLongDay(day.date)}</div>
                {[...(pastJourneys.get(day.date) ?? [])]
                  .reverse()
                  .map((legs) =>
                    legs.length > 1 ? (
                      <ConnectionBookingCard key={legs[0][0].id} legs={legs} past onHide={hideMany} />
                    ) : (
                      [...legs[0]].reverse().map((booking) => <BookingCard key={booking.id} booking={booking} past onHide={hide(booking.id)} />)
                    ),
                  )}
              </section>
            ))}
        </>
      )}

      {hiddenList.length > 0 && (
        <>
          <button className="btn block" type="button" style={{ marginTop: 16 }} onClick={() => setShowHidden(!showHidden)}>
            🙈 {showHidden ? t('Ocultar las reservas ocultas') : t('Ver las ocultas ({n})', { n: hiddenList.length })}
          </button>
          {showHidden &&
            hiddenList.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                showDay={formatLongDay(booking.startLocal.slice(0, 10))}
                hidden
                onHide={hide(booking.id)}
              />
            ))}
        </>
      )}

      <div className="spacer" />
      <TripMerge trip={trip} mode="menu" />
      <button className="btn danger block" onClick={() => void remove()}>
        {t('Borrar viaje')}
      </button>
    </main>
  );
}

/** Lo de cada día, con los vuelos con escala juntos en el día en que salen; `skip`: lo ya pintado en otra lista. */
function journeysByDay(days: readonly Day[], all: readonly Booking[], skip: ReadonlySet<string>): Map<string, Leg[][]> {
  const seen = new Set(skip);
  const result = new Map<string, Leg[][]>();
  for (const day of days) {
    const journeys = withConnections(groupSameTrip(day.bookings), all, seen);
    idsOf(journeys).forEach((id) => seen.add(id));
    result.set(day.date, journeys);
  }
  return result;
}
