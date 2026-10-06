import { useEffect, useRef, useState } from 'react';
import { locale, t } from '../i18n';

/** Lo mínimo del reconocimiento de voz del navegador (en Safari, `webkitSpeechRecognition`). */
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

function recognitionClass(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const dictationSupported = () => typeof window !== 'undefined' && recognitionClass() !== null;

/**
 * Botón 🎤 para dictar: escucha en el idioma de la app y va escribiendo lo que entiende. `onText` recibe el texto entero
 * dictado hasta ahora (para ponerlo en el campo); `onDone`, el final cuando se deja de hablar. Si el navegador no sabe
 * reconocer voz, no se pinta (queda el micrófono del teclado del iPhone).
 */
export function MicButton({
  onText,
  onDone,
  onError,
}: {
  onText: (text: string) => void;
  onDone?: (text: string) => void;
  /** Mensaje para enseñar si algo falla (permiso del micrófono, no se ha oído nada…); '' al empezar. */
  onError?: (message: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const setError = (message: string) => onError?.(message);
  const recognition = useRef<Recognition | null>(null);
  const text = useRef('');

  useEffect(() => () => recognition.current?.stop(), []);

  if (!dictationSupported()) {
    return null;
  }

  function toggle() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Klass = recognitionClass()!;
    const r = new Klass();
    r.lang = locale();
    r.interimResults = true;
    r.continuous = false;
    text.current = '';
    r.onresult = (event) => {
      let finalText = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      text.current = (finalText + interim).trim();
      onText(text.current);
    };
    r.onerror = (event) => {
      setError(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? t('Permite el micrófono a Viajes para dictar (Ajustes del iPhone → Viajes o Safari → Micrófono).')
          : event.error === 'no-speech'
            ? t('No te he oído. Vuelve a pulsar 🎤 y habla.')
            : t('No se ha podido dictar. Prueba con el micrófono del teclado.'),
      );
    };
    r.onend = () => {
      setListening(false);
      recognition.current = null;
      if (text.current) {
        onDone?.(text.current);
      }
    };
    setError('');
    recognition.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError(t('No se ha podido dictar. Prueba con el micrófono del teclado.'));
    }
  }

  return (
    <button
      type="button"
      className={`btn mic${listening ? ' listening' : ''}`}
      onClick={toggle}
      aria-pressed={listening}
      aria-label={listening ? t('Dejar de escuchar') : t('Dictar con la voz')}
      title={listening ? t('Dejar de escuchar') : t('Dictar con la voz')}
    >
      🎤
    </button>
  );
}
