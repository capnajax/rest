import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PermalinksRow } from '../../src/data/tables/permalinks-row.js';
import type { RelationshipDef } from '../../src/data/orm/types.js';

class PermalinkWithArticle extends PermalinksRow {
  static override readonly relationshipDefs: RelationshipDef[] = [
    { name: 'article', kind: 'single', foreignKey: 'article_id', targetTable: 'articles', isReference: false, loadWith: 'simple' },
  ];

  protected override _getSingleRelationship(): never {
    throw new Error('Serialization must not traverse the article relationship');
  }
}

test('permalink JSON retains article_id without traversing an article back-reference', () => {
  const permalink = new PermalinkWithArticle({ id: 27, name: 'hello', article_id: 10 }, true);
  const article = { id: 10, primary_permalink: permalink };
  Object.assign(permalink, { article });
  const expected = { id: 27, name: 'hello', article_id: 10 };
  assert.deepEqual(permalink.toJSON(), expected);
  assert.deepEqual(JSON.parse(JSON.stringify(article)), { id: 10, primary_permalink: expected });
});

test('permalink JSON omits unloaded columns', () => {
  const permalink = new PermalinksRow({ id: 27, name: 'hello' }, true);
  assert.deepEqual(permalink.toJSON(), { id: 27, name: 'hello' });
});
