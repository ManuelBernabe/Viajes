import { useEffect, useState } from 'react';
import { api, describeError } from '../api';
import { useSession } from '../app/SessionContext';
import { savePlace } from '../data/repo';
import type { Place, PlaceCategory, Trip } from '../data/types';
import { PLACE_INFO } from '../domain/places';
import { lang, t } from '../i18n';

interface Suggestion {
  id: string;
  name: string;
  category: PlaceCategory;
  description: string;
  address: string | null;
}

interface SuggestionsResponse {
  suggestions: Suggestion[];
  added: number;
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  function setSuggestions(next: Suggestion[]) {
    setSuggestionsState(next);
    writeCache(trip.id, next);
  }

  useEffect(() => {
    let alive = true;
    api<SuggestionsResponse>(`/api/trips/${trip.id}/place-suggestions`)
      .then((result) => {
        if (alive) {
          setSuggestions(result.suggestions);
        }
      })
      .catch(() => {
        // Sin conexión: se queda la copia local.
      });
    return () => {
      alive = false;
    };
  }, [trip.id]);

  async function ask() {
    setBusy(true);
    setMessage('');
    try {
      const result = await api<SuggestionsResponse>(`/api/trips/${trip.id}/place-suggestions`, {
        method: 'POST',
        body: JSON.stringify({ lang: lang() }),
      });
      setSuggestions(result.suggestions);
      if (result.added === 0) {
        setMessage(t('No hay sugerencias nuevas: ya tenéis apuntados los sitios que se le ocurren.'));
      }
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function add(chosen: readonly Suggestion[]) {
    for (const suggestion of chosen) {
      await savePlace(
        { tripId: trip.id, name: suggestion.name, category: suggestion.category, notes: suggestion.description || null, url: null, address: suggestion.address, visited: false },
        session.email ?? '',
      );
    }
    const ids = new Set(chosen.map((s) => s.id));
    setSuggestions((suggestions ?? []).filter((s) => !ids.has(s.id)));
  }

  async function dismiss(suggestion: Suggestion) {
    const before = suggestions ?? [];
    setSuggestions(before.filter((s) => s.id !== suggestion.id));
    try {
      await api(`/api/trips/${trip.id}/place-suggestions/${suggestion.id}`, { method: 'DELETE' });
    } catch (error) {
      setSuggestions(before);
      setMessage(describeError(error));
    }
  }

  const names = new Set(existing.map((p) => p.name.trim().toLowerCase()));
  const pending = suggestions?.filter((s) => !names.has(s.name.trim().toLowerCase())) ?? [];

  return (
    <section className="card">
      <h3>✨ {t('Ideas para {place}', { place: trip.destination || trip.title })}</h3>
      <div className="small muted">
        {pending.length > 0
          ? t('Propuestas con IA y guardadas en el viaje. Añade las que te gusten a la lista; las demás puedes quitarlas.')
          : t('Sitios para ver, comer o tomar algo, propuestos con IA. Añade los que te gusten.')}
      </div>

      {pending.map((suggestion) => (
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
          <button className="btn small primary" type="button" onClick={() => void add([suggestion])} aria-label={t('Añadir {name}', { name: suggestion.name })}>
            {t('+ Añadir')}
          </button>
          <button className="btn small" type="button" onClick={() => void dismiss(suggestion)} aria-label={t('Quitar {name} de las ideas', { name: suggestion.name })}>
            ✕
          </button>
        </div>
      ))}

      <div className="actions" style={{ marginTop: 10 }}>
        {pending.length > 1 && (
          <button className="btn" type="button" onClick={() => void add(pending)}>
            {t('Añadir todas ({n})', { n: pending.length })}
          </button>
        )}
        <button className={`btn${pending.length === 0 ? ' block' : ''}`} type="button" disabled={busy} onClick={() => void ask()}>
          {busy ? t('Buscando sitios…') : (suggestions?.length ?? 0) === 0 ? t('Sugerir sitios') : t('Sugerir más')}
        </button>
      </div>
      {message && <p className="small muted">{message}</p>}
    </section>
  );
}
