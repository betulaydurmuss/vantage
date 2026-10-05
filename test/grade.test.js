import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fail, grade, gradeRank, pass, skip, sortFindings } from '../server/scan/findings.js';

const f = (sev) => fail(`x.${sev}`, 'Headers', sev, 't', 'd', 'fix');

test('a clean report scores 100 and grades A+', () => {
  const r = grade([pass('a', 'TLS', 't'), skip('b', 'DNS', 't')]);
  assert.equal(r.score, 100);
  assert.equal(r.grade, 'A+');
  assert.deepEqual([r.counts.pass, r.counts.skip, r.counts.fail], [1, 1, 0]);
});

test('penalties follow severity', () => {
  assert.equal(grade([f('info')]).score, 100);
  assert.equal(grade([f('low')]).score, 97);
  assert.equal(grade([f('medium')]).score, 92);
  assert.equal(grade([f('high')]).score, 82);
  assert.equal(grade([f('critical')]).score, 60);
});

test('A+ needs no failure above low', () => {
  assert.equal(grade([f('low')]).grade, 'A+');
  assert.equal(grade([f('medium')]).grade, 'A');
});

test('a critical failure caps the grade at D', () => {
  assert.equal(grade([f('critical')]).grade, 'D');
});

test('the score never goes below zero', () => {
  const r = grade([f('critical'), f('critical'), f('critical')]);
  assert.equal(r.score, 0);
  assert.equal(r.grade, 'F');
});

test('grades rank from F to A+', () => {
  assert.ok(gradeRank('A+') > gradeRank('A'));
  assert.ok(gradeRank('D') > gradeRank('F'));
  assert.equal(gradeRank('Z'), -1);
});

test('findings sort by category, failures first, worst severity first', () => {
  const sorted = sortFindings([
    pass('h1', 'Headers', 't'),
    fail('h2', 'Headers', 'low', 't', 'd', 'f'),
    fail('h3', 'Headers', 'high', 't', 'd', 'f'),
    pass('t1', 'Transport', 't'),
  ]);
  assert.deepEqual(
    sorted.map((x) => x.id),
    ['t1', 'h3', 'h2', 'h1'],
  );
});
