import { useState } from 'react';
import { api, describeError } from '../api';
import { useSession } from '../app/SessionContext';
import { savePlace } from '../data/repo';
import type { Place, PlaceCategory, Trip } from '../data/types';
import { PLACE_INFO } from '../domain/places';
import { lang, t } from '../i18n';

interface Suggestion {
  name: string;
  category: PlaceCategory;
  description: string;
  address: string | null;
}

/** «✨ Sugerir sitios»: la IA del servidor propone lugares del destino; cada uno se añade con un toque. Necesita conexión. */
export function PlaceSuggestions({ trip, existing }: { trip: Trip; existing: readonly Place[] }) {
  const session = useSession();
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function ask() {
    setBusy(true);
    setMessage('');
    try {
      const result = await api<{ suggestions: Suggestion[] }>(`/api/trips/${trip.id}/place-suggestions`, {
        method: 'POST',
        body: JSON.stringify({ lang: lang() }),
      });
      setSuggestions(result.suggestions);
      if (result.suggestions.length === 0) {
        setMessage(t('No hay sugerencias nuevas: ya tenéis apuntados los sitios que se le ocurren.'));
      }
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function add(suggestion: Suggestion) {
    await savePlace(
      { tripId: trip.id, name: suggestion.name, category: suggestion.category, notes: suggestion.description || null, url: null, address: suggestion.address, visited: false },
      session.email ?? '',
    );
    setSuggestions((current) => current?.filter((s) => s !== suggestion) ?? null);
  }

  async function addAll() {
    for (const suggestion of suggestions ?? []) {
      await add(suggestion);
    }
  }

  const names = new Set(existing.map((p) => p.name.trim().toLowerCase()));
  const pending = suggestions?.filter((s) => !names.has(s.name.trim().toLowerCase())) ?? [];

  return (
    <section className="card">
      <div className="row between">
        <div className="grow">
          <h3>✨ {t('Ideas para {place}', { place: trip.destination || trip.title })}</h3>
          <div className="small muted">{t('Sitios para ver, comer o tomar algo, propuestos con IA. Añade los que te gusten.')}</div>
        </div>
      </div>
      {suggestions === null || pending.length === 0 ? (
        <button className="btn block" type="button" style={{ marginTop: 10 }} disabled={busy} onClick={() => void ask()}>
          {busy ? t('Buscando sitios…') : suggestions === null ? t('Sugerir sitios') : t('Sugerir más')}
        </button>
      ) : (
        <>
          {pending.map((suggestion) => (
            <div key={suggestion.name} className="row between suggestion" style={{ alignItems: 'flex-start', margin: '10px 0' }}>
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
              <button className="btn small primary" type="button" onClick={() => void add(suggestion)} aria-label={t('Añadir {name}', { name: suggestion.name })}>
                {t('+ Añadir')}
              </button>
            </div>
          ))}
          <div className="actions">
            <button className="btn" type="button" onClick={() => void addAll()}>
              {t('Añadir todas ({n})', { n: pending.length })}
            </button>
            <button className="btn" type="button" disabled={busy} onClick={() => void ask()}>
              {busy ? t('Buscando sitios…') : t('Otras ideas')}
            </button>
            <button className="btn" type="button" onClick={() => setSuggestions(null)}>
              {t('Cerrar')}
            </button>
          </div>
        </>
      )}
      {message && <p className="small muted">{message}</p>}
    </section>
  );
}
