export interface ServerVersion {
  commit: string | null;
  deploymentId: string | null;
  startedAt: string;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/** «26/09/2026 14:05 · a1b2c3d»: fecha local de compilación y commit corto, si se conoce. */
export function formatBuild(builtAt: Date, commitSha?: string): string {
  const stamp = `${pad(builtAt.getDate())}/${pad(builtAt.getMonth() + 1)}/${builtAt.getFullYear()} ${pad(builtAt.getHours())}:${pad(builtAt.getMinutes())}`;
  const sha = commitSha?.trim().slice(0, 7);
  return sha ? `${stamp} · ${sha}` : stamp;
}

/** «a1b2c3d · arrancado hace 12 min»: qué despliegue responde y desde cuándo. */
export function describeServer(info: ServerVersion, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(info.startedAt).getTime()) / 60_000));
  const age = minutes < 60 ? `hace ${minutes} min` : `hace ${Math.floor(minutes / 60)} h`;
  const id = info.commit ?? info.deploymentId?.slice(0, 8) ?? 'sin identificar';
  return `${id} · arrancado ${age}`;
}
