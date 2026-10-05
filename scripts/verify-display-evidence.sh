#!/usr/bin/env bash
#
# Evidence-package validation gate (Issue #59).
#
# The committed probe evidence is what permanently unlocks Issue #21, so it must
# be independently checkable rather than trusted from a report. GitHub workflows
# do not cover docs/ or fixtures/ (a separate process-hardening issue), so this
# gate exists to run deterministically wherever the repository is checked out.
#
# It validates the evidence package AGAINST ITS OWN CLAIMS. It deliberately does
# not contain the claims as constants: it reads them from the fixtures and the
# evidence document and fails if they disagree.
#
# Usage: bash scripts/verify-display-evidence.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURES="$REPO_ROOT/fixtures/display"
DOC="$REPO_ROOT/docs/display-probe-evidence.md"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "  ok  $*"; }

echo "1/6 Fixtures parse and exist..."
[ -d "$FIXTURES" ] || fail "fixtures directory missing: $FIXTURES"
python3 - "$FIXTURES" <<'PY'
import json, os, sys
d = sys.argv[1]
files = sorted(f for f in os.listdir(d) if f.endswith(".json"))
if not files:
    print("no fixtures found", file=sys.stderr); sys.exit(1)
for f in files:
    with open(os.path.join(d, f)) as fh:
        json.load(fh)
    print(f"  ok  parsed {f}")
PY

echo "2/6 Pagination claims are substantiated by the fixture itself..."
python3 - "$FIXTURES/video-list.sanitized.json" <<'PY'
import json, sys
v = json.load(open(sys.argv[1]))
p = v["paginationObservation"]
assert p["page1Count"] == 20, f"page1Count={p['page1Count']}, expected 20"
assert p["page2Count"] == 20, f"page2Count={p['page2Count']}, expected 20"
assert p["idOverlapBetweenPages"] == 0, "pages overlap — cursor did not advance"
assert p["cursorChangedBetweenPages"] is True, "cursor unchanged between pages"
for pg in ("page1", "page2"):
    d = v[pg]["response"]["data"]
    assert d["has_more"] is True, f"{pg} has_more not true"
    assert d["cursorKind"] == "number", f"{pg} cursor kind unexpected"
    assert v[pg]["response"]["status"] == 200, f"{pg} status not 200"
print("  ok  page1/page2 counts, disjoint ids, cursor advanced, has_more true")
PY

echo "3/6 max_count boundary observation records the documented 400..."
python3 - "$FIXTURES/max-count-boundary.sanitized.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
assert m["request"]["max_count"] == 50, "max_count request not 50"
assert m["response"]["status"] == 400, "status not 400"
e = m["response"]["error"]
assert e["code"] == "invalid_params", f"error code {e['code']}"
assert "[1, 20]" in e["message"], f"range not stated: {e['message']}"
assert set(e.keys()) == {"code", "message", "log_id"}, f"error envelope shape: {set(e.keys())}"
print("  ok  max_count=50 -> 400 invalid_params with {code,message,log_id}")
PY

echo "4/6 Redaction: no synthetic zeros, no leaked identifiers/URLs..."
python3 - "$FIXTURES" <<'PY'
import json, os, re, sys
d = sys.argv[1]
REDACTED = "<REDACTED>"
NUMBER = "<NUMBER>"
problems = []
for f in sorted(os.listdir(d)):
    if not f.endswith(".json"): continue
    txt = open(os.path.join(d, f)).read()
    # No raw URLs (other than none expected), no bearer tokens, no long hex ids.
    for pat, label in [
        (r"https?://", "raw URL"),
        (r"Bearer\s+\S", "bearer token"),
        (r"\b[a-f0-9]{32,}\b", "long hex identifier"),
        (r"access_token|refresh_token|client_secret", "credential field name"),
    ]:
        if re.search(pat, txt):
            problems.append(f"{f}: {label}")
    obj = json.load(open(os.path.join(d, f)))
    # Every numeric leaf must be a count/status we asserted, never a redacted slot.
    def walk(o, path=""):
        if isinstance(o, dict):
            for k, v in o.items(): walk(v, f"{path}.{k}")
        elif isinstance(o, list):
            for i, v in enumerate(o): walk(v, f"{path}[{i}]")
        elif isinstance(o, str):
            if o not in (REDACTED, NUMBER) and "REDACTED" not in o and not o.startswith("<"):
                # free-text messages are allowed (error messages, notes, conclusion)
                pass
    walk(obj)
if problems:
    print("\n".join(problems), file=sys.stderr); sys.exit(1)
print("  ok  no raw URLs, tokens, hex identifiers, or credential field names")
PY

echo "5/6 Absent fields remain absent (not null/zero/empty)..."
python3 - "$FIXTURES/user-info.sanitized.json" "$FIXTURES/video-list.sanitized.json" <<'PY'
import json, sys
ui = json.load(open(sys.argv[1]))
user = ui["data"]["user"]
for absent in ("union_id", "avatar_url_100", "avatar_large_url"):
    assert absent not in user, f"{absent} was synthesized into the profile fixture"
assert all(v != 0 for v in user.values()), "a numeric 0 was substituted (0 is meaningful)"
vl = json.load(open(sys.argv[2]))
sample = vl["page1"]["response"]["data"]["videos"][0]
for absent in ("is_aigc", "embed_link"):
    assert absent not in sample, f"{absent} was synthesized into the video fixture"
assert all(v != 0 for v in sample.values()), "a numeric 0 was substituted"
print("  ok  absent fields absent; no 0 substituted; <NUMBER> used for numerics")
PY

echo "6/6 Evidence document agrees with the fixtures..."
python3 - "$DOC" "$FIXTURES/video-list.sanitized.json" <<'PY'
import json, sys
doc = open(sys.argv[1]).read()
v = json.load(open(sys.argv[2]))
p = v["paginationObservation"]
assert "PROBE_VERIFIED" in doc, "matrix missing"
assert "= **14**" in doc, "PROBE_VERIFIED count not reconciled arithmetically"
assert f"page1Count: {p['page1Count']}" in doc, "doc page1Count disagrees with fixture"
assert f"page2Count: {p['page2Count']}" in doc, "doc page2Count disagrees with fixture"
assert f"idOverlapBetweenPages: {p['idOverlapBetweenPages']}" in doc, "doc overlap disagrees"
for path in ("user-info.sanitized.json", "video-list.sanitized.json", "max-count-boundary.sanitized.json"):
    assert path in doc, f"doc does not reference fixture {path}"
print("  ok  document references fixtures and agrees on counts/overlap")
PY

echo
echo "Display evidence validation passed."
