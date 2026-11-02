#!/bin/sh
# Renders the app-link association files (ayni-spec CC-WEB-001, app APP-LINK-001) into the directory given as
# first argument, for the application identifier of the network:
#   APP_ID                      org.ayni.app | org.ayni.app.test | org.ayni.app.dev (iOS bundle id = Android package)
#   APPLE_TEAM_ID               the Apple developer team id
#   ANDROID_CERT_FINGERPRINTS   comma-separated SHA-256 fingerprints of the Android signing certificates
#                               (empty until the signing key exists: Android then verifies nothing, iOS still works)
# Both files are plain JSON; iOS reads apple-app-site-association without an extension as application/json.
set -eu
OUT="${1:?output directory}"
APP_ID="${APP_ID:-org.ayni.app}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
mkdir -p "$OUT/.well-known"
list_json() { printf '%s' "$1" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^$' | sed 's/.*/"&"/' | paste -sd, - ; }
FINGERPRINTS_JSON=$(list_json "${ANDROID_CERT_FINGERPRINTS:-}")
cat > "$OUT/.well-known/apple-app-site-association" <<JSON
{
  "applinks": {
    "details": [
      {
        "appIDs": ["${APPLE_TEAM_ID}.${APP_ID}"],
        "components": [
          { "/": "/app/*", "comment": "Ayni app links (AG-UI profile 3.1 section 10)" }
        ]
      }
    ]
  }
}
JSON
cat > "$OUT/.well-known/assetlinks.json" <<JSON
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "${APP_ID}",
      "sha256_cert_fingerprints": [${FINGERPRINTS_JSON}]
    }
  }
]
JSON
