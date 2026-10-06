// Every t('some.key') used in the code must exist in both languages.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(root, 'src/i18n', `${name}.json`), 'utf8'));

function keys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const used = new Set();
for (const dir of ['app', 'src']) {
  for (const file of sourceFiles(join(root, dir))) {
    const text = readFileSync(file, 'utf8');
    // t('a.b'), and key strings such as 'settings.level1' or { 401: 'auth.wrongCredentials' }
    for (const m of text.matchAll(/['"`]((?:app|common|home|language|auth|settings|create|story|library|record|clone|errors)\.[A-Za-z0-9]+)['"`]/g)) {
      used.add(m[1]);
    }
  }
}

test('every key used in the code exists in English and Hebrew', () => {
  const en = new Set(keys(load('en')));
  const he = new Set(keys(load('he')));
  assert.ok(used.size > 20, 'the scan should find the keys');
  for (const key of used) {
    assert.ok(en.has(key), `missing in en.json: ${key}`);
    assert.ok(he.has(key), `missing in he.json: ${key}`);
  }
});

test('no key in the translation files is unused', () => {
  const unused = keys(load('en')).filter((k) => !used.has(k) && !k.startsWith('errors.'));
  assert.deepEqual(unused, []);
});
