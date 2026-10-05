import { useSyncExternalStore } from 'react';

/**
 * Bloqueo con Face ID (o Touch ID / código del iPhone). Usa una credencial de acceso (WebAuthn) del propio móvil: pedirla
 * obliga a pasar por Face ID. Es un candado local: protege la app si alguien coge el móvil desbloqueado. Cada móvil lo
 * activa por su cuenta; se guarda en este navegador.
 */
export interface LockConfig {
  /** Id de la credencial, en base64url. */
  credentialId: string;
  /** Minutos fuera de la app tras los que se vuelve a pedir; 0 = cada vez que se sale. */
  afterMinutes: number;
}

const KEY = 'viajes:lock';
const listeners = new Set<() => void>();
let config: LockConfig | null = read();
let locked = config !== null;

function read(): LockConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LockConfig) : null;
  } catch {
    return null;
  }
}

function save(next: LockConfig | null) {
  config = next;
  try {
    if (next) {
      localStorage.setItem(KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(KEY);
    }
  } catch {
    // Sin almacenamiento el candado dura lo que la sesión de la app.
  }
  emit();
}

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLockConfig(): LockConfig | null {
  return useSyncExternalStore(subscribe, () => config);
}

export function useLocked(): boolean {
  return useSyncExternalStore(subscribe, () => locked);
}

export function setLocked(value: boolean) {
  if (locked !== value) {
    locked = value && config !== null;
    emit();
  }
}

export function setAfterMinutes(afterMinutes: number) {
  if (config) {
    save({ ...config, afterMinutes });
  }
}

/** Tras desbloquear con la contraseña, 10 minutos en los que quitar el bloqueo no pide Face ID. */
let trustedUntil = 0;

export function trustForAWhile() {
  trustedUntil = Date.now() + 10 * 60_000;
}

export function isTrusted(): boolean {
  return Date.now() < trustedUntil;
}

export function disableLock() {
  save(null);
  setLocked(false);
}

const toBase64Url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const random = (size: number) => crypto.getRandomValues(new Uint8Array(size));

/** ¿Tiene el móvil Face ID, Touch ID o similar disponible para la web? */
export async function lockSupported(): Promise<boolean> {
  try {
    return typeof PublicKeyCredential !== 'undefined' && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

/** Crea la credencial (pide Face ID una vez) y activa el bloqueo. */
export async function enableLock(email: string, afterMinutes: number): Promise<void> {
  // «hints» aún no está en los tipos de TypeScript.
  const publicKey: PublicKeyCredentialCreationOptions & { hints?: string[] } = {
    challenge: random(32),
    rp: { name: 'Viajes', id: location.hostname },
    user: { id: random(16), name: email ? `Viajes · ${email}` : 'Viajes', displayName: email ? `Viajes · ${email}` : 'Viajes' },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    // «preferred»: los gestores de llaves (Contraseñas de iCloud, 1Password…) solo guardan llaves «descubribles».
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred',
      requireResidentKey: false,
    },
    // Pista para que el iPhone proponga su propio llavero y no otra app.
    hints: ['client-device'],
    attestation: 'none',
    timeout: 60_000,
  };
  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!credential) {
    throw new Error('cancelled');
  }
  save({ credentialId: toBase64Url(credential.rawId), afterMinutes });
}

/**
 * Pide Face ID. Devuelve true si la persona se ha identificado (el móvil marca «usuario verificado» en la respuesta).
 * Cancelar o fallar devuelve false.
 */
export async function verify(): Promise<boolean> {
  if (!config) {
    return true;
  }
  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: fromBase64Url(config.credentialId) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    const data = (assertion?.response as AuthenticatorAssertionResponse | undefined)?.authenticatorData;
    // Byte 32: indicadores; 0x04 = usuario verificado (Face ID, huella o código).
    return !!data && (new Uint8Array(data)[32] & 0x04) !== 0;
  } catch {
    return false;
  }
}

/** Hora a la que se salió de la app, para decidir al volver si toca pedir Face ID. */
let hiddenAt: number | null = null;

/** Bloquea al salir (si es «cada vez») o al volver tras el tiempo elegido. */
export function watchVisibility(): () => void {
  const onChange = () => {
    if (!config) {
      return;
    }
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      // «Cada vez»: se tapa ya, así la vista previa del selector de apps tampoco enseña nada.
      if (config.afterMinutes === 0) {
        setLocked(true);
      }
    } else if (hiddenAt !== null && Date.now() - hiddenAt >= config.afterMinutes * 60_000) {
      setLocked(true);
    }
  };
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}
