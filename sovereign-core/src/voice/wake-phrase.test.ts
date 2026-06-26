import { describe, expect, test } from 'bun:test';
import { containsWakePhrase } from './wake-phrase.ts';

describe('containsWakePhrase', () => {
  test('matches the bare wake phrase', () => {
    expect(containsWakePhrase('sovereign')).toBe(true);
    expect(containsWakePhrase('Sovereign')).toBe(true);
    expect(containsWakePhrase('SOVEREIGN')).toBe(true);
  });

  test('matches when the wake phrase appears mid-sentence', () => {
    expect(containsWakePhrase('Hey Sovereign, how are you')).toBe(true);
    expect(containsWakePhrase('Tell Sovereign to send the email')).toBe(true);
    expect(containsWakePhrase('I told sovereign already')).toBe(true);
  });

  test('respects word boundaries (does not match substrings)', () => {
    expect(containsWakePhrase('sovereignson')).toBe(false);
    expect(containsWakePhrase('starsovereign')).toBe(false);
    expect(containsWakePhrase('antisovereignt')).toBe(false);
  });

  test('treats punctuation as a word boundary', () => {
    expect(containsWakePhrase('Hello, Sovereign.')).toBe(true);
    expect(containsWakePhrase('"Sovereign!"')).toBe(true);
    expect(containsWakePhrase('(sovereign)')).toBe(true);
    expect(containsWakePhrase('Sovereign?')).toBe(true);
  });

  test('handles empty / null-ish input safely', () => {
    expect(containsWakePhrase('')).toBe(false);
    // The function takes string only, but we exercise the early-exit
    // branch by passing an empty string explicitly.
    expect(containsWakePhrase(' ')).toBe(false);
  });

  test('handles whitespace-only and unrelated text', () => {
    expect(containsWakePhrase('hello world')).toBe(false);
    expect(containsWakePhrase('the assistant said hello')).toBe(false);
    expect(containsWakePhrase('   ')).toBe(false);
  });

  test('is robust to multiline TTS input (the daemon flag-on-tts_text use case)', () => {
    expect(containsWakePhrase('First sentence.\nSecond sentence with Sovereign.')).toBe(true);
    expect(containsWakePhrase('Line one.\nLine two.\nLine three.')).toBe(false);
  });

  test('matches multiple occurrences (still returns true; not a count)', () => {
    expect(containsWakePhrase('Sovereign told Sovereign about Sovereign')).toBe(true);
  });
});
