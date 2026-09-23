import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import { knowledgeChunks, knowledgeSources } from '../../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { getTenant } from '../../core/tenancy/context.js';

const search = new Hono();

search.post('/', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json<{ query: string; limit?: number; sourceIds?: string[] }>();

  const limit = body.limit || 10;

  // Build conditions
  const conditions = [eq(knowledgeChunks.organizationId, tenant.organizationId)];

  if (body.sourceIds && body.sourceIds.length > 0) {
    conditions.push(
      sql`${knowledgeChunks.sourceId} IN (${sql.join(
        body.sourceIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
  }

  // Hybrid search: combine full-text and vector similarity
  // For now, use trigram similarity as a fallback until embeddings are set up
  const results = await db
    .select({
      id: knowledgeChunks.id,
      content: knowledgeChunks.content,
      chunkIndex: knowledgeChunks.chunkIndex,
      sourceId: knowledgeChunks.sourceId,
      sourceTitle: knowledgeSources.title,
      score: sql<number>`1 - (${knowledgeChunks.content} <% ${body.query})`,
    })
    .from(knowledgeChunks)
    .innerJoin(knowledgeSources, eq(knowledgeChunks.sourceId, knowledgeSources.id))
    .where(and(...conditions, eq(knowledgeSources.status, 'ready')))
    .orderBy(desc(sql`1 - (${knowledgeChunks.content} <% ${body.query})`))
    .limit(limit);

  return c.json({ results, query: body.query });
});

export default search;
