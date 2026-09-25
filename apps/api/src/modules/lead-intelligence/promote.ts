import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/index.js';
import {
  activities,
  companies,
  contacts,
  leadCandidates,
  leads,
  leadEvidence,
  webDocuments,
} from '../../db/schema.js';
import { ValidationError } from '../../core/errors/http.js';
import { getTenant } from '../../core/tenancy/context.js';
import { audit } from '../audit/service.js';
import { notify } from '../notifications/service.js';

export interface PromotionResult {
  leadId: string;
  companyId: string | null;
  contactId: string | null;
  alreadyPromoted: boolean;
}

/**
 * Turns a discovered candidate into real CRM records. Writes the existing `companies` /
 * `contacts` / `leads` / `activities` tables rather than a parallel shape, so the lead
 * shows up in the pipeline with no extra wiring.
 *
 * Idempotent, and safe under concurrent promotion: a candidate that already carries a
 * leadId returns that lead instead of creating a duplicate, so a double-click cannot
 * duplicate revenue. That guarantee comes from the row lock, not from the check — see
 * the `FOR UPDATE` below.
 */
export async function promoteCandidate(
  c: Context,
  candidateId: string,
): Promise<PromotionResult> {
  const tenant = getTenant(c);
  const db = getDb();
  const now = new Date();

  const { promoted, companyName, summary } = await db.transaction(async (tx) => {
    // `FOR UPDATE` is the guarantee. An application-level `if (!candidate.leadId)` cannot
    // prevent a duplicate lead, because two concurrent requests can both read `null`
    // before either writes. This row lock makes the second request block until the first
    // commits, then re-read and find `leadId` already set, so it returns that lead.
    //
    // The transaction also makes the writes atomic: a failure part-way through (say the
    // activity insert) rolls the lead back rather than leaving an orphan revenue record
    // with no back-link, which the retry would then duplicate.
    const [candidate] = await tx
      .select()
      .from(leadCandidates)
      .where(
        and(
          eq(leadCandidates.id, candidateId),
          eq(leadCandidates.organizationId, tenant.organizationId),
        ),
      )
      .limit(1)
      .for('update');
    if (!candidate) throw new ValidationError({ candidate: 'Candidate not found' });

    if (candidate.leadId) {
      return {
        promoted: { leadId: candidate.leadId, companyId: candidate.companyId, contactId: null, alreadyPromoted: true },
        companyName: candidate.companyName,
        summary: candidate.summary,
      };
    }
    assertPromotable(candidate);

    const evidence = await tx
      .select({
        claim: leadEvidence.claim,
        sourceUrl: leadEvidence.sourceUrl,
        documentId: leadEvidence.documentId,
      })
      .from(leadEvidence)
      .where(
        and(
          eq(leadEvidence.candidateId, candidate.id),
          eq(leadEvidence.organizationId, tenant.organizationId),
        ),
      )
      .limit(10);

    // Emails come from the crawler's own extraction, never from model-written claim text.
    const docIds = [...new Set(evidence.map((e) => e.documentId).filter((d): d is string => !!d))];
    let contactEmail: string | null = null;
    if (docIds.length > 0) {
      const docs = await tx
        .select({ emails: webDocuments.emails })
        .from(webDocuments)
        .where(
          and(
            eq(webDocuments.organizationId, tenant.organizationId),
            inArray(webDocuments.id, docIds),
          ),
        );
      contactEmail = docs.flatMap((d) => d.emails ?? []).find((e) => /@/.test(e)) ?? null;
    }

    // Reuse the company when the domain is already on file, otherwise this is a new account.
    const domain = candidate.normalizedDomain ?? null;
    if (domain) {
      // Two candidates from different jobs can share a domain, and `companies` has no
      // unique index on it, so both would insert a duplicate account. An advisory lock is
      // transaction-scoped, needs no migration, and is per-tenant so two organisations
      // researching the same domain never wait on each other.
      // ponytail: advisory lock instead of a unique index — swap for a partial unique index
      // on (organization_id, domain) once live data is confirmed free of duplicates.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${tenant.organizationId}:${domain}`}))`,
      );
    }

    let [company] = domain
      ? await tx
          .select()
          .from(companies)
          .where(
            and(
              eq(companies.organizationId, tenant.organizationId),
              eq(companies.domain, domain),
              // Never resurrect a soft-deleted account to hang a new lead on.
              isNull(companies.deletedAt),
            ),
          )
          .limit(1)
      : [];

    if (!company) {
      [company] = await tx
        .insert(companies)
        .values({
          organizationId: tenant.organizationId,
          name: candidate.companyName,
          domain,
          industry: candidate.industry ?? undefined,
          size: sizeBand(candidate.employeeMin, candidate.employeeMax),
          notes: candidate.summary ?? undefined,
          metadata: {
            source: 'lead_intelligence',
            candidateId: candidate.id,
            technologies: candidate.technologies ?? [],
          },
        })
        .returning();
    }

    // A contact needs a name; the crawl only guarantees a company, so promote without one
    // rather than inventing "Unknown"/"Contact" filler rows.
    let contactId: string | null = null;
    if (contactEmail) {
      const [contact] = await tx
        .insert(contacts)
        .values({
          organizationId: tenant.organizationId,
          companyId: company.id,
          firstName: candidate.companyName,
          lastName: '—',
          email: contactEmail,
          metadata: { source: 'lead_intelligence', candidateId: candidate.id },
        })
        .returning();
      contactId = contact.id;
    }

    const [lead] = await tx
      .insert(leads)
      .values({
        organizationId: tenant.organizationId,
        title: candidate.companyName,
        stage: 'new',
        companyId: company.id,
        contactId,
        ownerId: tenant.userId,
        notes: candidate.summary ?? undefined,
        metadata: {
          source: 'lead_intelligence',
          candidateId: candidate.id,
          jobId: candidate.jobId,
          icpScore: candidate.score,
          icpMatch: candidate.icpMatch ?? {},
          scoreReasons: candidate.scoreReasons ?? [],
          evidence: evidence.map((e) => ({ claim: e.claim, sourceUrl: e.sourceUrl })),
        },
      })
      .returning();

    // The reason it was found belongs in the timeline, not only in metadata.
    await tx.insert(activities).values({
      organizationId: tenant.organizationId,
      leadId: lead.id,
      contactId,
      companyId: company.id,
      userId: tenant.userId,
      type: 'note',
      subject: `Promoted from lead intelligence (ICP score ${candidate.score ?? 'n/a'})`,
      body: [
        candidate.summary,
        candidate.scoreReasons?.length ? `Why: ${candidate.scoreReasons.join('; ')}` : null,
        evidence.length ? `Sources: ${evidence.map((e) => e.sourceUrl).join(', ')}` : null,
      ]
        .filter(Boolean)
        .join('\n\n') || null,
    });

    await tx
      .update(leadCandidates)
      .set({ status: 'imported', leadId: lead.id, companyId: company.id, reviewedAt: now, updatedAt: now })
      .where(eq(leadCandidates.id, candidate.id));

    return {
      promoted: { leadId: lead.id, companyId: company.id, contactId, alreadyPromoted: false },
      companyName: candidate.companyName,
      summary: candidate.summary,
    };
  });

  // Deliberately outside the transaction: audit() and notify() each resolve their own
  // connection via getDb() and swallow their own errors, so they cannot join the
  // transaction, and they must not be able to roll back a lead that was really created.
  if (!promoted.alreadyPromoted) {
    await audit(c, 'lead_candidate.promoted', 'lead', promoted.leadId, {
      candidateId,
      companyId: promoted.companyId,
    });
    await notify(c, tenant.userId, 'lead_promoted', `${companyName} promoted to a lead`, {
      body: summary ?? undefined,
      // The CRM is one tabbed page, so there is no per-lead URL to deep-link.
      link: '/sales',
      metadata: { leadId: promoted.leadId, candidateId },
    });
  }

  return promoted;
}

/** Only promote a judged candidate; an unscored one has nothing behind it yet. */
export function assertPromotable(candidate: { score?: number | null; status: string }): void {
  if (candidate.status === 'imported') return;
  if (candidate.score === null || candidate.score === undefined) {
    throw new ValidationError({ candidate: 'This candidate has no score yet — analysis has not run' });
  }
}

export function sizeBand(min?: number | null, max?: number | null): string | undefined {
  if (!min && !max) return undefined;
  const lo = min ?? max!;
  const hi = max ?? min!;
  if (lo <= 10) return '1-10';
  if (lo <= 50) return '11-50';
  if (lo <= 200) return '51-200';
  if (lo <= 500) return '201-500';
  if (lo <= 1000) return '501-1000';
  return `1000+ (${lo}-${hi})`;
}
