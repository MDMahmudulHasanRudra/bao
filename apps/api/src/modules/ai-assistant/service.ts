import { getDb } from '../../db/index.js';
import { aiConversations, aiMessages } from '../../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { retrieveRelevantChunks } from './retrieval.js';
import { generateCompletion } from '../../integrations/ai-provider/adapter.js';

const SYSTEM_PROMPT = `You are an AI assistant for Business AI OS. Answer questions based on the provided company knowledge. Always cite your sources. If you don't have enough information, say so. Never fabricate information or citations. Keep answers concise and actionable.`;

export async function createConversation(organizationId: string, userId: string, title?: string) {
  const db = getDb();
  const [conversation] = await db
    .insert(aiConversations)
    .values({ organizationId, userId, title: title || 'New conversation' })
    .returning();
  return conversation;
}

export async function getConversations(organizationId: string, userId: string) {
  const db = getDb();
  return db
    .select()
    .from(aiConversations)
    .where(
      and(eq(aiConversations.organizationId, organizationId), eq(aiConversations.userId, userId)),
    )
    .orderBy(desc(aiConversations.updatedAt));
}

export async function getConversationMessages(conversationId: string, organizationId: string) {
  const db = getDb();
  return db
    .select()
    .from(aiMessages)
    .where(
      and(
        eq(aiMessages.conversationId, conversationId),
        eq(aiMessages.organizationId, organizationId),
      ),
    )
    .orderBy(aiMessages.createdAt);
}

export async function sendMessage(
  conversationId: string,
  organizationId: string,
  userId: string,
  content: string,
) {
  const db = getDb();

  // Save user message
  const [userMessage] = await db
    .insert(aiMessages)
    .values({
      conversationId,
      organizationId,
      role: 'user',
      content,
    })
    .returning();

  // Retrieve relevant chunks
  const { chunks, totalTokens } = await retrieveRelevantChunks(content, organizationId, userId, 5);

  // Build context from retrieved chunks
  const context = chunks
    .map((c, i) => `[Source ${i + 1}: ${c.sourceTitle}]\n${c.content}`)
    .join('\n\n');

  // Generate completion via org policy → capability default → provider adapter
  const result = await generateCompletion(
    SYSTEM_PROMPT,
    content,
    context || undefined,
    organizationId,
  );

  // Build citations
  const citations = chunks.map((c) => ({
    sourceId: c.sourceId,
    chunkId: c.id,
    title: c.sourceTitle,
    content: c.content.substring(0, 200),
    score: c.score,
  }));

  // Save assistant message
  const [assistantMessage] = await db
    .insert(aiMessages)
    .values({
      conversationId,
      organizationId,
      role: 'assistant',
      content: result.content,
      citations,
      runMetadata: {
        ...result.metadata,
        retrievalTokens: totalTokens,
        chunksUsed: chunks.length,
      },
    })
    .returning();

  // Update conversation title if first message
  const messageCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId));

  if (messageCount[0].count === 2) {
    // First exchange - auto-generate title
    const titlePreview = content.substring(0, 100);
    await db
      .update(aiConversations)
      .set({ title: titlePreview, updatedAt: new Date() })
      .where(eq(aiConversations.id, conversationId));
  } else {
    await db
      .update(aiConversations)
      .set({ updatedAt: new Date() })
      .where(eq(aiConversations.id, conversationId));
  }

  return { userMessage, assistantMessage };
}
