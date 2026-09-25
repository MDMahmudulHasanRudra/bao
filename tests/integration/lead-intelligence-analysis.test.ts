import { describe, it, expect } from 'vitest';
import {
  parseJsonLoose,
  pruneUnquotableSignals,
  suggestedStatus,
  type CompanyAnalysis,
} from '../../apps/api/src/modules/lead-intelligence/analysis.js';

const base: CompanyAnalysis = {
  icpMatch: { industry: 'match' },
  score: 50,
  scoreReasons: [],
  summary: '',
  signals: [],
};

describe('parseJsonLoose', () => {
  it('parses bare JSON', () => {
    expect(parseJsonLoose('{"score": 80}')).toEqual({ score: 80 });
  });

  it('parses a fenced block', () => {
    expect(parseJsonLoose('```json\n{"score": 12}\n```')).toEqual({ score: 12 });
  });

  it('tolerates prose around the object', () => {
    expect(parseJsonLoose('Here you go:\n{"score": 3}\nHope that helps!')).toEqual({ score: 3 });
  });

  it('throws on output with no JSON', () => {
    expect(() => parseJsonLoose('I could not determine this.')).toThrow(/no JSON/);
  });
});

describe('pruneUnquotableSignals', () => {
  const text = 'Acme is hiring twelve backend engineers in Berlin this quarter.';

  it('keeps a signal whose quote appears verbatim', () => {
    const result = pruneUnquotableSignals(
      {
        ...base,
        signals: [
          {
            type: 'hiring',
            title: 'Hiring backend engineers',
            evidenceQuote: 'hiring twelve backend engineers',
          },
        ],
      },
      text,
    );
    expect(result.signals).toHaveLength(1);
  });

  it('drops a signal whose quote is not in the source', () => {
    const result = pruneUnquotableSignals(
      {
        ...base,
        signals: [
          {
            type: 'funding',
            title: 'Raised a Series B',
            evidenceQuote: 'raised a $40M Series B led by Accel',
          },
        ],
      },
      text,
    );
    expect(result.signals).toHaveLength(0);
  });

  it('drops a signal with no quote at all', () => {
    const result = pruneUnquotableSignals(
      { ...base, signals: [{ type: 'expansion', title: 'Expanding into EMEA' }] },
      text,
    );
    expect(result.signals).toHaveLength(0);
  });

  it('matches across collapsed whitespace', () => {
    const result = pruneUnquotableSignals(
      {
        ...base,
        signals: [
          {
            type: 'hiring',
            title: 'Hiring',
            evidenceQuote: 'hiring   twelve\n   backend engineers',
          },
        ],
      },
      text,
    );
    expect(result.signals).toHaveLength(1);
  });
});

describe('suggestedStatus', () => {
  it.each([
    [70, 'qualified'],
    [100, 'qualified'],
    [69, 'review_required'],
    [40, 'review_required'],
    [39, 'discovered'],
    [0, 'discovered'],
  ])('maps score %i to %s', (score, expected) => {
    expect(suggestedStatus({ ...base, score: score as number })).toBe(expected);
  });
});
