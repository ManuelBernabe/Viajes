import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { BackLink } from '../app/Layout';
import { useSession } from '../app/SessionContext';
import { deletePlace, getTrip, listPlaces, savePlace } from '../data/repo';
import { PLACE_CATEGORIES, type Place, type PlaceBody, type PlaceCategory } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { mapsUrl, parsePasted, PLACE_INFO, sortPlaces } from '../domain/places';
import { t } from '../i18n';
import { PlaceSuggestions } from '../components/PlaceSuggestions';
import { MicButton } from '../components/MicButton';

const EMPTY: Omit<PlaceBody, 'tripId'> = { name: '', category: 'see', notes: null, url: null, address: null, visited: false };

function CategoryChips({ value, onChange }: { value: PlaceCategory; onChange: (category: PlaceCategory) => void }) {
  return (
    <div className="chips" role="radiogroup" aria-label={t('Categoría')}>
      {PLACE_CATEGORIES.map((category) => (
        <button key={category} type="button" role="radio" aria-checked={value === category} className={value === category ? 'on' : ''} onClick={() => onChange(category)}>
          {PLACE_INFO[category].icon} {PLACE_INFO[category].label}
        </button>
      ))}
    </div>
  );
}

/** Alta rápida (solo el nombre y la categoría) y edición completa con los detalles. */
function PlaceForm({
  tripId,
  place,
  onDone,
}: {
  tripId: string;
  place?: Place;
  onDone?: () => void;
}) {
  const session = useSession();
  const [form, setForm] = useState<Omit<PlaceBody, 'tripId'>>(place ? { ...place } : EMPTY);
  const [details, setDetails] = useState(!!place);
  const [message, setMessage] = useState('');

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  /** Si pegan un enlace (por ejemplo, «Compartir» desde Google Maps) se separa en nombre y enlace. */
  function onName(text: string) {
    if (/https?:\/\//i.test(text)) {
      const parsed = parsePasted(text);
      setForm((current) => ({ ...current, name: parsed.name, url: parsed.url }));
      setDetails(true);
      if (!parsed.name) {
        setMessage(t('Enlace guardado. Escribe ahora el nombre del sitio.'));
      }
      return;
    }
    set('name', text);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setMessage(t('Escribe el nombre del sitio.'));
      return;
    }
    const url = form.url?.trim() || null;
    if (url && !/^https?:\/\//i.test(url)) {
      setMessage(t('El enlace tiene que empezar por http:// o https://.'));
      return;
    }
    await savePlace(
      { tripId, name, category: form.category, notes: form.notes?.trim() || null, url, address: form.address?.trim() || null, visited: form.visited },
      session.email ?? '',
      place?.id,
    );
    setMessage('');
    if (place) {
      onDone?.();
    } else {
      setForm({ ...EMPTY, category: form.category });
      setDetails(false);
    }
  }

  async function remove() {
    if (place && confirm(t('¿Borrar «{name}» de la lista?', { name: place.name }))) {
      await deletePlace(place.id);
      onDone?.();
    }
  }

  return (
    <form onSubmit={submit} className={place ? '' : 'card'}>
      {!place && <h3>{t('Añadir un sitio')}</h3>}
      <div className="field" style={{ flexDirection: 'row', gap: 8 }}>
        <input
          value={form.name}
          onChange={(e) => onName(e.target.value)}
          placeholder={t('Nombre, o pega un enlace de Google Maps')}
          aria-label={t('Nombre del sitio')}
          maxLength={1200}
        />
        <MicButton onText={(text) => onName(text.replace(/[.。]$/, ''))} onError={setMessage} />
      </div>
      <CategoryChips value={form.category} onChange={(category) => set('category', category)} />
      {details ? (
        <>
          <div className="field">
            <label htmlFor={`notes-${place?.id ?? 'new'}`}>{t('Notas')}</label>
            <textarea
              id={`notes-${place?.id ?? 'new'}`}
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
              placeholder={t('Por qué merece la pena, horario, qué pedir…')}
              maxLength={2000}
            />
          </div>
          <div className="field">
            <label htmlFor={`address-${place?.id ?? 'new'}`}>{t('Dirección')}</label>
            <input id={`address-${place?.id ?? 'new'}`} value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} maxLength={300} />
          </div>
          <div className="field">
            <label htmlFor={`url-${place?.id ?? 'new'}`}>{t('Enlace (web, Google Maps, reseña…)')}</label>
            <input id={`url-${place?.id ?? 'new'}`} type="url" inputMode="url" value={form.url ?? ''} onChange={(e) => set('url', e.target.value)} maxLength={1000} />
          </div>
        </>
      ) : (
        <button className="btn small" type="button" onClick={() => setDetails(true)}>
          {t('+ Notas, dirección o enlace')}
        </button>
      )}
      {message && <p className="error small">{message}</p>}
      <div className="actions">
        <button className="btn primary" type="submit">
          {place ? t('Guardar') : t('Añadir')}
        </button>
        {place && (
          <>
            <button className="btn" type="button" onClick={onDone}>
              {t('Cancelar')}
            </button>
            <button className="btn danger" type="button" onClick={() => void remove()}>
              {t('Borrar')}
            </button>
          </>
        )}
      </div>
    </form>
  );
}

