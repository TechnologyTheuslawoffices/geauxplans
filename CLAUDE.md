# CLAUDE.md — GeauxDrafterPrivate (doc-tools)

This file guides Claude Code when working in the `doc-tools` document generation service.

## Project Identity

| Field | Value |
|-------|-------|
| **Vercel project** | `doc-tools` |
| **Production URL** | `doc-tools-geaux-counsel.vercel.app` |
| **Vercel account** | `zularjob-3870` (team `geaux-counsel`) |
| **Local path** | `C:\Users\Arman\Documents\GeauxDrafterPrivate` |
| **Stack** | Next.js 14 (App Router) on Node.js, hosted on Vercel |
| **Role** | Transforms form data → Knackly schema → DOCX/PDF |

**ALWAYS** verify account before deploying:
```bash
npx vercel whoami      # must print: zularjob-3870
npx vercel --prod
npx vercel alias set <new-url> doc-tools-geaux-counsel.vercel.app
```

## Service Architecture

```
geauxplans-backend  ──POST──►  /api/poa/generate          (POA documents)
                    ──POST──►  /api/estate/generate       (Trust documents)
                                       │
                                       ▼
                              templates/*.docx (Knackly-syntax templates)
                                       │
                                       ▼
                              processKnacklyXml() → DOCX → PDF (ConvertAPI)
                                       │
                                       ▼
                              Returns Buffer/base64 to backend
```

### Key Endpoints

| Route | Purpose |
|-------|---------|
| `app/api/poa/generate/route.ts` | POA document generation (FPOA, HPOA, HCD, HIPAA × Client/Spouse) |
| `app/api/estate/generate/route.ts` | Estate trust document generation |

### Templates

`templates/*.docx` — Knackly-syntax DOCX files (e.g., `ClientFPOA.docx`, `ClientFPOATemplate.docx`). These contain `{[if]}`, `{[list]}`, `{[Variable]}` patterns that the route handlers expand against form data.

## POA Generation Pipeline

`processKnacklyXml()` in `app/api/poa/generate/route.ts` runs multi-pass over each `word/document.xml`:

| Pass | Purpose |
|------|---------|
| **PASS 0** | Per-paragraph processing — inline conditionals, boundary fix, list/conditional expansion |
| **PASS 1** | List expansion (`{[list X]}...{[endlist]}`) |
| **PASS 2** | Orphan-else cleanup |
| **PASS 3** | Orphan-table-tag removal |
| **PASS 4** | Global variable resolution across remaining unresolved `{[Var]}` |
| **PASS 5** | FINAL-XML diagnostic dumps for probes |

### Critical Helpers

| Function | Role |
|----------|------|
| `findRunStart(content, beforePos)` | Locate `<w:r>` start (handles `<w:r>` and `<w:r w:rsidR="…">`) |
| `preserveWordBoundary(branch, charBefore, charAfter)` | Prevent fusion ("iseither", "AgentIn") at conditional splice points |
| `dumpParagraphDiagnostic(label, probe, sources, window)` | Centralized log dump around a probe substring |
| `paragraphHasBoundaryMarker(paraXml)` | Detect `<!--bfix-->` sentinel for PASS 4 dispatch |
| `parseRunFmt(rPr)` / `isWeakerFormatting(prev, next)` | Subset-flag formatting transition detection |
| `resolveVariablesPerRun(paraXml, data)` | Per-run var resolution preserving clean body rPr |
| `dlog(msg)` | Budget-gated diagnostic logger (v175.2+) |

### Boundary Fix Concept

Knackly templates often have a single paragraph carrying both a heading and body, e.g.:

```
"Designation of Curator." [bold + smallCaps + underline]
"In the event that Appearer becomes incapacitated…" [no formatting]
```

Word stores these as separate `<w:r>` runs but the paragraph passes through PASS 4 which historically merged ALL text into the FIRST `<w:t>` element — hoisting body text into the heading run and inheriting bold/underline.

**The fix**:
1. PASS 0 splits heading/body into properly formatted runs at the sentence boundary
2. Inserts a `<!--bfix-->` sentinel marker before the heading run
3. PASS 4 calls `paragraphHasBoundaryMarker()` and dispatches:
   - **Marker present** → `resolveVariablesPerRun()` (preserves run-level rPr)
   - **No marker** → `redistributeIntoFirstWt()` (legacy hoist)

### Boundary Detection (v175)

The boundary gate accepts:
- **Strict transition**: prev run formatted, next run unformatted
- **Weak transition** (`isWeakerFormatting`): next run has STRICT subset of prev's flags (e.g., heading `b+u+smallCaps` → body `b+smallCaps` — drops `u`)

## Diagnostic Logging Conventions

### Version-Tag Format

Every change ships with a version tag like `v175.2-LOG-BUDGET`. The version is logged on the first line of every request:

```typescript
console.log('=== POA-GENERATE v175.2-LOG-BUDGET ===');
```

Diagnostic logs use the form `vNNN:TAG …`:

| Prefix | Meaning |
|--------|---------|
| `vNNN:NAME` | Diagnostic from version NNN |
| `vNNN.M:NAME` | Sub-version diagnostic |

### Vercel 256-Line Log Limit

**Vercel truncates request output at 256 log lines.** Verbose Curator/Retirement debugging easily exceeds this and silently drops the most recent (often most informative) lines.

**Solution: budgeted `dlog()` helper** (added in v175.2):

