# doc-tools v200 — 3-Layer Architecture

**Status**: DESIGN (Phase 2). No code yet. Approved by user 2026-04-27.
**Replaces**: `app/api/poa/generate/route.ts` v141 → v175.6 (5,523 lines of accreted patches).
**Goal**: One generation engine that produces correct DOCX from **any** template that
follows a documented Knackly grammar, at the scale of thousands of templates, without
per-paragraph patches.

---

## 1. Why a Rewrite (Not Another Patch)

### 1.1 The single invariant the v175.x stack violates

> **Invariant R**: every `<w:r>` keeps its own `<w:rPr>`. Text moved between runs takes
> the destination run's rPr, never the source's.

The v175.x stack violates Invariant R in two places:

1. **PASS 4 `redistributeIntoFirstWt`** — hoists concatenated paragraph text into the
   first `<w:t>` element. Result: body text inherits heading rPr.
2. **Token assembly** — when a Knackly token like `{[Agent.NameCO]}` is split across
   runs `<w:r>{[</w:r><w:r>Agent.NameCO</w:r><w:r>]}</w:r>`, the engine concatenates
   text and discards the per-run rPr.

Every `vNNN` patch addresses a *symptom* of one of these two violations on one specific
paragraph shape. There are infinite paragraph shapes. We will never finish.

### 1.2 Mathematical argument against continued iteration

Let `T` = number of templates (target: ~10⁴). Let `P` = average paragraph count per
template (~10²). Let `S` = number of structurally distinct paragraph shapes per
template (~10). Total distinct shapes ≈ `T · S` = 10⁵.

The v175.x stack has fixed ~5 shapes after 35 versions. That's 10⁵ / 5 ≈ 20,000 more
versions to ship. Untenable.

A run-aware engine fixes shapes by **class**, not by **instance**. There are ~10
classes (heading-merge, list-with-conditional, nested-table, split-token, etc.). 10
class fixes vs 20,000 instance fixes. That is the rewrite case.

---

## 2. Design Constraints

### 2.1 Must preserve (regression canaries)

| # | Constraint | Source |
|---|-----------|--------|
| 1 | Recursive Tables (nested `<w:tbl>`) | v110 |
| 2 | Teal/green Knackly highlighting | v152 |
| 3 | Variable syntax inside Knackly blocks | v154 |
| 4 | Paragraph-level pPr/rPr inheritance | v160 |
| 5 | Self Dealing heading + body | v169 + v170 |
| 6 | Tempered-greedy heading regex behavior | v173 |
| 7 | Elseif word-boundary preservation | v174 + v175.1 |
| 8 | Curator heading + body separation | v175 |
| 9 | Retirement Plans body format clean | v175.5 + v175.6 |

### 2.2 Must implement (currently broken or missing)

| # | Feature | Status today |
|---|---------|--------------|
| 1 | `\|sort: <field>` | Not implemented |
| 2 | `\|any: <expr>` | Not implemented |
| 3 | `\|every: <expr>` | Not implemented |
| 4 | `\|contains: "str"` | Not implemented |
| 5 | `\|keepsections` | Not implemented |
| 6 | `peek()` correctness | Partial |
| 7 | Nested `{[list]}` inside `{[list]}` | Partial |

### 2.3 Non-goals (intentionally out of scope)

- Editing source `.docx` templates programmatically (Layer 1 normalizes a *copy*).
- Any change to the Knackly grammar itself.
- PDF generation pipeline (still ConvertAPI).
- Supabase storage layer.
- Frontend / API surface (`POST /api/poa/generate` contract unchanged).

---

## 3. Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 1: Template Normalizer                                        │
│   Input:  raw .docx uploaded by template author                     │
│   Output: normalized .docx with stable run boundaries + assembled   │
│           tokens, stored in templates/normalized/<hash>.docx        │
│   When:   template upload time (one-shot, cached by content hash)   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 2: Run-Aware Generation Engine                                │
│   Input:  normalized .docx + form data                              │
│   Output: rendered .docx                                            │
│   How:    parse OOXML → typed AST → resolve grammar → serialize     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 3: Fixture Suite + Property-Based Fuzzing                     │
│   Input:  every known-bad paragraph + random Knackly programs       │
│   Output: pass/fail per fixture; no merge if any canary fails       │
│   When:   on every PR via CI; nightly fuzz on full corpus           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Layer 1 — Template Normalizer

### 4.1 Purpose

Eliminate the structural messiness in author-supplied `.docx` files **once**, so that
Layer 2 only ever sees clean input. Author tooling (Word + Knackly Designer add-in)
introduces three classes of mess that we cannot control:

