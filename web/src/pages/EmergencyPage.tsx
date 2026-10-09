import { useEffect, useState, type ReactNode } from 'react';
import { BackLink } from '../app/Layout';
import { describeError } from '../api';
import { listTrips } from '../data/repo';
import { useLiveQuery } from '../data/useLive';
import { tripStatus, todayLocal } from '../domain/agenda';
import { cachedDestination, type CountryInfo } from '../domain/destination';
import { cachedEmergency, emergencyApi, phonesIn, type EmergencyCard, type EmergencyContact, type EmergencyPerson } from '../domain/emergency';
import { lang, t } from '../i18n';

/** Botones para llamar a cada teléfono que aparece en el texto. */
function Calls({ text, big = false }: { text: string | null | undefined; big?: boolean }) {
  const phones = phonesIn(text);
  if (phones.length === 0) {
    return null;
  }
  return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
      {phones.map((p) => (
        <a key={p.tel} className={`btn ${big ? 'primary emergency-call' : ''}`} href={`tel:${p.tel}`}>
          📞 {p.label}
        </a>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dest-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * «🆘 Emergencia»: en el país donde estáis, el teléfono de emergencias y la embajada; y la tarjeta del hogar (seguro, a
 * quién llamar en casa y los datos médicos que se quieran apuntar). Se abre sin conexión con lo último que se vio.
 */
export function EmergencyPage() {
  const [card, setCard] = useState<EmergencyCard | null>(() => cachedEmergency());
  const [editing, setEditing] = useState(false);
  const today = todayLocal();
  const countries = useLiveQuery(async () => {
    const trips = (await listTrips()).filter((x) => x.deletedAtMs === null && tripStatus(x, today) === 'current');
    return trips.flatMap((trip) => cachedDestination(trip.id)?.countries ?? []);
  }, [today]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [editing]);

  useEffect(() => {
    emergencyApi
      .get()
      .then(setCard)
      .catch(() => {
        // Sin conexión: lo guardado en el móvil.
      });
  }, []);

  if (editing) {
    return (
      <EmergencyForm
        card={card ?? {}}
        onCancel={() => setEditing(false)}
        onSaved={(saved) => {
          setCard(saved);
          setEditing(false);
        }}
      />
    );
  }

  const insurance = card?.insurance;
  const contacts = card?.contacts ?? [];
  const people = card?.people ?? [];
  const empty = !insurance && contacts.length === 0 && people.length === 0 && !card?.notes;

  return (
    <main className="page">
      <div className="topbar">
        <BackLink to="/" />
        <h1>🆘 {t('Emergencia')}</h1>
      </div>

      {(countries ?? []).map((country) => (
        <CountryEmergency key={country.country} country={country} />
      ))}
      {countries && countries.length === 0 && (
        <p className="small muted">{t('Cuando estéis de viaje, aquí sale el teléfono de emergencias y la embajada de cada país (abre «🌍 Destino» del viaje una vez con conexión).')}</p>
      )}

      {empty ? (
        <section className="card">
          <p style={{ marginTop: 0 }}>{t('Apunta el seguro de viaje, a quién llamar en casa y, si queréis, el grupo sanguíneo y las alergias de cada uno. Lo verá todo el hogar, también sin conexión.')}</p>
          <button className="btn primary" type="button" onClick={() => setEditing(true)}>
            {t('Rellenar la tarjeta')}
          </button>
        </section>
      ) : (
        <>
          {insurance && (
            <section className="card">
              <h2 className="dest-title">🛡️ {t('Seguro de viaje')}</h2>
              <dl className="dest-rows">
                {insurance.company && <Row label={t('Compañía')}>{insurance.company}</Row>}
                {insurance.policy && <Row label={t('Póliza')}>{insurance.policy}</Row>}
                {insurance.notes && <Row label={t('Notas')}>{insurance.notes}</Row>}
              </dl>
              <Calls text={insurance.phone} big />
            </section>
          )}
          {contacts.length > 0 && (
            <section className="card">
              <h2 className="dest-title">🏠 {t('A quién llamar')}</h2>
              {contacts.map((c, i) => (
                <div key={i} className="dest-row" style={{ alignItems: 'center' }}>
                  <dt>{c.name}{c.relation ? ` · ${c.relation}` : ''}</dt>
                  <dd>{c.phone ? <a className="btn" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>📞 {c.phone}</a> : null}</dd>
                </div>
              ))}
            </section>
          )}
          {people.length > 0 && (
            <section className="card">
              <h2 className="dest-title">🩺 {t('Datos médicos')}</h2>
              {people.map((p, i) => (
                <div key={i} style={{ marginTop: i ? 10 : 0 }}>
                  <strong>{p.name}</strong>
                  <dl className="dest-rows">
                    {p.blood && <Row label={t('Grupo sanguíneo')}>{p.blood}</Row>}
                    {p.allergies && <Row label={t('Alergias')}>{p.allergies}</Row>}
                    {p.medication && <Row label={t('Medicación')}>{p.medication}</Row>}
                    {p.notes && <Row label={t('Notas')}>{p.notes}</Row>}
                  </dl>
                </div>
              ))}
            </section>
          )}
          {card?.notes && (
            <section className="card">
              <h2 className="dest-title">📝 {t('Notas')}</h2>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{card.notes}</p>
              <Calls text={card.notes} />
            </section>
          )}
          <button className="btn" type="button" onClick={() => setEditing(true)}>
            ✏️ {t('Editar la tarjeta')}
          </button>
          {card?.updatedMs ? (
            <p className="small muted">
              {t('Actualizada el {date}', { date: new Date(card.updatedMs).toLocaleDateString(lang()) })}
              {card.updatedBy ? ` · ${card.updatedBy}` : ''}
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}

function CountryEmergency({ country }: { country: CountryInfo }) {
  const search = `https://www.google.com/search?q=${encodeURIComponent(`Embajada de España ${country.country} site:exteriores.gob.es`)}`;
  return (
    <section className="card emergency-country">
      <h2 className="dest-title">
        <span className="dest-flag">{country.flag}</span> {country.country}
      </h2>
      {country.emergency && (
        <>
          <div className="muted small">{t('Emergencias')}: {country.emergency}</div>
          <Calls text={country.emergency} big />
        </>
      )}
      <div style={{ marginTop: 12 }}>
        <div className="muted small">{t('Embajada o consulado')}</div>
        <div>{country.embassy ?? t('Actualiza «🌍 Destino» del viaje para verla aquí.')}</div>
        <Calls text={country.embassy} />
        <a className="small" href={search} target="_blank" rel="noreferrer">
          {t('Comprobar en la web oficial')} ↗
        </a>
      </div>
    </section>
  );
}

function EmergencyForm({ card, onCancel, onSaved }: { card: EmergencyCard; onCancel: () => void; onSaved: (card: EmergencyCard) => void }) {
  const [insurance, setInsurance] = useState(card.insurance ?? {});
  const [contacts, setContacts] = useState<EmergencyContact[]>(card.contacts?.length ? card.contacts : [{}]);
  const [people, setPeople] = useState<EmergencyPerson[]>(card.people?.length ? card.people : [{}]);
  const [notes, setNotes] = useState(card.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      onSaved(await emergencyApi.save({ insurance, contacts, people, notes }));
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  const edit = <T,>(list: T[], set: (next: T[]) => void, index: number, change: Partial<T>) => set(list.map((x, i) => (i === index ? { ...x, ...change } : x)));

  return (
    <main className="page">
      <div className="topbar">
        <h1>🆘 {t('Editar la tarjeta')}</h1>
      </div>
      <section className="card emergency-form">
        <h2 className="dest-title">🛡️ {t('Seguro de viaje')}</h2>
        <input value={insurance.company ?? ''} onChange={(e) => setInsurance({ ...insurance, company: e.target.value })} placeholder={t('Compañía')} aria-label={t('Compañía')} />
        <input value={insurance.phone ?? ''} inputMode="tel" onChange={(e) => setInsurance({ ...insurance, phone: e.target.value })} placeholder={t('Teléfono de asistencia')} aria-label={t('Teléfono de asistencia')} />
        <input value={insurance.policy ?? ''} onChange={(e) => setInsurance({ ...insurance, policy: e.target.value })} placeholder={t('Número de póliza')} aria-label={t('Número de póliza')} />
      </section>

      <section className="card emergency-form">
        <h2 className="dest-title">🏠 {t('A quién llamar')}</h2>
        {contacts.map((c, i) => (
          <div key={i} className="emergency-grid">
            <input value={c.name ?? ''} onChange={(e) => edit(contacts, setContacts, i, { name: e.target.value })} placeholder={t('Nombre')} aria-label={t('Nombre')} />
            <input value={c.relation ?? ''} onChange={(e) => edit(contacts, setContacts, i, { relation: e.target.value })} placeholder={t('Relación')} aria-label={t('Relación')} />
            <input value={c.phone ?? ''} inputMode="tel" onChange={(e) => edit(contacts, setContacts, i, { phone: e.target.value })} placeholder={t('Teléfono')} aria-label={t('Teléfono')} />
          </div>
        ))}
        <button className="linklike small" type="button" onClick={() => setContacts([...contacts, {}])}>
          {t('+ Añadir otra persona')}
        </button>
      </section>

      <section className="card emergency-form">
        <h2 className="dest-title">🩺 {t('Datos médicos')}</h2>
        <p className="small muted" style={{ marginTop: 0 }}>{t('Opcional. Lo ve todo el hogar.')}</p>
        {people.map((p, i) => (
          <div key={i} className="emergency-person">
            <input value={p.name ?? ''} onChange={(e) => edit(people, setPeople, i, { name: e.target.value })} placeholder={t('Nombre')} aria-label={t('Nombre')} />
            <input value={p.blood ?? ''} onChange={(e) => edit(people, setPeople, i, { blood: e.target.value })} placeholder={t('Grupo sanguíneo')} aria-label={t('Grupo sanguíneo')} />
            <input value={p.allergies ?? ''} onChange={(e) => edit(people, setPeople, i, { allergies: e.target.value })} placeholder={t('Alergias')} aria-label={t('Alergias')} />
            <input value={p.medication ?? ''} onChange={(e) => edit(people, setPeople, i, { medication: e.target.value })} placeholder={t('Medicación')} aria-label={t('Medicación')} />
          </div>
        ))}
        <button className="linklike small" type="button" onClick={() => setPeople([...people, {}])}>
          {t('+ Añadir otra persona')}
        </button>
      </section>

      <section className="card emergency-form">
        <h2 className="dest-title">📝 {t('Notas')}</h2>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('Tarjetas bloqueadas, dónde está el pasaporte, otros teléfonos…')} aria-label={t('Notas')} />
      </section>

      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" type="button" disabled={busy} onClick={() => void save()}>
          {t('Guardar')}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          {t('Cancelar')}
        </button>
      </div>
      {message && <p className="error">{message}</p>}
    </main>
  );
}
