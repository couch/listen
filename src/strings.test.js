import { describe, it, expect } from 'vitest';
import { STRINGS, lang, L, fmtDate } from './strings.js';

const ALL_LANGS = ['en', 'es', 'it', 'de', 'fr', 'zh', 'ko', 'ja', 'ru', 'hi', 'mr'];
const REQUIRED_KEYS = ['mo', 'tr', 'cr', 'ed', 'nb', 'fa', 'au', 'mi', 'pl', 'pc', 'pp', 'play', 'pause', 'by', 'np', 'pe', 'of', 'pi'];

describe('STRINGS', () => {
  it('contains all 11 supported languages', () => {
    ALL_LANGS.forEach(l => expect(STRINGS).toHaveProperty(l));
  });
  it('every language has all required keys', () => {
    ALL_LANGS.forEach(l => {
      REQUIRED_KEYS.forEach(k => expect(STRINGS[l], `${l}.${k}`).toHaveProperty(k));
    });
  });
  it('every mo array has 12 entries', () => {
    ALL_LANGS.forEach(l => expect(STRINGS[l].mo).toHaveLength(12));
  });
  it('only English uses miles (mi: true)', () => {
    expect(STRINGS.en.mi).toBe(true);
    ALL_LANGS.filter(l => l !== 'en').forEach(l => expect(STRINGS[l].mi).toBe(false));
  });
});

describe('lang', () => {
  it('is a string', () => expect(typeof lang).toBe('string'));
  it('defaults to "en" when navigator is unavailable (Node environment)', () => {
    expect(lang).toBe('en');
  });
});

describe('L', () => {
  it('resolves to STRINGS.en in test environment', () => expect(L).toBe(STRINGS.en));
  it('has a 12-entry mo array', () => expect(L.mo).toHaveLength(12));
});

describe('fmtDate', () => {
  it('returns empty string for falsy values', () => {
    expect(fmtDate('')).toBe('');
    expect(fmtDate(null)).toBe('');
    expect(fmtDate(undefined)).toBe('');
  });
  it('formats a date in English', () => expect(fmtDate('2026-06-07')).toBe('07 Jun 2026'));
  it('pads single-digit days', () => expect(fmtDate('2026-01-05')).toBe('05 Jan 2026'));
  it('uses the correct month name for each month', () => {
    expect(fmtDate('2026-12-01')).toBe('01 Dec 2026');
    expect(fmtDate('2026-02-28')).toBe('28 Feb 2026');
  });
});

describe('pluralization', () => {
  it('English: singular and plural', () => {
    expect(STRINGS.en.tr(1)).toBe('1 track');
    expect(STRINGS.en.tr(0)).toBe('0 tracks');
    expect(STRINGS.en.tr(2)).toBe('2 tracks');
  });
  it('Russian: applies grammatical plural forms', () => {
    expect(STRINGS.ru.tr(1)).toContain('трек');
    expect(STRINGS.ru.tr(21)).toContain('трек');
    expect(STRINGS.ru.tr(2)).toContain('трека');
    expect(STRINGS.ru.tr(11)).toContain('треков');
    expect(STRINGS.ru.tr(5)).toContain('треков');
  });
});

describe('format functions', () => {
  it('by() formats title and artist in English order', () => {
    expect(STRINGS.en.by('Song', 'Artist')).toBe('Song by Artist');
  });
  it('by() reverses order for CJK locales', () => {
    expect(STRINGS.zh.by('Song', 'Artist')).toBe('Artist - Song');
    expect(STRINGS.ja.by('Song', 'Artist')).toBe('Artist - Song');
    expect(STRINGS.ko.by('Song', 'Artist')).toBe('Artist - Song');
  });
  it('fa() includes the distance number', () => {
    expect(STRINGS.en.fa(100)).toContain('100');
    expect(STRINGS.en.fa(100)).toContain('miles');
  });
  it('np() includes both title and artist', () => {
    const result = STRINGS.en.np('Track Title', 'The Artist');
    expect(result).toContain('Track Title');
    expect(result).toContain('The Artist');
  });
});