1. **Token splitting**: `{[Agent.NameCO]}` arrives as N runs because of rsid splits or
   autocorrect.
2. **Heading-body merge**: `Designation of Curator. In the event…` lives in one `<w:p>`
   with mid-paragraph rPr change.
3. **Mid-token formatting changes**: a single token spans rPr boundaries.

### 4.2 Operations

| Op | Input shape | Output shape |
|----|-------------|--------------|
| **Token assembly** | `<w:r>X</w:r><w:r>Y</w:r>` where `X+Y` contains a Knackly token | Single `<w:r>` with merged text and the rPr of the run that contains the **opening** `{[` |
| **Heading-body split** | `<w:p>` with mid-paragraph rPr drop (e.g., `b+smallCaps+u → b+smallCaps`, or `formatted → unformatted`) and a sentence boundary | Two `<w:p>` sharing pPr, first with heading rPr, second with body rPr; sentinel `<!--bfix-->` retained for compat during cutover, dropped post-v200.10 |
| **Run consolidation** | Adjacent `<w:r>` with byte-identical rPr | Single `<w:r>` |
| **Variable highlight strip** | `<w:rPr>…<w:shd w:fill="C9E1F3"/>…</w:rPr>` (Knackly designer color box) | Same rPr without `<w:shd>` — the highlight is an authoring aid, not output |
| **Empty-run prune** | `<w:r><w:rPr/><w:t></w:t></w:r>` | Removed |
| **pPr inheritance** | `<w:p>` with no `<w:rPr>` in `<w:pPr>` but children inherit from default | Explicit pPr-rPr added so cascading is deterministic |

### 4.3 Implementation

- **Module**: `lib/normalizer/` (new directory).
- **Files**:
  - `index.ts` — `normalizeDocx(buffer: Buffer): Promise<Buffer>` entry.
  - `parse.ts` — `loadDocument(buffer)` → `{ documentXml, numberingXml, stylesXml, ... }`.
  - `tokenAssembler.ts` — sweep `<w:p>` children, find Knackly token spans, merge runs.
  - `headingBodySplitter.ts` — detect `b+smallCaps[+u] → subset` transitions at sentence
    boundaries; split `<w:p>` while preserving pPr.
  - `runConsolidator.ts` — adjacent identical-rPr merge.
  - `serialize.ts` — write back into ZIP.
  - `__tests__/` — fixture tests per op.

- **Storage**:
  - `templates/normalized/<sha256>.docx` (cache).
  - `template_normalizations` table in Supabase: `{ sha256, original_path,
    normalized_path, normalized_at, normalizer_version }`.
  - Re-run when `normalizer_version` changes.

- **Idempotency**: `normalize(normalize(x)) === normalize(x)` — required property,
  enforced by Layer 3 fuzzer.

### 4.4 What Layer 1 does NOT do

- Does not resolve any Knackly grammar (`{[if]}`, `{[list]}`, `{[Var]}`).
- Does not look at form data.
- Does not rewrite text content of any token.

---

## 5. Layer 2 — Run-Aware Generation Engine

### 5.1 Purpose

Given a normalized `.docx` + form data, produce the rendered `.docx`. Replaces all of
`processKnacklyXml`, all 6 passes, and all ~50 helpers in the current `route.ts`.

### 5.2 Pipeline

```
normalized .docx
    │
    ▼
┌──────────────────────────────────────────┐
│ Stage A: Parse OOXML → typed AST         │
│   Each <w:p> becomes Paragraph { pPr,    │
│   runs: Run[] }. Each Run keeps rPr +    │
│   Knackly token list.                    │
└──────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────┐
│ Stage B: Lex Knackly tokens within runs  │
│   Output: Token[] per Run with positions │
│   relative to that run's text.           │
└──────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────┐
│ Stage C: Parse Tokens → grammar AST      │
│   IfNode { cond, then, elseif[], else }  │
│   ListNode { source, body }              │
│   VarNode  { path, formatters[] }        │
│   TextNode { value }                     │
└──────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────┐
│ Stage D: Resolve grammar against data    │
│   - Evaluate conditions                  │
│   - Expand lists                         │
│   - Apply formatters                     │
│   Output: resolved AST (no Knackly)      │
└──────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────┐
│ Stage E: Materialize AST → OOXML         │
│   Each resolved span becomes a Run with  │
│   the rPr of the source span. Run-rPr    │
│   invariant preserved by construction.   │
└──────────────────────────────────────────┘
    │
    ▼
rendered .docx
```

### 5.3 Type definitions (excerpt)

