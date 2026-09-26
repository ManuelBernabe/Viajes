import { useState } from 'react';
import { runCryptoCheck, type CryptoCheckResult } from './cryptoBenchmark';

export function CryptoCheck() {
  const [result, setResult] = useState<CryptoCheckResult | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setResult(await runCryptoCheck());
    setRunning(false);
  }

  return (
    <section>
      <h2>6 · Cifrado</h2>
      <button disabled={running} onClick={() => void run()}>
        {running ? 'Calculando…' : 'Probar 600.000 iteraciones'}
      </button>
      {result && (
        <p>
          {result.ok ? '✅' : '🔴'} {Math.round(result.pbkdf2Ms)} ms{' '}
          {result.pbkdf2Ms < 2000 ? '(dentro del límite de 2 s)' : '(⚠️ supera 2 s)'}
          {result.error && ` · ${result.error}`}
        </p>
      )}
    </section>
  );
}
