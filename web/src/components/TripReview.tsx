import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Booking, Trip } from '../data/types';
import { todayLocal } from '../domain/agenda';
import { reviewTrip } from '../domain/review';
import { t } from '../i18n';

/** «🔎 Revisión del viaje»: lo que no cuadra en lo que queda por delante, con enlace a cada reserva. */
export function TripReview({ trip, bookings }: { trip: Trip; bookings: readonly Booking[] }) {
  const [ignored, setIgnored] = useState<Set<string>>(() => ignoredNights(trip.id));
  const now = Date.now();
  const today = todayLocal();
  if ((trip.endDate ?? '9999') < today) {
    return null;
  }
  const issues = reviewTrip(trip, bookings, now, today, ignored);

  function ignore(nights: readonly string[]) {
    const next = new Set([...ignored, ...nights]);
    setIgnored(next);
    saveIgnoredNights(trip.id, next);
  }

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
            {issue.nights && (
              <div className="small">
                <Link to={`/trips/${trip.id}/bookings/new`} style={{ marginRight: 10 }}>
                  {t('+ Añadir alojamiento')}
                </Link>
                <button type="button" className="linklike" onClick={() => ignore(issue.nights ?? [])}>
                  {t('Ya lo tengo resuelto')}
                </button>
              </div>
            )}
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

/** Noches que alguien ha dado por buenas (en casa de alguien, un alojamiento sin reserva…), por viaje y en este móvil. */
const ignoredKey = (tripId: string) => `viajes.review.nights.${tripId}`;

function ignoredNights(tripId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(ignoredKey(tripId)) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveIgnoredNights(tripId: string, nights: ReadonlySet<string>) {
  try {
    localStorage.setItem(ignoredKey(tripId), JSON.stringify([...nights]));
  } catch {
    // Sin almacenamiento: volverá a avisar.
  }
}
