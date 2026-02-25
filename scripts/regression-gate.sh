#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Regression Gate Script
#
# Triggers the regression gate endpoint and exits non-zero if
# AI accuracy has regressed. Used in CI to block deployments.
#
# Required env vars:
#   REGRESSION_GATE_URL      — Full URL (e.g. https://app.example.com/api/evaluations/regression-gate)
#   REGRESSION_GATE_API_KEY  — API key for auth
#   REGRESSION_GATE_ORG_ID   — Organization ID to run against
#
# Optional env vars:
#   F1_DROP_THRESHOLD        — Max allowed F1 drop (default: 0.05)
#   MIN_F1                   — Absolute minimum F1 (default: 0.7)
#   GITHUB_SHA               — Commit SHA (auto-set in GitHub Actions)
#   GITHUB_REF_NAME          — Branch name (auto-set in GitHub Actions)
# ──────────────────────────────────────────────────────────────
set -euo pipefail

# Validate required vars
: "${REGRESSION_GATE_URL:?Missing REGRESSION_GATE_URL}"
: "${REGRESSION_GATE_API_KEY:?Missing REGRESSION_GATE_API_KEY}"
: "${REGRESSION_GATE_ORG_ID:?Missing REGRESSION_GATE_ORG_ID}"

F1_DROP_THRESHOLD="${F1_DROP_THRESHOLD:-0.05}"
MIN_F1="${MIN_F1:-0.7}"
COMMIT_SHA="${GITHUB_SHA:-unknown}"
BRANCH="${GITHUB_REF_NAME:-unknown}"

echo "╔══════════════════════════════════════════════╗"
echo "║         AI Regression Gate Check             ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Endpoint:       ${REGRESSION_GATE_URL}"
echo "  Organization:   ${REGRESSION_GATE_ORG_ID}"
echo "  Commit:         ${COMMIT_SHA}"
echo "  Branch:         ${BRANCH}"
echo "  F1 threshold:   ${F1_DROP_THRESHOLD}"
echo "  Min F1:         ${MIN_F1}"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${REGRESSION_GATE_URL}" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${REGRESSION_GATE_API_KEY}" \
  -H "x-org-id: ${REGRESSION_GATE_ORG_ID}" \
  -d "{
    \"triggered_by\": \"ci\",
    \"f1_drop_threshold\": ${F1_DROP_THRESHOLD},
    \"min_f1\": ${MIN_F1},
    \"commit_sha\": \"${COMMIT_SHA}\",
    \"branch\": \"${BRANCH}\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "── Response (HTTP ${HTTP_CODE}) ──"
echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Regression gate PASSED — deployment can proceed."
  exit 0
elif [ "$HTTP_CODE" = "422" ]; then
  echo "❌ Regression gate BLOCKED — accuracy regression detected!"
  echo ""
  echo "Block reasons:"
  echo "$BODY" | python3 -c "
import sys, json
data = json.load(sys.stdin)
reasons = data.get('data', {}).get('block_reasons', [])
for r in reasons:
    print(f'  - {r}')
" 2>/dev/null || true
  exit 1
else
  echo "⚠️  Unexpected response (HTTP ${HTTP_CODE})"
  exit 1
fi
