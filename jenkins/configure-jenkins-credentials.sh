#!/usr/bin/env bash
#
# configure-jenkins-credentials.sh
#
# Idempotently creates the Jenkins credentials (as secrets) that the Deashot
# Jenkinsfile needs. Uses the Jenkins CLI / groovy script console over HTTP.
#
# USAGE (run ON the Jenkins server, or anywhere with network access to it):
#   JENKINS_URL=http://localhost:8080 \
#   JENKINS_USER=admin \
#   JENKINS_API_TOKEN=your-api-token \
#   REGISTRY_USER=dockerdummy \
#   REGISTRY_PASS=dockerdummy \
#   KUBECONFIG_PATH=/path/to/kubeconfig \
#   ./jenkins/configure-jenkins-credentials.sh
#
# Everything is DUMMY by default — replace via env before running.

set -euo pipefail

JENKINS_URL="${JENKINS_URL:-http://localhost:8080}"
JENKINS_USER="${JENKINS_USER:-admin}"
JENKINS_API_TOKEN="${JENKINS_API_TOKEN:-dummy-api-token}"

REGISTRY_USER="${REGISTRY_USER:-dockerdummy}"
REGISTRY_PASS="${REGISTRY_PASS:-dockerdummy}"
KUBECONFIG_PATH="${KUBECONFIG_PATH:-/tmp/dummy-kubeconfig}"

AUTH=$(printf '%s:%s' "$JENKINS_USER" "$JENKINS_API_TOKEN" | base64 -w0)
BASE="$(dirname "$(realpath "$0")")"

echo "==> Creating dummy registry credential (deashot-registry)"
curl -sS -X POST \
  -H "Authorization: Basic $AUTH" \
  --data-urlencode "json={
    \"\": \"0\",
    \"credentials\": {
      \"scope\": \"GLOBAL\",
      \"id\": \"deashot-registry\",
      \"username\": \"$REGISTRY_USER\",
      \"password\": \"$REGISTRY_PASS\",
      \"description\": \"Dummy Docker registry credentials for deashot\",
      \"stapler-class\": \"com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl\"
    }
  }" \
  "$JENKINS_URL/credentials/store/system/domain/_/createCredentials" || true

echo "==> Creating dummy kubeconfig credential (deashot-kubeconfig)"
# Build a minimal secret-file credential payload
cat > /tmp/kubecred.json <<EOF
{
  "credentials": {
    "scope": "GLOBAL",
    "id": "deashot-kubeconfig",
    "file": "$KUBECONFIG_PATH",
    "description": "Dummy kubeconfig for deashot cluster",
    "stapler-class": "org.jenkinsci.plugins.plaincredentials.impl.FileCredentialsImpl"
  }
}
EOF
curl -sS -X POST \
  -H "Authorization: Basic $AUTH" \
  -F "json={\"credentials\": {\"scope\": \"GLOBAL\", \"id\": \"deashot-kubeconfig\", \"description\": \"Dummy kubeconfig for deashot cluster\", \"stapler-class\": \"org.jenkinsci.plugins.plaincredentials.impl.FileCredentialsImpl\", \"secretBytes\": \"$(base64 -w0 < /dev/zero | head -c 0)\"}}" \
  "$JENKINS_URL/credentials/store/system/domain/_/createCredentials" || true

# The file credential requires the SecretBytes; simpler and more reliable:
# create it via the Jenkins script console instead.
echo ""
echo "==> Creating kubeconfig as a Secret text via script console"
SECRET_BYTES=$(base64 -w0 "$KUBECONFIG_PATH")
curl -sS -X POST \
  -H "Authorization: Basic $AUTH" \
  --data-urlencode "script=
    import org.jenkinsci.plugins.plaincredentials.impl.*
    import com.cloudbees.plugins.credentials.*
    import com.cloudbees.plugins.credentials.domains.*
    def creds = CredentialsProvider.lookupCredentials(FileCredentialsImpl, Jenkins.instance, null, null)
    def dummy = new FileCredentialsImpl(
      CredentialsScope.GLOBAL, 'deashot-kubeconfig', 'Dummy kubeconfig for deashot',
      org.apache.commons.codec.binary.Base64.decodeBase64('$SECRET_BYTES'))
    def store = Jenkins.instance.getExtensionList(CredentialsProvider)[0].getStore(Jenkins.instance)
    (store as com.cloudbees.plugins.credentials.SystemCredentialsProvider.StoreImpl).addCredentials(Domain.global(), dummy)
    println 'OK'
  " \
  "$JENKINS_URL/scriptText"

echo ""
echo "==> Done. Verify in Jenkins UI: Manage Jenkins > Credentials > deashot-registry, deashot-kubeconfig"
