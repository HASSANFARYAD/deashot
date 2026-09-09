#!/usr/bin/env bash
#
# deploy-to-vm.sh  — apply the Deashot k8s manifests to your VM cluster.
#
# Reads real values from env vars and a gitignored `.env` on the machine where
# it runs. Nothing real is hardcoded in this file — the defaults are DUMMY.
#
# Requires: kubectl + kustomize installed, a kubeconfig pointing at the
# cluster running ON the VM, and a `.env` prepared from `.env.example.k8s`.
#
# Usage:
#   ./scripts/deploy-to-vm.sh [overlay] [namespace]
#
# Env (optional, all have DUMMY defaults):
#   VM_IP         - public IP of the VM            (default 203.0.113.10)
#   VM_USER       - SSH user                       (default root)
#   KUBE_CONTEXT  - kube config context            (default deashot-vm)
#   REGISTRY      - registry to pull images from   (default localhost:5000)
#   DOCKER_REPO   - repo name prefix               (default deashot)
#   DOCKER_TAG    - image tag                      (default latest)

set -euo pipefail

# ---- DUMMY DEFAULTS — override via env ----
VM_IP="${VM_IP:-203.0.113.10}"
VM_USER="${VM_USER:-root}"
KUBE_CONTEXT="${KUBE_CONTEXT:-deashot-vm}"
REGISTRY="${REGISTRY:-localhost:5000}"
DOCKER_REPO="${DOCKER_REPO:-deashot}"
DOCKER_TAG="${DOCKER_TAG:-latest}"
ENV_FILE="${ENV_FILE:-.env}"
# ---------------------------------------------------

OVERLAY="${1:-k8s/overlays/staging}"
NAMESPACE="${2:-deashot}"

echo "==> Target: VM ${VM_IP} (${VM_USER}), context ${KUBE_CONTEXT}, overlay ${OVERLAY}"
echo "==> Images from ${REGISTRY}/${DOCKER_REPO} tag ${DOCKER_TAG}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "WARN: $ENV_FILE not found. Real secrets will NOT be injected."
  echo "  Copy .env.example.k8s to .env, fill in values, then run:"
  echo "  ./scripts/setup-secrets.sh"
fi

if ! kubectl config use-context "$KUBE_CONTEXT" >/dev/null 2>&1; then
  echo "WARN: context '${KUBE_CONTEXT}' not found locally."
  echo "  If kubeconfig lives on the VM, copy it here with:"
  echo "  scp ${VM_USER}@${VM_IP}:/etc/kubernetes/admin.conf ~/.kube/config"
fi

if [[ -f "$ENV_FILE" ]]; then
  echo "==> Injecting secrets + config from ${ENV_FILE}"
  ENV_FILE="$ENV_FILE" ./scripts/setup-secrets.sh
fi

echo "==> Building manifests with kustomize (temp copy of overlays)"
OVERLAY_NAME="${OVERLAY#k8s/overlays/}"
rm -rf /tmp/k8s-deploy
cp -r k8s /tmp/k8s-deploy
cd "/tmp/k8s-deploy/overlays/$OVERLAY_NAME"
kustomize edit set image \
  deashot-api="${REGISTRY}/${DOCKER_REPO}-api:${DOCKER_TAG}" \
  deashot-game-server="${REGISTRY}/${DOCKER_REPO}-game-server:${DOCKER_TAG}" \
  deashot-web="${REGISTRY}/${DOCKER_REPO}-web:${DOCKER_TAG}"
kustomize build . > /tmp/deashot-manifests.yaml
cd - >/dev/null

echo "==> Applying to namespace '${NAMESPACE}'"
kubectl apply -f /tmp/deashot-manifests.yaml

echo "==> Waiting for rollouts"
kubectl -n "$NAMESPACE" rollout status deployment/api --timeout=180s
kubectl -n "$NAMESPACE" rollout status deployment/game-server --timeout=180s
kubectl -n "$NAMESPACE" rollout status deployment/web --timeout=180s

echo "==> Pods"
kubectl -n "$NAMESPACE" get pods -o wide

echo "==> Done."
echo "  To enable externally (NodePort) on the VM you typically also run:"
echo "  kubectl -n ${NAMESPACE} port-forward svc/web-service 8080:80"