import { describe, expect, it } from 'vitest';
import { formatArticleShareText, formatSearchShareText, shareQaFromMessages } from './shareText';

const user = (text: string) => ({ role: 'user', text });
const ai = (text: string) => ({ role: 'assistant', text });

describe('article share', () => {
  it('is a chooser payload, not the full article body', () => {
    const dumped = 'Paragraph one of a very long article that must not leak.';
    const text = formatArticleShareText({
      title: 'Court ruling on housing',
      source: 'The Hindu',
      date: '17 Sep 2026',
      url: 'https://example.com/housing',
      snapshot: 'A short snapshot of the story.',
    });
    expect(text).toContain('Nexus AI · News');
    expect(text).toContain('Court ruling on housing');
    expect(text).toContain('The Hindu  ·  17 Sep 2026');
    expect(text).toContain('https://example.com/housing');
    expect(text).toContain('A short snapshot of the story.');
    expect(text).not.toContain(dumped);
    expect(text).toContain('— Shared from Nexus AI');
    expect(text).not.toContain('Follow-up');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('formats completed follow-ups as Question then Answer', () => {
    const text = formatArticleShareText({
      title: 'Budget speech',
      source: 'Mint',
      url: 'https://example.com/budget',
      messages: [
        user('What changed for home loans?'),
        ai('The rate cap was lifted from April.'),
        user('Does this apply to existing EMIs?'),
        ai('Only new floating-rate loans from the notified date.'),
      ],
    });
    expect(text).toContain('────────  Follow-up  ────────');
    expect(text).toContain('Question 1\nWhat changed for home loans?');
    expect(text).toContain('Answer 1\nThe rate cap was lifted from April.');
    expect(text).toContain('Question 2\nDoes this apply to existing EMIs?');
    expect(text).toContain('· · ·');
  });
});

describe('search share', () => {
  it('includes the query and answer and omits follow-up when there is none', () => {
    const text = formatSearchShareText({
      query: 'who won the match?',
      model: 'gemini-2.5-flash',
      response: 'India won by 4 wickets.',
    });
    expect(text).toContain('Nexus AI · Search');
    expect(text).toContain('who won the match?');
    expect(text).toContain('gemini-2.5-flash');
    expect(text).toContain('India won by 4 wickets.');
    expect(text).not.toContain('Follow-up');
  });

  it('includes the search answer and the follow-up chat', () => {
    const text = formatSearchShareText({
      query: 'capital of France',
      model: 'gemini-3.5-flash-lite',
      response: 'The capital of France is Paris.',
      messages: [user('which river'), ai('The river is the Seine.')],
    });
    expect(text).toContain('The capital of France is Paris.');
    expect(text).toContain('Question\nwhich river');
    expect(text).toContain('Answer\nThe river is the Seine.');
    expect(text).not.toContain('Question 1');
  });

  it('drops a loading answer and an unanswered question', () => {
    const qa = shareQaFromMessages([
      user('Still going?'),
      { role: 'assistant', text: 'partial', isLoading: true },
      user('Now?'),
      ai('Done.'),
      user('Hanging?'),
    ]);
    expect(qa).toEqual([{ question: 'Now?', answer: 'Done.' }]);
  });

  it('drops an error answer', () => {
    expect(
      shareQaFromMessages([
        user('Broken?'),
        { role: 'assistant', text: 'boom', isError: true },
      ]),
    ).toEqual([]);
  });
});
