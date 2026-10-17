import { chunkText } from './chunking.js';
it('keeps Unicode policy chunks bounded without splitting surrogate pairs', () => {
  const chunks = chunkText('Policy ' + '🧩'.repeat(5000));
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.every((c) => c.content.length <= 3200)).toBe(true);
  expect(
    chunks.every(
      (c) =>
        !/[\uD800-\uDBFF]$/.test(c.content) &&
        !/^\p{Surrogate}/u.test(c.content),
    ),
  ).toBe(true);
});
