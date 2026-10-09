import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BackLink } from '../app/Layout';
import { describeError } from '../api';
import { getTrip } from '../data/repo';
import { useLiveQuery } from '../data/useLive';
import { cachedDestination, formatRate, loadDestination, quickConversions, type CountryInfo, type DestinationInfo } from '../domain/destination';
import { lang, t } from '../i18n';

/**
 * «🌍 Información del destino»: por cada país del viaje, moneda y cambio, enchufes, emergencias, propinas, idioma, visado
 * y unos consejos. Lo prepara la IA una vez (se guarda en el servidor y aquí, para verlo sin conexión).
 */
export function DestinationPage() {
  const { tripId = '' } = useParams();
  const trip = useLiveQuery(() => getTrip(tripId), [tripId]);
  const [info, setInfo] = useState<DestinationInfo | null>(() => cachedDestination(tripId));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function load(refresh: boolean) {
    setBusy(true);
    setMessage('');
    try {
      setInfo(await loadDestination(tripId, refresh));
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load(false);
  }, [tripId]);

  return (
    <main className="page">
      <div className="topbar">
        <BackLink to={`/trips/${tripId}`} />
        <h1>🌍 {t('Información del destino')}</h1>
      </div>
      {trip && <div className="muted">{trip.title}</div>}

      {busy && !info && <p className="muted">{t('Preparando la información del destino…')}</p>}
      {message && <p className="error">{message}</p>}

      {info?.countries.map((country) => <CountryCard key={country.country} country={country} />)}

      {info && (
        <>
          <p className="muted small">
            {t('Orientativo: comprueba los requisitos de entrada en la web oficial antes de viajar.')}
            {info.ratesMs ? ` ${t('Cambio del {date}.', { date: new Date(info.ratesMs).toLocaleDateString(lang()) })}` : ''}
          </p>
          <button className="btn" type="button" disabled={busy} onClick={() => void load(true)}>
            {busy ? t('Actualizando…') : `↻ ${t('Actualizar')}`}
          </button>
        </>
      )}
    </main>
  );
}

function CountryCard({ country }: { country: CountryInfo }) {
  const rows: [string, string, string | undefined][] = [
    ['🔌', t('Enchufes'), [country.plugs, country.voltage].filter(Boolean).join(' · ') || undefined],
    ['🚨', t('Emergencias'), country.emergency],
    ['💶', t('Propinas'), country.tipping],
    ['🗣️', t('Idioma'), country.language],
    ['🛂', t('Visado'), country.visa],
    ['🏛️', t('Embajada o consulado'), country.embassy],
  ];
  return (
    <section className="card dest-card">
      <h2 className="dest-title">
        <span className="dest-flag">{country.flag}</span> {country.country}
      </h2>
      {country.currencyCode && (
        <div className="dest-money">
          <div>
            <strong>{country.currencyName ?? country.currencyCode}</strong> <span className="muted">({country.currencyCode})</span>
          </div>
          {country.rate != null && country.currencyCode !== 'EUR' && (
            <>
              <div className="dest-rate">{formatRate(country.rate, country.currencyCode, lang())}</div>
              <div className="muted small">{quickConversions(country.rate, lang()).join(' · ')}</div>
            </>
          )}
        </div>
      )}
      <dl className="dest-rows">
        {rows
          .filter(([, , value]) => value)
          .map(([icon, label, value]) => (
            <div key={label} className="dest-row">
              <dt>
                {icon} {label}
              </dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      {country.tips && country.tips.length > 0 && (
        <ul className="dest-tips">
          {country.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
