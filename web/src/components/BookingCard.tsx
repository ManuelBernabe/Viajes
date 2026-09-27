import { Link } from 'react-router-dom';
import { timeOf, zoneLabel } from '../data/localTime';
import type { Booking } from '../data/types';
import { TYPE_INFO } from '../domain/agenda';

export function BookingCard({ booking, showDay }: { booking: Booking; showDay?: string }) {
  const info = TYPE_INFO[booking.type];
  const route = [booking.startPlace, booking.endPlace].filter(Boolean).join(' → ');
  return (
    <Link className={`card booking type-${booking.type}`} to={`/bookings/${booking.id}`}>
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
          {booking.changeNote && <span className="badge danger"> ⚠️ Modificada</span>}
          {booking.visibility === 'private' && <span className="badge"> Privada</span>}
          {booking.visibility === 'some' && <span className="badge"> Compartida con {(booking.sharedWith ?? []).length}</span>}
        </div>
        {showDay && <div className="sub">{showDay}</div>}
        {route && <div className="sub">{route}</div>}
        {booking.reference && <div className="sub">Localizador {booking.reference}</div>}
      </div>
    </Link>
  );
}
