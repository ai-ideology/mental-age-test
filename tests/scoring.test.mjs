import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnswers, scoreAnswers } from '../scoring.js';

const allA = Object.fromEntries(Array.from({ length: 36 }, (_, index) => [index + 1, 'A']));
const allD = Object.fromEntries(Array.from({ length: 36 }, (_, index) => [index + 1, 'D']));
const asLines = answers => Object.entries(answers).map(([question, choice]) => `${question}.${choice}`).join('\n');

test('parses numbered answers, Markdown forms, fenced text, and a Chinese explanation', () => {
  const parsed = parseAnswers(`\`\`\`text\n- 1. **A**，因为这符合我的倾向\nQ2: b\n3. C\n\`\`\``);
  assert.deepEqual(parsed.answers, { 1: 'A', 2: 'B', 3: 'C' });
  assert.deepEqual(parsed.missing.slice(0, 3), [4, 5, 6]);
  assert.ok(parsed.errors.length);
  const explanation = parseAnswers(asLines(allA).replace('1.A', '1.A because it fits'));
  assert.equal(Object.keys(explanation.answers).length, 36);
  assert.equal(explanation.answers[1], 'A');
});

test('parses JSON mappings and rejects repeated numeric or Q-prefixed keys', () => {
  assert.deepEqual(parseAnswers('{"answers":{"1":"a","Q2":"D"}}').answers, { 1: 'A', 2: 'D' });
  assert.deepEqual(parseAnswers('{"1":"B","2":"C"}').answers, { 1: 'B', 2: 'C' });
  assert.ok(parseAnswers('{"1":"A","1":"B"}').errors.some(error => error.includes('重复')));
  assert.ok(parseAnswers('{"Q1":"A","1":"B"}').errors.some(error => error.includes('重复')));
  const malformed = parseAnswers('{"\\x":"A"}');
  assert.equal(Object.keys(malformed.answers).length, 0);
  assert.ok(malformed.errors.length);
});

test('rejects incomplete, duplicated, invalid, out-of-range, and multi-choice answers', () => {
  const choices = Array.from({ length: 36 }, (_, i) => 'ABCD'[i % 4]).join(' ');
  assert.equal(Object.keys(parseAnswers(choices).answers).length, 36);
  assert.ok(parseAnswers('A B C').errors.length);
  for (const answer of ['A, B', 'A B', 'A或B', 'A/B/C', 'AB']) {
    const parsed = parseAnswers(`${asLines(allA).replace('1.A', `1. ${answer}`)}`);
    assert.ok(parsed.errors.some(error => error.includes('多个选项')), answer);
  }
  assert.ok(parseAnswers(`${asLines(allA)}\n1.B`).errors.some(error => error.includes('重复')));
  assert.ok(parseAnswers('37.A').errors.some(error => error.includes('超出范围')));
  assert.ok(parseAnswers('1.E').errors.length);
});

test('all-A and all-D scoring match hand-calculated dimension and age results', () => {
  const young = scoreAnswers(allA);
  assert.equal(young.dimensions.E, 100);
  assert.equal(young.dimensions.R, 100);
  assert.equal(young.dimensions.A, 100);
  assert.equal(young.dimensions.I, 100);
  assert.ok(Math.abs(young.dimensions.P - 100 / 27) < 1e-12);
  assert.equal(young.nearestPrototype.age, 18);
  assert.equal(young.interpolation[0], 18);
  assert.ok(Math.abs(young.preciseAge - 20.06542516571278) < 1e-10);
  assert.equal(young.age, 20);
  assert.equal(young.ageLabel, '少年探索型');

  const stable = scoreAnswers(allD);
  assert.deepEqual(stable.dimensions, { E: 0, R: 0, A: 0, I: 0, P: 100 });
  assert.equal(stable.nearestPrototype.age, 58);
  assert.deepEqual(stable.interpolation, [47, 58]);
  assert.ok(Math.abs(stable.preciseAge - 53.24883590090583) < 1e-10);
  assert.equal(stable.age, 53);
  assert.equal(stable.ageLabel, '稳定老练型');
});

test('applies I/P exceptions and excludes Q4, Q16, and behavior answers from age matching', () => {
  const answers = { ...allD, 6: 'C', 7: 'B', 15: 'B', 22: 'B', 24: 'B' };
  const result = scoreAnswers(answers);
  assert.ok(Math.abs(result.dimensions.I - 10 * 100 / 18) < 1e-12);
  assert.ok(Math.abs(result.dimensions.P - 21 * 100 / 27) < 1e-12);
  const changed = { ...answers, 4: 'A', 16: 'A', 31: 'A', 32: 'B', 33: 'C', 34: 'D', 35: 'A', 36: 'C' };
  const changedResult = scoreAnswers(changed);
  assert.deepEqual(changedResult.dimensions, result.dimensions);
  assert.equal(changedResult.age, result.age);
  assert.deepEqual(changedResult.distances, result.distances);
  assert.deepEqual(changedResult.behavior.map(item => item.value), [100, 70, 35, 65, 100, 75]);
  assert.equal(result.behavior[0].value, 50);
  assert.equal(result.behavior[1].value, 0);
});

test('rejects invalid answer objects rather than scoring partial input', () => {
  assert.throws(() => scoreAnswers({ 1: 'A' }), /Cannot score invalid answers/);
  assert.throws(() => scoreAnswers({ ...allA, 37: 'A' }), /Cannot score invalid answers/);
});

