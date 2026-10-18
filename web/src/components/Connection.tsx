import { Link } from 'react-router-dom';
import { dateOf, timeOf } from '../data/localTime';
import type { Booking } from '../data/types';
import { TYPE_INFO } from '../domain/agenda';
import { baggageOf } from '../domain/baggage';
import { arrivalMs, connectionRoute, shortPlace, type Leg } from '../domain/connections';
import { destinationOf, directionsUrls, isAppleDevice } from '../domain/directions';
import { clock, hasFlightNumber, statusLabel } from '../domain/flightStatus';
import { passengerOf, withoutPassenger } from '../domain/today';
import { t } from '../i18n';
import { BoardingCard, shortWait } from './Agenda';
import { FlightCheckNote, FlightStatusLine, isTracked, useFlightStatus } from './FlightStatus';
import { useAutoFix } from './useAutoFix';
import { formatSeats, useSeats } from './useSeats';

function stopsLabel(legs: readonly Leg[]): string {
  return legs.length === 2 ? t('1 escala') : t('{n} escalas', { n: legs.length - 1 });
}

/** «+1» si se llega otro día (hora del lugar). */
function dayShift(from: string, to: string | null): string {
  if (!to) {
    return '';
  }
  const days = Math.round((Date.parse(`${dateOf(to)}T00:00Z`) - Date.parse(`${dateOf(from)}T00:00Z`)) / 86_400_000);
  return days > 0 ? ` +${days}` : '';
}

const SHORT_LAYOVER_MS = 60 * 60_000;

/** La escala entre dos tramos: dónde y cuánto, avisando si es justa. */
function Layover({ prev, next }: { prev: Leg; next: Leg }) {
  const wait = next[0].startUtcMs - arrivalMs(prev);
  const short = wait < SHORT_LAYOVER_MS;
  return (
    <div className={`layover${short ? ' short' : ''}`}>
      ⏱ {t('Escala en {place}', { place: shortPlace(prev[0].endPlace ?? next[0].startPlace) })} · <b>{shortWait(wait)}</b>
      {short && ` · ${t('ajustada')}`}
    </div>
  );
}

/** Un tramo dentro de la tarjeta: número, horas (con retrasos), terminal, puerta, asientos y su QR. */
function LegBlock({ leg, index, qr, now }: { leg: Leg; index: number; qr: ReadonlySet<string>; now: number }) {
  const booking = leg[0];
  const [flight] = useFlightStatus(hasFlightNumber(booking) ? booking : undefined);
  useAutoFix(leg[0], flight);
  useAutoFix(leg[1], flight);
  useAutoFix(leg[2], flight);
  const info = flight?.configured ? flight.info : null;
  const label = info ? statusLabel(info, flight?.delayMinutes ?? 0) : null;
  const seats = useSeats(leg);
  const done = arrivalMs(leg) < now;
  const planned = timeOf(booking.startLocal);
  const expected = info && info.depActualMs === null ? clock(info.depEstimatedMs, booking.startTz) : null;
  const arrival = info ? clock(info.arrActualMs ?? info.arrEstimatedMs ?? info.arrScheduledMs, booking.endTz ?? booking.startTz) : null;
  const withQr = leg.find((b) => qr.has(b.id));
  const facts = [
    !done && info?.depTerminal && { label: t('Terminal'), value: info.depTerminal },
    !done && info?.depGate && { label: t('Puerta'), value: info.depGate },
    seats.length > 0 && { label: seats.length === 1 ? t('Asiento') : t('Asientos'), value: formatSeats(seats) },
    leg.length === 1 && booking.reference && { label: t('Localizador'), value: booking.reference },
  ].filter((x): x is { label: string; value: string } => Boolean(x));
  return (
    <div className={`leg${done ? ' done' : ''}`}>
      <div className="leg-head">
        <span className="leg-num">{index + 1}</span>
        <b>{withoutPassenger(booking.title)}</b>
        {withQr && !done && (
          <Link className="btn small primary leg-btn" to={`/bookings/${withQr.id}/qr`}>
            {t('QR')}
          </Link>
        )}
        <Link className="btn small leg-btn" to={`/bookings/${booking.id}`} aria-label={t('Ver reserva')}>
          ›
        </Link>
        {done ? (
          <span className="chip">✓ {t('Hecho')}</span>
        ) : (
          label && (
            <span className={`chip tone-${label.tone}`}>
              {label.icon} {label.text}
            </span>
          )
        )}
      </div>
      <div className="leg-route">
        <span>
          {shortPlace(info?.origin ?? booking.startPlace)}{' '}
          <b>
            {expected && expected !== planned ? (
              <>
                <s>{planned}</s> {expected}
              </>
            ) : (
              planned
            )}
          </b>
        </span>
        <span className="muted">{TYPE_INFO[booking.type].icon}</span>
        <span>
          {shortPlace(info?.destination ?? booking.endPlace)}{' '}
          <b>
            {arrival ?? (booking.endLocal ? timeOf(booking.endLocal) : '')}
            {dayShift(booking.startLocal, booking.endLocal)}
          </b>
        </span>
      </div>
      {facts.length > 0 && (
        <div className="pass-facts leg-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <span>{fact.label}</span>
              <b>{fact.value}</b>
            </div>
          ))}
        </div>
      )}
      {booking.changeNote && <div className="pass-warn">⚠️ {booking.changeNote}</div>}
      {!done && hasFlightNumber(booking) && <FlightCheckNote status={flight} />}
    </div>
  );
}