```typescript
let v175_2_logCount = 0;
const V175_2_LOG_BUDGET = 120;
function dlog(msg: string): void {
  if (v175_2_logCount >= V175_2_LOG_BUDGET) return;
  v175_2_logCount++;
  console.log(msg);
  if (v175_2_logCount === V175_2_LOG_BUDGET) {
    console.log(`v175.2:DLOG-BUDGET-EXHAUSTED suppressing further detail logs`);
  }
}
```

`POST` resets `v175_2_logCount = 0` per request.

### What Stays on `console.log` vs `dlog`

| Tier | Examples | Tool |
|------|----------|------|
| **Essential signal** (≤10/req) | Version banner, `v175:PASS4-SKIP`, `v174:BNDRY-ENTRY`, `v142:BNDRY summary`, `v137:PASS4` | `console.log` |
| **Probe-gated detail** (10-100/req) | `v144:MATCH`, `v172:CURATOR target`, `v169:DIAG`, `v174:RETIRE` dumps, `dumpParagraphDiagnostic` output | `dlog` |
| **Removed** | One-time exploration logs from prior versions | deleted |

## Investigation Probes

Probes used to investigate paragraph-level issues:

| Probe | Detects |
|-------|---------|
| `Designation of Curator` / `In the event that Appearer` | Curator heading/body leak |
| `Retirement Plans` | Retirement heading subset-formatting transition |
| `Self Dealing` | Self-dealing heading (regression canary) |
| `C. Alternate or Substitute` / `Substitute Agent` | Elseif word-boundary fusion ("iseither", "AgentIn") |
| `Recursive Table` | Nested table preservation |

## Version History (Recent)

| Version | Change |
|---------|--------|
| v141 | Initial formatting-boundary fix |
| v144 | LAST formatted→unformatted transition selection |
| v152 | Teal/green highlighting fix |
| v154 | Skip sentence boundary inside Knackly blocks |
| v160 | Paragraph-level pPr rPr inheritance fix |
| v170 | `consolidationTarget` (heading run with active underline preferred) |
| v173 | Tempered-greedy heading regex (prevents heading text consumption) |
| v174 | Diagnostic-only — pinpointed PASS 4 merge + binary unformatted gate as culprits |
| v175 | PASS 4 sentinel + `paragraphHasBoundaryMarker` dispatch; `isWeakerFormatting` gate |
| v175.1 | Inner transition-finder weakened; `noFmtRpr` clears `smallCaps`; elseif splice at line ~925 calls `preserveWordBoundary` |
| v175.2 | Log budget — `dlog()` helper, ~120-line cap on detail logs to stay under Vercel 256 limit |

### Known-Pending Issues

- **Retirement Plans bypass** — paragraph has no Knackly patterns so `if (!hasInlineCond) return fullMatch;` short-circuits the boundary fix. Needs either gate lift OR separate heading-merged-into-body normalization pass.
- **Second elseif fusion site** — line 925 fix is firing per logs but fusion persists in some templates → another splice site in `processConditionals` / `findInnermostIfElseBlock` likely needs `preserveWordBoundary`.

## Constraints (DO NOT REGRESS)

When making changes to `processKnacklyXml`, run a deploy + visual check that ALL of these still work:

- Recursive Table (nested tables preserve structure)
- Teal/green highlighting (v152 fix)
- Variable syntax preservation inside Knackly blocks (v154)
- Paragraph-level pPr rPr inheritance (v160)
- v170 `consolidationTarget` (Self Dealing + Curator heading placement)
- v173 tempered-greedy heading regex
- v174 elseif word-boundary fix
- Self Dealing visual rendering
- Designation of Curator heading/body separation (v175)

## Working Directory Tips

- `route.ts` is large (>5000 lines). Use `Grep` for targeted searches, `Read` with offset/limit for context.
- Templates live in `templates/` — read with `Read` to inspect Knackly markup structure.
- `lib/shared/condition-evaluator.ts` provides `evaluateCondition`, `evaluateFilterCondition`, `getNestedValue`, `applyFormatters`, `clearConditionCache` — call `clearConditionCache()` at request entry.
- `lib/knackly-schema/integration` provides code-first formula schema (avoids DB queries).

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=<supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
CONVERTAPI_SECRET=<convertapi-key>   # PDF conversion; if missing → PDF skip
```

## Common Workflows

### Diagnostic Loop

1. Add `vNNN:TAG` log lines (gated through `dlog()` if verbose)
2. `npx tsc --noEmit` — confirm no type regressions
3. `npx vercel whoami` — must show `zularjob-3870`
4. `npx vercel --prod`
5. `npx vercel alias set <new-url> doc-tools-geaux-counsel.vercel.app`
6. Trigger a POA generation via `geauxplans-react` UI
7. `npx vercel inspect <url> --logs` to capture run output
8. Iterate

### Reading Logs

Use Vercel dashboard or `npx vercel inspect <deployment-url> --logs`. Filter by:
- Request ID (each POST is one request)
- `vNNN:` prefix to focus on a version's instrumentation
- Probe substring (e.g., `Curator`, `Retirement`)

## Cross-References

- **Frontend caller**: `geauxplans-react` (login-6676 / geaux-ventures account)
- **Backend caller**: `geauxplans-backend` at `geauxplans-backend-sooty.vercel.app` — invokes via `DOCTOOLS_URL` env var
- **Knackly training docs**: `C:\Users\Arman\Documents\Knackly Training\CLAUDE.md` for syntax patterns and variable types
