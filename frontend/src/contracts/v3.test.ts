import { expect, it } from 'vitest';
import * as schemas from './v3';
import cases from './v3-cases.json';
for (const [name, payload] of cases.valid) it(`v3 consumes BE valid ${name}`, () => {
 expect(schemas[name as keyof typeof schemas].safeParse(payload).success).toBe(true);
});
for (const [name, payload] of cases.invalid) it(`v3 rejects BE invalid ${name}`, () => {
 expect(schemas[name as keyof typeof schemas].safeParse(payload).success).toBe(false);
});
