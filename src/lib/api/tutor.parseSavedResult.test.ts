import { describe, expect, it } from 'vitest';
import { parseSavedResult } from './tutor';

// Regression coverage for the "Could not open saved search" bug: the backend
// returns `responseJson` as a PARSED OBJECT (it JSON.parses the column before
// sending), so the old `JSON.parse(s.responseJson)` always threw. We must
// tolerate objects, raw strings, and every cross-platform payload shape.
describe('parseSavedResult', () => {
  it('parses an OBJECT responseJson (server GET shape) — the original crash', () => {
    const r = parseSavedResult({
      answer: 'Chennai is sunny, 33°C.',
      model: 'gemini-3.1-flash-lite',
      sources: [{ title: 'Weather', url: 'https://x' }],
      searchQueries: ['chennai weather'],
    });
    expect(r).not.toBeNull();
    expect(r!.answer).toBe('Chennai is sunny, 33°C.');
    expect(r!.model).toBe('gemini-3.1-flash-lite');
    expect(r!.sources).toHaveLength(1);
    expect(r!.searchQueries).toEqual(['chennai weather']);
  });

  it('parses a STRING responseJson (legacy / local rows)', () => {
    const r = parseSavedResult(
      JSON.stringify({ answer: 'A', model: 'm', sources: [], searchQueries: [] }),
    );
    expect(r?.answer).toBe('A');
  });

  it('falls back to `summary` for an Android summarizer payload', () => {
    const r = parseSavedResult({ summary: 'Short summary', model: 'm' });
    expect(r?.answer).toBe('Short summary');
  });

  it('falls back to `text` (Tavily/legacy answer key)', () => {
    const r = parseSavedResult({ text: 'Answer body', model: 'm' });
    expect(r?.answer).toBe('Answer body');
  });

  it('returns null for unusable payloads', () => {
    expect(parseSavedResult(null)).toBeNull();
    expect(parseSavedResult('not json')).toBeNull();
    expect(parseSavedResult(123)).toBeNull();
  });

  it('tolerates missing optional arrays', () => {
    const r = parseSavedResult({ answer: 'A' });
    expect(r?.sources).toEqual([]);
    expect(r?.searchQueries).toEqual([]);
  });
});