function PlaceCard({ place, destination }: { place: Place; destination: string | null }) {
  const session = useSession();
  const [editing, setEditing] = useState(false);
  const info = PLACE_INFO[place.category];

  async function toggleVisited() {
    const { id, tripId, name, category, notes, url, address, visited } = place;
    await savePlace({ tripId, name, category, notes, url, address, visited: !visited }, session.email ?? '', id);
  }

  if (editing) {
    return (
      <section className="card">
        <PlaceForm tripId={place.tripId} place={place} onDone={() => setEditing(false)} />
      </section>
    );
  }

  return (
    <section className={`card place${place.visited ? ' past' : ''}`}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <h3>
            {info.icon} {place.name}
            {place.visited && <span className="badge done">{t('Visitado')}</span>}
          </h3>
          <div className="muted small">{info.label}{place.address ? ` · ${place.address}` : ''}</div>
          {place.notes && <p className="small" style={{ whiteSpace: 'pre-line', margin: '6px 0 0' }}>{place.notes}</p>}
        </div>
        <button className="btn small" type="button" onClick={() => setEditing(true)} aria-label={t('Editar {name}', { name: place.name })}>
          {t('Editar')}
        </button>
      </div>
      <div className="actions">
        <a className="btn small" href={mapsUrl(place, destination)} target="_blank" rel="noreferrer">
          🗺️ {t('Mapa')}
        </a>
        {place.url && (
          <a className="btn small" href={place.url} target="_blank" rel="noreferrer">
            🔗 {t('Enlace')}
          </a>
        )}
        <button className={`btn small${place.visited ? '' : ' primary'}`} type="button" onClick={() => void toggleVisited()}>
          {place.visited ? t('Quitar «visitado»') : `✓ ${t('Visitado')}`}
        </button>
      </div>
    </section>
  );
}

/** Lugares recomendables de un viaje: lo que queremos ver, dónde comer… Lo ve y lo edita todo el hogar. */
export function PlacesPage() {
  const { tripId = '' } = useParams();
  const trip = useLiveQuery(() => getTrip(tripId), [tripId]);
  const places = useLiveQuery(() => listPlaces(tripId), [tripId]);
  const [filter, setFilter] = useState<PlaceCategory | null>(null);
  const [showVisited, setShowVisited] = useState(false);

  if (trip === undefined || places === undefined) {
    return <main className="page muted">{t('Cargando…')}</main>;
  }
  if (!trip) {
    return (
      <main className="page">
        <div className="topbar">
          <BackLink to="/" />
          <h1>{t('Lugares')}</h1>
        </div>
        <p className="empty">{t('Este viaje ya no existe.')}</p>
      </main>
    );
  }

  const present = PLACE_CATEGORIES.filter((c) => places.some((p) => p.category === c));
  const shown = filter ? places.filter((p) => p.category === filter) : places;
  const { pending, visited } = sortPlaces(shown);

  return (
    <main className="page">
      <div className="topbar">
        <BackLink to={`/trips/${tripId}`} />
        <h1>{t('Lugares')}</h1>
      </div>
      <div className="muted">{trip.title}{trip.destination && trip.destination !== trip.title ? ` · ${trip.destination}` : ''}</div>

      <PlaceForm tripId={tripId} />

      {places.length === 0 && (
        <p className="empty">
          {t('Aún no hay sitios. Apunta lo que queráis ver, dónde comer o tomar algo; todo el hogar lo ve y puede marcarlo como visitado.')}
        </p>
      )}

      {present.length > 1 && (
        <div className="chips" role="group" aria-label={t('Filtrar por categoría')} style={{ marginTop: 12 }}>
          <button type="button" className={filter === null ? 'on' : ''} onClick={() => setFilter(null)}>
            {t('Todo')} ({places.length})
          </button>
          {present.map((category) => (
            <button key={category} type="button" className={filter === category ? 'on' : ''} onClick={() => setFilter(filter === category ? null : category)}>
              {PLACE_INFO[category].icon} {PLACE_INFO[category].label} ({places.filter((p) => p.category === category).length})
            </button>
          ))}
        </div>
      )}

      {pending.map((place) => (
        <PlaceCard key={place.id} place={place} destination={trip.destination ?? trip.title} />
      ))}

      {visited.length > 0 && (
        <>
          <button className="btn block" type="button" style={{ marginTop: 12 }} onClick={() => setShowVisited(!showVisited)}>
            {showVisited
              ? t('Ocultar los visitados')
              : visited.length === 1
                ? t('Ver el visitado (1)')
                : t('Ver los visitados ({n})', { n: visited.length })}
          </button>
          {showVisited && visited.map((place) => <PlaceCard key={place.id} place={place} destination={trip.destination ?? trip.title} />)}
        </>
      )}

      {/* Las ideas de la IA, después de vuestra lista: lo que habéis apuntado (lo último, primero) queda siempre arriba. */}
      <PlaceSuggestions trip={trip} existing={places} />
    </main>
  );
}
