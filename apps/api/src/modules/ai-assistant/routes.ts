import { Hono } from 'hono';
import { getTenant } from '../../core/tenancy/context.js';
import {
  createConversation,
  getConversations,
  getConversationMessages,
  sendMessage,
} from './service.js';
import { NotFoundError } from '../../core/errors/http.js';
import { getDb } from '../../db/index.js';
import { aiConversations } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';

const aiAssistant = new Hono();

aiAssistant.get('/conversations', async (c) => {
  const tenant = getTenant(c);
  const conversations = await getConversations(tenant.organizationId, tenant.userId);
  return c.json({ conversations });
});

aiAssistant.post('/conversations', async (c) => {
  const tenant = getTenant(c);
  const body = await c.req.json<{ title?: string }>();
  const conversation = await createConversation(tenant.organizationId, tenant.userId, body.title);
  return c.json({ conversation }, 201);
});

aiAssistant.get('/conversations/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const conversationId = c.req.param('id');

  const [conversation] = await db
    .select()
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.id, conversationId),
        eq(aiConversations.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);

  if (!conversation) throw new NotFoundError('Conversation', conversationId);

  const messages = await getConversationMessages(conversationId, tenant.organizationId);

  return c.json({ conversation, messages });
});

aiAssistant.post('/conversations/:id/messages', async (c) => {
  const tenant = getTenant(c);
  const conversationId = c.req.param('id');
  const body = await c.req.json<{ content: string }>();

  const db = getDb();
  const [conversation] = await db
    .select()
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.id, conversationId),
        eq(aiConversations.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);

  if (!conversation) throw new NotFoundError('Conversation', conversationId);

  const { userMessage, assistantMessage } = await sendMessage(
    conversationId,
    tenant.organizationId,
    tenant.userId,
    body.content,
  );

  return c.json({ userMessage, assistantMessage });
});

export default aiAssistant;
