import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyChange, clearAll, mergeShared, replaceAll, sameShared } from '../src/sync.js';

const empty = { results: {}, finals: {}, manualTies: {}, stamps: {} };

test('Abgleich: Ergebnisse von zwei Handys werden zusammengeführt', () => {
  const phoneA = applyChange(empty, 'results', 'r1-D6', { a: 5, b: 3, confirmed: true }, 100);
  const phoneB = applyChange(empty, 'results', 'r1-D7', { a: 4, b: 4, confirmed: true }, 110);
  const merged = mergeShared(phoneA, phoneB);
  assert.deepEqual(Object.keys(merged.results).sort(), ['r1-D6', 'r1-D7']);
  assert.ok(sameShared(merged, mergeShared(phoneB, phoneA)));
});

test('Abgleich: jüngere Korrektur gewinnt', () => {
  const base = applyChange(empty, 'results', 'r1-D6', { a: 5, b: 3, confirmed: true }, 100);
  const corrected = applyChange(base, 'results', 'r1-D6', { a: 3, b: 5, confirmed: true }, 200);
  assert.deepEqual(mergeShared(base, corrected).results['r1-D6'], { a: 3, b: 5, confirmed: true });
  assert.deepEqual(mergeShared(corrected, base).results['r1-D6'], { a: 3, b: 5, confirmed: true });
});

test('Abgleich: Löschen und Zurücksetzen kommen auf dem anderen Handy an', () => {
  const a = applyChange(applyChange(empty, 'results', 'r1-D6', { a: 5, b: 3, confirmed: true }, 100), 'finals', 'final', { a: 5, b: 4 }, 100);
  const b = mergeShared(empty, a);
  const cleared = clearAll(a, 300);
  const merged = mergeShared(b, cleared);
  assert.deepEqual(merged.results, {});
  assert.deepEqual(merged.finals, {});
  // Ein später eingetragenes Ergebnis überlebt das Zurücksetzen
  const later = applyChange(b, 'results', 'r2-D6', { a: 1, b: 1, confirmed: false }, 400);
  assert.ok(mergeShared(cleared, later).results['r2-D6']);
});

test('Abgleich: Backup ersetzt alles', () => {
  const a = applyChange(empty, 'results', 'r1-D6', { a: 5, b: 3, confirmed: true }, 100);
  const restored = replaceAll(a, { results: { 'r3-D8': { a: 2, b: 2, confirmed: true } } }, 200);
  assert.deepEqual(Object.keys(restored.results), ['r3-D8']);
  assert.deepEqual(Object.keys(mergeShared(a, restored).results), ['r3-D8']);
});
