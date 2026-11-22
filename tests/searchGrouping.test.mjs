import test from 'node:test';
import assert from 'node:assert/strict';
import { groupSearchResults } from '../services/seriesIdentity.js';

const hit = (source, id, title, score = 100) => ({ source, id, title, score });

test('one series row retains multiple provider references', () => {
  const rows = groupSearchResults([
    hit('mgeko', 'mgeko__eleceed', 'Eleceed'),
    hit('mangadex', 'mangadex__123', 'Eleceed'),
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].searchSources.map(s => s.source), ['mgeko', 'mangadex']);
  assert.equal(rows[0].id, 'mgeko__eleceed');
});

test('merges punctuation/case variants and explicit verified title alias', () => {
  const rows = groupSearchResults([
    hit('mangapill', 'https://mangapill.com/manga/3/fuufu', 'Fuufu Ijou, Koibito Miman'),
    hit('mgeko', 'mgeko__fuufu', 'More Than a Married Couple, But Not Lovers'),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].searchSources.length, 2);
});

test('different titles are never fuzzy-merged', () => {
  assert.equal(groupSearchResults([
    hit('mangapill', 'a', 'Eleceed'),
    hit('mgeko', 'b', 'Eleceed: Side Story'),
  ]).length, 2);
});

test('ambiguous same-provider editions remain separate', () => {
  const rows = groupSearchResults([
    hit('mangadex', 'mangadex__one', 'Eleceed'),
    hit('mangadex', 'mangadex__two', 'Eleceed'),
    hit('mgeko', 'mgeko__eleceed', 'Eleceed'),
  ]);
  assert.equal(rows.length, 3);
  assert.ok(rows.every(row => row.searchSources.length === 1));
});

test('duplicate provider IDs are removed and relevance ordering retained', () => {
  const rows = groupSearchResults([
    hit('mgeko', 'mgeko__eleceed', 'Eleceed', 100),
    hit('mgeko', 'mgeko__eleceed', 'ELECEED', 100),
    hit('mangadex', 'mangadex__one', 'Eleceed', 100),
    hit('asura', 'asura-other', 'Other', 500),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'Other');
  assert.equal(rows[1].searchSources.length, 2);
});
