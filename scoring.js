const QUESTIONS = 36;
const CHOICES = new Set(['A', 'B', 'C', 'D']);
const DIMENSIONS = {
  E: [1, 8, 11, 14, 18, 20, 25, 26, 28, 30],
  R: [2, 5, 6, 12, 23, 27, 29],
  A: [3, 9, 10, 13, 17, 19],
  I: [6, 15, 20, 21, 22, 24],
  P: [2, 7, 11, 15, 21, 24, 25, 28, 30],
};
const BASE = { A: 3, B: 2, C: 1, D: 0 };
const I_SCORES = { 6: { A: 3, B: 2, C: 2, D: 0 }, 22: { A: 3, B: 3, C: 1, D: 0 }, 24: { A: 3, B: 3, C: 1, D: 0 } };
const P_SCORES = {
  2: { A: 0, B: 1, C: 2, D: 3 }, 7: { A: 1, B: 0, C: 2, D: 3 },
  11: { A: 0, B: 1, C: 2, D: 3 }, 15: { A: 0, B: 2, C: 2, D: 3 },
  21: { A: 0, B: 1, C: 2, D: 3 }, 24: { A: 0, B: 1, C: 2, D: 3 },
  25: { A: 0, B: 1, C: 2, D: 3 }, 28: { A: 0, B: 1, C: 2, D: 3 },
  30: { A: 0, B: 1, C: 2, D: 3 },
};
const PROTOTYPES = [
  { age: 18, label: '少年探索型', values: { E: 92, R: 82, A: 76, I: 88, P: 25 } },
  { age: 23, label: '青年冒险型', values: { E: 86, R: 72, A: 84, I: 80, P: 40 } },
  { age: 30, label: '青年成长型', values: { E: 72, R: 58, A: 76, I: 66, P: 61 } },
  { age: 38, label: '稳健成人型', values: { E: 57, R: 44, A: 67, I: 52, P: 76 } },
  { age: 47, label: '经验务实型', values: { E: 43, R: 31, A: 58, I: 40, P: 86 } },
  { age: 58, label: '稳定老练型', values: { E: 31, R: 21, A: 48, I: 31, P: 92 } },
];
const WEIGHTS = { E: 0.24, R: 0.24, A: 0.16, I: 0.16, P: 0.20 };
const BEHAVIOR = {
  31: { label: '竞争性', lowLabel: '强合作', highLabel: '强竞争', scores: { A: 100, B: 65, C: 0, D: 50 } },
  32: { label: '直接表达', lowLabel: '回避冲突／关系优先', highLabel: '高度直接', scores: { A: 100, B: 70, C: 30, D: 0 } },
  33: { label: '风险偏好', lowLabel: '稳定优先', highLabel: '直接高风险', scores: { A: 100, B: 0, C: 35, D: 70 } },
  34: { label: '情绪表达', lowLabel: '自己消化', highLabel: '表达／寻求支持', scores: { A: 0, B: 100, C: 25, D: 65 } },
  35: { label: '任务导向', lowLabel: '关系／参与优先', highLabel: '结果／任务优先', scores: { A: 100, B: 20, C: 50, D: 80 } },
  36: { label: '独立决策', lowLabel: '参与式决策', highLabel: '强独立决策', scores: { A: 100, B: 30, C: 75, D: 0 } },
};

function emptyResult(errors = []) {
  return { answers: {}, errors, missing: Array.from({ length: QUESTIONS }, (_, i) => i + 1) };
}

