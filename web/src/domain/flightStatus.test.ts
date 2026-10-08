import { describe, expect, it } from 'vitest';
import { duration, hasFlightNumber, statusLabel, type FlightInfo } from './flightStatus';

const info = (extra: Partial<FlightInfo>): FlightInfo => ({
  status: 'scheduled', origin: 'IGR', destination: 'AEP', depScheduledMs: 0, depEstimatedMs: 0, depActualMs: null, depTerminal: null, depGate: null,
  checkInDesk: null, arrScheduledMs: null, arrEstimatedMs: null, arrActualMs: null, arrTerminal: null, arrGate: null, baggage: null, source: 'X', ...extra,
});

describe('flightStatus', () => {
  it('solo los vuelos con número en el título', () => {
    expect(hasFlightNumber({ type: 'flight', title: 'JA 3157 IGR → AEP' })).toBe(true);
    expect(hasFlightNumber({ type: 'flight', title: 'Vuelo a Tokio' })).toBe(false);
    expect(hasFlightNumber({ type: 'train', title: 'AVE 05143' })).toBe(false);
  });

  it('estado legible', () => {
    expect(statusLabel(info({}), 0).text).toBe('En hora');
    expect(statusLabel(info({ status: 'delayed' }), 65).text).toBe('Retraso de 1 h 05 min');
    expect(statusLabel(info({ status: 'cancelled' }), 0).tone).toBe('danger');
    expect(duration(40)).toBe('40 min');
  });
});
