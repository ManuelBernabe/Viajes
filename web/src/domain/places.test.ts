import { describe, expect, it } from 'vitest';
import type { Place } from '../data/types';
import { groupByArea, mapsUrl, parsePasted, sortPlaces } from './places';

const place = (name: string, category: Place['category'], visited = false): Place => ({
  id: name, tripId: 't', name, category, notes: null, url: null, address: null, visited, createdBy: 'yo', version: 1, deletedAtMs: null,
});

describe('parsePasted', () => {
  it('un nombre normal se queda como nombre', () => {
    expect(parsePasted('  Caminito  ')).toEqual({ name: 'Caminito', url: null });
  });

  it('lo que comparte Google Maps: nombre delante y enlace detrás', () => {
    expect(parsePasted('Café Tortoni\nhttps://maps.app.goo.gl/abc123')).toEqual({ name: 'Café Tortoni', url: 'https://maps.app.goo.gl/abc123' });
  });

  it('un enlace de Google Maps con /place/ da el nombre', () => {
    expect(parsePasted('https://www.google.com/maps/place/Caf%C3%A9+Tortoni/@-34.6,-58.3,17z')).toEqual({
      name: 'Café Tortoni',
      url: 'https://www.google.com/maps/place/Caf%C3%A9+Tortoni/@-34.6,-58.3,17z',
    });
  });

  it('un enlace sin nombre deja el nombre vacío para escribirlo', () => {
    expect(parsePasted('https://www.tripadvisor.es/Restaurant_Review-g1')).toEqual({ name: '', url: 'https://www.tripadvisor.es/Restaurant_Review-g1' });
  });
});

describe('mapsUrl', () => {
  it('busca el nombre con el destino del viaje, o con la dirección si la hay', () => {
    expect(mapsUrl({ name: 'Caminito', address: null }, 'Buenos Aires')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Caminito%2C%20Buenos%20Aires',
    );
    expect(mapsUrl({ name: 'Don Julio', address: 'Guatemala 4691' }, 'Buenos Aires')).toContain('Don%20Julio%2C%20Guatemala%204691');
    expect(mapsUrl({ name: 'Cataratas del Iguazú', address: null }, 'Iguazú')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Cataratas%20del%20Iguaz%C3%BA',
    );
  });
});

describe('sortPlaces', () => {
  it('pendientes primero, por categoría y nombre; los visitados aparte', () => {
    const { pending, visited } = sortPlaces([place('Zoo', 'see'), place('Asado', 'eat'), place('Bar', 'drink', true), place('Arte', 'see')]);
    expect(pending.map((p) => p.name)).toEqual(['Arte', 'Zoo', 'Asado']);
    expect(visited.map((p) => p.name)).toEqual(['Bar']);
  });
});

describe('sortPlaces: lo último añadido, primero', () => {
  it('ordena por fecha de alta y deja los antiguos (sin fecha) después', () => {
    const { pending } = sortPlaces([
      place('Zoo', 'see'),
      { ...place('Nuevo', 'other'), createdAtMs: 2000 },
      { ...place('Anterior', 'eat'), createdAtMs: 1000 },
      place('Arte', 'see'),
    ]);
    expect(pending.map((p) => p.name)).toEqual(['Nuevo', 'Anterior', 'Arte', 'Zoo']);
  });
});

describe('groupByArea', () => {
  it('agrupa por país en el orden del viaje; los demás después y los sin país al final', () => {
    const ideas = [
      { name: 'Cristo Redentor', area: 'Brasil' },
      { name: 'Caminito', area: 'Argentina' },
      { name: 'Sitio raro', area: null },
      { name: 'Colonia', area: 'Uruguay' },
      { name: 'Cataratas', area: 'Argentina' },
    ];
    const groups = groupByArea(ideas, 'Argentina Brasil · Buenos Aires, Río');
    expect(groups.map((g) => g.area)).toEqual(['Argentina', 'Brasil', 'Uruguay', null]);
    expect(groups[0].items.map((i) => i.name)).toEqual(['Caminito', 'Cataratas']);
  });

  it('sin acentos ni mayúsculas', () => {
    expect(groupByArea([{ area: 'Perú' }, { area: 'méxico' }], 'Mexico y Peru').map((g) => g.area)).toEqual(['méxico', 'Perú']);
  });
});
