import { describe, it, expect } from 'vitest';
import { resolveTapeParam, drawerEntries, spineColor, spineTextColor, tapeUrl, shelfOrder, reorderPublished } from './library.js';
import { PALETTE } from './utils.js';

describe('resolveTapeParam', () => {
  it('returns the tape id from a ?tape= param', () => {
    expect(resolveTapeParam('?tape=123', '999')).toBe('123');
  });
  it('returns null when the param names the baked-in tape', () => {
    expect(resolveTapeParam('?tape=999', '999')).toBeNull();
  });
  it('returns null when there is no param', () => {
    expect(resolveTapeParam('', '999')).toBeNull();
    expect(resolveTapeParam('?other=1', '999')).toBeNull();
  });
  it('returns null for an empty tape param', () => {
    expect(resolveTapeParam('?tape=', '999')).toBeNull();
  });
  it('reads tape among other params', () => {
    expect(resolveTapeParam('?a=1&tape=42&b=2', '999')).toBe('42');
  });
});

describe('drawerEntries', () => {
  it('returns the published order verbatim when the active tape is published', () => {
    const index = { active: '2', ids: ['1', '2', '3'], published: ['3', '2'] };
    expect(drawerEntries(index, '2')).toEqual(['3', '2']);
  });
  it('prepends the active tape when it is not published', () => {
    const index = { active: '1', ids: ['1', '2', '3'], published: ['3', '2'] };
    expect(drawerEntries(index, '1')).toEqual(['1', '3', '2']);
  });
  it('handles a missing published field', () => {
    expect(drawerEntries({ active: '1', ids: ['1'] }, '1')).toEqual(['1']);
  });
  it('handles an empty published array', () => {
    expect(drawerEntries({ active: '1', ids: ['1'], published: [] }, '1')).toEqual(['1']);
  });
  it('handles a missing active id', () => {
    expect(drawerEntries({ active: '1', ids: ['1'], published: ['1'] }, undefined)).toEqual(['1']);
  });
  it('does not mutate the index', () => {
    const index = { active: '1', ids: ['1', '2'], published: ['2'] };
    drawerEntries(index, '1');
    expect(index.published).toEqual(['2']);
  });
});

describe('spineColor', () => {
  it('passes a hex color through', () => {
    expect(spineColor('#a83232', '1', PALETTE)).toBe('#a83232');
  });
  it('returns the pride sentinel for pride tapes', () => {
    expect(spineColor('pride', '1', PALETTE)).toBe('pride');
  });
  it('picks deterministically from the palette for random tapes', () => {
    const a = spineColor('random', '1748649600000', PALETTE);
    const b = spineColor('random', '1748649600000', PALETTE);
    expect(a).toBe(b);
    expect(PALETTE).toContain(a);
  });
  it('different ids can land on different palette colors', () => {
    const colors = new Set(
      ['1', '2', '3', '4', '5', '6'].map(id => spineColor('random', id, PALETTE))
    );
    expect(colors.size).toBeGreaterThan(1);
  });
  it('treats a missing color as random', () => {
    expect(PALETTE).toContain(spineColor(undefined, '42', PALETTE));
  });
});

describe('spineTextColor', () => {
  it('uses light text on dark backgrounds', () => {
    expect(spineTextColor('#000000')).toBe('light');
    expect(spineTextColor('#a83232')).toBe('light');
    expect(spineTextColor('#2e4a7a')).toBe('light');
  });
  it('uses dark text on light backgrounds', () => {
    expect(spineTextColor('#ffffff')).toBe('dark');
    expect(spineTextColor('#e8d8a0')).toBe('dark');
  });
  it('every palette color takes light text', () => {
    PALETTE.forEach(hex => expect(spineTextColor(hex)).toBe('light'));
  });
});

describe('shelfOrder', () => {
  it('lists published tapes first in curated order, then the rest in ids order', () => {
    const index = { active: '1', ids: ['1', '2', '3', '4'], published: ['3', '1'] };
    expect(shelfOrder(index)).toEqual(['3', '1', '2', '4']);
  });
  it('falls back to ids order with no published field', () => {
    expect(shelfOrder({ active: '1', ids: ['2', '1'] })).toEqual(['2', '1']);
  });
  it('drops published ids that are not in ids', () => {
    const index = { active: '1', ids: ['1', '2'], published: ['ghost', '2'] };
    expect(shelfOrder(index)).toEqual(['2', '1']);
  });
  it('handles a missing index', () => {
    expect(shelfOrder(undefined)).toEqual([]);
  });
});

describe('reorderPublished', () => {
  it('reorders published ids to match the DOM order', () => {
    expect(reorderPublished(['1', '2', '3'], ['3', '1', '2'])).toEqual(['3', '1', '2']);
  });
  it('ignores unpublished ids in the DOM order', () => {
    expect(reorderPublished(['1', '2'], ['4', '2', '5', '1'])).toEqual(['2', '1']);
  });
  it('never changes membership', () => {
    expect(reorderPublished(['1'], ['2', '3'])).toEqual(['1']);
    expect(reorderPublished([], ['1', '2'])).toEqual([]);
  });
  it('keeps published ids missing from the DOM', () => {
    expect(reorderPublished(['1', '2', '3'], ['3', '1'])).toEqual(['3', '1', '2']);
  });
  it('does not mutate its inputs', () => {
    const pub = ['1', '2'];
    reorderPublished(pub, ['2', '1']);
    expect(pub).toEqual(['1', '2']);
  });
});

describe('tapeUrl', () => {
  it('returns the bare path for the baked-in tape', () => {
    expect(tapeUrl('999', '999', '/')).toBe('/');
  });
  it('returns a ?tape= URL for other tapes', () => {
    expect(tapeUrl('123', '999', '/')).toBe('/?tape=123');
  });
  it('encodes the id', () => {
    expect(tapeUrl('a b', '999', '/')).toBe('/?tape=a%20b');
  });
});
