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

echo "1/11 Fixtures parse and exist..."
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

echo "2/11 Pagination DERIVED from committed fingerprints (not from metadata)..."
python3 - "$FIXTURES/video-list.sanitized.json" <<'PY'
import json, sys
v = json.load(open(sys.argv[1]))
p1, p2 = v["page1"], v["page2"]
f1 = p1["evidence"]["itemFingerprints"]
f2 = p2["evidence"]["itemFingerprints"]

derived_p1 = len(f1)
derived_p2 = len(f2)
derived_overlap = len(set(f1) & set(f2))
derived_cursor_differs = p1["evidence"]["cursorFingerprint"] != p2["evidence"]["cursorFingerprint"]

print(f"  [derived]  page1 item count from fingerprints = {derived_p1}")
print(f"  [derived]  page2 item count from fingerprints = {derived_p2}")
print(f"  [derived]  cross-page fingerprint intersection = {derived_overlap}")
print(f"  [derived]  page1/page2 cursor fingerprints differ = {derived_cursor_differs}")

assert derived_p1 > 0, "page1 fingerprints empty — cannot substantiate the claim"
assert derived_p2 > 0, "page2 fingerprints empty — cannot substantiate the claim"
assert derived_overlap == 0, f"pages share {derived_overlap} items — cursor did not advance"
assert derived_cursor_differs, "cursor fingerprints identical — no advancement evidence"
assert p2["request"]["cursorFingerprint"] == p1["evidence"]["cursorFingerprint"], \
    "page2 was not requested with page1's cursor"
for pg in (p1, p2):
    assert pg["response"]["data"]["has_more"] is True, "has_more not true"
    assert pg["response"]["status"] == 200, "status not 200"
print("  [derived]  page2 used page1's cursor; has_more true on both")
PY

echo "3/11 max_count boundary (CONTRACT assertion, not a derived observation)..."
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

echo "4/11 Redaction: no synthetic zeros, no leaked identifiers/URLs..."
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

echo "5/11 Absent fields genuinely absent; no 0/null/empty substituted..."
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

echo "6/11 PROBE_VERIFIED count DERIVED from the classification source..."
python3 - "$FIXTURES/classification.json" "$DOC" <<'PY'
import json, re, sys
m = json.load(open(sys.argv[1]))
doc = open(sys.argv[2]).read()
pv = [c["id"] for c in m["claims"] if c["current"] == "PROBE_VERIFIED"]
derived = len(pv)
print(f"  [derived]  PROBE_VERIFIED rows in classification.json = {derived}  {pv}")

# The document must state the SAME number, and its matrix must have the same row count.
stated = re.findall(r"PROBE_VERIFIED count = \**(\d+)\**", doc)
assert stated, "document does not state a PROBE_VERIFIED count"
assert int(stated[0]) == derived, f"document says {stated[0]}, classification.json derives {derived}"
matrix_rows = len(re.findall(r"\*\*PROBE_VERIFIED\*\*", doc))
assert matrix_rows == derived, f"matrix has {matrix_rows} PROBE_VERIFIED rows, source has {derived}"
print(f"  [derived]  document count and matrix rows both = {derived}")
PY

echo "7/11 PROBE_VERIFIED rows must be fixture-backed (no unsupported promotions)..."
python3 - "$FIXTURES" "$FIXTURES/classification.json" <<'PY'
import json, os, sys
d, src_path = sys.argv[1], sys.argv[2]
m = json.load(open(src_path))

# Fixture-specific structural validators. Adding a PROBE_VERIFIED row whose
# fixture lacks one of these is a failure, not a silent pass.
def v_user_info(o):
    assert set(o["data"].keys()) == {"user"}, "user-info data shape"
    assert len(o["data"]["user"]) >= 7, "user-info field set too small"
    assert "_observedTypes" in o, "user-info missing type metadata"

def v_video_list(o):
    for pg in ("page1", "page2"):
        assert "evidence" in o[pg], f"{pg} missing evidence block"
        assert len(o[pg]["evidence"]["itemFingerprints"]) > 0, f"{pg} no fingerprints"
    f1 = o["page1"]["evidence"]["itemFingerprints"]
    f2 = o["page2"]["evidence"]["itemFingerprints"]
    assert len(set(f1) & set(f2)) == 0, "pages overlap"
    assert o["page1"]["evidence"]["cursorFingerprint"] != o["page2"]["evidence"]["cursorFingerprint"], "cursor unchanged"

def v_max_count(o):
    assert o["response"]["status"] == 400, "boundary not 400"
    assert set(o["response"]["error"].keys()) == {"code", "message", "log_id"}, "envelope shape"

def v_oauth_audit(o):
    acts = [e["action"] for e in o["authorizationLifecycle"]]
    assert "authorization_callback" in acts, "no callback event"
    assert o["connectionOutcome"]["status"] == "active", "connection not active"

VALIDATORS = {
    "user-info.sanitized.json": v_user_info,
    "video-list.sanitized.json": v_video_list,
    "max-count-boundary.sanitized.json": v_max_count,
    "oauth-audit.sanitized.json": v_oauth_audit,
}

