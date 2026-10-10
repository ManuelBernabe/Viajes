import { useEffect, useState } from 'react';
import { api, describeError } from '../api';
import { useSession } from '../app/SessionContext';
import { savePlace } from '../data/repo';
import type { Place, PlaceCategory, Trip } from '../data/types';
import { groupByArea, PLACE_INFO } from '../domain/places';
import { lang, t } from '../i18n';

interface Suggestion {
  id: string;
  name: string;
  category: PlaceCategory;
  description: string;
  address: string | null;
  /** Ciudad del viaje donde está (o, en viajes sin vuelos ni trenes, el país), para agruparlas. */
  area?: string | null;
}

interface SuggestionsResponse {
  suggestions: Suggestion[];
  added: number;
  /** Las ciudades donde se está, en el orden del viaje (sin escalas). */
  cities?: string[];
}

const citiesKey = (tripId: string) => `viajes:ideas-ciudades:${tripId}`;

function readCities(tripId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(citiesKey(tripId)) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/** Copia local de las ideas del viaje, para verlas al momento (y sin conexión) mientras llega la lista del servidor. */
const cacheKey = (tripId: string) => `viajes:ideas:${tripId}`;

function readCache(tripId: string): Suggestion[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(tripId));
    return raw ? (JSON.parse(raw) as Suggestion[]) : null;
  } catch {
    return null;
  }
}

function writeCache(tripId: string, suggestions: Suggestion[]) {
  try {
    localStorage.setItem(cacheKey(tripId), JSON.stringify(suggestions));
  } catch {
    // Sin almacenamiento: se vuelven a pedir al servidor la próxima vez.
  }
}

/**
 * «✨ Ideas para…»: la IA del servidor propone lugares del destino y quedan guardados en el viaje, para todo el hogar.
 * Al volver a entrar siguen ahí; «Sugerir más» añade ideas nuevas sin borrar las anteriores. Cada una se añade a «Lugares»
 * con un toque o se quita de la lista.
 */
