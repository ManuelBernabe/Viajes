import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatLongDay, timeOf, zoneLabel } from '../data/localTime';
import { hiddenBookings, listAllBookings, listAttachments, listTrips } from '../data/repo';
import type { Booking } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { isInProgress, todayLocal, TYPE_INFO } from '../domain/agenda';
import { countdown, todayView } from '../domain/today';
import { t } from '../i18n';
import { Directions } from './Directions';

function startsIn(ms: number): string {
  const { days, hours, minutes } = countdown(ms);
  if (days > 0) {
    return t('Empieza en {d} d {h} h', { d: days, h: hours });
  }
  if (hours > 0) {
    return t('Empieza en {h} h {m} min', { h: hours, m: minutes });
  }
  return minutes > 0 ? t('Empieza en {m} min', { m: minutes }) : t('Empieza ahora');
}

function NextCard({ booking, qr, now }: { booking: Booking; qr: boolean; now: number }) {
  const info = TYPE_INFO[booking.type];
  const running = isInProgress(booking, now);
  return (
    <div className="today-item">
      <div className="small eyebrow-type">
        {running ? t('En curso') : startsIn(booking.startUtcMs - now)}
        {running && booking.endLocal && ` · ${t('hasta las {time}', { time: timeOf(booking.endLocal) })}`}
      </div>
      <h3>
        {info.icon} {booking.title}
      </h3>
      <div className="small">
        {t('{time} hora de {zone}', { time: timeOf(booking.startLocal), zone: zoneLabel(booking.startTz) })}
        {booking.startPlace && ` · ${booking.startPlace}`}
        {booking.reference && ` · ${booking.reference}`}
      </div>
      {booking.changeNote && <div className="error small">⚠️ {booking.changeNote}</div>}
      <div className="actions">
        {qr && (
          <Link className="btn primary small" to={`/bookings/${booking.id}/qr`}>
            {t('Ver QR')}
          </Link>
        )}
        <Directions booking={booking} small />
        <Link className="btn small" to={`/bookings/${booking.id}`}>
          {t('Ver reserva')}
        </Link>
      </div>
    </div>
  );
}

/**
 * «Hoy», arriba en Inicio mientras se viaja: lo siguiente con su cuenta atrás y su QR, dónde se duerme esta noche y el
 * resto del día. Cada cosa con «Cómo llegar». No sale si hoy no hay nada.
 */
export function TodayPanel() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const today = todayLocal(new Date(now));

  const data = useLiveQuery(async () => {
    const hidden = await hiddenBookings();
    const trips = new Set((await listTrips()).filter((trip) => trip.deletedAtMs === null).map((trip) => trip.id));
    const bookings = (await listAllBookings()).filter((b) => !hidden.has(b.id) && trips.has(b.tripId));
    const qr = new Set<string>();
    for (const booking of bookings) {
      if ((await listAttachments(booking.id)).some((a) => a.qrText)) {
        qr.add(booking.id);
      }
    }
    return { bookings, qr };
  }, []);

  const view = data ? todayView(data.bookings, now, today) : null;
  if (!data || !view) {
    return null;
  }

  return (
    <section className="card today">
      <h2 style={{ marginTop: 0 }}>
        ☀️ {t('Hoy')} <span className="muted small">· {formatLongDay(today)}</span>
      </h2>
      {view.next.map((booking) => (
        <NextCard key={booking.id} booking={booking} qr={data.qr.has(booking.id)} now={now} />
      ))}
      {view.tonight.map((booking) => (
        <div key={booking.id} className="today-item">
          <div className="small eyebrow-type">🌙 {t('Esta noche')}</div>
          <h3>
            {TYPE_INFO.hotel.icon} {booking.startPlace || booking.title}
          </h3>
          {booking.address && <div className="small">{booking.address}</div>}
          <div className="actions">
            <Directions booking={booking} small />
            <Link className="btn small" to={`/bookings/${booking.id}`}>
              {t('Ver reserva')}
            </Link>
          </div>
        </div>
      ))}
      {view.today.length > 0 && (
        <div className="today-item">
          <div className="small eyebrow-type">{t('Más tarde, hoy')}</div>
          {view.today.map((booking) => (
            <Link key={booking.id} className={`today-row${booking.startUtcMs < now ? ' muted' : ''}`} to={`/bookings/${booking.id}`}>
              <span className="today-time">{timeOf(booking.startLocal)}</span> {TYPE_INFO[booking.type].icon} {booking.title}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
