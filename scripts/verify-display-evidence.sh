#!/usr/bin/env bash
#
# Evidence-package validation gate (Issue #59).
#
# The committed probe evidence is what permanently unlocks Issue #21, so it must
# be independently checkable rather than trusted from a report. GitHub workflows
# do not cover docs/ or fixtures/ (tracked separately as a process-hardening
# issue), so this gate runs deterministically wherever the repository is checked
# out.
#
# DERIVATION vs CONTRACT ASSERTION
#
#   DERIVED  — computed from the committed sanitized evidence. Pagination item
#              counts, cross-page overlap and cursor difference are computed from
#              the per-page `itemFingerprints` lists, NOT read from a metadata
#              field. Mutating the fingerprints fails these checks.
#
#   CONTRACT — asserts the contract under test, not an observation. The
#              max_count boundary check asserts the provider is expected to
#              reject >20; that expectation is not derivable from the fixture.
#              It is labelled as a contract assertion in the output.
#
# Usage: bash scripts/verify-display-evidence.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURES="$REPO_ROOT/fixtures/display"
DOC="$REPO_ROOT/docs/display-probe-evidence.md"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "  ok  $*"; }
derived() { echo "  [derived]  $*"; }
contract() { echo "  [contract] $*"; }

echo "1/7 Fixtures parse and exist..."
python3 - "$FIXTURES" <<'PY'
import json, os, sys
d = sys.argv[1]
files = sorted(f for f in os.listdir(d) if f.endswith(".json"))
if not files:
    print("no fixtures found", file=sys.stderr); sys.exit(1)
for f in files:
    json.load(open(os.path.join(d, f)))
    print(f"  ok  parsed {f}")
PY

echo "2/7 Pagination DERIVED from committed fingerprints (not from metadata)..."
python3 - "$FIXTURES/video-list.sanitized.json" <<'PY'
import json, sys
v = json.load(open(sys.argv[1]))
p1, p2 = v["page1"], v["page2"]
f1 = p1["response"]["data"]["itemFingerprints"]
f2 = p2["response"]["data"]["itemFingerprints"]

derived_p1 = len(f1)
derived_p2 = len(f2)
derived_overlap = len(set(f1) & set(f2))
derived_cursor_differs = p1["response"]["data"]["cursorFingerprint"] != p2["response"]["data"]["cursorFingerprint"]

print(f"  [derived]  page1 item count from fingerprints = {derived_p1}")
print(f"  [derived]  page2 item count from fingerprints = {derived_p2}")
print(f"  [derived]  cross-page fingerprint intersection = {derived_overlap}")
print(f"  [derived]  page1/page2 cursor fingerprints differ = {derived_cursor_differs}")

assert derived_p1 > 0, "page1 fingerprints empty — cannot substantiate the claim"
assert derived_p2 > 0, "page2 fingerprints empty — cannot substantiate the claim"
assert derived_overlap == 0, f"pages share {derived_overlap} items — cursor did not advance"
assert derived_cursor_differs, "cursor fingerprints identical — no advancement evidence"
assert p2["request"]["cursorFingerprint"] == p1["response"]["data"]["cursorFingerprint"], \
    "page2 was not requested with page1's cursor"
for pg in (p1, p2):
    assert pg["response"]["data"]["has_more"] is True, "has_more not true"
    assert pg["response"]["status"] == 200, "status not 200"
print("  [derived]  page2 used page1's cursor; has_more true on both")
PY

echo "3/7 max_count boundary (CONTRACT assertion, not a derived observation)..."
python3 - "$FIXTURES/max-count-boundary.sanitized.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
print(f"  [contract] asserting the provider rejects max_count={m['request']['max_count']} (documented range [1,20])")
assert m["response"]["status"] == 400, "status not 400"
e = m["response"]["error"]
assert e["code"] == "invalid_params", f"error code {e['code']}"
assert set(e.keys()) == {"code", "message", "log_id"}, f"envelope shape {set(e.keys())}"
print("  [contract] observed 400 invalid_params with {code,message,log_id}")
PY

