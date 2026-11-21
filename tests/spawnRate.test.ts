import { describe, it, expect } from 'vitest';
import { monTarget, respawnMs, MON_CAP, MIN_RESPAWN, lowWater } from '../src/systems/spawnRate';

describe('monsters keep up with the crowd', () => {
  it('a solo player sees the map as designed', () => {
    expect(monTarget(28, 1)).toBe(28);
    expect(respawnMs(10000, 1)).toBe(10000);
  });
  it('more players: more monsters and faster respawns, with limits', () => {
    expect(monTarget(28, 31)).toBeGreaterThan(50);
    expect(monTarget(80, 101)).toBe(MON_CAP);
    expect(respawnMs(10000, 31)).toBeLessThan(2000);
    expect(respawnMs(10000, 101)).toBe(MIN_RESPAWN);
    expect(lowWater(100)).toBe(60);
  });
});

import { pickRoom, fillRooms } from '../src/systems/rooms';
describe('automatic rooms', () => {
  it('joins the fullest room with space, opens a new one only when all are full', () => {
    expect(pickRoom([], 30)).toBe(0);
    expect(pickRoom([12, 25, 30], 30)).toBe(1);
    expect(pickRoom([30, 30], 30)).toBe(2);
    expect(fillRooms(101, 30)).toEqual([30, 30, 30, 11]);
  });
});
