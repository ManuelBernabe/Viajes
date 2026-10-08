import { Link } from 'react-router-dom';
import { timeOf } from '../data/localTime';
import type { Booking } from '../data/types';
import { isInProgress, TYPE_INFO } from '../domain/agenda';
import { seatsIn } from '../domain/airlines';
import { destinationOf, directionsUrls, isAppleDevice } from '../domain/directions';
import { clock, hasFlightNumber, statusLabel } from '../domain/flightStatus';
import { countdown, passengerOf, withoutPassenger } from '../domain/today';
import { t } from '../i18n';
import { FlightStatusLine, isTracked, useFlightStatus } from './FlightStatus';
import { useAutoFix } from './useAutoFix';

export function startsIn(ms: number): string {
  const { days, hours, minutes } = countdown(ms);
  if (days > 0) {
    return t('Empieza en {d} d {h} h', { d: days, h: hours });
  }
  if (hours > 0) {
    return t('Empieza en {h} h {m} min', { h: hours, m: minutes });
  }
  return minutes > 0 ? t('Empieza en {m} min', { m: minutes }) : t('Empieza ahora');
}

/** «2 h 57 min», «1 d 3 h», «12 min». */
export function shortWait(ms: number): string {
  const { days, hours, minutes } = countdown(ms);
  return days > 0 ? `${days} d ${hours} h` : hours > 0 ? `${hours} h ${minutes} min` : `${Math.max(minutes, 1)} min`;
}

/** Un código corto (aeropuerto, estación) se pinta grande; un nombre largo, más pequeño para que quepa. */
function Place({ text }: { text: string | null }) {
  if (!text) {
    return <div className="pass-code">–</div>;
  }
  return <div className={text.length <= 4 ? 'pass-code' : 'pass-place'}>{text}</div>;
}

/**
 * «Lo siguiente» como una tarjeta de embarque: trayecto y horas en grande, terminal, puerta, asiento y localizador a la
 * vista, y solo dos acciones. Si son varios pasajeros del mismo vuelo (una reserva cada uno), una sola tarjeta.
 */
