export interface DisplayEnv {
  matchMedia(query: string): { matches: boolean };
  navigator: { standalone?: boolean };
}

// iOS solo expone navigator.standalone; el resto de navegadores, display-mode.
export function isStandalone(env: DisplayEnv): boolean {
  return env.matchMedia('(display-mode: standalone)').matches || env.navigator.standalone === true;
}
