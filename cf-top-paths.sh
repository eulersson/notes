#!/usr/bin/env bash
# Top requested paths on a Cloudflare-proxied host, ranked by hit count.
#
# Reads credentials from env so secrets stay out of shell history:
#   export CF_API_TOKEN="cfat_..."      # token with Account Analytics: Read
#   export CF_ACCOUNT_ID="d0d74a30..."   # Cloudflare account ID
#
# If those vars are unset and ~/.env.secrets exists, it is auto-loaded.
#
# Usage:
#   cf-top-paths.sh [host] [days] [limit]
#     host  : default notes.ramn.dev
#     days  : default 30
#     limit : default 200 (max 10000)
#
# Examples:
#   ./cf-top-paths.sh
#   ./cf-top-paths.sh notes.ramn.dev 7 50
#   ./cf-top-paths.sh ramn.dev 90 1000

set -euo pipefail

host="${1:-notes.ramn.dev}"
days="${2:-30}"
limit="${3:-200}"

if [[ -z "${CF_API_TOKEN:-}" || -z "${CF_ACCOUNT_ID:-}" ]] && [[ -f "$HOME/.env.secrets" ]]; then
  set -a; source "$HOME/.env.secrets"; set +a
fi

if [[ -z "${CF_API_TOKEN:-}" || -z "${CF_ACCOUNT_ID:-}" ]]; then
  echo "error: CF_API_TOKEN and CF_ACCOUNT_ID must be set in the environment" >&2
  exit 1
fi

until=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
if date -u -v-1d +%s >/dev/null 2>&1; then
  since=$(date -u -v-"${days}"d +"%Y-%m-%dT00:00:00Z")  # macOS/BSD
else
  since=$(date -u -d "${days} days ago" +"%Y-%m-%dT00:00:00Z")  # GNU
fi

payload=$(cat <<JSON
{
  "query": "query(\$accountTag: String!, \$host: String!, \$since: Time!, \$until: Time!, \$limit: Int!) { viewer { accounts(filter: {accountTag: \$accountTag}) { httpRequestsAdaptiveGroups(limit: \$limit, filter: {datetime_geq: \$since, datetime_leq: \$until, clientRequestHTTPHost: \$host, edgeResponseStatus: 200}, orderBy: [count_DESC]) { count dimensions { clientRequestPath } } } } }",
  "variables": {
    "accountTag": "${CF_ACCOUNT_ID}",
    "host": "${host}",
    "since": "${since}",
    "until": "${until}",
    "limit": ${limit}
  }
}
JSON
)

curl -sS -X POST https://api.cloudflare.com/client/v4/graphql \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "$payload" \
| python3 -c '
import json, sys
d = json.load(sys.stdin)
if d.get("errors"):
    print("error:", json.dumps(d["errors"], indent=2), file=sys.stderr); sys.exit(1)
rows = d["data"]["viewer"]["accounts"][0]["httpRequestsAdaptiveGroups"]
print("%7s  %s" % ("Hits", "Path"))
print("-" * 80)
for r in rows:
    print("%7d  %s" % (r["count"], r["dimensions"]["clientRequestPath"]))
print("# %d paths returned" % len(rows), file=sys.stderr)
'
