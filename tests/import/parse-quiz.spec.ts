import { describe, expect, it } from 'vitest';
import { parseAnswer, parseQuiz } from '../../scripts/onboarding-import/parse-quiz';

describe('parseAnswer', () => {
  it('removes comments and sorts valid labels', () => {
    expect(parseAnswer('c, a, a (ghi chú)', 3)).toEqual(['a', 'c']);
  });

  it('keeps missing or out of range answers as draft', () => {
    expect(parseAnswer('[CẦN ĐIỀN đáp án đúng]', 4)).toEqual([]);
    expect(parseAnswer('j', 2)).toEqual([]);
    expect(parseAnswer('j', 10)).toEqual(['j']);
  });
});

describe('parseQuiz', () => {
  it('parses multiline questions, CRLF and answer annotations', () => {
    const markdown = '# Quiz\r\n\r\n**Q3.2 (Trắc nghiệm).** Câu đầu\r\ndòng kế?\r\na) Một\r\nb) Hai\r\n<!-- answer: b (ghi chú) -->\r\n';
    expect(parseQuiz(markdown, 'Vị trí/Day_03/quiz_day_03.md')).toEqual([{
      sourceKey: 'Vị trí/Day_03/quiz_day_03.md#Q3.2',
      content: 'Câu đầu\ndòng kế?', options: ['Một', 'Hai'],
      correctLabels: ['b'], explanation: 'ghi chú',
    }]);
  });

  it('rejects duplicate or skipped option labels with location', () => {
    const markdown = '**Q1.1 (Trắc nghiệm).** Chọn?\na) Một\nc) Ba\n<!-- answer: a -->';
    expect(() => parseQuiz(markdown, 'bad.md')).toThrow(/bad\.md:3.*Q1\.1/);
  });

  it('joins indented option continuation without discarding the source wording', () => {
    const markdown = '**Q1.1 (Trắc nghiệm).** Chọn?\na) Dòng đầu\n   dòng sau\nb) Hai\n<!-- answer: a -->';
    expect(parseQuiz(markdown, 'quiz.md')[0].options).toEqual(['Dòng đầu dòng sau', 'Hai']);
  });

  it('rejects malformed question instead of silently omitting it', () => {
    expect(() => parseQuiz('**Q1.1 (Trắc nghiệm).** Chọn?\na) Một\nb) Hai', 'bad.md'))
      .toThrow(/bad\.md:1.*Q1\.1/);
  });

  it('rejects a quiz file with no recognized questions', () => {
    expect(() => parseQuiz('# Quiz\nNothing to import', 'empty.md')).toThrow(/empty\.md.*no questions/i);
  });
});
