import { describe, expect, it } from 'vitest';
import { describeServer, formatBuild } from './version';

describe('formatBuild', () => {
  it('muestra fecha y hora locales con el commit corto', () => {
    expect(formatBuild(new Date(2026, 8, 26, 14, 5), '0123456789abcdef')).toBe('26/09/2026 14:05 · 0123456');
  });

  it('sin commit muestra solo la fecha', () => {
    expect(formatBuild(new Date(2026, 0, 3, 9, 7))).toBe('03/01/2026 09:07');
    expect(formatBuild(new Date(2026, 0, 3, 9, 7), '  ')).toBe('03/01/2026 09:07');
  });
});

describe('describeServer', () => {
  const now = new Date('2026-09-26T14:30:00Z');

  it('prefiere el commit y dice hace cuánto arrancó', () => {
    const info = { commit: 'abc1234', deploymentId: 'dep-1', startedAt: '2026-09-26T14:18:00Z' };
    expect(describeServer(info, now)).toBe('abc1234 · arrancado hace 12 min');
  });

  it('sin commit usa el despliegue y pasa a horas', () => {
    const info = { commit: null, deploymentId: '53cc777c-d5eb-435d', startedAt: '2026-09-26T11:00:00Z' };
    expect(describeServer(info, now)).toBe('53cc777c · arrancado hace 3 h');
  });

  it('sin nada que identifique lo dice', () => {
    const info = { commit: null, deploymentId: null, startedAt: '2026-09-26T14:31:00Z' };
    expect(describeServer(info, now)).toBe('sin identificar · arrancado hace 0 min');
  });
});
