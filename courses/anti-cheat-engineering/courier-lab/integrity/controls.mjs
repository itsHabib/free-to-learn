// Author-only calibration controls. These are never copied into a learner workspace.
import { checkPackage } from './policy.mjs';

/** An independently structured correct solution: validate, sort, then zip. */
export function sortedPolicy(input) {
  const hasKeys = (value, names) => value !== null && typeof value === 'object'
    && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...names].sort().join('|');
  const validPath = (value) => typeof value === 'string' && value.length > 0 && value.length <= 512
    && !value.startsWith('/') && !/[\\:\x00-\x1f\x7f]/.test(value)
    && value.split('/').every((part) => /^[A-Za-z0-9._-]+$/.test(part) && !['.', '..'].includes(part));
  const inventory = (items) => {
    if (!Array.isArray(items) || items.length === 0) return null;
    const sorted = [...items].sort((a, b) => String(a?.path) < String(b?.path) ? -1 : Number(String(a?.path) > String(b?.path)));
    const good = sorted.every((item, index) => hasKeys(item, ['path', 'sha256']) && validPath(item.path)
      && typeof item.sha256 === 'string' && /^[\da-f]{64}$/i.test(item.sha256)
      && (index === 0 || sorted[index - 1].path !== item.path));
    const unique = good && new Set(sorted.map(item => item.path.toLowerCase())).size === sorted.length;
    return unique ? sorted : null;
  };
  const refused = (reason) => ({ ok: false, reason });
  if (!hasKeys(input, ['manifest', 'observed', 'supported'])) return refused('schema');
  const { manifest, observed, supported } = input;
  if (!hasKeys(manifest, ['schema', 'packageId', 'release', 'files'])) return refused('schema');
  if (manifest.schema !== 1 || manifest.packageId !== 'courier-runtime') return refused('schema');
  if (typeof manifest.release !== 'string' || !manifest.release.trim()) return refused('schema');
  const expected = inventory(manifest.files);
  if (!expected || !Array.isArray(supported)) return refused('schema');
  if (supported.some((release) => typeof release !== 'string' || !release.trim())) return refused('schema');
  if (supported.indexOf(manifest.release) < 0) return refused('unsupported-release');
  const actual = inventory(observed);
  if (!actual || actual.length !== expected.length) return refused('inventory');
  if (actual.some((item, index) => item.path !== expected[index].path)) return refused('inventory');
  if (actual.some((item, index) => item.sha256.toUpperCase() !== expected[index].sha256.toUpperCase())) return refused('digest');
  return { ok: true, reason: 'verified' };
}

function patched(input, change) {
  const copy = structuredClone(input);
  change(copy);
  return checkPackage(copy);
}

export const correctPolicies = Object.freeze([
  { name: 'map-policy', checkPackage },
  { name: 'sorted-policy', checkPackage: sortedPolicy },
]);

export const wrongPolicies = Object.freeze([
  { name: 'always-verified', checkPackage: () => ({ ok: true, reason: 'verified' }) },
  { name: 'always-refused', checkPackage: () => ({ ok: false, reason: 'schema' }) },
  { name: 'release-only', checkPackage: ({ manifest, supported }) => supported.includes(manifest?.release)
    ? { ok: true, reason: 'verified' } : { ok: false, reason: 'unsupported-release' } },
  { name: 'trust-observed-digests', checkPackage: (input) => patched(input, (copy) => {
    copy.manifest.files = copy.manifest.files?.map((file) => ({ ...file,
      sha256: copy.observed?.find((actual) => actual.path === file.path)?.sha256 ?? file.sha256 }));
  }) },
  { name: 'ignore-missing-files', checkPackage: (input) => patched(input, (copy) => {
    copy.observed = [...(copy.observed ?? []), ...(copy.manifest.files ?? [])
      .filter((file) => !copy.observed?.some((actual) => actual.path === file.path))];
  }) },
  { name: 'ignore-extra-files', checkPackage: (input) => patched(input, (copy) => {
    copy.observed = copy.observed?.filter((file) => copy.manifest.files?.some((expected) => file.path === expected.path));
  }) },
  { name: 'ignore-release-support', checkPackage: (input) => patched(input, (copy) => {
    copy.supported = [...(copy.supported ?? []), copy.manifest?.release];
  }) },
  { name: 'version-one-only', checkPackage: (input) => input.manifest?.release === 'courier-runtime-2'
    ? { ok: false, reason: 'unsupported-release' } : checkPackage(input) },
  { name: 'erase-manifest-duplicates', checkPackage: (input) => patched(input, (copy) => {
    if (Array.isArray(copy.manifest.files)) copy.manifest.files = [...new Map(copy.manifest.files.map((file) => [file.path, file])).values()];
  }) },
  { name: 'sort-input-in-place', checkPackage: (input) => {
    if (Array.isArray(input.observed)) input.observed.sort((a, b) => String(a?.path).localeCompare(String(b?.path)));
    return checkPackage(input);
  } },
]);
