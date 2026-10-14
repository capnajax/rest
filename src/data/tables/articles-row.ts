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
import { pick } from '../../util/tools.js';
import { TagsRow } from './tags-row.js';
import { RelationshipArray } from '../orm/relationship-array.js';

export class ArticlesRow extends _ArticlesRowBase {

  static async loadArticlesByIds(
    ids: (number|string)[],
    connection?: PoolClient,
    cb?: (article:ArticlesRow) => void
  ): Promise<void>;
  static async loadArticlesByIds(
    ids: (number|string)[],
    connection?: PoolClient
  ): Promise<ArticlesRow[]>;
  static async loadArticlesByIds(
    ids: (number|string)[],
    connection?: PoolClient,
    cb?: (article:ArticlesRow) => void
  ): Promise<ArticlesRow[]|void> {

    // avoid a query if the list is empty
    if (ids.length === 0) {
      return [];
    }

    // convert all strings to numbers and filter out duplicates
    const uniqueIds:number[] = [...new Set(ids.map(id => {
      const result = typeof id === 'string' ?  Number.parseInt(id) : id;
      if (Number.isNaN(result)) {
        throw `invalid id "${id}"`;
      }
      return result;
    }))];

    const conn: QueryOptions = {
      connection: connection ?? await getConnection(),
      allowHardcoded: true
    };
    const ownConn = !connection;

    try {
      const queryResult = await queryWithConnection(
        conn, 'article.getSummariesByIds', [uniqueIds]
      );

      const tags:Record<number, TagsRow> = {};

      const forEachRow = (row:any) => {
        const useTags:TagsRow[] = [];
        for (const tag of row.tags as {id: number, title: string,
          color?: string|null, important: boolean, seq?: number|null}[]) {
          if (Object.hasOwn(tags, tag.id)) {
            useTags.push(tags[tag.id])
          } else {
            const tagRow = new TagsRow(tag);
            tags[tag.id] = tagRow;
            useTags.push(tagRow);
          }
        }
        const article = new ArticlesRow(
          { ...pick(row, ArticlesRow.columnSets.simple), tags: useTags }
        );
        article._relationships.set('tags', new RelationshipArray(useTags));
        
        cb && cb(article);
        return article;
      };

      if (cb) {
        queryResult.rows.forEach(forEachRow);
        return;
      } else {
        return queryResult.rows.map(forEachRow); 
      }
  
    } finally {
      if (ownConn) returnConnection(conn.connection);
    }
  }

  static async loadArticles(
    connection?: PoolClient,
    filters: {
      // three states: `true` for "include only this",
      // `false` for "exclude this", and `undefined` for do not consider this
      is_hidden?: boolean,
      // true for "only featured", false for "exclude featured", undefined
      // for not filtering on featured at all
      is_featured?: boolean,
      tagIds?: number[],
      // no filtering if not included, inclusive if any form factors are
      // included
      types?: ('article'|'cheat'|'link'|'rocket')[]
    } = {}
  ): Promise<ArticlesRow[]> {
    const conn = connection ?? await getConnection();
    const ownConn = !connection;

    try {
      const sqlSelect =
        `SELECT articles.id AS id, last_update, title, ` +
          `ct.name AS ct, f.name AS ff ` +
        `FROM articles ` +
        `JOIN content_types AS ct ON ct.id = articles.content_type_id ` +
        `JOIN form_factors AS f ON f.id = ct.form_factor_id `
      const sqlWheres:string[] = [];
      const sqlOrder = `ORDER BY last_update DESC;`;
      const queryParams:unknown[] = [];

      const where3State = (property: string, def?:boolean):void => {
        let fv = (filters as Record<string, boolean|undefined>)[property];
        if (fv === undefined) { fv = def; }
        if (fv !== undefined) {
          sqlWheres.push(`${property} = $${queryParams.length+1}::BOOLEAN`);
          queryParams.push(fv);
        }
      }
      where3State('is_featured');
      where3State('is_hidden', false);
      if (filters.tagIds) {
        sqlWheres.push('articles.id IN (SELECT article_id FROM article_tag ' +
          `WHERE tag_id = ANY($${queryParams.length+1}::int[]))`)
        queryParams.push(filters.types);
      }
      if (filters.types) {
        sqlWheres.push(`ct.name = ANY(${queryParams.length+1}::int[]`);
        queryParams.push(filters.types);
      }
      // TODO add filtering on tags

      const sqlWhere = sqlWheres.length
          ? 'WHERE ' + sqlWheres.join(' AND ') + ' '
          : '';

      const sql = sqlSelect + sqlWhere + sqlOrder;
      console.log(sql);
      const queryResult = await queryWithConnection(
        {connection: conn, allowHardcoded: true}, sql, queryParams
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
