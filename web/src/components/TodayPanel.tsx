import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatLongDay, timeOf } from '../data/localTime';
import { hiddenBookings, listAllBookings, listAttachments, listTrips } from '../data/repo';
import type { Booking } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { isInProgress, todayLocal, TYPE_INFO } from '../domain/agenda';
import { countdown, todayView } from '../domain/today';
import { describeWeather, temps } from '../domain/weather';
import { t } from '../i18n';
import { Directions } from './Directions';
import { FlightStatusLine } from './FlightStatus';
import { useTripWeather } from './WeatherStrip';
import { BigTime, TIME_MARK, TimeAt } from './TimeAt';

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
        {running && booking.endLocal && (
          <>
            {' · '}
            <BigTime text={t('hasta las {time}', { time: TIME_MARK })} time={timeOf(booking.endLocal)} />
          </>
        )}
      </div>
      <h3>
        {info.icon} {booking.title}
      </h3>
      <div className="small">
        <TimeAt local={booking.startLocal} tz={booking.startTz} />
        {booking.startPlace && ` · ${booking.startPlace}`}
        {booking.reference && ` · ${booking.reference}`}
      </div>
      <FlightStatusLine booking={booking} />
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
  // El tiempo de hoy donde se está: el del viaje de lo que toca hoy (el hotel de esta noche manda).
  const tripId = view ? [...view.tonight, ...view.next, ...view.today][0]?.tripId : undefined;
  const weather = useTripWeather(tripId).find((day) => day.date === today);
  if (!data || !view) {
    return null;
  }
  const sky = weather ? describeWeather(weather.code) : null;

  return (
    <section className="card today">
      <h2 style={{ marginTop: 0 }}>
        {sky?.icon ?? '☀️'} {t('Hoy')} <span className="muted small">· {formatLongDay(today)}</span>
      </h2>
      {weather && sky && (
        <div className="small today-weather">
          {sky.label} · <strong>{temps(weather)}</strong> · {weather.place}
          {weather.rain !== null && weather.rain >= 30 && ` · 💧 ${t('lluvia {n} %', { n: weather.rain })}`}
        </div>
      )}
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
