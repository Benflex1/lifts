import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { kgToDisplay, displayToKg, formatWeight, KG_PER_LB } from '../../src/utils/units';

describe('kgToDisplay', () => {
  it('returns kg unchanged', () => {
    assert.equal(kgToDisplay(100, 'kg'), 100);
    assert.equal(kgToDisplay(2.5, 'kg'), 2.5);
  });

  it('converts kg to lb', () => {
    assert.equal(kgToDisplay(100, 'lb'), Math.round(100 / KG_PER_LB * 10) / 10);
  });
});

describe('displayToKg', () => {
  it('returns kg unchanged', () => {
    assert.equal(displayToKg(100, 'kg'), 100);
  });

  it('converts lb to kg', () => {
    const result = displayToKg(220, 'lb');
    assert.ok(Math.abs(result - 99.79) < 0.1);
  });

  it('round-trips kg -> lb -> kg within 0.1', () => {
    const original = 80;
    const lb = kgToDisplay(original, 'lb');
    const back = displayToKg(lb, 'lb');
    assert.ok(Math.abs(back - original) < 0.1);
  });
});

describe('formatWeight', () => {
  it('formats kg', () => {
    assert.equal(formatWeight(100, 'kg'), '100 kg');
    assert.equal(formatWeight(2.5, 'kg'), '2.5 kg');
  });

  it('formats lb', () => {
    assert.equal(formatWeight(100, 'lb'), '220.5 lb');
  });

  it('formats zero', () => {
    assert.equal(formatWeight(0, 'kg'), '0 kg');
    assert.equal(formatWeight(0, 'lb'), '0 lb');
  });
});
