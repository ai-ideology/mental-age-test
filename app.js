import { funInfo } from './fun-info.js';
import { buildPrompt, parseAnswers, scoreAnswers } from './scoring.js';

const form = document.querySelector('#answer-form');
const answersInput = document.querySelector('#answers-input');
const copyButton = document.querySelector('#copy-button');
const copyStatus = document.querySelector('#copy-status');
const manualCopy = document.querySelector('#manual-copy');
const promptFallback = document.querySelector('#prompt-fallback');
const validationMessage = document.querySelector('#validation-message');
const clearButton = document.querySelector('#clear-button');
const aiSubmitButton = form.querySelector('[type="submit"]');
const emptyResult = document.querySelector('#empty-result');
const resultContent = document.querySelector('#result-content');
const resultSourceLabel = document.querySelector('#result-source');
const reviewList = document.querySelector('#answer-review-list');
const personalQuestionnaire = document.querySelector('#personal-questionnaire');
const personalQuestionList = document.querySelector('#personal-question-list');
const personalLoadStatus = document.querySelector('#personal-load-status');
const personalProgress = document.querySelector('#personal-progress');
const personalValidation = document.querySelector('#personal-validation');
const personalSubmitButton = document.querySelector('#personal-submit');
const personalResetButton = document.querySelector('#personal-reset');
const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const answerLetters = ['A', 'B', 'C', 'D'];

const dimensions = [
  { key: 'E', label: '探索新奇', shortLabel: '探索' },
  { key: 'R', label: '风险胃口', shortLabel: '风险' },
  { key: 'A', label: '自主倾向', shortLabel: '自主' },
  { key: 'I', label: '理想主义', shortLabel: '理想' },
  { key: 'P', label: '规划稳定', shortLabel: '规划' },
];

const componentLabels = [
  { key: 'exploration', label: '探索年龄' },
  { key: 'risk', label: '风险年龄' },
  { key: 'planning', label: '规划年龄' },
  { key: 'idealism', label: '理想主义年龄' },
];

let questionText = '';
let questionBank = [];
let questionBankReady = false;
let resultSource = null;


function formatValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numberFormatter.format(numeric) : '未提供';
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeQuestionBank(text) {
  const bank = [];
  let currentQuestion = null;

  for (const line of text.split(/\r?\n/)) {
    const questionMatch = line.match(/^###\s*(\d+)\.\s*(.+?)\s*$/);
    if (questionMatch) {
      currentQuestion = {
        number: Number(questionMatch[1]),
        question: questionMatch[2],
        choices: {},
      };
      bank.push(currentQuestion);
      continue;
    }

    const choiceMatch = line.match(/^([A-D])\.\s*(.+?)\s*$/);
    if (currentQuestion && choiceMatch) {
      currentQuestion.choices[choiceMatch[1]] = choiceMatch[2];
    }
  }

  return bank;
}

function renderManualPrompt(prompt) {
  promptFallback.value = prompt;
  manualCopy.hidden = false;
}

function renderPersonalQuestionnaire(bank) {
  personalQuestionList.replaceChildren();
  for (const item of bank) {
    const row = document.createElement('li');
    row.className = 'personal-question-row';
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'personal-question';
    fieldset.id = `personal-question-${item.number}`;
    const legend = document.createElement('legend');
    legend.append(
      createElement('span', 'personal-question-number', `第 ${item.number} 题`),
      document.createTextNode(item.question),
    );
    const choices = createElement('div', 'personal-choices');

    for (const letter of answerLetters) {
      const label = createElement('label', 'personal-choice');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `personal-answer-${item.number}`;
      input.value = letter;
      input.dataset.questionNumber = item.number;
      label.append(
        input,
        createElement('span', 'personal-choice-letter', letter),
        createElement('span', 'personal-choice-text', item.choices[letter]),
      );
      choices.append(label);
    }

    fieldset.append(legend, choices);
    row.append(fieldset);
    personalQuestionList.append(row);
  }
  updatePersonalProgress();
}

function getPersonalAnswers() {
  const answers = {};
  for (const input of personalQuestionList.querySelectorAll('input[type="radio"]:checked')) {
    answers[Number(input.dataset.questionNumber)] = input.value;
  }
  return answers;
}

function clearPersonalValidation() {
  personalValidation.hidden = true;
  personalValidation.replaceChildren();
  for (const fieldset of personalQuestionList.querySelectorAll('.personal-question')) {
    fieldset.classList.remove('is-missing');
    fieldset.removeAttribute('aria-describedby');
    fieldset.querySelector('[aria-invalid="true"]')?.removeAttribute('aria-invalid');
  }
}

function renderPersonalValidation(focusFirst = false) {
  clearPersonalValidation();
  const answers = getPersonalAnswers();
  const missing = questionBank.filter((item) => !answerLetters.includes(answers[item.number]));
  if (missing.length === 0) return true;

  const firstMissing = missing[0];
  const fieldset = personalQuestionList.querySelector(`#personal-question-${firstMissing.number}`);
  const firstChoice = fieldset.querySelector('input[type="radio"]');
  personalValidation.textContent = `还有 ${missing.length} 道题未作答。请从第 ${firstMissing.number} 题开始，选择一个选项。`;
  personalValidation.hidden = false;
  fieldset.classList.add('is-missing');
  fieldset.setAttribute('aria-describedby', 'personal-validation');
  firstChoice.setAttribute('aria-invalid', 'true');

  if (focusFirst) {
    personalQuestionnaire.open = true;
    fieldset.scrollIntoView({ behavior: 'smooth', block: 'center' });
    firstChoice.focus({ preventScroll: true });
  }
  return false;
}

function updatePersonalProgress() {
  const answers = getPersonalAnswers();
  const answered = Object.keys(answers).length;
  personalProgress.textContent = `已作答 ${answered} / 36`;
  if (!personalValidation.hidden) renderPersonalValidation();
}
async function loadPrompt() {
  try {
    const response = await fetch('./题目.txt');
    if (!response.ok) throw new Error(`读取题目失败（${response.status}）`);
    questionText = await response.text();
    questionBank = makeQuestionBank(questionText);
    if (questionBank.length !== 36 || questionBank.some((item) => Object.keys(item.choices).length !== 4)) {
      throw new Error('题目文件不完整，无法准备全部 36 道题。');
    }
    renderPersonalQuestionnaire(questionBank);
    questionBankReady = true;
    copyButton.disabled = false;
    copyButton.textContent = '复制全部题目';
    aiSubmitButton.disabled = false;
    personalSubmitButton.disabled = false;
    personalResetButton.disabled = false;
    personalLoadStatus.hidden = true;
    return true;
  } catch (error) {
    questionBank = [];
    questionBankReady = false;
    const message = error instanceof Error ? error.message : '读取题目失败，请刷新页面重试。';
    copyButton.disabled = true;
    copyButton.textContent = '题目暂不可用';
    copyStatus.textContent = message;
    copyStatus.classList.add('status-error');
    aiSubmitButton.disabled = true;
    personalSubmitButton.disabled = true;
    personalResetButton.disabled = true;
    personalQuestionnaire.open = true;
    personalLoadStatus.hidden = false;
    personalLoadStatus.textContent = `${message} 题目载入前无法计分。`;
    personalLoadStatus.classList.add('status-error');
    return false;
  }
}

function renderValidation(errors, missing) {
  validationMessage.replaceChildren();
  const list = document.createElement('ul');

  for (const error of errors) {
    if (missing.length > 0 && /^缺少题目：/.test(error)) continue;
    list.append(createElement('li', '', error));
  }

  if (missing.length > 0) {
    const missingText = missing.join('、');
    list.append(createElement('li', '', `缺少第 ${missingText} 题的答案。`));
  }

  validationMessage.append(createElement('p', '', '请修正后再生成画像。'), list);
  validationMessage.hidden = false;
  answersInput.setAttribute('aria-invalid', 'true');
  answersInput.setAttribute('aria-describedby', 'answer-help validation-message');
}

function clearValidation() {
  validationMessage.hidden = true;
  validationMessage.replaceChildren();
  answersInput.removeAttribute('aria-invalid');
  answersInput.setAttribute('aria-describedby', 'answer-help validation-message');
}

function showEmptyResult(changedSource = null) {
  resultSource = null;
  resultContent.hidden = true;
  emptyResult.hidden = false;
  if (changedSource) {
    const subject = changedSource === 'personal' ? '个人答案' : 'AI 回答';
    emptyResult.querySelector('h3').textContent = `${subject}已修改`;
    emptyResult.querySelector('p').textContent = `旧的${subject}画像已清除。重新生成后查看更新结果。`;
  } else {
    emptyResult.querySelector('h3').textContent = '准备好时，再生成画像';
    emptyResult.querySelector('p').textContent = '可粘贴 AI 的完整回答，或展开“我也来做题”亲自回答 36 题，查看相同的画像指标。';
  }
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function radarCoordinates(index, total, radius, centerX, centerY, value = 100) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / total;
  const distance = radius * Math.max(0, Math.min(100, Number(value) || 0)) / 100;
  return {
    x: centerX + Math.cos(angle) * distance,
    y: centerY + Math.sin(angle) * distance,
    angle,
  };
}

function renderRadar(svg, axes) {
  const existingGroups = svg.querySelectorAll(':scope > g');
  existingGroups.forEach((group) => group.remove());

  const layer = svgElement('g');
  const centerX = 210;
  const centerY = 165;
  const radius = 98;
  const total = axes.length;

  for (const level of [25, 50, 75, 100]) {
    const points = axes.map((_, index) => {
      const point = radarCoordinates(index, total, radius, centerX, centerY, level);
      return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    }).join(' ');
    layer.append(svgElement('polygon', { points, class: 'radar-grid' }));
  }

  axes.forEach((axis, index) => {
    const outer = radarCoordinates(index, total, radius, centerX, centerY);
    layer.append(svgElement('line', {
      x1: centerX,
      y1: centerY,
      x2: outer.x.toFixed(2),
      y2: outer.y.toFixed(2),
      class: 'radar-axis',
    }));

    const labelPoint = radarCoordinates(index, total, 135, centerX, centerY);
    const cos = Math.cos(labelPoint.angle);
    const sin = Math.sin(labelPoint.angle);
    const anchor = cos > 0.24 ? 'start' : cos < -0.24 ? 'end' : 'middle';
    const label = svgElement('text', {
      x: labelPoint.x.toFixed(2),
      y: (labelPoint.y + (sin < -0.7 ? 4 : sin > 0.7 ? 1 : 4)).toFixed(2),
      'text-anchor': anchor,
      class: 'radar-label',
    });
    label.textContent = axis.shortLabel;
    layer.append(label);
  });

  const dataPoints = axes.map((axis, index) => radarCoordinates(index, total, radius, centerX, centerY, axis.value));
  const area = svgElement('polygon', {
    points: dataPoints.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '),
    class: 'radar-data-area',
  });
  layer.append(area);
  dataPoints.forEach((point) => {
    layer.append(svgElement('circle', {
      cx: point.x.toFixed(2),
      cy: point.y.toFixed(2),
      r: 3.5,
      class: 'radar-point',
    }));
  });
  svg.append(layer);
}

function renderDimensionValues(values) {
  const list = document.querySelector('#dimension-values');
  list.replaceChildren();
  for (const dimension of dimensions) {
    const item = document.createElement('li');
    item.append(
      createElement('span', '', dimension.label),
      createElement('strong', '', formatValue(values[dimension.key])),
    );
    list.append(item);
  }
}

function renderBehaviorValues(behavior) {
  const list = document.querySelector('#behavior-values');
  list.replaceChildren();
  for (const axis of behavior) {
    const item = document.createElement('li');
    item.append(
      createElement('span', 'behavior-name', axis.label),
      createElement('strong', '', formatValue(axis.value)),
      createElement('span', 'behavior-range', `0 ${axis.lowLabel} / 100 ${axis.highLabel}`),
    );
    list.append(item);
  }
}

function renderComponentAges(componentAges) {
  const list = document.querySelector('#component-values');
  list.replaceChildren();
  for (const item of componentLabels) {
    const value = componentAges[item.key];
    const entry = document.createElement('li');
    entry.append(
      createElement('span', '', item.label),
      createElement('strong', '', `${formatValue(value)} 岁`),
    );
    list.append(entry);
  }
}

function renderFunValues(fun) {
  const list = document.querySelector('#fun-values');
  list.replaceChildren();
  for (const item of funInfo) {
    const entry = createElement('li', 'fun-item');
    const heading = createElement('div', 'fun-value-line');
    heading.append(
      createElement('span', 'fun-label', item.label),
      createElement('strong', '', formatValue(fun[item.key])),
    );
    const details = createElement('details', 'fun-details');
    const detailsSummary = createElement('summary', '', '低分含义与计算方式');
    details.append(
      detailsSummary,
      createElement('p', 'fun-low', item.low),
      createElement('p', 'fun-formula', `计算方式：${item.formula}`),
    );
    entry.append(
      heading,
      createElement('p', 'fun-summary', item.summary),
      createElement('p', 'fun-high', item.high),
      details,
    );
    list.append(entry);
  }
}

function renderPrototypeInfo(result) {
  const nearest = result.nearestPrototype;
  const interpolation = Array.isArray(result.interpolation) ? result.interpolation : [];
  const pairText = interpolation.length === 2
    ? `${formatValue(interpolation[0])} 与 ${formatValue(interpolation[1])} 岁原型之间插值`
    : '依据最近年龄原型插值';
  const nearestDistance = Array.isArray(result.distances)
    ? result.distances.find((item) => item.age === nearest?.age)?.distance
    : undefined;

  const preciseAge = formatValue(result.preciseAge);
  document.querySelector('#prototype-note').textContent = `${pairText}，精确插值 ${preciseAge} 岁`;
  const details = document.querySelector('#prototype-detail');
  details.textContent = `最近原型：${formatValue(nearest?.age)} 岁 · ${nearest?.label ?? '未提供'}${nearestDistance === undefined ? '' : ` · 加权距离 ${formatValue(nearestDistance)}`}`;

  const distanceList = document.querySelector('#prototype-distances');
  distanceList.replaceChildren();
  for (const item of result.distances ?? []) {
    const row = document.createElement('li');
    row.append(
      createElement('span', '', `${formatValue(item.age)} 岁 · ${item.label}`),
      createElement('strong', '', formatValue(item.distance)),
    );
    distanceList.append(row);
  }
}

function renderAnswerReview(answers) {
  reviewList.replaceChildren();
  for (const item of questionBank) {
    const answer = answers[item.number];
    const selectedText = item.choices[answer] ?? '未提供选项内容';
    const row = document.createElement('li');
    row.className = 'review-item';
    row.append(
      createElement('p', 'review-question', `${item.number}. ${item.question}`),
    );
    const answerText = document.createElement('p');
    answerText.className = 'review-answer';
    answerText.append(
      createElement('span', 'review-choice', answer),
      document.createTextNode(selectedText),
    );
    row.append(answerText);
    reviewList.append(row);
  }
}

function renderResults(result, answers, source) {
  document.querySelector('#age-value').textContent = formatValue(result.age);
  document.querySelector('#age-label').textContent = result.ageLabel;
  resultSourceLabel.textContent = source === 'personal' ? '结果来源：个人作答' : '结果来源：AI 粘贴回答';
  renderPrototypeInfo(result);

  const dimensionAxes = dimensions.map((dimension) => ({
    shortLabel: dimension.shortLabel,
    value: result.dimensions[dimension.key],
  }));
  const behaviorAxes = result.behavior.map((item) => ({
    shortLabel: item.label.length > 4 ? item.label.slice(0, 3) : item.label,
    value: item.value,
  }));

  renderRadar(document.querySelector('#dimension-chart'), dimensionAxes);
  renderRadar(document.querySelector('#behavior-chart'), behaviorAxes);
  document.querySelector('#dimension-svg-description').textContent = dimensions
    .map((dimension) => `${dimension.label} ${formatValue(result.dimensions[dimension.key])}`)
    .join('，');
  document.querySelector('#behavior-svg-description').textContent = result.behavior
    .map((item) => `${item.label} ${formatValue(item.value)}`)
    .join('，');

  renderDimensionValues(result.dimensions);
  renderBehaviorValues(result.behavior);
  renderComponentAges(result.componentAges);
  renderFunValues(result.fun);
  renderAnswerReview(answers);

  emptyResult.hidden = true;
  resultContent.hidden = false;
  resultSource = source;
  document.querySelector('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function isCompleteAnswerSet(answers) {
  return answers && Array.from({ length: 36 }, (_, index) => answers[index + 1])
    .every((answer) => answerLetters.includes(answer));

}

personalQuestionList.addEventListener('change', (event) => {
  if (!event.target.matches('input[type="radio"]')) return;
  updatePersonalProgress();
  if (resultSource === 'personal') showEmptyResult('personal');
});

personalSubmitButton.addEventListener('click', () => {
  if (!questionBankReady) return;
  const answers = getPersonalAnswers();
  if (!isCompleteAnswerSet(answers)) {
    renderPersonalValidation(true);
    return;
  }
  clearPersonalValidation();
  renderResults(scoreAnswers(answers), answers, 'personal');
});

personalResetButton.addEventListener('click', () => {
  for (const input of personalQuestionList.querySelectorAll('input[type="radio"]:checked')) {
    input.checked = false;
  }
  clearPersonalValidation();
  updatePersonalProgress();
  if (resultSource !== 'ai') showEmptyResult();
});
copyButton.addEventListener('click', async () => {
  if (!questionText) return;
  const prompt = buildPrompt(questionText);
  try {
    if (!navigator.clipboard?.writeText) throw new Error('此浏览器未提供剪贴板权限。');
    await navigator.clipboard.writeText(prompt);
    manualCopy.hidden = true;
    copyStatus.textContent = '已复制 36 道题，可以粘贴给 AI。';
    copyStatus.classList.remove('status-error');
  } catch (error) {
    renderManualPrompt(prompt);
    copyStatus.textContent = error instanceof Error
      ? `${error.message} 已显示手动复制内容。`
      : '自动复制失败，已显示手动复制内容。';
    copyStatus.classList.add('status-error');
  }
});

document.querySelector('#select-prompt').addEventListener('click', () => {
  promptFallback.focus();
  promptFallback.select();
  copyStatus.textContent = '题目内容已选中，请使用 Ctrl+C 或系统的复制快捷键。';
  copyStatus.classList.remove('status-error');
});

answersInput.addEventListener('input', () => {
  clearValidation();
  if (resultSource === 'ai') showEmptyResult('ai');
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearValidation();

  if (!questionBankReady) {
    renderValidation(['题目尚未载入，暂时无法生成画像。'], []);
    return;
  }

  const parsed = parseAnswers(answersInput.value);
  const errors = Array.isArray(parsed.errors) ? parsed.errors : [];
  const missing = Array.isArray(parsed.missing) ? parsed.missing : [];

  if (errors.length > 0 || missing.length > 0 || !isCompleteAnswerSet(parsed.answers)) {
    const completeMissing = missing.length > 0
      ? missing
      : Array.from({ length: 36 }, (_, index) => index + 1)
        .filter((number) => !answerLetters.includes(parsed.answers?.[number]));
    const fallbackErrors = errors.length > 0
      ? errors
      : ['答案格式无法识别，请按“1.A”逐题填写。'];
    renderValidation(fallbackErrors, completeMissing);
    if (resultSource === 'ai') showEmptyResult('ai');
    return;
  }

  renderResults(scoreAnswers(parsed.answers), parsed.answers, 'ai');
});

clearButton.addEventListener('click', () => {
  answersInput.value = '';
  clearValidation();
  manualCopy.hidden = true;
  copyStatus.classList.remove('status-error');
  copyStatus.textContent = '题目只包含作答内容，不包含评分规则。';
  if (resultSource !== 'personal') showEmptyResult();
  answersInput.focus();
});


showEmptyResult();
loadPrompt();
