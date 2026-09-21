import { beforeEach, describe, expect, it } from 'vitest';
import { createServeGate, type ServeGate } from './serveGate';

let gate: ServeGate;

beforeEach(() => {
  gate = createServeGate();
});

describe('a fresh order', () => {
  it('shows no serve button before the kid jingles', () => {
    expect(gate.canServe('iceCream', true)).toBe(false);
  });

  it('arms serve once the ice-cream truck jingles in serve range', () => {
    gate.noteJingle();
    expect(gate.canServe('iceCream', true)).toBe(true);
  });

  it('stays disarmed while the truck is out of serve range', () => {
    gate.noteJingle();
    expect(gate.canServe('iceCream', false)).toBe(false);
  });

  it('never arms for another truck, jingled or not', () => {
    gate.noteJingle();
    expect(gate.canServe('fire', true)).toBe(false);
    expect(gate.canServe('garbage', true)).toBe(false);
    expect(gate.canServe('police', true)).toBe(false);
  });
});

describe('abandoning and re-arming', () => {
  it('forgets the jingle when the kid morphs to another truck', () => {
    gate.noteJingle();
    gate.noteActiveVehicle('fire');
    expect(gate.canServe('iceCream', true)).toBe(false);
  });

  it('keeps the jingle while the ice-cream truck stays active', () => {
    gate.noteJingle();
    gate.noteActiveVehicle('iceCream');
    expect(gate.canServe('iceCream', true)).toBe(true);
  });

  it('re-arms when the kid comes back and jingles again', () => {
    gate.noteJingle();
    gate.noteActiveVehicle('fire');
    gate.noteActiveVehicle('iceCream');
    expect(gate.canServe('iceCream', true)).toBe(false);

    gate.noteJingle();
    expect(gate.canServe('iceCream', true)).toBe(true);
  });

  it('needs a fresh jingle for each new order', () => {
    gate.noteJingle();
    gate.noteOrderOpened();
    expect(gate.canServe('iceCream', true)).toBe(false);
  });
});
