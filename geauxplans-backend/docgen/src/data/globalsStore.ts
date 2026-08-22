// Workspace-level GLOBAL records (e.g. Firm Info). Real Knackly stores these
// once per workspace and shares them across every record.
//
// In geauxplans-v2 (browser SPA) user edits are persisted to localStorage. On
// the server there is no per-user storage and no editor UI, so the backing
// store is a process-level override map: the built-in defaults below are the
// firm's real values, and a caller may override them per-process if needed.

import firmInfoGlobal from './firmInfoGlobal';

export type GlobalsMap = Record<string, Record<string, unknown>>;

/** Built-in workspace defaults used when the user has not edited a global. */
const DEFAULTS: GlobalsMap = {
  firmInfo: firmInfoGlobal as Record<string, unknown>,
};

/** Process-level overrides (replaces the browser's localStorage backing). */
let overrides: GlobalsMap = {};

/** Read the full overrides map (may be empty). */
export function loadGlobals(): GlobalsMap {
  return overrides;
}

/** Resolve a single global by name: persisted edit wins, else built-in default. */
export function getGlobal(name: string): Record<string, unknown> {
  const stored = loadGlobals()[name];
  if (stored && Object.keys(stored).length > 0) return stored;
  return DEFAULTS[name] ? { ...DEFAULTS[name] } : {};
}

/** #51 — augment interview/editor data with every workspace global (built-in
 *  defaults + persisted edits) not already present, so OPTION resolvers see
 *  the same data document generation injects (local-generator adds
 *  `firmInfo: getGlobal('firmInfo')`). Needed for pool formulas that read a
 *  global, e.g. `AttorneyList = firmInfo.AttorneysAndStaff|filter:
 *  IsAttorneyTF`. Caller data always wins; input object is not mutated. */
export function withGlobals(data: Record<string, unknown>): Record<string, unknown> {
  const names = new Set([...Object.keys(DEFAULTS), ...Object.keys(loadGlobals())]);
  let out = data;
  for (const name of Array.from(names)) {
    if (out[name] !== undefined) continue;
    const g = getGlobal(name);
    if (Object.keys(g).length === 0) continue;
    if (out === data) out = { ...data };
    out[name] = g;
  }
  return out;
}

/** #51 — resolve a DOTTED userData option source (e.g. the individual model's
 *  SelectNotary source "firmInfo.AttorneysAndStaff") against interview data,
 *  falling back to the workspace global store for the ROOT segment. Returns
 *  undefined when any segment is missing. */
export function resolveGlobalPath(data: Record<string, unknown>, path: string): unknown {
  const segs = path.split('.').map((s) => s.trim()).filter(Boolean);
  if (segs.length === 0) return undefined;
  let cur: unknown = data[segs[0]];
  if (cur === undefined) {
    const g = getGlobal(segs[0]);
    if (Object.keys(g).length > 0) cur = g;
  }
  for (let i = 1; i < segs.length; i++) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[segs[i]];
  }
  return cur;
}

/** Merge a single global into the process overrides and return the new map. */
export function saveGlobal(name: string, value: Record<string, unknown>): GlobalsMap {
  overrides = { ...overrides, [name]: value };
  return overrides;
}
