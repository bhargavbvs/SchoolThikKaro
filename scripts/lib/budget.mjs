import { statSync } from 'node:fs';

export function assertBudget(path, maxBytes) {
  const size = statSync(path).size;
  if (size > maxBytes) {
    throw new Error(`${path} is ${size} bytes, over budget of ${maxBytes}`);
  }
  return size;
}

export function stateCode(name) {
  return String(name).toUpperCase().replace(/&/g, ' ')
    .replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
}
