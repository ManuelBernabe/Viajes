import { useEffect, useState } from 'react';
import { formatDay } from '../data/localTime';
import { cachedWeather, describeWeather, loadWeather, temps, type DayWeather } from '../domain/weather';
import { t } from '../i18n';

/** La previsión del viaje (y de cada día), con la copia guardada al momento y la del servidor cuando llega. */
export function useTripWeather(tripId: string | undefined): DayWeather[] {
  const [days, setDays] = useState<DayWeather[]>(() => (tripId ? (cachedWeather(tripId)?.days ?? []) : []));
  useEffect(() => {
    if (!tripId) {
      return;
    }
    let alive = true;
    void loadWeather(tripId).then((result) => {
      if (alive) {
        setDays(result);
      }
    });
    return () => {
      alive = false;
    };
  }, [tripId]);
  return days;
}

/** «☀️ 24° / 15°» junto al día de la agenda. */
export function DayWeatherBadge({ day }: { day: DayWeather | undefined }) {
  if (!day) {
    return null;
  }
  const { icon, label } = describeWeather(day.code);
  return (
    <span className="weather-badge" title={`${label} · ${day.place}`}>
      {icon} {temps(day)}
    </span>
  );
}

/** «🌤️ El tiempo»: una tira con los días del viaje que ya tienen previsión, marcando cuándo cambia el sitio. */
export function WeatherStrip({ days }: { days: readonly DayWeather[] }) {
  if (days.length === 0) {
    return null;
  }
  return (
    <section className="card">
      <h3 style={{ marginTop: 0 }}>🌤️ {t('El tiempo')}</h3>
      <div className="weather-strip" role="list">
        {days.map((day, index) => {
          const { icon, label } = describeWeather(day.code);
          const newPlace = index === 0 || days[index - 1].place !== day.place;
          return (
            <div key={day.date} className="weather-day" role="listitem" title={label}>
              <div className="small muted">{formatDay(day.date)}</div>
              <div className="weather-icon">{icon}</div>
              <div className="small">
                <strong>{day.max !== null ? `${Math.round(day.max)}°` : '–'}</strong> {day.min !== null ? `${Math.round(day.min)}°` : ''}
              </div>
              {day.rain !== null && day.rain >= 30 && <div className="small muted">💧 {day.rain} %</div>}
              <div className={`small weather-place${newPlace ? '' : ' same'}`}>{day.place}</div>
            </div>
          );
        })}
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>
        {t('Previsión de Open-Meteo para donde dormís cada noche. Llega hasta 16 días por delante.')}
      </p>
    </section>
  );
}
