# Deashot Jenkins + Kubernetes — DUMMY CREDENTIALS TEMPLATE
#
# This file is a TEMPLATE of all the secrets the Jenkins pipeline and the
# Kubernetes manifests expect. Every value here is a DUMMY / placeholder —
# do NOT use these for anything real. Fill in real values in production and
# store them in Jenkins credentials + a Kubernetes Secret, never in git.
#
# =============================================================================
# 1) Jenkins credentials (Credentials > System > Global credentials > Add)
# =============================================================================
#
# a) Docker registry login
#    Kind: Username with password
#    ID:   deashot-registry
#    Username: your-docker-username        <- RUN YOUR OWN
#    Password: your-docker-password        <- RUN YOUR OWN
#
# b) Kubernetes kubeconfig
#    Kind: Secret file
#    ID:   deashot-kubeconfig
#    File: the kubeconfig of your cluster  <- RUN YOUR OWN
#
# =============================================================================
# 2) Kubernetes Secret — NOT committed to git
# =============================================================================
#
# There is no k8s/base/secrets.yaml with values. The `deashot-secrets` Secret
# and `deashot-config` ConfigMap are created ON THE VM by scripts/setup-secrets.sh
# from a gitignored `.env` (copy `.env.example.k8s` → `.env`, fill values).
#
# JWT_SECRET         -> openssl rand -hex 32
# POSTGRES_PASSWORD  -> openssl rand -hex 24
# REDIS_URL          -> redis://redis-service:6379
# ALLOWED_ORIGINS    -> http://your-public-host
# SENTRY_DSN         -> (empty)
#
# Generate real replacement values locally:
#   openssl rand -hex 32     # -> JWT_SECRET
#   openssl rand -hex 24     # -> POSTGRES_PASSWORD
#
# =============================================================================
# 2b) GitHub Actions Secrets (repo Settings > Secrets) — for auto-deploy
# =============================================================================
# REGISTRY, DOCKER_REPO, REGISTRY_USERNAME, REGISTRY_PASSWORD
# VM_HOST, VM_USER, VM_SSH_KEY, VITE_SERVER_URL
#
# =============================================================================
# 3) Deashot app env (only needed for the legacy docker-compose path)
# =============================================================================
#
# JWT_SECRET=REPLACE_ME
# POSTGRES_USER=deashot
# POSTGRES_PASSWORD=REPLACE_ME
# POSTGRES_DB=deashot
#
# =============================================================================
# 4) VM / Jenkins server details (you will supply these next)
# =============================================================================
#
# VM_IP            -> the public IP of your VM
# VM_USER          -> the SSH user
# KUBE_CONTEXT     -> the name of the kube config context targeting your VM cluster
# PUBLIC_HOST      -> the DNS name / IP players will use (VITE_SERVER_URL)