/** Parse explicit numbered choices, a JSON mapping, or exactly 36 bare choices. */
export function parseAnswers(text) {
  if (typeof text !== 'string') return emptyResult(['答案必须是文本。']);
  const source = text.trim();
  if (!source) return emptyResult(['未提供答案。']);

  const jsonSource = source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (jsonSource.startsWith('{')) {
    try {
      const duplicateKeys = findDuplicateJsonKeys(jsonSource);
      if (duplicateKeys) return emptyResult([`JSON答案中题号重复：${duplicateKeys.join('、')}。`]);
      const parsed = JSON.parse(jsonSource);
      const mapping = parsed.answers && typeof parsed.answers === 'object' && !Array.isArray(parsed.answers) ? parsed.answers : parsed;
      if (mapping && typeof mapping === 'object' && !Array.isArray(mapping)) {
        return validatePairs(Object.entries(mapping).map(([key, value]) => [key, value]));
      }
      return emptyResult(['JSON答案格式无效。']);
    } catch {
      return emptyResult(['JSON答案格式无效。']);
    }
  }

  const normalized = source.replace(/```[^\n]*\n?/g, ' ').replace(/```/g, ' ').replace(/^\s*[-*+]\s+(?=(?:Q\s*)?\d)/gmi, '');
  const numbered = [...normalized.matchAll(/(?:^|[\s,;|])(?:Q\s*)?(\d+)\s*[.:：、)）-]\s*/gim)];
  if (numbered.length) {
    const pairs = [];
    const errors = [];
    for (let index = 0; index < numbered.length; index++) {
      const match = numbered[index];
      const start = match.index + match[0].length;
      const end = index + 1 < numbered.length ? numbered[index + 1].index : normalized.length;
      const span = normalized.slice(start, end).trim();
      const choiceTokens = [...span.matchAll(/\b[A-D]\b|[A-D]{2,}/gi)];
      const markdownChoice = span.match(/^\*{1,2}([A-D])\*{1,2}(?=$|\s|[，,。.!?])/i);
      const compactChoice = span.match(/^([A-D])(?=$|\s|[，,。.!?])/i);
      const choice = (markdownChoice?.[1] ?? compactChoice?.[1] ?? '').toUpperCase();
      pairs.push([match[1], choice]);
      const hasMultiple = /(?:\b[A-D]\b|[A-D])\s*(?:\/|,|，|\bor\b|或|和)\s*(?:\*{0,2}[A-D]\*{0,2})(?=$|[\s,;，；。.!?/])/i.test(span)
        || /(?:\b[A-D]\b|[A-D])\s+(?:\*{0,2}[A-D]\*{0,2})(?=$|[\s,;，；。.!?/])/i.test(span)
        || /^\*{0,2}[A-D]{2,}\*{0,2}(?=$|[\s,;，；。.!?/])/i.test(span)
        || (choiceTokens.length > 1 && !/^[A-D]\b/i.test(span));
      if (hasMultiple) errors.push(`第${match[1]}题存在多个选项，无法判定。`);
    }
    const result = validatePairs(pairs);
    result.errors.push(...errors);
    return result;
  }

  const tokens = normalized.match(/\b[A-D]\b/gi) || [];
  if (tokens.length === QUESTIONS && normalized.replace(/[A-D\s,;|，；。.!?\-`]/gi, '').length === 0) {
    return validatePairs(tokens.map((choice, index) => [String(index + 1), choice]));
  }
  return emptyResult(['无法识别答案格式；请提供带题号的选项或恰好36个裸选项。']);
}

function findDuplicateJsonKeys(source) {
  const duplicates = new Set();
  const objects = [];
  const tokenPattern = /"(?:\\.|[^"\\])*"(?=\s*:)|[{}]/g;
  for (const match of source.matchAll(tokenPattern)) {
    if (match[0] === '{') {
      objects.push(new Set());
    } else if (match[0] === '}') {
      objects.pop();
    } else if (objects.length) {
      const key = JSON.parse(match[0]);
      const questionKey = key.match(/^Q?\s*(\d+)$/i);
      const normalized = questionKey ? String(Number(questionKey[1])) : key;
      const current = objects.at(-1);
      if (current.has(normalized)) duplicates.add(normalized);
      current.add(normalized);
    }
  }
  return duplicates.size ? [...duplicates] : null;
}

function validatePairs(pairs) {
  const answers = {};
  const errors = [];
  for (const [rawNumber, rawChoice] of pairs) {
    const number = Number(String(rawNumber).replace(/^Q\s*/i, ''));
    const choice = typeof rawChoice === 'string' ? rawChoice.trim().toUpperCase() : '';
    if (!Number.isInteger(number) || number < 1 || number > QUESTIONS) {
      errors.push(`题号超出范围：${rawNumber}。`);
      continue;
    }
    if (Object.hasOwn(answers, number)) {
      errors.push(`第${number}题重复作答。`);
      continue;
    }
    if (!CHOICES.has(choice)) {
      errors.push(`第${number}题的选项无效：${String(rawChoice)}。`);
      continue;
    }
    answers[number] = choice;
  }
  const missing = Array.from({ length: QUESTIONS }, (_, i) => i + 1).filter(number => !Object.hasOwn(answers, number));
  if (missing.length) errors.push(`缺少题目：${missing.join('、')}。`);
  return { answers, errors, missing };
}

function ageLabel(age) {
  if (age <= 20) return '少年探索型';
  if (age <= 25) return '青年冒险型';
  if (age <= 33) return '青年成长型';
  if (age <= 41) return '稳健成人型';
  if (age <= 51) return '经验务实型';
  return '稳定老练型';
}

/** Score a complete, unambiguous 36-question answer object. */
export function scoreAnswers(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new TypeError('answers must be a complete object keyed by question number.');
  const entries = Object.entries(answers);
  const checked = validatePairs(entries);
  if (checked.errors.length || checked.missing.length || entries.length !== QUESTIONS) throw new TypeError(`Cannot score invalid answers: ${checked.errors.join(' ')}`);
  const answer = checked.answers;
  const dimensions = {};
  for (const [dimension, questions] of Object.entries(DIMENSIONS)) {
    const total = questions.reduce((sum, q) => sum + (dimension === 'I' ? (I_SCORES[q]?.[answer[q]] ?? BASE[answer[q]]) : dimension === 'P' ? P_SCORES[q][answer[q]] : BASE[answer[q]]), 0);
    dimensions[dimension] = total / (questions.length * 3) * 100;
  }
  const distances = PROTOTYPES.map(prototype => ({
    age: prototype.age,
    label: prototype.label,
    distance: Math.sqrt(Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + weight * (dimensions[key] - prototype.values[key]) ** 2, 0)),
  })).sort((a, b) => a.distance - b.distance || a.age - b.age);
  const closest = distances[0];
  const prototypeIndex = PROTOTYPES.findIndex(item => item.age === closest.age);
  const neighborCandidates = [PROTOTYPES[prototypeIndex - 1], PROTOTYPES[prototypeIndex + 1]].filter(Boolean);
  const neighbor = neighborCandidates.map(item => distances.find(itemDistance => itemDistance.age === item.age)).sort((a, b) => a.distance - b.distance || a.age - b.age)[0];
  const interpolation = neighbor ? [closest.age, neighbor.age].sort((a, b) => a - b) : [closest.age];
  let preciseAge;
  if (closest.distance === 0 || !neighbor || neighbor.distance === 0) preciseAge = closest.distance === 0 ? closest.age : neighbor.age;
  else preciseAge = (closest.age / closest.distance + neighbor.age / neighbor.distance) / (1 / closest.distance + 1 / neighbor.distance);
  const roundedAge = Math.round(preciseAge);
  const behavior = Object.entries(BEHAVIOR).map(([question, spec]) => ({ question: Number(question), label: spec.label, value: spec.scores[answer[question]], lowLabel: spec.lowLabel, highLabel: spec.highLabel }));
  const { E, R, A, I, P } = dimensions;
  const fun = {
    youth: 0.40 * E + 0.25 * R + 0.20 * I + 0.15 * (100 - P),
    cadre: 0.45 * P + 0.30 * (100 - R) + 0.25 * (100 - E),
    yolo: 0.60 * R + 0.25 * E + 0.15 * I,
    tinkering: 0.65 * E + 0.20 * A + 0.15 * R,
    stability: 0.55 * P + 0.30 * (100 - R) + 0.15 * (100 - E),
    idealisticYouth: 0.55 * I + 0.25 * E + 0.20 * A,
  };
  return {
    dimensions,
    age: roundedAge,
    preciseAge,
    ageLabel: ageLabel(roundedAge),
    nearestPrototype: { ...PROTOTYPES[prototypeIndex] },
    distances,
    interpolation,
    behavior,
    componentAges: { exploration: 58 - E * 0.40, risk: 58 - R * 0.40, planning: 18 + P * 0.40, idealism: 58 - I * 0.40 },
    fun,
  };
}

/** Return only the question text; scoring metadata must never enter the prompt. */
export function buildPrompt(questionText) {
  if (typeof questionText !== 'string') throw new TypeError('questionText must be a string.');
  return questionText;
}
