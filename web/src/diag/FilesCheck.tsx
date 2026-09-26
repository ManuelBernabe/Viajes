import { useEffect, useState, type ChangeEvent } from 'react';
import { describeError } from '../api';
import { daysSince, readProbe, saveProbe, type Probe } from './probeStore';

const MB = 1_000_000;

export function FilesCheck({ signedIn }: { signedIn: boolean }) {
  const [probe, setProbe] = useState<Probe | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [remote, setRemote] = useState('');

  useEffect(() => {
    void readProbe().then(setProbe);
  }, []);

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    if (!picked) {
      return;
    }
    setFile(picked);
    await saveProbe(new Uint8Array(await picked.arrayBuffer()), picked.name, new Date());
    setProbe(await readProbe());
  }

  async function upload() {
    if (!file) {
      return;
    }
    try {
      const response = await fetch('/api/diag/file', {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      setRemote(response.ok ? '✅ subido' : `🔴 error ${response.status}`);
    } catch (error) {
      setRemote(describeError(error));
    }
  }

  async function download() {
    try {
      const response = await fetch('/api/diag/file');
      if (!response.ok) {
        setRemote(`🔴 error ${response.status}`);
        return;
      }
      const blob = await response.blob();
      const same = file ? blob.size === file.size : false;
      setRemote(`✅ descargado ${(blob.size / MB).toFixed(1)} MB${file ? (same ? ' · mismo tamaño' : ' · 🔴 tamaño distinto') : ''}`);
    } catch (error) {
      setRemote(describeError(error));
    }
  }

  return (
    <section>
      <h2>3 y 4 · Adjuntar, guardar en el móvil y subir</h2>
      <input type="file" accept="image/*,application/pdf" onChange={(e) => void onPick(e)} />
      {file && <p>Elegido: {file.name} · {file.type || 'sin tipo'} · {(file.size / MB).toFixed(1)} MB</p>}
      {probe ? (
        <p>
          En el móvil: {probe.name} ({(probe.size / MB).toFixed(1)} MB), guardado hace {daysSince(probe.savedAt, new Date())} días ·{' '}
          {probe.intact ? '✅ íntegro' : '🔴 dañado'}
        </p>
      ) : (
        <p>Nada guardado en el móvil todavía.</p>
      )}
      {signedIn && (
        <>
          <button disabled={!file} onClick={() => void upload()}>Subir al servidor</button>
          <button onClick={() => void download()}>Descargar del servidor</button>
        </>
      )}
      {remote && <p>{remote}</p>}
    </section>
  );
}
