#!/usr/bin/env bash
#
# setup-secrets.sh
#
# Creates the Deashot Kubernetes Secret + ConfigMap on the cluster from
# environment values (read from a gitignored .env file on the VM). This way
# NO real secrets ever live in the git repository.
#
# USAGE (on the VM):
#   1. cp .env.example.k8s .env        (gitignored)
#   2. edit .env and set real values   (openssl rand -hex 32 for JWT_SECRET)
#   3. ./scripts/setup-secrets.sh
#
# The script reads every DEASHOT_* var from .env and injects them into the
# Kubernetes Secret `deashot-secrets` and ConfigMap `deashot-config`.

set -euo pipefail

NAMESPACE="${NAMESPACE:-deashot}"
ENV_FILE="${ENV_FILE:-.env}"
KUBECTL="${KUBECTL:-kubectl}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Create it first (see .env.example.k8s)." >&2
  exit 1
fi

echo "==> Ensuring namespace '${NAMESPACE}'"
$KUBECTL create namespace "$NAMESPACE" --dry-run=client -o yaml | $KUBECTL apply -f - >/dev/null

# ---- Build Secret from DEASHOT_SECRET_* vars ----
echo "==> Building Secret 'deashot-secrets' from DEASHOT_SECRET_* vars"
SECRET_KEYS=()
SECRET_VALS=()
while IFS='=' read -r key value; do
  case "$key" in
    DEASHOT_SECRET_*)
      k="${key#DEASHOT_SECRET_}"
      SECRET_KEYS+=("$k")
      SECRET_VALS+=("$(printf '%s' "$value" | tr -d '\r')")
      ;;
  esac
done < "$ENV_FILE"

if [[ ${#SECRET_KEYS[@]} -eq 0 ]]; then
  echo "WARN: no DEASHOT_SECRET_* vars found in $ENV_FILE"
fi

$KUBECTL -n "$NAMESPACE" create secret generic deashot-secrets \
  --dry-run=client -o yaml \
  ${SECRET_KEYS[@]+$(for i in "${!SECRET_KEYS[@]}"; do echo "--from-literal=${SECRET_KEYS[$i]}=${SECRET_VALS[$i]}"; done)} \
  | $KUBECTL apply -f - >/dev/null

# ---- Build ConfigMap from DEASHOT_CONFIG_* vars ----
echo "==> Building ConfigMap 'deashot-config' from DEASHOT_CONFIG_* vars"
CONFIG_KEYS=()
CONFIG_VALS=()
while IFS='=' read -r key value; do
  case "$key" in
    DEASHOT_CONFIG_*)
      k="${key#DEASHOT_CONFIG_}"
      CONFIG_KEYS+=("$k")
      CONFIG_VALS+=("$(printf '%s' "$value" | tr -d '\r')")
      ;;
  esac
done < "$ENV_FILE"

if [[ ${#CONFIG_KEYS[@]} -eq 0 ]]; then
  echo "WARN: no DEASHOT_CONFIG_* vars found in $ENV_FILE"
fi

$KUBECTL -n "$NAMESPACE" create configmap deashot-config \
  --dry-run=client -o yaml \
  ${CONFIG_KEYS[@]+$(for i in "${!CONFIG_KEYS[@]}"; do echo "--from-literal=${CONFIG_KEYS[$i]}=${CONFIG_VALS[$i]}"; done)} \
  | $KUBECTL apply -f - >/dev/null

echo "==> Done. Verify with:"
echo "    kubectl -n $NAMESPACE get secret deashot-secrets"
echo "    kubectl -n $NAMESPACE get configmap deashot-config"

# ---- Docker registry imagePullSecret ----
# ALWAYS create `deashot-registry-cred` (the Deployments reference it by name).
# With DEASHOT_REGISTRY set, real auth is used. With no registry, an empty
# dockerconfigjson is created — harmless and keeps base manifests deployable.
REGISTRY="${DEASHOT_REGISTRY:-}"
REG_USER="${DEASHOT_REGISTRY_USERNAME:-}"
REG_PASS="${DEASHOT_REGISTRY_PASSWORD:-}"

echo "==> Creating imagePullSecret 'deashot-registry-cred'${REGISTRY:+ for $REGISTRY}"
if [[ -n "$REGISTRY" ]]; then
  if [[ -n "$REG_USER" ]]; then
    $KUBECTL -n "$NAMESPACE" create secret docker-registry deashot-registry-cred \
      --docker-server="$REGISTRY" \
      --docker-username="$REG_USER" \
      --docker-password="$REG_PASS" \
      --dry-run=client -o yaml | $KUBECTL apply -f - >/dev/null
  else
    # Anonymous registry: empty-cred dockerconfigjson.
    AUTH=$(printf '%s' "$REG_USER:$REG_PASS" | base64)
    JQ="{\"auths\":{\"$REGISTRY\":{\"username\":\"$REG_USER\",\"password\":\"$REG_PASS\",\"auth\":\"$AUTH\"}}}"
    B64=$(printf '%s' "$JQ" | base64)
    printf 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: deashot-registry-cred\n  namespace: %s\ntype: kubernetes.io/dockerconfigjson\ndata:\n  .dockerconfigjson: %s\n' "$NAMESPACE" "$B64" |
      $KUBECTL apply -f - >/dev/null
  fi
else
  # No registry configured (local image model): empty dockerconfigjson so the
  # referenced imagePullSecret always exists.
  printf 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: deashot-registry-cred\n  namespace: %s\ntype: kubernetes.io/dockerconfigjson\ndata:\n  .dockerconfigjson: %s\n' "$NAMESPACE" "$(printf '{"auths":{}}' | base64)" |
    $KUBECTL apply -f - >/dev/null
fi
echo "    imagePullSecret 'deashot-registry-cred' ready."
