#!/bin/sh
# Renders config.json next to the bundle from the container environment (UI-PLAT-004). Sourced by the
# nginx entrypoint before its envsubst step, so the exports below reach the server template.
HTML=/usr/share/nginx/html
list_json() { printf '%s' "$1" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^$' | sed 's/.*/"&"/' | paste -sd, - ; }
LOCALES_JSON=$(list_json "${LOCALES:-en,es,fr,pt}")
ORIGINS_JSON=$(list_json "${ALLOWED_AGENT_ORIGINS:-}")
cat > "$HTML/config.json" <<JSON
{
  "publicUrl": "${PUBLIC_URL:-}",
  "defaultAgent": "${DEFAULT_AGENT:-}",
  "singleAgent": ${SINGLE_AGENT:-false},
  "trustPolicy": "${TRUST_POLICY:-refuse}",
  "trustRecheckIntervalSeconds": ${TRUST_RECHECK_INTERVAL_SECONDS:-900},
  "veranaIndexerUrl": "${VERANA_INDEXER_URL:-https://idx.devnet.verana.network}",
  "veranaGraphUrl": "${VERANA_GRAPH_URL:-https://graph.devnet.verana.network}",
  "didResolverUrl": "${DID_RESOLVER_URL:-}",
  "allowedAgentOrigins": [${ORIGINS_JSON}],
  "brandConfigUrl": "${BRAND_CONFIG_URL:-}",
  "locales": [${LOCALES_JSON}],
  "defaultLocale": "${DEFAULT_LOCALE:-}",
  "soundsEnabled": ${SOUNDS_ENABLED:-true},
  "installPromptEnabled": ${INSTALL_PROMPT_ENABLED:-true},
  "appStoreUrl": "${APP_STORE_URL:-}",
  "playStoreUrl": "${PLAY_STORE_URL:-}"
}
JSON
# the app-link association files for this network's app (CC-WEB-001)
sh /usr/local/bin/ayni-render-well-known.sh "$HTML"
# the CSP connect-src gets the configured agent origins (the browser adds nothing at runtime)
export ALLOWED_AGENT_ORIGINS_CSP="$(printf '%s' "${ALLOWED_AGENT_ORIGINS:-}" | tr ',' ' ')"
export PORT="${PORT:-8080}"
