import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '../api';
import { enqueue, flush, pending, toSendResult, type Mark, type SendResult } from './outbox';

async function sendMark(mark: Mark): Promise<SendResult> {
  try {
    await api('/api/diag/marks', { method: 'POST', body: JSON.stringify(mark) });
    return 'ok';
  } catch (error) {
    return toSendResult(error);
  }
}

export function OutboxCheck({ signedIn }: { signedIn: boolean }) {
  const [queued, setQueued] = useState(0);
  const [server, setServer] = useState('—');
  const [last, setLast] = useState('');

  const refresh = useCallback(async () => {
    setQueued((await pending()).length);
    if (!signedIn) {
      return;
    }
    try {
      const marks = await api<Mark[]>('/api/diag/marks');
      setServer(`${marks.length} marcas${marks.length ? ` · última: ${marks[marks.length - 1].local}` : ''}`);
    } catch (error) {
      setServer(describeError(error));
    }
  }, [signedIn]);

  const send = useCallback(async () => {
    const result = await flush(sendMark);
    setLast(`Enviadas ${result.sent} · descartadas ${result.dropped} · quedan ${result.left}`);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void send();
    const onOnline = () => void send();
    const onVisible = () => document.visibilityState === 'visible' && void send();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [send]);

  async function add() {
    await enqueue({ id: crypto.randomUUID(), local: new Date().toLocaleString('es-ES') });
    await send();
  }

  return (
    <section>
      <h2>2 · Cambios sin conexión</h2>
      <p>En cola en el móvil: {queued}</p>
      <p>En el servidor: {server}</p>
      {last && <p>{last}</p>}
      <button onClick={() => void add()}>Añadir marca</button>
    </section>
  );
}
