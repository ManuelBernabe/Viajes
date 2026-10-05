import { Link } from 'react-router-dom';
import { timeOf, zoneLabel } from '../data/localTime';
import type { Booking } from '../data/types';
import { TYPE_INFO } from '../domain/agenda';
import { t } from '../i18n';

/** `past`: reserva ya terminada, en el histórico (atenuada y marcada como realizada). */
export function BookingCard({ booking, showDay, past = false }: { booking: Booking; showDay?: string; past?: boolean }) {
  const info = TYPE_INFO[booking.type];
  const route = [booking.startPlace, booking.endPlace].filter(Boolean).join(' → ');
  return (
    <Link className={`card booking type-${booking.type}${past ? ' past' : ''}`} to={`/bookings/${booking.id}`}>
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
      </div>
    </Link>
  );
}
