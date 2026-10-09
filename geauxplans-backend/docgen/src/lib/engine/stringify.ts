/**
 * Layer 2 Engine — shared value→string coercion
 *
 * Centralized helper that converts ANY engine value into displayable text.
 * Critical for avoiding "[object Object]" leaks in generated DOCX output:
 * never call `String(v)` directly on engine values — always use `toText(v)`.
 *
 * Resolution order for objects:
 *   1. Selection-style:  { Name: "X" }           → "X"
 *   2. Party-style:      { NameCO: "...", ... }  → NameCO
 *   3. Party fallback:   { First, Last, ... }    → "First Last" composed
 *   4. EntityName:       { EntityName: "Acme" }  → "Acme"
 *   5. Anything else                              → '' (NOT "[object Object]")
 *
 * Arrays are joined with ", " after coercing each element via toText.
 */

export function toText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(toText).join(', ');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    // Pre-computed display string (most common: NameCO populated by upstream
    // template rendering, or Name on selection objects).
    if (typeof o.NameCO === 'string' && o.NameCO.length > 0) return o.NameCO;
    if (typeof o.Name === 'string' && o.Name.length > 0) return o.Name;
    // Party fallback: compose from First/Middle/Last if present.
    const first = typeof o.First === 'string' ? o.First.trim() : '';
    const middle = typeof o.Middle === 'string' ? o.Middle.trim() : '';
    const last = typeof o.Last === 'string' ? o.Last.trim() : '';
    const suffix = typeof o.Suffix === 'string' ? o.Suffix.trim() : '';
    if (first || last) {
      const parts = [first, middle, last].filter((p) => p.length > 0);
      const composed = parts.join(' ');
      return suffix ? `${composed} ${suffix}` : composed;
    }
    // Entity fallback
    if (typeof o.EntityName === 'string' && o.EntityName.length > 0) return o.EntityName;
    if (typeof o.FullName === 'string' && o.FullName.length > 0) return o.FullName;
    // Unknown object shape — emit nothing rather than "[object Object]".
    return '';
  }
  // Functions, symbols, etc. — never useful as text.
  return '';
}