export function PlaceSuggestions({ trip, existing }: { trip: Trip; existing: readonly Place[] }) {
  const session = useSession();
  const [suggestions, setSuggestionsState] = useState<Suggestion[] | null>(() => readCache(trip.id));
  const [cities, setCitiesState] = useState<string[]>(() => readCities(trip.id));
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  function setSuggestions(next: Suggestion[]) {
    setSuggestionsState(next);
    writeCache(trip.id, next);
  }

  function setCities(next: string[] | undefined) {
    if (!next) {
      return;
    }
    setCitiesState(next);
    try {
      localStorage.setItem(citiesKey(trip.id), JSON.stringify(next));
    } catch {
      // Sin almacenamiento.
    }
  }

  useEffect(() => {
    let alive = true;
    api<SuggestionsResponse>(`/api/trips/${trip.id}/place-suggestions?lang=${lang()}`)
      .then((result) => {
        if (alive) {
          setSuggestions(result.suggestions);
          setCities(result.cities);
        }
      })
      .catch(() => {
        // Sin conexión: se queda la copia local.
      });
    return () => {
      alive = false;
    };
  }, [trip.id]);

  /** Pide ideas nuevas: de todo el viaje o de una de sus ciudades. */
  async function ask(area?: string) {
    setBusy(area ?? '');
    setMessage('');
    try {
      const result = await api<SuggestionsResponse>(`/api/trips/${trip.id}/place-suggestions`, {
        method: 'POST',
        body: JSON.stringify({ lang: lang(), area: area ?? null }),
      });
      setSuggestions(result.suggestions);
      setCities(result.cities);
      if (result.added === 0) {
        setMessage(t('No hay sugerencias nuevas: ya tenéis apuntados los sitios que se le ocurren.'));
      }
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(null);
    }
  }

  async function add(chosen: readonly Suggestion[]) {
    for (const suggestion of chosen) {
      await savePlace(
        {
          tripId: trip.id,
          name: suggestion.name,
          category: suggestion.category,
          notes: suggestion.description || null,
          url: null,
          address: suggestion.address,
          visited: false,
        },
        session.email ?? '',
      );
    }
    // La idea no se borra: queda oculta mientras el sitio esté en «Lugares». Si se quita de ahí, vuelve a salir aquí.
  }

  async function dismiss(suggestion: Suggestion) {
    const before = suggestions ?? [];
    setSuggestions(before.filter((s) => s.id !== suggestion.id));
    try {
      await api(`/api/trips/${trip.id}/place-suggestions/${suggestion.id}`, {
        method: 'DELETE',
      });
    } catch (error) {
      setSuggestions(before);
      setMessage(describeError(error));
    }
  }

  const names = new Set(existing.filter((p) => p.deletedAtMs === null).map((p) => p.name.trim().toLowerCase()));
  const pending = suggestions?.filter((s) => !names.has(s.name.trim().toLowerCase())) ?? [];
  const groups = groupByArea(pending, `${trip.title} ${trip.destination ?? ''}`, cities);

  return (
    <section className="card">
      <h3>✨ {t('Ideas para {place}', { place: cities.length > 1 ? trip.title : cities[0] || trip.destination || trip.title })}</h3>
      <div className="small muted">
        {pending.length > 0
          ? t('Propuestas con IA y guardadas en el viaje. Añade las que te gusten a la lista; las demás puedes quitarlas.')
          : t('Sitios para ver, comer o tomar algo, propuestos con IA. Añade los que te gusten.')}
      </div>

      {groups.map((group) => (
        <div key={group.area ?? ''}>
          {groups.length > 1 && (
            <h4 className="idea-area" style={{ margin: '16px 0 4px' }}>
              📍 {group.area ?? t('Otros sitios')} <span className="muted small">({group.items.length})</span>
            </h4>
          )}
          {group.items.map((suggestion) => (
            <div key={suggestion.id} className="row between suggestion" style={{ alignItems: 'flex-start', margin: '10px 0', gap: 6 }}>
              <div className="grow">
                <strong>
                  {PLACE_INFO[suggestion.category].icon} {suggestion.name}
                </strong>
                {suggestion.description && <div className="small">{suggestion.description}</div>}
                <div className="small muted">
                  {PLACE_INFO[suggestion.category].label}
                  {suggestion.address ? ` · ${suggestion.address}` : ''}
                </div>
              </div>
              <button
                className="btn small primary"
                type="button"
                onClick={() => void add([suggestion])}
                aria-label={t('Añadir {name}', { name: suggestion.name })}
              >
                {t('+ Añadir')}
              </button>
              <button
                className="btn small"
                type="button"
                onClick={() => void dismiss(suggestion)}
                aria-label={t('Quitar {name} de las ideas', {
                  name: suggestion.name,
                })}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ))}

      <div className="actions" style={{ marginTop: 10 }}>
        {pending.length > 1 && (
          <button className="btn" type="button" onClick={() => void add(pending)}>
            {t('Añadir todas ({n})', { n: pending.length })}
          </button>
        )}
        <button className={`btn${pending.length === 0 ? ' block' : ''}`} type="button" disabled={busy !== null} onClick={() => void ask()}>
          {busy === '' ? t('Buscando sitios…') : (suggestions?.length ?? 0) === 0 ? t('Sugerir sitios') : t('Sugerir más')}
        </button>
      </div>
      {cities.length > 1 && (
        <div className="idea-cities">
          <span className="small muted">{t('Más ideas de:')}</span>
          {cities.map((city) => (
            <button key={city} className="btn small" type="button" disabled={busy !== null} onClick={() => void ask(city)}>
              {busy === city ? t('Buscando sitios…') : `✨ ${city}`}
            </button>
          ))}
        </div>
      )}
      {message && <p className="small muted">{message}</p>}
    </section>
  );
}
