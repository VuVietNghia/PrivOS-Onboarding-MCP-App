// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const legacyCss = readFileSync(resolve(process.cwd(), 'src/ui/contact-form-styles.css'), 'utf8');
const onboardingCss = readFileSync(resolve(process.cwd(), 'src/ui/onboarding/onboarding-v4.css'), 'utf8');

function requiredElement<T extends Element>(document: Document, selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing test element: ${selector}`);
  return element;
}

describe('member learning theme isolation', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('uses onboarding colors when the host supplies a dark palette and the member selects light mode', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.setAttribute('style',
      '--base-text-primary:#ece7eb;--base-text-secondary:#97979b;--base-bg-main:#0b0c10;--base-bg-surface:#3b3c48');
    document.head.innerHTML = `<style>${legacyCss}\n${onboardingCss}</style>`;
    document.body.innerHTML = `<div class="onboarding-v4" data-theme-mode="light">
          <section class="v4-learning-day"><h1>Day 1</h1><article><h2>Lesson</h2></article></section>
          <section class="v4-learning-quiz"><h1>Quiz</h1><fieldset><legend>Question 1</legend>
            <label><input type="radio">Answer</label>
          </fieldset></section>
          <section class="v4-quiz-result"><h1>Attempt result 1</h1></section>
        </div>`;
    const style = (selector: string) => getComputedStyle(requiredElement(document, selector));

    expect(style('.v4-learning-day h1').color).toBe('var(--v4-text)');
    expect(style('.v4-learning-quiz h1').color).toBe('var(--v4-text)');
    expect(style('.v4-learning-quiz legend').color).toBe('var(--v4-text)');
    expect(style('.v4-learning-quiz label').color).toBe('var(--v4-text-2)');
    expect(style('.v4-learning-quiz input').width).toBe('auto');
    expect(style('.v4-quiz-result h1').color).toBe('var(--v4-text)');
  });
});
