// Hand-maintained extension of the generated base class for 'articles'.
// The generator will NOT overwrite this file.
// Add domain-specific methods, computed properties, and custom queries here.

import type { PoolClient } from 'pg';
import './content-types-row.js';
import './form-factors-row.js';
import { _ArticlesRowBase } from '../generated/_articles-row-base.js';
import './media-row.js';
import './people-row.js';
import './permalinks-row.js';
import { getConnection, QueryOptions, queryWithConnection, returnConnection } from '../query.js';
import './tags-row.js';

export class ArticlesRow extends _ArticlesRowBase {
  static async loadArticlesByIds(
    ids: number[],
    connection?: PoolClient,
  ): Promise<ArticlesRow[]> {
    if (ids.length === 0) {
      return [];
    }

    const uniqueIds = [...new Set(ids)];
    const conn: QueryOptions = {
      connection: connection ?? await getConnection(),
      allowHardcoded: true
    };
    const ownConn = !connection;

    try {
      const placeholders = uniqueIds.map((_, i) => `$${i + 1}`).join(', ');
      const sql = `SELECT * FROM articles WHERE id IN (${placeholders}) ORDER BY id`;
      const result = await queryWithConnection(conn, sql, uniqueIds);
      return result.rows.map(row => new this(row as Record<string, unknown>, true));
    } finally {
      if (ownConn) returnConnection(conn.connection);
    }
  }

  static async loadArticles(
    connection?: PoolClient,
  ): Promise<ArticlesRow[]> {
    const conn = connection ?? await getConnection();
    const ownConn = !connection;

    try {
      const sql = `SELECT id, last_update, title FROM articles ORDER BY last_update DESC`;
      const queryResult = await queryWithConnection(
        {connection: conn, allowHardcoded: true}, sql
      );
      const result =
        queryResult.rows.map(row => {
          return new this(row as Record<string, unknown>, true);
        });
      return result;
    } finally {
      if (ownConn) returnConnection(conn);
    }
  }
}
