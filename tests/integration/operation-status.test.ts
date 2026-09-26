import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPERATION_STATE_LABEL,
  isInFlight,
  researchOperationState,
  sourceOperationError,
  sourceOperationState,
  type OperationState,
} from '../../apps/web/src/components/operations/OperationCard';

const webSrc = resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/web/src');
const read = (rel: string) => readFileSync(resolve(webSrc, rel), 'utf-8');

// Spec 5: one vocabulary, plain words, and a stated next step for every state.
describe('durable operation status (spec 5)', () => {
  it('exposes the spec vocabulary, never a raw enum', () => {
    expect(Object.keys(OPERATION_STATE_LABEL)).toEqual([
      'draft',
      'queued',
      'running',
      'waiting_for_input',
      'completed',
      'completed_with_warnings',
      'failed',
      'cancelled',
    ]);
    expect(OPERATION_STATE_LABEL.waiting_for_input).toBe('Waiting for input');
    expect(OPERATION_STATE_LABEL.completed_with_warnings).toBe('Completed with warnings');
  });

  it('maps research_jobs statuses onto the shared vocabulary', () => {
    expect(researchOperationState({ status: 'queued' })).toBe('queued');
    expect(researchOperationState({ status: 'discovering' })).toBe('running');
    expect(researchOperationState({ status: 'analyzing' })).toBe('running');
    expect(researchOperationState({ status: 'completed' })).toBe('completed');
    expect(researchOperationState({ status: 'cancelled' })).toBe('cancelled');
    expect(researchOperationState({ status: 'failed' })).toBe('failed');
  });

  it('derives "completed with warnings" from real counters, never from a guess', () => {
    expect(researchOperationState({ status: 'completed', progress: { failed: 0 } })).toBe('completed');
    expect(researchOperationState({ status: 'completed', progress: { failed: 2 } })).toBe(
      'completed_with_warnings',
    );
    expect(researchOperationState({ status: 'completed', stats: { errors: 1 } })).toBe(
      'completed_with_warnings',
    );
  });

  it('maps knowledge_sources statuses and surfaces the stored error only on failure', () => {
    expect(sourceOperationState({ status: 'pending' })).toBe('queued');
    expect(sourceOperationState({ status: 'processing' })).toBe('running');
    expect(sourceOperationState({ status: 'ready' })).toBe('completed');
    expect(sourceOperationState({ status: 'error' })).toBe('failed');

    expect(sourceOperationError({ status: 'error', metadata: { error: 'HTTP 404' } })).toBe('HTTP 404');
    expect(sourceOperationError({ status: 'error' })).toBe('The document could not be read.');
    expect(sourceOperationError({ status: 'ready' })).toBeNull();
  });

  it('keeps polling only while an operation can still change', () => {
    const inFlight: OperationState[] = ['queued', 'running', 'waiting_for_input'];
    for (const state of inFlight) expect(isInFlight(state)).toBe(true);
    for (const state of ['draft', 'completed', 'completed_with_warnings', 'failed', 'cancelled'] as
      OperationState[]) {
      expect(isInFlight(state)).toBe(false);
    }
  });

  it('is the single source of status wording on both operation pages', () => {
    const lead = read('app/(workspace)/lead-intelligence/page.tsx');
    const knowledge = read('app/(workspace)/knowledge/page.tsx');

    // Neither page may render a stored enum or keep a private status table.
    expect(lead).not.toMatch(/JOB_TONE/);
    expect(knowledge).not.toMatch(/STATUS_BADGES/);
    expect(lead).toMatch(/researchOperationState/);
    expect(knowledge).toMatch(/sourceOperationState/);

    // Both state what a human should do next.
    expect(lead).toMatch(/What to do next|nextStepFor/);
    expect(knowledge).toMatch(/What to do next/);

    // Both attribute the durable source.
    expect(lead).toMatch(/Saved to research_jobs/);
    expect(knowledge).toMatch(/knowledge_sources|Saved to/);
  });
});
