# v200 Rollout Runbook

> Phased cutover from the legacy v141–v175.6 path (`route.ts processDocx`)
> to the v200 path (Layer 1 normalize → Layer 2 render).
>
> See [ARCHITECTURE.md](./ARCHITECTURE.md) §7 for design rationale.

---

## Pre-flight Checklist

- [ ] All Layer 1, Layer 2, Layer 3 tests pass locally (`npx jest`)
- [ ] `npx tsc --noEmit -p tsconfig.json` clean
- [ ] `npx vercel whoami` returns `zularjob-3870`
- [ ] Working tree is clean (`git status`)
- [ ] Latest legacy version banner is up to date (currently `v175.6`)

---

## Cutover Phases

### Phase 6.1 — Normalize the 8 Production Templates (Offline)

For each template under `templates/`:

```bash
node scripts/normalize-template.js templates/ClientFPOATemplate.docx \
  --out templates/normalized/ClientFPOATemplate.docx
```

Verify:
- Tokens that span runs are merged (`{[Var]}` lives inside ONE `<w:t>`)
- Heading-body merged paragraphs are split into TWO `<w:p>`
- Designer highlight shading (C9E1F3, C9F3CD, FAE7D2) is removed
- Empty runs pruned, adjacent identical-rPr runs consolidated

The 8 templates to normalize:
1. ClientFPOATemplate.docx
2. SingleTrust.docx
3. JointTrust.docx
4. SNT.docx
5. TUT.docx
6. EstateAdmin templates (×3)

> **Idempotency check**: `normalize(normalize(t)) === normalize(t)` — the
> property test (`__tests__/properties.test.ts` P1) covers this for random
> docs. Verify on each real template by hashing.

### Phase 6.2 — Single-Tenant Canary (1 day)

Deploy with the env flag set for ONE tenant only:

```bash
# In Vercel project settings (doc-tools)
DOCTOOLS_V200_TEMPLATES=ClientFPOATemplate
```

Deploy:
```bash
cd C:\Users\Arman\Documents\GeauxDrafterPrivate
npx vercel --prod
npx vercel alias set <new-build-url> doc-tools-geaux-counsel.vercel.app
```

Verify in Vercel logs:
```
v200.0: ClientFPOATemplate → v200 path
```

Generate one POA via geauxplans-react. Visual checks:
- ✅ Designation of Curator: heading bold/smallCaps/underline, body clean
- ✅ Retirement Plans: heading bold/smallCaps/underline, body no bold
- ✅ Self Dealing: unchanged
- ✅ Elseif paragraphs ("C. Alternate Agent"): no `iseither` fusion
- ✅ Recursive table preserved
- ✅ Teal/green highlight stripped from output

### Phase 6.3 — 10% Traffic (3 days)

Add the next two templates:

```bash
DOCTOOLS_V200_TEMPLATES=ClientFPOATemplate,SingleTrust,JointTrust
```

Monitor for 3 days. Watch for:
- Render exceptions (uncaught throws in Layer 2)
- DOCX corruption reports from users
- Byte-equivalence drift from baseline (run nightly diff job)

If drift is detected: `unset DOCTOOLS_V200_TEMPLATES` to revert that template
to legacy; file a fixture and add to `__tests__/fixtures.test.ts`.

### Phase 6.4 — 100% Traffic (7 days)

Flip the global flag:

```bash
DOCTOOLS_USE_V200=1
```

This makes `shouldUseV200()` return true for ALL templates. Legacy path
remains in code as a fallback only (the `legacy` thunk is still passed but
not invoked).

Monitor for 7 consecutive days of zero regressions.

### Phase 6.5 — Delete the v141–v175.6 Stack (after 14 days clean)

After 14 days of `DOCTOOLS_USE_V200=1` with byte-equivalent output for the
fixture suite + 50-template production sample:

1. Delete `route.ts processDocx` and all v141–v175.6 helpers
2. Inline the v200 dispatcher into `route.ts` (no more `legacy` thunk)
3. Remove `DOCTOOLS_USE_V200` and `DOCTOOLS_V200_TEMPLATES` env vars
4. Remove the version banner machinery
5. Bump version to `v200.1` and ship

> **DO NOT** perform this step until ALL of the following are true:
> - 14 consecutive days at 100% traffic with zero regressions
> - Fixture suite + properties tests pass on every PR
> - 50-template byte-equivalence sample matches baseline

---

## Rollback Procedure

If a regression is detected at any phase:

### Per-template rollback (Phase 6.2 / 6.3)

Remove the template from `DOCTOOLS_V200_TEMPLATES` and redeploy. The
dispatcher will fall back to `legacy()` for that key.

### Global rollback (Phase 6.4)

```bash
DOCTOOLS_USE_V200=0
DOCTOOLS_V200_TEMPLATES=
```

Redeploy. All requests revert to v175.6 path immediately.

### Hot rollback (no deploy)

If the bad template is identified live, you can also temporarily delete the
template from `DOCTOOLS_V200_TEMPLATES` via the Vercel env-var UI and
redeploy with `--force`. This is faster than a code revert.

---

## Verification Commands

```bash
# Type check
npx tsc --noEmit -p tsconfig.json

# Full test suite (73 tests)
npx jest

# Property tests with extra runs
PROPERTY_RUNS=500 npx jest properties.test

# Account check
npx vercel whoami    # must print zularjob-3870

# Deploy
npx vercel --prod

# Alias
npx vercel alias set <build-url> doc-tools-geaux-counsel.vercel.app

# Inspect logs
npx vercel inspect <url> --logs
```

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Layer 1 + Layer 2 LoC | ≤ 4,000 (vs 5,523 legacy) |
| Test count | ≥ 73 (23 normalizer + 28 engine + 18 fixtures + 4 properties) |
| Property test runs | 50/property baseline, 500 nightly |
| Byte-equivalence on fixture suite | 100% |
| Production regressions in 14-day soak | 0 |
| Version banner | `v200.0` → `v200.1` after Phase 6.5 |

---

## Known Limitations (Documented, Not Blockers)

- **Multi-paragraph if/list spanning paragraph boundaries** — `renderParagraphGroup`
  falls back to per-paragraph rendering. Production templates already align
  `{[if]}/{[endif]}` and `{[list]}/{[endlist]}` with paragraph boundaries.
  If a future template requires cross-paragraph spans, extend
  `groupParagraphsByBalance` to emit a multi-para group resolver.

- **Designer highlight regex** — currently strips `<w:shd … w:fill="C9E1F3"/>`
  and the two siblings. If Knackly adds new highlight colors, append them
  to `DESIGNER_SHADING` in `lib/normalizer/xml.ts`.

- **`|sort:` filter** — implemented but uses lexicographic sort by default.
  Add a comparator option if numeric sort is required.