```typescript
// lib/engine/types.ts

export interface RunFmt {
  b?: boolean;
  i?: boolean;
  u?: 'single' | 'double' | 'none';
  smallCaps?: boolean;
  caps?: boolean;
  color?: string;
  highlight?: string;
  font?: { ascii?: string; hAnsi?: string; cs?: string };
  size?: number;
  // …all rPr children we care about
}

export interface Run {
  rPr: RunFmt;
  text: string;
  // After Stage B:
  tokens?: Token[];
}

export interface Paragraph {
  pPr: ParagraphFmt;
  runs: Run[];
  // For AST stage:
  ast?: BlockNode[];
}

export type BlockNode =
  | { kind: 'text'; rPr: RunFmt; value: string }
  | { kind: 'var'; rPr: RunFmt; path: string; formatters: Formatter[] }
  | { kind: 'if'; cond: Expr; then: BlockNode[]; elseifs: { cond: Expr; body: BlockNode[] }[]; else?: BlockNode[] }
  | { kind: 'list'; source: Expr; filters: Filter[]; body: BlockNode[] };
```

### 5.4 Critical design rules

1. **rPr never crosses Run boundaries.** A resolved span always carries the rPr of the
   run that produced it.
2. **Conditional branches inherit the rPr of their tokens.** `{[if A]}X{[else]}Y{[endif]}`
   where the entire token sits in one Run: `X` and `Y` both inherit that Run's rPr.
   When the token spans Runs, each text span keeps its own Run's rPr.
3. **List bodies materialize per-iteration.** Each iteration is a deep copy of the body
   AST with `{[this]}` resolved.
4. **Word boundary preservation is structural, not heuristic.** When splicing branch
   text, look at the AST neighbors, not at character offsets. If the previous TextNode
   ends with a letter and the branch starts with a letter, insert a space.
5. **No hoisting.** There is no equivalent of `redistributeIntoFirstWt`. Stage E builds
   the output Run-by-Run.

### 5.5 Module layout

- `lib/engine/parse.ts` — Stage A
- `lib/engine/lex.ts` — Stage B (token regex on text only)
- `lib/engine/grammar.ts` — Stage C (parser combinators)
- `lib/engine/resolve.ts` — Stage D (interpreter)
- `lib/engine/materialize.ts` — Stage E
- `lib/engine/expr.ts` — `Expr` evaluator (`==`, `&&`, `||`, `!`, `.length`, ternary,
  `peek()`, `.endsWith()`, dot-paths)
- `lib/engine/formatters.ts` — `|format:`, `|cardinal`, `|titlecaps`, `|else:`, `|filter:`,
  `|sort:`, `|punc:`, `|any:`, `|every:`, `|contains:`, `|keepsections`
- `lib/engine/index.ts` — `renderDocx(normalizedBuffer: Buffer, data: object): Promise<Buffer>`

### 5.6 What Layer 2 does NOT do

