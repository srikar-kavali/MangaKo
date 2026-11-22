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

test('Home discovery groups distinct curated providers into one title card', () => {
  const home = groupSearchResults([
    hit('mgeko', 'mgeko__eleceed', 'Eleceed'),
    hit('asura', 'eleceed', 'Eleceed'),
    hit('mangadex', 'mangadex__uuid', 'Eleceed'),
    hit('asura', 'other-title', 'Another Series'),
  ]);
  assert.equal(home.length, 2);
  assert.equal(home[0].title, 'Eleceed');
  assert.deepEqual(home[0].searchSources.map(s => s.source), ['mgeko', 'asura', 'mangadex']);
});

test('Home re-groups titles that arrive during MangaDex pagination', () => {
  const initial = [
    hit('mgeko', 'mgeko__eleceed', 'Eleceed'),
    hit('asura', 'series-b', 'Series B'),
  ];
  const paginated = [
    ...initial,
    hit('mangadex', 'mangadex__eleceed', 'Eleceed'),
  ];
  assert.equal(groupSearchResults(initial).length, 2);
  const rows = groupSearchResults(paginated);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].searchSources.length, 2);
});


test('canonical cover and description do not depend on selected Eleceed provider', async () => {
  const { canonicalMetadataFor, applyCanonicalMetadata } = await import('../services/canonicalMetadata.js');
  const overview = canonicalMetadataFor('Eleceed');
  assert.ok(overview);
  assert.match(overview.cover, /asurascans/);
  const selected = applyCanonicalMetadata(hit('mgeko', 'mgeko__eleceed', 'Eleceed'));
  assert.equal(selected.id, 'mgeko__eleceed');
  assert.equal(selected.source, 'mgeko');
  assert.equal(selected.cover, overview.cover);
  assert.equal(selected.description, overview.description);
});

test('Northern Blade aliases keep multiple provider IDs in one series', async () => {
  const { canonicalMetadataFor } = await import('../services/canonicalMetadata.js');
  const rows = groupSearchResults([
    hit('mgeko', 'mgeko__legend-of-the-northern-blade', 'Legend of the Northern Blade'),
    hit('asura', 'the-legend-of-the-northern-blade', 'The Legend of TheNorthern Blade'),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].searchSources.length, 2);
  assert.ok(canonicalMetadataFor('Legend of the Northern Blade'));
});

test('single provider items retain their own metadata', async () => {
  const { applyCanonicalMetadata } = await import('../services/canonicalMetadata.js');
  const item = { id: 'solo-leveling', source: 'asura', title: 'Solo Leveling',
    description: 'Its original synopsis', cover: 'https://example.com/original.jpg' };
  assert.deepEqual(applyCanonicalMetadata(item), item);
});

test('Sword Clan alternate names display as one series with both source IDs', async () => {
  const { applyCanonicalMetadata, canonicalMetadataFor } = await import('../services/canonicalMetadata.js');
  const entries = [
    hit('asura', 'regressing-as-the-reincarnated-bastard-of-the-swor',
      'Regressing as the Reincarnated Bastard of the Sword Clan'),
    hit('mgeko', 'mgeko__regressed-life-of-the-sword-clans-ignoble-reincarnator',
      "Regressed Life of the Sword Clan's Ignoble Reincarnator"),
  ];
  const grouped = groupSearchResults(entries);
  assert.equal(grouped.length, 1);
  assert.deepEqual(grouped[0].searchSources.map(entry => entry.source), ['asura', 'mgeko']);
  const canonical = canonicalMetadataFor(entries[1].title);
  assert.ok(canonical);
  const card = applyCanonicalMetadata(grouped[0]);
  assert.equal(card.image, canonical.cover);
  assert.equal(card.description, canonical.description);
  assert.equal(card.searchSources.length, 2);
});

test('unrelated Sword Clan series are not grouped by title similarity', () => {
  assert.equal(groupSearchResults([
    hit('asura', 'regressing-as-the-reincarnated-bastard-of-the-swor',
      'Regressing as the Reincarnated Bastard of the Sword Clan'),
    hit('mgeko', 'different-sword', 'Sword Clan Chronicles'),
  ]).length, 2);
});