/**
 * Un viaje con escalas como una sola tarjeta de embarque: arriba el trayecto entero (salida, escalas y llegada final) y
 * debajo cada tramo con su número, horas, terminal, puerta, asiento y QR, y cuánto dura cada escala.
 */
export function ConnectionCard({ legs, qr, now, label: heading }: { legs: Leg[]; qr: ReadonlySet<string>; now: number; label?: string }) {
  const first = legs[0][0];
  const last = legs[legs.length - 1][0];
  const finalArrival = arrivalMs(legs[legs.length - 1]);
  const current = legs.find((leg) => arrivalMs(leg) >= now) ?? legs[legs.length - 1];
  const flying = current[0].startUtcMs <= now;
  const people = legs[0].length > 1 ? legs[0] : [];
  const baggage =
    legs
      .flat()
      .map((b) => baggageOf(b.notes))
      .find(Boolean) ?? null;
  const destination = destinationOf(first);
  const directions = destination ? directionsUrls(destination) : null;
  const currentQr = current.find((b) => qr.has(b.id));
  const vias = legs.slice(0, -1).map((leg) => shortPlace(leg[0].endPlace));

  const head =
    first.startUtcMs > now
      ? `${heading ?? t('Lo siguiente')} · ${t('en {time}', { time: shortWait(first.startUtcMs - now) })}`
      : flying
        ? `${t('En curso')}${last.endLocal ? ` · ${t('llegada a las {time}', { time: timeOf(last.endLocal) })}` : ''}`
        : `${t('Escala en {place}', { place: shortPlace(current[0].startPlace) })} · ${t('sale en {time}', { time: shortWait(current[0].startUtcMs - now) })}`;

  return (
    <section className={`pass connection type-${first.type}`}>
      <div className="pass-head">
        <span>{head}</span>
        <span className="chip">🔁 {stopsLabel(legs)}</span>
      </div>

      <div className="pass-route">
        <div>
          <div className="pass-code">{shortPlace(first.startPlace)}</div>
          <div className="pass-time">{timeOf(first.startLocal)}</div>
        </div>
        <div className="pass-mid">
          <span>{TYPE_INFO[first.type].icon}</span>
          <div className="pass-line" />
          <div className="pass-via">{t('vía {places}', { places: vias.join(', ') })}</div>
        </div>
        <div className="right">
          <div className="pass-code">{shortPlace(last.endPlace)}</div>
          <div className="pass-time">
            {last.endLocal ? timeOf(last.endLocal) : ''}
            {last.endLocal && <small>{dayShift(first.startLocal, last.endLocal)}</small>}
          </div>
        </div>
      </div>
      <div className="pass-name">
        {stopsLabel(legs)} · {t('Duración total {time}', { time: shortWait(finalArrival - first.startUtcMs) })}
      </div>

      <div className="legs">
        {legs.map((leg, index) => (
          <div key={leg[0].id}>
            {index > 0 && <Layover prev={legs[index - 1]} next={leg} />}
            <LegBlock leg={leg} index={index} qr={qr} now={now} />
          </div>
        ))}
      </div>

      {baggage && (
        <div className="pass-bag leg-bag">
          🧳 <span className="muted">{t('Maletas')}:</span> {baggage}
        </div>
      )}
      {people.length > 0 && (
        <div className="pass-people">
          {people.map((b) => (
            <Link key={b.id} to={`/bookings/${b.id}`} className="pass-person">
              <span>{passengerOf(b.title) ?? b.title}</span>
              <span className="muted">{b.reference ?? ''}</span>
              <span className="muted">›</span>
            </Link>
          ))}
        </div>
      )}

      <div className="pass-perf" />
      <div className="pass-actions">
        {first.startUtcMs > now && directions ? (
          <a className="btn primary" href={isAppleDevice() ? directions.apple : directions.google} target="_blank" rel="noreferrer">
            {t('Cómo llegar')}
          </a>
        ) : currentQr ? (
          <Link className="btn primary" to={`/bookings/${currentQr.id}/qr`}>
            {t('Ver QR')}
          </Link>
        ) : (
          <span />
        )}
        <Link className="btn" to={`/bookings/${current[0].id}`}>
          {t('Ver reserva')}
        </Link>
      </div>
    </section>
  );
}

