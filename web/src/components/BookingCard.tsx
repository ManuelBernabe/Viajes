import { Link } from 'react-router-dom';
import { timeOf, zoneLabel } from '../data/localTime';
import type { Booking } from '../data/types';
import { TYPE_INFO } from '../domain/agenda';
import { t } from '../i18n';
import { FlightStatusLine, isTracked } from './FlightStatus';
import { formatSeats, useSeats } from './useSeats';

/** `past`: reserva ya terminada, en el histórico (atenuada y marcada como realizada). */
/**
 * `onHide`: botón para ocultar la reserva de mis listas (o volver a mostrarla, si `hidden`). Quien administra ve las
 * reservas de todo el hogar y así quita de la vista las que no le tocan.
 */
export function BookingCard({
  booking,
  showDay,
  past = false,
  hidden = false,
  onHide,
}: {
  booking: Booking;
  showDay?: string;
  past?: boolean;
  hidden?: boolean;
  onHide?: (hidden: boolean) => void;
}) {
  const info = TYPE_INFO[booking.type];
  const route = [booking.startPlace, booking.endPlace].filter(Boolean).join(' → ');
  const seats = useSeats(booking.type === 'flight' || booking.type === 'train' ? [booking] : []);
  return (
    <Link className={`card booking type-${booking.type}${past || hidden ? ' past' : ''}`} to={`/bookings/${booking.id}`}>
      <div className="time">
        {timeOf(booking.startLocal)}
        <span className="tz">{zoneLabel(booking.startTz)}</span>
      </div>
      <div className="icon" aria-label={info.label}>
        {info.icon}
      </div>
      <div className="body">
        <div className="title">
          {booking.title}
          {past && <span className="badge done">{t('Realizada')}</span>}
          {booking.changeNote && <span className="badge danger"> ⚠️ {t('Modificada')}</span>}
          {booking.visibility === 'private' && <span className="badge"> {t('Privada')}</span>}
          {booking.visibility === 'some' && <span className="badge"> {t('Compartida con {n}', { n: (booking.sharedWith ?? []).length })}</span>}
        </div>
        {showDay && <div className="sub">{showDay}</div>}
        {route && <div className="sub">{route}</div>}
        {booking.reference && <div className="sub">{t('Localizador')} {booking.reference}</div>}
        {seats.length > 0 && (
          <div className="sub">
            💺 <strong>{formatSeats(seats)}</strong>
          </div>
        )}
        {!past && isTracked(booking) && <FlightStatusLine booking={booking} />}
      </div>
      {onHide && (
        <button
          type="button"
          className="btn small hide-toggle"
          aria-label={hidden ? t('Mostrar «{name}» en mis listas', { name: booking.title }) : t('Ocultar «{name}» de mis listas', { name: booking.title })}
          title={hidden ? t('Mostrar') : t('Ocultar')}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onHide(!hidden);
          }}
        >
          {hidden ? '👁' : '🙈'}
        </button>
      )}
    </Link>
  );
}
