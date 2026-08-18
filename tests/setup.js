import { readFile } from 'node:fs/promises';
globalThis.fetch = async (url) => {
  const p = new URL(`../public${String(url)}`, import.meta.url);
  const body = await readFile(p, 'utf8');
  return { ok: true, json: async () => JSON.parse(body) };
};