- Does not attempt to repair malformed templates (Layer 1's job).
- Does not assemble split tokens (Layer 1's job).
- Does not inspect form-data validity (caller's job).

---

## 6. Layer 3 — Fixture Suite + Property-Based Fuzzing

### 6.1 Purpose

Make regressions impossible to ship. Every known-bad shape becomes a permanent test.
Random program generation finds shapes we haven't seen yet.

### 6.2 Fixture suite

- **Location**: `__tests__/fixtures/<category>/<name>/`
- **Each fixture is a directory** with:
  - `input.docx` — minimal template containing one paragraph shape
  - `data.json` — form data
  - `expected.xml` — exact expected `word/document.xml` (canonicalized)
  - `README.md` — human description of what's being tested
- **Categories**:
  - `01-curator/` — heading + body with body Knackly
  - `02-retirement/` — heading + body, body plain text, subset rPr
  - `03-self-dealing/` — heading + body via consolidationTarget
  - `04-elseif-fusion/` — word-boundary splices
  - `05-recursive-table/` — nested `<w:tbl>`
  - `06-split-token/` — token across runs
  - `07-list-conditional/` — list with inner conditional
  - `08-nested-list/` — list within list
  - `09-formatters/` — every `|formatter` in isolation
  - `10-edge-cases/` — empty data, missing fields, etc.

- **Runner**: `__tests__/fixtures.test.ts` walks the dir and asserts
  `canonicalize(render(input, data)) === canonicalize(expected)`.
- **First run**: every existing v141–v175.6 canary becomes one fixture.

### 6.3 Property-based fuzzer

- **Library**: `fast-check`.
- **Generators**:
  - `genRunFmt()` — random rPr
  - `genTextNode()`, `genVarNode()`, `genIfNode()`, `genListNode()`
  - `genParagraph()` — depth-bounded compose
  - `genTemplate()` — paragraphs + numbering + styles
- **Properties**:
  1. **Idempotency**: `normalize(normalize(t)) === normalize(t)`.
  2. **Run-rPr invariant**: every `<w:r>` in the rendered output has rPr that traces
     to a Run in the source template.
  3. **No-orphan-tokens**: rendered output contains no `{[`.
  4. **Round-trip**: `parse(serialize(p)) === p` for every Paragraph.
  5. **Determinism**: `render(t, d) === render(t, d)` byte-for-byte.

### 6.4 CI integration

- `npm test` runs fixture suite + 1 minute of fast-check.
- Nightly job runs fast-check for 60 minutes against the full normalized corpus.
- PR cannot merge if any fixture fails.

---

## 7. Migration Strategy

### 7.1 Coexistence (the only safe path)

We will not delete `route.ts` until Layer 2 has shipped and produced byte-identical
output for the fixture suite + 50-template sample for **two consecutive weeks**.

```
POST /api/poa/generate
  ├── if env.USE_V200 === '1' → Layer 2 engine
  └── else → existing route.ts (v175.6)
```

`USE_V200` flips per-tenant, then per-template, then globally. Rollback is one env var.

### 7.2 Phased cutover

| Phase | Action | Exit criterion |
|-------|--------|----------------|
| 6.1 | Normalize all 8 production templates | All 8 normalized + cached |
| 6.2 | Layer 2 ships behind `USE_V200=1` for one test tenant | Fixture suite green for 7 days |
| 6.3 | Cut 10% production traffic to Layer 2 | No regressions reported |
| 6.4 | Cut 100% production traffic | 14 days clean |
| 6.5 | Delete `processKnacklyXml` and all v141–v175.6 helpers from `route.ts` | route.ts < 500 lines |

---

## 8. File / Directory Plan

```
GeauxDrafterPrivate/
├── app/api/poa/generate/route.ts        # shrunk to thin dispatcher
├── lib/
│   ├── normalizer/                      # Layer 1 (NEW)
│   │   ├── index.ts
│   │   ├── parse.ts
│   │   ├── tokenAssembler.ts
│   │   ├── headingBodySplitter.ts
│   │   ├── runConsolidator.ts
│   │   ├── serialize.ts
│   │   └── __tests__/
│   ├── engine/                          # Layer 2 (NEW)
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── parse.ts
│   │   ├── lex.ts
│   │   ├── grammar.ts
│   │   ├── expr.ts
│   │   ├── resolve.ts
│   │   ├── formatters.ts
│   │   ├── materialize.ts
│   │   └── __tests__/
│   └── shared/
│       └── condition-evaluator.ts       # KEEP (already shared, well-tested)
├── __tests__/
│   ├── fixtures/                        # Layer 3 (NEW)
│   │   ├── 01-curator/
│   │   ├── 02-retirement/
│   │   ├── …
│   │   └── 10-edge-cases/
│   ├── fixtures.test.ts                 # NEW
│   └── fuzz.test.ts                     # NEW
├── ARCHITECTURE.md                      # this file
└── ROLLOUT.md                           # phased-cutover runbook (NEW)
```

---

## 9. Open Questions (resolve before Phase 3)

1. **Numbering / list level cascade**: when Layer 2 expands `{[list]}`, does it
   re-emit `<w:numPr>` per iteration? Must match Word's expectation for continuous
   numbering. Decision: **yes**, copy `<w:numPr>` from the first child `<w:p>` of the
   list body.
2. **Form data shape**: stay 1:1 with current `data` object, or move to schema-typed?
   Decision: keep current shape; Layer 2 reads via dot-path accessor.
3. **Where does PDF generation hook in?** Same place as today — after Layer 2 returns,
   pass the buffer to ConvertAPI.
4. **Streaming?** No. Templates are < 1 MB; full in-memory is fine.

---

## 10. Success Criteria

- **Correctness**: 100% of fixture suite green; full corpus byte-equivalent for 14 days.
- **Performance**: Layer 1 + Layer 2 combined ≤ current `route.ts` p95 latency.
- **Maintainability**: adding a new Knackly feature requires one file change in
  `lib/engine/grammar.ts` + one in `lib/engine/formatters.ts` + one fixture.
- **Code size**: Layer 1 + Layer 2 + tests ≤ 4,000 LoC (vs 5,523 in current route.ts).

---

*End of design. Phase 3 (build Layer 1) does not start until this doc is approved.*
