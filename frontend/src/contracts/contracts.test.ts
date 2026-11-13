import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { z } from 'zod';
import * as common from './common';
import * as pub from './public';

// RP-CONTRACT-FE-01: typed fixture parsing against contracts/v2 examples + invalid cases.

const registry: Record<string, z.ZodTypeAny> = {
  ...common,
  ...pub,
};

interface ExampleRecord {
  schema_uri: string;
  definition: string;
  payload: unknown;
}

interface InvalidRecord {
  case_id: string;
  schema_uri: string;
  definition: string;
  payload: unknown;
  expected_error_keyword: string;
}

const contractsDir = resolve(__dirname, '../../../contracts/v2');

function loadExamples(name: string): ExampleRecord[] {
  return JSON.parse(readFileSync(resolve(contractsDir, `examples/${name}.json`), 'utf-8'));
}

const commonExamples = loadExamples('common');
const publicExamples = loadExamples('public');
const invalidCases: InvalidRecord[] = JSON.parse(
  readFileSync(resolve(contractsDir, 'invalid/backend.json'), 'utf-8'),
);

describe('positive fixtures parse with typed bindings', () => {
  it.each(commonExamples.map((r) => [r.definition, r] as const))(
    'common/%s',
    (_name, record) => {
      const schema = registry[record.definition];
      expect(schema, `no zod binding for ${record.definition}`).toBeDefined();
      const result = schema.safeParse(record.payload);
      expect(
        result.success,
        result.success ? '' : JSON.stringify(result.error.issues, null, 2),
      ).toBe(true);
    },
  );

  it.each(publicExamples.map((r) => [r.definition, r] as const))(
    'public/%s',
    (_name, record) => {
      const schema = registry[record.definition];
      expect(schema, `no zod binding for ${record.definition}`).toBeDefined();
      const result = schema.safeParse(record.payload);
      expect(
        result.success,
        result.success ? '' : JSON.stringify(result.error.issues, null, 2),
      ).toBe(true);
    },
  );
});

describe('invalid fixtures are rejected by typed bindings', () => {
  const feRelevant = invalidCases.filter((r) =>
    ['common.schema.json', 'public.schema.json'].some((s) => r.schema_uri.endsWith(s)),
  );

  it.each(feRelevant.map((r) => [r.case_id, r] as const))('%s', (_id, record) => {
    const schema = registry[record.definition];
    expect(schema, `no zod binding for ${record.definition}`).toBeDefined();
    const result = schema.safeParse(record.payload);
    expect(result.success, `case ${record.case_id} unexpectedly passed`).toBe(false);
  });

  it('covers every invalid case targeting common/public schemas', () => {
    const targeted = invalidCases.filter((r) =>
      ['common.schema.json', 'public.schema.json'].some((s) => r.schema_uri.endsWith(s)),
    );
    expect(feRelevant.length).toBe(targeted.length);
    expect(feRelevant.length).toBeGreaterThan(0);
  });
});
