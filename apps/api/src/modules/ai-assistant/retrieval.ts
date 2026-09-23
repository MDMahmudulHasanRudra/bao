import { getDb } from '../../db/index.js';
import { knowledgeChunks, knowledgeSources, memberships } from '../../db/schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import { generateEmbedding } from '../../integrations/ai-provider/adapter.js';

interface RetrievalResult {
  chunks: Array<{
    id: string;
    content: string;
    sourceId: string;
    sourceTitle: string;
    score: number;
  }>;
  totalTokens: number;
}

export async function retrieveRelevantChunks(
  query: string,
  organizationId: string,
  userId: string,
  limit: number = 10,
): Promise<RetrievalResult> {
  const db = getDb();

  // Verify user has access to this organization
  const [membership] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)))
    .limit(1);

  if (!membership) {
    return { chunks: [], totalTokens: 0 };
  }

  // Generate query embedding
  let queryEmbedding: number[] = [];
  try {
    const result = await generateEmbedding(query);
    queryEmbedding = result.embedding;
  } catch {
    // Fallback to text search if embedding fails
  }

  // Hybrid retrieval: combine vector similarity and full-text search
  let results: Array<{
    id: string;
    content: string;
    sourceId: string;
    sourceTitle: string;
    score: number;
  }> = [];

  if (queryEmbedding.length > 0) {
    // Vector similarity search using pgvector
    const vectorResults = await db.execute(sql`
      SELECT
        kc.id,
        kc.content,
        kc.source_id as "sourceId",
        ks.title as "sourceTitle",
        1 - (kc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as score
      FROM knowledge_chunks kc
      INNER JOIN knowledge_sources ks ON kc.source_id = ks.id
      WHERE kc.organization_id = ${organizationId}
        AND ks.status = 'ready'
        AND ks.deleted_at IS NULL
      ORDER BY kc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${limit}
    `);

    results = vectorResults as unknown as typeof results;
  }

  // If vector search returned few results, supplement with text search
  if (results.length < limit) {
    const textResults = await db
      .select({
        id: knowledgeChunks.id,
        content: knowledgeChunks.content,
        sourceId: knowledgeChunks.sourceId,
        sourceTitle: knowledgeSources.title,
        score: sql<number>`1 - (${knowledgeChunks.content} <% ${query})`,
      })
      .from(knowledgeChunks)
      .innerJoin(knowledgeSources, eq(knowledgeChunks.sourceId, knowledgeSources.id))
      .where(
        and(
          eq(knowledgeChunks.organizationId, organizationId),
          eq(knowledgeSources.status, 'ready'),
        ),
      )
      .orderBy(desc(sql`1 - (${knowledgeChunks.content} <% ${query})`))
      .limit(limit);

    // Merge and deduplicate
    const existingIds = new Set(results.map((r) => r.id));
    for (const tr of textResults) {
      if (!existingIds.has(tr.id)) {
        results.push(tr);
      }
    }
  }

  // Sort by score and limit
  results.sort((a, b) => b.score - a.score);
  results = results.slice(0, limit);

  const totalTokens = results.reduce(
    (acc, r) => acc + Math.ceil(r.content.split(/\s+/).length * 1.3),
    0,
  );

  return { chunks: results, totalTokens };
}
