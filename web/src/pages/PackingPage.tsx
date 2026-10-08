import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { BackLink } from '../app/Layout';
import { describeError } from '../api';
import { MicButton } from '../components/MicButton';
import { getTrip, listTrips } from '../data/repo';
import { useLiveQuery } from '../data/useLive';
import { cachedPacking, cachePacking, categories, groupItems, packingApi, templates, type PackingItem } from '../domain/packing';
import { t } from '../i18n';

/**
 * «🧳 Equipaje» de un viaje: una lista que comparte todo el hogar. Se empieza con plantillas (básico, playa, nieve…) o
 * copiando la de otro viaje, y se marca lo que ya va en la maleta.
 */
export function PackingPage() {
  const { tripId = '' } = useParams();
  const trip = useLiveQuery(() => getTrip(tripId), [tripId]);
  const otherTrips = useLiveQuery(async () => (await listTrips()).filter((x) => x.id !== tripId && x.deletedAtMs === null), [tripId]);
  const [items, setItemsState] = useState<PackingItem[] | null>(() => cachedPacking(tripId));
  const [text, setText] = useState('');
  const [category, setCategory] = useState(categories()[0]);
  const [forWhom, setForWhom] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  function setItems(next: PackingItem[]) {
    setItemsState(next);
    cachePacking(tripId, next);
  }

  async function reload() {
    try {
      setItems(await packingApi.list(tripId));
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  useEffect(() => {
    void reload();
  }, [tripId]);

  async function add(newItems: { text: string; category?: string | null; forWhom?: string | null }[]) {
    setBusy(true);
    setMessage('');
    try {
      const added = await packingApi.add(tripId, newItems);
      setItems([...(items ?? []), ...added]);
      if (added.length === 0) {
        setMessage(t('Ya estaba todo en la lista.'));
      }
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) {
      return;
    }
    await add([{ text, category, forWhom: forWhom || null }]);
    setText('');
  }

  async function toggle(item: PackingItem) {
    const before = items ?? [];
    setItems(before.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)));
    try {
      await packingApi.update(item.id, { checked: !item.checked });
    } catch (error) {
      setItems(before);
      setMessage(describeError(error));
    }
  }

  async function remove(item: PackingItem) {
    const before = items ?? [];
    setItems(before.filter((i) => i.id !== item.id));
    try {
      await packingApi.remove(item.id);
    } catch (error) {
      setItems(before);
      setMessage(describeError(error));
    }
  }

  async function copyFrom(otherTripId: string) {
    if (!otherTripId) {
      return;
    }
    try {
      const theirs = await packingApi.list(otherTripId);
      await add(theirs.map((i) => ({ text: i.text, category: i.category, forWhom: i.forWhom })));
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  const list = items ?? [];
  const done = list.filter((i) => i.checked).length;
  const visible = hideDone ? list.filter((i) => !i.checked) : list;

  return (
    <main className="page">
      <div className="topbar">
        <BackLink to={`/trips/${tripId}`} />
        <h1>🧳 {t('Equipaje')}</h1>
      </div>
      {trip && <div className="muted">{trip.title}</div>}

      {list.length > 0 && (
        <div className="packing-progress">
          <div className="packing-bar">
            <span style={{ width: `${Math.round((done / list.length) * 100)}%` }} />
          </div>
          <div className="row between small">
            <span>{t('{done} de {total} en la maleta', { done, total: list.length })}</span>
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> {t('Ocultar lo ya metido')}
            </label>
          </div>
        </div>
      )}

      <form className="card" onSubmit={(e) => void submit(e)}>
        <div className="row" style={{ gap: 8 }}>
          <input className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Añadir algo a la lista')} aria-label={t('Añadir algo a la lista')} />
          <MicButton onText={(spoken) => setText(spoken)} />
        </div>
        <div className="packing-form-grid">
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('Grupo')}>
            {categories().map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input value={forWhom} onChange={(e) => setForWhom(e.target.value)} placeholder={t('¿Para quién?')} aria-label={t('¿Para quién?')} />
        </div>
        <button className="btn primary block" type="submit" disabled={busy || !text.trim()} style={{ marginTop: 8 }}>
          {t('Añadir')}
        </button>
      </form>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>{t('Empezar con una plantilla')}</h3>
        <div className="chips">
          {templates().map((template) => (
            <button key={template.id} type="button" disabled={busy} onClick={() => void add(template.items)}>
              {template.icon} {template.name}
            </button>
          ))}
        </div>
        {otherTrips && otherTrips.length > 0 && (
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="copy-from">{t('Copiar la lista de otro viaje')}</label>
            <select id="copy-from" value="" onChange={(e) => void copyFrom(e.target.value)}>
              <option value="">{t('Elegir viaje…')}</option>
              {otherTrips.map((other) => (
                <option key={other.id} value={other.id}>
                  {other.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {message && <p className="small muted">{message}</p>}
      {items !== null && list.length === 0 && <p className="empty">{t('La lista está vacía: empieza con una plantilla o añade lo que necesites.')}</p>}

      {groupItems(visible).map((group) => (
        <section key={group.category}>
          <h2 className="section-title">{group.category}</h2>
          <div className="agenda">
            {group.items.map((item) => (
              <div key={item.id} className={`packing-row${item.checked ? ' done' : ''}`}>
                <label className="packing-check">
                  <input type="checkbox" checked={item.checked} onChange={() => void toggle(item)} />
                  <span>{item.text}</span>
                  {item.forWhom && <span className="chip">{item.forWhom}</span>}
                </label>
                <button type="button" className="btn small" aria-label={t('Quitar {name} de la lista', { name: item.text })} onClick={() => void remove(item)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