problems = []
for c in m["claims"]:
    if c["current"] != "PROBE_VERIFIED":
        continue
    fx = c.get("fixture")
    if not fx:
        problems.append(f"{c['id']}: PROBE_VERIFIED with no fixture")
        continue
    path = os.path.join(d, fx)
    if not os.path.exists(path):
        problems.append(f"{c['id']}: fixture missing: {fx}")
        continue
    fn = VALIDATORS.get(fx)
    if fn is None:
        problems.append(f"{c['id']}: fixture {fx} has no structural validator")
        continue
    try:
        fn(json.load(open(path)))
    except AssertionError as e:
        problems.append(f"{c['id']}: fixture {fx} failed validation: {e}")

if problems:
    print("\n".join(problems), file=sys.stderr); sys.exit(1)
n = len([c for c in m["claims"] if c["current"] == "PROBE_VERIFIED"])
print(f"  ok  all {n} PROBE_VERIFIED rows are fixture-backed and pass fixture-specific validation")
print("  note: this enforces durable committed support, NOT cryptographic provider provenance")
PY

echo "8/11 Synthetic-field audit: provider response objects contain only observed members..."
python3 - "$FIXTURES" <<'PY'
import json, os, sys
d = sys.argv[1]
problems = []

vl = json.load(open(os.path.join(d, "video-list.sanitized.json")))
# TikTok's video/list response data contains exactly: videos, cursor, has_more.
ALLOWED = {"videos", "cursor", "has_more"}
for pg in ("page1", "page2"):
    actual = set(vl[pg]["response"]["data"].keys())
    extra = actual - ALLOWED
    if extra:
        problems.append(f"video-list {pg} response.data has non-provider members: {sorted(extra)}")
    # derived evidence must live in the sibling block, not the response
    assert "evidence" in vl[pg], f"{pg} missing evidence block for derived fields"

ui = json.load(open(os.path.join(d, "user-info.sanitized.json")))
if set(ui["data"].keys()) != {"user"}:
    problems.append(f"user-info data has unexpected members: {sorted(ui['data'].keys())}")
ALLOWED_USER = {"open_id","display_name","avatar_url","follower_count",
                "following_count","likes_count","video_count"}
extra_u = set(ui["data"]["user"].keys()) - ALLOWED_USER
if extra_u:
    problems.append(f"user-info user has non-provider members: {sorted(extra_u)}")

mc = json.load(open(os.path.join(d, "max-count-boundary.sanitized.json")))
if set(mc["response"].keys()) - {"status","error"}:
    problems.append(f"max-count response has unexpected members: {sorted(mc['response'].keys())}")

if problems:
    print("\n".join(problems), file=sys.stderr); sys.exit(1)
print("  ok  no synthetic members inside any provider response object")
PY

echo "9/11 OAuth audit fixture records durable lifecycle evidence without secrets..."
python3 - "$FIXTURES/oauth-audit.sanitized.json" <<'PY'
import json, re, sys
t = open(sys.argv[1]).read()
a = json.loads(t)
# Must not carry credential material or provider identity.
for pat, label in [(r"https?://", "URL"), (r"\b[a-f0-9]{32,}\b", "long hex"),
                   (r"Bearer\s", "bearer"), (r"client_(?:secret|key)\s*[:=]\s*[\"']?[A-Za-z0-9_-]{6,}", "credential value")]:
    assert not re.search(pat, t), f"oauth-audit contains {label}"
actions = [e["action"] for e in a["authorizationLifecycle"]]
assert "authorization_callback" in actions, "no callback event recorded"
cb = next(e for e in a["authorizationLifecycle"] if e["action"] == "authorization_callback")
assert cb["outcome"] == "success", f"callback outcome is {cb['outcome']}; no durable lifecycle evidence of a completed callback"
conn = a["connectionOutcome"]
assert conn["status"] == "active", "connection not active"
assert set(conn["scopes"]) == {"user.info.basic","user.info.stats","video.list"}, "scope set mismatch"
assert a.get("_limitation"), "oauth-audit must state its own limitation"
print("  ok  durable lifecycle evidence present (callback success, active connection, scopes); "
      "no secrets; fixture states its own limitation")
PY

echo "10/11 Type semantics: representation type and observed provider type are distinct..."
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

echo "11/11 Negative control: mutating pagination evidence must FAIL the gate..."
python3 - "$FIXTURES/video-list.sanitized.json" <<'PY'
import json, sys, copy
v = json.load(open(sys.argv[1]))

def gate(fixture):
    p1, p2 = fixture["page1"], fixture["page2"]
    f1 = p1["evidence"]["itemFingerprints"]
    f2 = p2["evidence"]["itemFingerprints"]
    if not f1 or not f2: return False
    if set(f1) & set(f2): return False
    if p1["evidence"]["cursorFingerprint"] == p2["evidence"]["cursorFingerprint"]:
        return False
    if p2["request"]["cursorFingerprint"] != p1["evidence"]["cursorFingerprint"]:
        return False
    return True

assert gate(v) is True, "unmutated fixture should pass"

m1 = copy.deepcopy(v)
m1["page2"]["evidence"]["itemFingerprints"] = list(v["page1"]["evidence"]["itemFingerprints"])
assert gate(m1) is False, "overlap mutation NOT detected"

m2 = copy.deepcopy(v)
m2["page2"]["evidence"]["cursorFingerprint"] = v["page1"]["evidence"]["cursorFingerprint"]
assert gate(m2) is False, "identical-cursor mutation NOT detected"

m3 = copy.deepcopy(v)
m3["page2"]["evidence"]["itemFingerprints"] = []
assert gate(m3) is False, "empty-page mutation NOT detected"

print("  ok  3 mutations detected (overlap, identical cursor, empty page)")
PY

echo
echo "Display evidence validation passed."