echo "4/7 Redaction: no synthetic zeros, no leaked identifiers/URLs..."
python3 - "$FIXTURES" <<'PY'
import json, os, re, sys
d = sys.argv[1]
problems = []
for f in sorted(os.listdir(d)):
    if not f.endswith(".json"): continue
    txt = open(os.path.join(d, f)).read()
    for pat, label in [
        (r"https?://", "raw URL"),
        (r"Bearer\s+\S", "bearer token"),
        (r"\b[a-f0-9]{32,}\b", "long hex identifier"),
        (r"access_token|refresh_token|client_secret", "credential field name"),
    ]:
        if re.search(pat, txt): problems.append(f"{f}: {label}")
if problems:
    print("\n".join(problems), file=sys.stderr); sys.exit(1)
print("  ok  no raw URLs, tokens, hex identifiers, or credential field names")
PY

echo "5/7 Absent fields genuinely absent; no 0/null/empty substituted..."
python3 - "$FIXTURES/user-info.sanitized.json" "$FIXTURES/video-list.sanitized.json" <<'PY'
import json, sys
ui = json.load(open(sys.argv[1]))
user = ui["data"]["user"]
for absent in ("union_id", "avatar_url_100", "avatar_large_url"):
    assert absent not in user, f"{absent} synthesized into profile fixture"
for k, v in user.items():
    assert v not in (0, None, ""), f"{k} carries a synthetic {v!r}"
vl = json.load(open(sys.argv[2]))
sample = vl["page1"]["response"]["data"]["videos"][0]
for absent in ("is_aigc", "embed_link"):
    assert absent not in sample, f"{absent} synthesized into video fixture"
for k, v in sample.items():
    assert v not in (0, None, ""), f"{k} carries a synthetic {v!r}"
print("  ok  absent fields absent; no 0/null/empty; redaction strings used")
PY

echo "6/7 Type semantics: representation type and observed provider type are distinct..."
python3 - "$FIXTURES/user-info.sanitized.json" <<'PY'
import json, sys
ui = json.load(open(sys.argv[1]))
assert "_observedTypes" in ui, "no _observedTypes block: fixture would overclaim type preservation"
for field, t in ui["_observedTypes"].items():
    assert t in ("string", "number", "boolean", "null"), f"unexpected type {t}"
assert ui["data"]["user"]["follower_count"] == "<NUMBER>"
assert ui["_observedTypes"]["follower_count"] == "number"
print("  ok  representation is a redaction string; provider type recorded as metadata")
PY

echo "7/7 Negative control: mutating pagination evidence must FAIL the gate..."
python3 - "$FIXTURES/video-list.sanitized.json" <<'PY'
import json, sys, copy
v = json.load(open(sys.argv[1]))

def gate(fixture):
    p1, p2 = fixture["page1"], fixture["page2"]
    f1 = p1["response"]["data"]["itemFingerprints"]
    f2 = p2["response"]["data"]["itemFingerprints"]
    if not f1 or not f2: return False
    if set(f1) & set(f2): return False
    if p1["response"]["data"]["cursorFingerprint"] == p2["response"]["data"]["cursorFingerprint"]:
        return False
    if p2["request"]["cursorFingerprint"] != p1["response"]["data"]["cursorFingerprint"]:
        return False
    return True

assert gate(v) is True, "unmutated fixture should pass"

m1 = copy.deepcopy(v)
m1["page2"]["response"]["data"]["itemFingerprints"] = list(v["page1"]["response"]["data"]["itemFingerprints"])
assert gate(m1) is False, "overlap mutation NOT detected"

m2 = copy.deepcopy(v)
m2["page2"]["response"]["data"]["cursorFingerprint"] = v["page1"]["response"]["data"]["cursorFingerprint"]
assert gate(m2) is False, "identical-cursor mutation NOT detected"

m3 = copy.deepcopy(v)
m3["page2"]["response"]["data"]["itemFingerprints"] = []
assert gate(m3) is False, "empty-page mutation NOT detected"

print("  ok  3 mutations detected (overlap, identical cursor, empty page)")
PY

echo
echo "Display evidence validation passed."
