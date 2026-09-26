import { describe, expect, it } from 'vitest';
import { formatSize, isImage, isPdf, mimeOf, tooBig } from './files';

describe('ficheros', () => {
  it('deduce el tipo por la extensión cuando iOS no lo pone', () => {
    expect(mimeOf({ type: '', name: 'billete.PDF' })).toBe('application/pdf');
    expect(mimeOf({ type: '', name: 'IMG_0001.HEIC' })).toBe('image/heic');
    expect(mimeOf({ type: 'image/jpeg', name: 'x' })).toBe('image/jpeg');
    expect(mimeOf({ type: '', name: 'raro.xyz' })).toBe('application/octet-stream');
  });

  it('clasifica y limita', () => {
    expect(isImage('image/png')).toBe(true);
    expect(isPdf('application/pdf')).toBe(true);
    expect(tooBig(20_000_000)).toBe(false);
    expect(tooBig(20_000_001)).toBe(true);
  });

  it('formatea tamaños', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(24_171)).toBe('24 KB');
    expect(formatSize(3_000_000)).toBe('3.0 MB');
  });
});
