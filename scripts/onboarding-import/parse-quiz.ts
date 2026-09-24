import type { ImportedQuestion } from './models';

const heading = /^\*\*Q(\d+\.\d+)\s*\([^)]*\)\.\*\*\s*(.*)$/u;
const option = /^([a-j])\)\s*(.*)$/u;
const answer = /^<!--\s*answer:\s*(.*?)\s*-->$/iu;

export function parseAnswer(value: string, optionCount: number): string[] {
  const raw = value.split(/[([]/, 1)[0].trim();
  if (!raw) return [];
  const labels = raw.split(',').map((label) => label.trim().toLowerCase());
  if (labels.some((label) => !/^[a-j]$/.test(label) || label.charCodeAt(0) - 97 >= optionCount)) return [];
  return [...new Set(labels)].sort();
}

export function parseQuiz(markdown: string, fileKey: string): ImportedQuestion[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const questions: ImportedQuestion[] = [];
  const seen = new Set<string>();
  let current: { id: string; line: number; content: string[]; options: string[]; answer: string | null } | null = null;

  const fail = (line: number, question: string, reason: string): never => {
    throw new Error(`${fileKey}:${line} ${question}: ${reason}`);
  };
  const flush = (): void => {
    if (!current) return;
    const question = current;
    if (!question.content.join('\n').trim()) fail(question.line, question.id, 'empty question');
    if (question.options.length < 2 || question.options.length > 10) fail(question.line, question.id, 'expected 2-10 options');
    if (question.answer === null) fail(question.line, question.id, 'missing answer comment');
    if (seen.has(question.id)) fail(question.line, question.id, 'duplicate question');
    seen.add(question.id);
    const rawAnswer = question.answer ?? '';
    const correctLabels = parseAnswer(rawAnswer, question.options.length);
    const explanation = correctLabels.length ? (rawAnswer.match(/\(([^)]*)\)/u)?.[1]?.trim() ?? '') : '';
    questions.push({
      sourceKey: `${fileKey}#${question.id}`,
      content: question.content.join('\n').trim(),
      options: question.options,
      correctLabels,
      explanation,
    });
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const match = line.match(heading);
    if (match) {
      flush();
      current = { id: `Q${match[1]}`, line: lineNumber, content: [match[2]], options: [], answer: null };
      return;
    }
    if (/^\*\*Q\d/u.test(line)) fail(lineNumber, 'quiz', 'malformed question heading');
    if (!current) return;
    const question = current;
    const answerMatch = line.match(answer);
    if (answerMatch) {
      if (question.answer !== null) fail(lineNumber, question.id, 'duplicate answer comment');
      question.answer = answerMatch[1];
      return;
    }
    const optionMatch = line.match(option);
    if (optionMatch) {
      if (question.answer !== null) fail(lineNumber, question.id, 'option after answer');
      const expected = String.fromCharCode(97 + question.options.length);
      if (optionMatch[1] !== expected) fail(lineNumber, question.id, `expected option ${expected}`);
      if (!optionMatch[2].trim()) fail(lineNumber, question.id, 'empty option');
      question.options.push(optionMatch[2].trim());
      return;
    }
    if (line.trim()) {
      if (question.answer !== null) fail(lineNumber, question.id, 'text after answer');
      if (question.options.length) {
        if (!/^\s+/u.test(line)) fail(lineNumber, question.id, 'malformed option');
        const last = question.options.length - 1;
        question.options[last] += ` ${line.trim()}`;
        return;
      }
      question.content.push(line.trim());
    }
  });
  flush();
  if (!questions.length) fail(1, 'quiz', 'no questions');
  return questions;
}
