import { describe, expect, it } from 'vitest';
import { checkDigit, countryName, findMrz } from './mrz';

describe('findMrz', () => {
  it('lee el pasaporte de ejemplo de la norma, con basura alrededor', () => {
    const text = 'PASAPORTE\nREINO DE UTOPIA\nP<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10\n';
    expect(findMrz(text)).toEqual({
      kind: 'passport', issuer: 'UTO', nationality: 'UTO', surnames: 'Eriksson', givenNames: 'Anna Maria', number: 'L898902C3',
      birthDate: '1974-08-12', expiryDate: '2012-04-15',
    });
  });

  it('tolera espacios, «K» por «<» al final y O por 0 en las fechas', () => {
    const text = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C3 6UTO74O8122F12O4159ZE184226B<<<<<10';
    expect(findMrz(text)?.expiryDate).toBe('2012-04-15');
  });

  it('un carácter mal leído en el número hace fallar el control', () => {
    expect(findMrz('P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C86UTO7408122F1204159ZE184226B<<<<<10')).toBeNull();
  });

  it('carné (TD1) con el número de DNI español en los datos opcionales', () => {
    const line1 = 'IDESPCAA000000' + String(checkDigit('CAA000000')) + '12345678Z<<<<<<';
    const line2 = `800101${checkDigit('800101')}M300101${checkDigit('300101')}ESP<<<<<<<<<<<0`;
    const result = findMrz(`${line1}\n${line2}\nBELSO<ALFONSO<<FRANCISCO<JOSE<`);
    expect(result).toMatchObject({ kind: 'id', number: '12345678Z', surnames: 'Belso Alfonso', givenNames: 'Francisco Jose', expiryDate: '2030-01-01', birthDate: '1980-01-01' });
  });
});

describe('lectura real del OCR', () => {
  it('corrige con los controles lo que el OCR confunde (P→D, 5→6, Z→2, relleno como S)', () => {
    const ocr = 'P<ESPBELSO<ALFONSO<<FRANCISCOSJOSESSSSS\nDAA1234560ESP7503120M3109165123456782<<<<<32\n';
    expect(findMrz(ocr)).toMatchObject({ kind: 'passport', number: 'PAA123456', expiryDate: '2031-09-15', birthDate: '1975-03-12', surnames: 'Belso Alfonso', issuer: 'ESP' });
  });
});

describe('lectura real del OCR en el navegador', () => {
  it('con el primer carácter perdido: caducidad segura y el número en blanco (podría ser P o F)', () => {
    const ocr = '0<ESPBELSO<ALFONSO<<FRANCISCOSJOSES<<SS\nAA1234560ESP7503120M3109156123456782<<<<<32\nCE\n';
    expect(findMrz(ocr)).toMatchObject({ number: '', expiryDate: '2031-09-15', surnames: 'Belso Alfonso' });
  });
});

describe('countryName', () => {
  it('del código de 3 letras al nombre', () => {
    expect(countryName('ESP', 'es-ES')).toBe('España');
    expect(countryName('UTO', 'es-ES')).toBe('UTO');
  });
});
