import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, describeError } from '../api';
import { BackLink } from '../app/Layout';
import { MicButton } from '../components/MicButton';
import { lang, t } from '../i18n';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  route?: string | null;
}

const STORED = 'viajes:help-chat';

function load(): Message[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORED) ?? '[]') as Message[];
  } catch {
    return [];
  }
}

/** Nombre del botón «Ir a…» para cada pantalla que puede proponer el asistente. */
function routeLabel(route: string): string {
  switch (route) {
    case '/':
      return t('Inicio');
    case '/documents':
      return t('Documentos');
    case '/documents/new':
      return t('Nuevo documento');
    case '/settings':
      return t('Ajustes');
    case '/inbox':
      return t('Por revisar');
    case '/trips/new':
      return t('Nuevo viaje');
    default:
      return t('Guía de uso');
  }
}

/**
 * «Pregunta a la guía»: chat con un asistente que conoce la app (sus pantallas y botones) y responde dudas de uso.
 * No ve los viajes ni las reservas. La conversación dura lo que la sesión de la app y es la misma en la pantalla /ayuda
 * y en la burbuja flotante. `onNavigate`: al pulsar «Ir a…» (la burbuja se cierra).
 */
export function HelpChat({ onNavigate }: { onNavigate?: () => void }) {
  const [messages, setMessages] = useState<Message[]>(load);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORED, JSON.stringify(messages.slice(-20)));
    } catch {
      // Sin almacenamiento, la conversación se pierde al salir; no pasa nada.
    }
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  async function ask(question: string) {
    const clean = question.trim();
    if (!clean || busy) {
      return;
    }
    const next: Message[] = [...messages, { role: 'user', text: clean }];
    setMessages(next);
    setText('');
    setError('');
    setBusy(true);
    try {
      const answer = await api<{ text: string; route: string | null }>('/api/help/ask', {
        method: 'POST',
        body: JSON.stringify({ lang: lang(), messages: next.slice(-10).map(({ role, text: body }) => ({ role, text: body })) }),
      });
      setMessages([...next, { role: 'assistant', text: answer.text, route: answer.route }]);
    } catch (problem) {
      setError(describeError(problem));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(text);
  }

  const suggestions = [
    t('¿Cómo añado una reserva desde un correo?'),
    t('¿Cómo veo el QR sin conexión?'),
    t('¿Cómo activo Face ID?'),
    t('¿Cómo invito a alguien al hogar?'),
    t('¿Cómo pongo los viajes en el calendario del iPhone?'),
  ];

  return (
    <>
      <p className="small muted">
        {t('Pregúntame cómo hacer cualquier cosa en la app. Respondo con la guía de uso, con ayuda de la IA: no escribas datos personales.')}
      </p>

      {messages.length === 0 && (
        <div className="chips" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          {suggestions.map((s) => (
            <button key={s} type="button" style={{ whiteSpace: 'normal', textAlign: 'left' }} onClick={() => void ask(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="chat">
        {messages.map((message, index) => (
          <div key={index} className={`bubble ${message.role}`}>
            <div style={{ whiteSpace: 'pre-line' }}>{message.text}</div>
            {message.route && (
              <Link className="btn small" to={message.route} style={{ marginTop: 8 }} onClick={onNavigate}>
                {t('Ir a {screen}', { screen: routeLabel(message.route) })} ›
              </Link>
            )}
          </div>
        ))}
        {busy && <div className="bubble assistant muted">{t('Pensando…')}</div>}
        <div ref={end} />
      </div>
      {error && <p className="error small">{error}</p>}

      <form className="chat-input" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Escribe o dicta tu pregunta…')} maxLength={1000} enterKeyHint="send" />
        {/* Al dejar de hablar, se envía sola. */}
        <MicButton onText={setText} onDone={(spoken) => void ask(spoken)} onError={setError} />
        <button className="btn primary" type="submit" disabled={busy || !text.trim()} aria-label={t('Enviar')}>
          ↑
        </button>
      </form>
      <div className="row between small" style={{ marginTop: 8 }}>
        <Link to="/guia" onClick={onNavigate}>
          {t('Ver la guía completa')}
        </Link>
        {messages.length > 0 && (
          <button className="btn small" type="button" onClick={() => setMessages([])}>
            {t('Empezar de nuevo')}
          </button>
        )}
      </div>
    </>
  );
}

/** La misma conversación a pantalla completa (desde Ajustes → Ayuda y la guía). */
export function HelpChatPage() {
  return (
    <main className="page">
      <div className="topbar">
        <BackLink to="/settings" />
        <h1>💬 {t('Pregunta a la guía')}</h1>
      </div>
      <HelpChat />
    </main>
  );
}
