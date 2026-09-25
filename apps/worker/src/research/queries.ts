import type { DiscoverySpecification } from '@bao/contracts';

const MAX_QUERIES = 8;

/** Section 11: several focused queries instead of one giant query, and no query explosion. */
export function generateQueries(
  spec: DiscoverySpecification,
  maxQueries: number = MAX_QUERIES,
): string[] {
  const industries = spec.industries?.length ? spec.industries : [''];
  const geographies = spec.geography?.length ? spec.geography : [''];
  const industry = industries[0];
  const geo = geographies[0];

  const queries: string[] = [];
  const push = (q: string) => {
    const t = q.replace(/\s+/g, ' ').trim();
    if (t && !queries.includes(t)) queries.push(t);
  };

  push([industry, geo, 'companies'].filter(Boolean).join(' '));
  push([industry, geo, 'company website'].filter(Boolean).join(' '));

  const size = spec.companySize;
  if (size?.min || size?.max) {
    const range =
      size.min && size.max ? `${size.min}-${size.max} employees` : size.min ? `${size.min}+ employees` : `up to ${size.max} employees`;
    push([industry, geo, range].filter(Boolean).join(' '));
  }

  for (const tech of spec.technologies?.slice(0, 2) ?? []) {
    push([`${tech} companies`, geo].filter(Boolean).join(' '));
  }
  if (spec.businessModels?.length) {
    push([spec.businessModels[0], industry, geo].filter(Boolean).join(' '));
  }
  if (spec.targetService) {
    push([geo, `companies that need ${spec.targetService}`].filter(Boolean).join(' '));
  }
  for (const signal of spec.targetSignals?.slice(0, 2) ?? []) {
    push([industry, geo, signal].filter(Boolean).join(' '));
  }
  for (const keyword of spec.keywords?.slice(0, 2) ?? []) {
    push([keyword, industry].filter(Boolean).join(' '));
  }

  return queries.slice(0, Math.max(1, maxQueries));
}
