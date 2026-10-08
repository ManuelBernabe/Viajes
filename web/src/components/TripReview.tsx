import { Link } from 'react-router-dom';
import type { Booking, Trip } from '../data/types';
import { todayLocal } from '../domain/agenda';
import { reviewTrip } from '../domain/review';
import { t } from '../i18n';

/** «🔎 Revisión del viaje»: lo que no cuadra en lo que queda por delante, con enlace a cada reserva. */
export function TripReview({ trip, bookings }: { trip: Trip; bookings: readonly Booking[] }) {
  const now = Date.now();
  const today = todayLocal();
  if ((trip.endDate ?? '9999') < today) {
    return null;
  }
  const issues = reviewTrip(trip, bookings, now, today);
  if (issues.length === 0) {
    return bookings.length > 0 ? <p className="small muted review-ok">✅ {t('Revisión del viaje: todo cuadra.')}</p> : null;
  }
  return (
    <section className="card review">
      <h3 style={{ marginTop: 0 }}>🔎 {t('Revisión del viaje')}</h3>
      {issues.map((issue, index) => (
        <div key={index} className={`review-item ${issue.level}`}>
          <span>{issue.level === 'danger' ? '⛔' : issue.level === 'warning' ? '⚠️' : 'ℹ️'}</span>
          <div>
            <div>{issue.message}</div>
            {issue.bookings.length > 0 && (
              <div className="small">
                {issue.bookings.map((b) => (
                  <Link key={b.id} to={`/bookings/${b.id}`} style={{ marginRight: 10 }}>
                    {t('Ver «{name}»', { name: b.title })}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