/** La tarjeta de lo siguiente: con escalas, una sola tarjeta para todo el viaje; si no, la tarjeta de embarque de siempre. */
export function JourneyCard({ legs, qr, now, label }: { legs: Leg[]; qr: ReadonlySet<string>; now: number; label?: string }) {
  return legs.length > 1 ? (
    <ConnectionCard legs={legs} qr={qr} now={now} label={label} />
  ) : (
    <BoardingCard group={legs[0]} qr={qr} now={now} label={label} />
  );
}

/** Una fila de la agenda para un viaje con escalas: «AEP → GRU → MAD», la escala y los vuelos. */
export function ConnectionRow({ legs, now, date }: { legs: Leg[]; now?: number; date?: string }) {
  const first = legs[0][0];
  // En el día siguiente de una escala nocturna, la hora es la del tramo de ese día.
  const shown = (date && legs.find((leg) => leg[0].startLocal.slice(0, 10) >= date)?.[0]) || first;
  const people = legs[0].length > 1 ? legs[0].map((b) => passengerOf(b.title) ?? b.title).join(', ') : null;
  const layovers = legs
    .slice(1)
    .map((leg, i) => `${shortPlace(legs[i][0].endPlace)} ${shortWait(leg[0].startUtcMs - arrivalMs(legs[i]))}`)
    .join(', ');
  const past = now !== undefined && arrivalMs(legs[legs.length - 1]) < now;
  const tracked = now === undefined ? undefined : legs.find((leg) => arrivalMs(leg) >= now && isTracked(leg[0], now))?.[0];
  return (
    <Link className={`agenda-row type-${first.type}${past ? ' past' : ''}`} to={`/bookings/${shown.id}`}>
      <span className="agenda-time">{timeOf(shown.startLocal)}</span>
      <span className="agenda-icon">{TYPE_INFO[first.type].icon}</span>
      <span className="agenda-text">
        <b>{connectionRoute(legs)}</b>
        <span>
          {stopsLabel(legs)} ({layovers}) · {legs.map((leg) => withoutPassenger(leg[0].title).split(' ').slice(0, 2).join(' ')).join(' + ')}
        </span>
        {people && <span>{people}</span>}
        {tracked && <FlightStatusLine booking={tracked} />}
      </span>
      <span className="agenda-go">›</span>
    </Link>
  );
}

/** En la lista del viaje: una sola tarjeta con todos los tramos, cada uno con su enlace a la reserva. */
export function ConnectionBookingCard({
  legs,
  past = false,
  onHide,
}: {
  legs: Leg[];
  past?: boolean;
  onHide?: (ids: string[], hidden: boolean) => void;
}) {
  const first = legs[0][0];
  const last = legs[legs.length - 1][0];
  const all: Booking[] = legs.flat();
  return (
    <div className={`card booking connection-card type-${first.type}${past ? ' past' : ''}`}>
      <div className="time">{timeOf(first.startLocal)}</div>
      <div className="icon" aria-label={TYPE_INFO[first.type].label}>
        {TYPE_INFO[first.type].icon}
      </div>
      <div className="body">
        <div className="title">
          {connectionRoute(legs)}
          {past && <span className="badge done">{t('Realizada')}</span>}
          {all.some((b) => b.changeNote) && <span className="badge danger"> ⚠️ {t('Modificada')}</span>}
        </div>
        <div className="sub">
          🔁 {stopsLabel(legs)} ·{' '}
          {t('llegada {time}', { time: last.endLocal ? `${timeOf(last.endLocal)}${dayShift(first.startLocal, last.endLocal)}` : '–' })}
        </div>
        {legs.map((leg, index) => (
          <div key={leg[0].id}>
            {index > 0 && (
              <div className="sub layover-line">
                ⏱ {t('Escala en {place}', { place: shortPlace(legs[index - 1][0].endPlace) })} ·{' '}
                {shortWait(leg[0].startUtcMs - arrivalMs(legs[index - 1]))}
              </div>
            )}
            <Link className="leg-link" to={`/bookings/${leg[0].id}`}>
              <span>
                <b>{timeOf(leg[0].startLocal)}</b> {withoutPassenger(leg[0].title)}
                {leg[0].reference && <span className="muted"> · {leg[0].reference}</span>}
              </span>
              <span className="muted">›</span>
            </Link>
            {!past && isTracked(leg[0]) && <FlightStatusLine booking={leg[0]} />}
          </div>
        ))}
      </div>
      {onHide && (
        <button
          type="button"
          className="btn small hide-toggle"
          aria-label={t('Ocultar «{name}» de mis listas', { name: connectionRoute(legs) })}
          title={t('Ocultar')}
          onClick={() =>
            onHide(
              all.map((b) => b.id),
              true,
            )
          }
        >
          🙈
        </button>
      )}
    </div>
  );
}