export function BoardingCard({ group, qr, now, label: heading }: { group: Booking[]; qr: ReadonlySet<string>; now: number; label?: string }) {
  const booking = group[0];
  const [flight] = useFlightStatus(hasFlightNumber(booking) ? booking : undefined);
  // Si la reserva tiene el origen y el destino al revés o la llegada sin mover, se corrige sola (cada pasajero la suya).
  useAutoFix(group[0], flight);
  useAutoFix(group[1], flight);
  useAutoFix(group[2], flight);
  const info = flight?.configured ? flight.info : null;
  const label = info ? statusLabel(info, flight?.delayMinutes ?? 0) : null;
  const running = isInProgress(booking, now);
  const route = (booking.type === 'flight' || booking.type === 'train') && (booking.startPlace || booking.endPlace);
  const planned = timeOf(booking.startLocal);
  const expected = info && info.depActualMs === null ? clock(info.depEstimatedMs, booking.startTz) : null;
  const arrival = info ? clock(info.arrActualMs ?? info.arrEstimatedMs ?? info.arrScheduledMs, booking.endTz ?? booking.startTz) : null;
  const seats = seatsIn(booking.notes, booking.title);
  const withQr = group.find((b) => qr.has(b.id));
  const destination = destinationOf(booking);
  const directions = destination ? directionsUrls(destination) : null;
  const facts = [
    info?.depTerminal && { label: t('Terminal'), value: info.depTerminal },
    info?.depGate && { label: t('Puerta'), value: info.depGate },
    group.length === 1 && seats.length > 0 && { label: t('Asiento'), value: seats.join(', ') },
    group.length === 1 && booking.reference && { label: t('Localizador'), value: booking.reference },
  ].filter((x): x is { label: string; value: string } => Boolean(x));

  return (
    <section className={`pass type-${booking.type}`}>
      <div className="pass-head">
        <span>
          {running
            ? `${t('En curso')}${booking.endLocal ? ` · ${t('hasta las {time}', { time: timeOf(booking.endLocal) })}` : ''}`
            : `${heading ?? t('Lo siguiente')} · ${t('en {time}', { time: shortWait(booking.startUtcMs - now) })}`}
        </span>
        {label && (
          <span className={`chip tone-${label.tone}`}>
            {label.icon} {label.text}
          </span>
        )}
      </div>

      {route ? (
        <div className="pass-route">
          <div>
            <Place text={info?.origin ?? booking.startPlace} />
            <div className="pass-time">
              {expected && expected !== planned ? (
                <>
                  <s>{planned}</s> {expected}
                </>
              ) : (
                planned
              )}
            </div>
          </div>
          <div className="pass-mid">
            <span>{TYPE_INFO[booking.type].icon}</span>
            <div className="pass-line" />
          </div>
          <div className="right">
            <Place text={info?.destination ?? booking.endPlace} />
            <div className="pass-time">{arrival ?? (booking.endLocal ? timeOf(booking.endLocal) : '')}</div>
          </div>
        </div>
      ) : (
        <div className="pass-plain">
          <div className="pass-time big">{planned}</div>
          <div className="pass-title">
            {TYPE_INFO[booking.type].icon} {booking.type === 'hotel' ? booking.startPlace || booking.title : booking.title}
          </div>
          {booking.address && <div className="small muted">{booking.address}</div>}
        </div>
      )}
      {route && <div className="pass-name">{withoutPassenger(booking.title)}</div>}

      {facts.length > 0 && (
        <div className="pass-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <span>{fact.label}</span>
              <b>{fact.value}</b>
            </div>
          ))}
        </div>
      )}

      {group.length > 1 && (
        <div className="pass-people">
          {group.map((b) => (
            <Link key={b.id} to={`/bookings/${b.id}`} className="pass-person">
              <span>{passengerOf(b.title) ?? b.title}</span>
              <span className="muted">{b.reference ?? ''}</span>
              <span className="muted">›</span>
            </Link>
          ))}
        </div>
      )}

      {booking.changeNote && <div className="pass-warn">⚠️ {booking.changeNote}</div>}

      <div className="pass-perf" />
      <div className="pass-actions">
        {withQr ? (
          <Link className="btn primary" to={`/bookings/${withQr.id}/qr`}>
            {t('Ver QR')}
          </Link>
        ) : (
          directions && (
            <a className="btn primary" href={isAppleDevice() ? directions.apple : directions.google} target="_blank" rel="noreferrer">
              {t('Cómo llegar')}
            </a>
          )
        )}
        <Link className="btn" to={`/bookings/${booking.id}`}>
          {t('Ver reserva')}
        </Link>
      </div>
    </section>
  );
}

/** Una fila de la agenda: hora en negrita, icono, título y un detalle; lleva a la reserva. */
export function AgendaRow({ booking, group, kind = 'start', now }: { booking: Booking; group?: Booking[]; kind?: 'start' | 'checkout' | 'night'; now?: number }) {
  const info = TYPE_INFO[booking.type];
  const people = group && group.length > 1 ? group.map((b) => passengerOf(b.title) ?? b.title).join(', ') : null;
  const time = kind === 'checkout' ? (booking.endLocal ? timeOf(booking.endLocal) : '') : kind === 'night' ? '' : timeOf(booking.startLocal);
  const name = booking.type === 'hotel' ? booking.startPlace || booking.title : people ? withoutPassenger(booking.title) : booking.title;
  const detail =
    kind === 'checkout'
      ? t('Salida del hotel')
      : kind === 'night'
        ? (booking.address ?? t('Noche en el hotel'))
        : people
          ? people
            : booking.type === 'hotel'
            ? info.startLabel
            : booking.type === 'flight' || booking.type === 'train'
              ? [booking.startPlace, booking.endPlace].filter(Boolean).join(' → ')
              : (booking.startPlace ?? booking.address ?? '');
  const past = now !== undefined && kind === 'start' && booking.startUtcMs < now;
  return (
    <Link className={`agenda-row type-${kind === 'start' ? booking.type : 'hotel'}${past ? ' past' : ''}`} to={`/bookings/${booking.id}`}>
      <span className="agenda-time">{time || (kind === 'night' ? '🌙' : '')}</span>
      <span className="agenda-icon">{kind === 'checkout' ? '🧳' : info.icon}</span>
      <span className="agenda-text">
        <b>{name}</b>
        {detail && <span>{detail}</span>}
        {kind === 'start' && !past && isTracked(booking) && <FlightStatusLine booking={booking} />}
      </span>
      <span className="agenda-go">›</span>
    </Link>
  );
}
