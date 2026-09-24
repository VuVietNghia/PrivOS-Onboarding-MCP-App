export interface OptionDraft { id: string; text: string; correct: boolean }

export function answerLabels(options: readonly OptionDraft[]): string[] {
  return options.flatMap((option, index) => option.correct ? [String.fromCharCode(97 + index)] : []);
}

export function moveOption(options: readonly OptionDraft[], id: string, index: number): OptionDraft[] {
  const current = options.findIndex((option) => option.id === id);
  if (current < 0 || index < 0 || index >= options.length) return [...options];
  const next = [...options];
  const [option] = next.splice(current, 1);
  next.splice(index, 0, option);
  return next;
}

export function removeOption(options: readonly OptionDraft[], id: string): OptionDraft[] {
  return options.filter((option) => option.id !== id);
}
