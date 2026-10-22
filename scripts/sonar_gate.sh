#!/usr/bin/env bash
#
# Sonar quality gate: a task is complete only when ZERO issues are open
# on SonarCloud (statuses OPEN or CONFIRMED).
#
# Usage:
#   scripts/sonar_gate.sh            check only (fast; uses last scan's state)
#   scripts/sonar_gate.sh --scan     scan first (runs the local scanner, waits
#                                    for server processing), then check
#
# Exit codes: 0 = gate passed, 1 = open issues remain, 2 = gate could not run
# (missing SONARQUBE_TOKEN or network). A gate that cannot run must never be
# silently treated as passed.
#
# Requires: SONARQUBE_TOKEN (never commit tokens; see scripts/run_sonar_locally.sh, gitignored)
#
# AI AGENTS: passing this gate means FIXING the flagged code. Transitioning
# issues to won't-fix / false-positive to make the count go zero requires an
# explicit human decision per issue - never do it as an agent to get green.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_KEY="BrunoO_offline-fitness"
TOKEN="${SONARQUBE_TOKEN:-}"
RUN_SCAN=false
[[ "${1:-}" == "--scan" ]] && RUN_SCAN=true
[[ "${1:-}" == "--help" || "${1:-}" == "-h" ]] && {
    sed -n '3,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 0
}

if [[ -z "$TOKEN" ]]; then
    echo "ERROR: SONARQUBE_TOKEN is required for the Sonar gate." >&2
    exit 2
fi

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

# --- optional scan, then wait for the server to finish processing it ---
if [[ "$RUN_SCAN" == "true" ]]; then
    echo -e "${YELLOW}Running local Sonar scan (~1-2 min)...${NC}"
    # The user's scanner script holds auth; run it from the project root.
    (cd "$PROJECT_ROOT" && bash scripts/run_sonar_locally.sh > /dev/null) \
        || { echo "ERROR: sonar-scanner failed; gate cannot evaluate." >&2; exit 2; }

    echo "Waiting for SonarCloud to process the analysis..."
    deadline=$((SECONDS + 240))
    while (( SECONDS < deadline )); do
        STATE=$(curl -s -u "$TOKEN:" \
            "https://sonarcloud.io/api/qualitygates/project_status?projectKey=${PROJECT_KEY}" \
            | jq -r '.projectStatus.status // "PENDING"')
        case "$STATE" in
            OK)     echo -e "${GREEN}Analysis processed (quality gate: OK).${NC}"; break ;;
            ERROR|WARN) echo -e "${YELLOW}Analysis processed (quality gate: ${STATE}).${NC}"; break ;;
            *)    sleep 10; echo "  ...still processing" ;;
        esac
    done
fi

# --- check: count OPEN/CONFIRMED issues via the API directly ---
TOTAL=$(curl -s -u "$TOKEN:" \
    "https://sonarcloud.io/api/issues/search?componentKeys=${PROJECT_KEY}&issueStatuses=OPEN,CONFIRMED&ps=100" \
    | jq -r '.total // empty')

if [[ -z "$TOTAL" ]]; then
    echo "ERROR: could not read issue count from SonarCloud." >&2
    exit 2
fi

if (( TOTAL == 0 )); then
    echo -e "${GREEN}✅ Sonar gate PASSED: 0 open issues (project is clean as you code).${NC}"
    exit 0
fi

echo -e "${RED}❌ Sonar gate FAILED: ${TOTAL} open issue(s).${NC}"
echo "Open issues by file (fix these; do NOT mark won't-fix as an agent):"
curl -s -u "$TOKEN:" \
    "https://sonarcloud.io/api/issues/search?componentKeys=${PROJECT_KEY}&issueStatuses=OPEN,CONFIRMED&ps=100" \
    | jq -r '.issues[] | "  \(.component | sub("^.*:"; "")):\(.line // "?") [\(.severity)] \(.rule) \(.message[0:80])"' | sort -u
echo "Details: https://sonarcloud.io/project/issues?id=${PROJECT_KEY}&issueStatuses=open"
exit 1
