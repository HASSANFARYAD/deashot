# Deashot — Jenkins + Kubernetes Deployment on a VM

Deploy Deashot with **Jenkins (CI/CD) + Kubernetes (runtime)** instead of the
docker-compose path. Jenkins builds the images, then applies the k8s manifests
to a cluster running on your VM.

> All credentials in this setup are **DUMMY** placeholders on purpose. Fill in
> real values before you go live. See `jenkins/dummy-credentials.md`.

## Repository layout

```
Jenkinsfile                       # full CI/CD pipeline
jenkins/
  configure-jenkins-credentials.sh
  dummy-credentials.md
k8s/
  base/                           # shared manifests (namespace, config, secrets, postgres, redis, api, game-server, web, ingress)
  overlays/
    staging/                      # dev overlay (1 replica each, staging host)
    production/                   # prod overlay (real secrets, prod host)
scripts/
  deploy-to-vm.sh                 # apply manifests to your VM cluster
```

## Architecture

```
Jenkins (CI) --(docker build+push)--> Registry --(kubectl apply)--> VM cluster
                                                                     |
                                                          ┌──────────┴──────────┐
                                                          │ k8s (kubeadm/k3s)  │
                                                          │ - web (nginx SPA)  │
                                                          │ - api (Fastify)    │
                                                          │ - game-server      │
                                                          │   (Colyseus/ws)    │
                                                          │ - postgres         │
                                                          │ - redis            │
                                                          └────────────────────┘
```

`web` is the only externally reachable service; `api` and `game-server` are
ClusterIP and reachable only inside the cluster. The ingress routes
`/api` → api, `/ws` → game-server (WebSocket upgrade), `/` → web.

## 1. Prerequisites

- A VM (Ubuntu 22.04 recommended) that will host the Kubernetes cluster.
- On the VM: `kubectl`, `kustomize`, `docker`, and a running cluster
  (kubeadm or k3s). For a single node, `k3s` is simplest:
  ```bash
  curl -sfL https://get.k3s.io | sh -
  ```
- On the Jenkins server: `Jenkins LTS`, `docker`, recommended plugin set, plus
  the **Pipeline**, **Git**, **Credentials Binding**, and **Kubernetes CLI**
  plugins.

## 2. Node / pnpm on the Jenkins agent

The pipeline installs Node 22 and pnpm 11.9 itself, so no preinstalled
toolchain is required.

## 3. Create Jenkins credentials (dummy first, real later)

The `Jenkinsfile` references two credentials by ID:

| ID | Kind | Purpose |
|---|---|---|
| `deashot-registry` | Username with password | Docker registry login |
| `deashot-kubeconfig` | Secret file | kubeconfig pointing at your VM cluster |

Set them via the UI (Manage Jenkins > Credentials) or run the helper:

```bash
REGISTRY_USER=dockerdummy \
REGISTRY_PASS=dockerdummy \
KUBECONFIG_PATH=~/.kube/config \
./jenkins/configure-jenkins-credentials.sh
```

(Everything is dummy by default — swap in real values later.)

## 4. Create the Jenkins job

1. **New Item** → **Pipeline** → name it `deashot`.
2. **Pipeline** → **Pipeline script from SCM**.
3. Set the repo URL, branch `main`, Script Path `Jenkinsfile`.
4. Save and **Build Now** — use the `SKIP_DEPLOY=true` parameter the first time
   to validate CI (install/lint/build/test) without touching the cluster.

## 5. Apply manifests to the VM (first manual deploy)

From the Jenkins agent (or your machine with a kubeconfig for the VM):

```bash
./scripts/deploy-to-vm.sh k8s/overlays/staging deashot
```

This builds the manifests with kustomize and `kubectl apply`s them, then waits
for rollouts. Verify:

```bash
kubectl -n deashot get pods -o wide
kubectl -n deashot get svc
```

If no ingress controller is configured yet, expose via NodePort:

```bash
kubectl -n deashot port-forward svc/web-service 8080:80
# then open http://<VM_IP>:8080
```

## 6. Set real secrets before production

No secrets belong in git. Real values come from two places:

- **The VM's gitignored `.env`** (source of the k8s Secret/ConfigMap). Copy
  `.env.example.k8s` → `.env` on the VM, fill it in, then:
  ```bash
  ./scripts/setup-secrets.sh
  ```
- **GitHub repo Secrets** (source of registry + VM SSH access for the automatic
  deploy workflow). Set these in Settings → Secrets and variables → Actions:
  `REGISTRY`, `DOCKER_REPO`, `REGISTRY_USERNAME`, `REGISTRY_PASSWORD`,
  `VM_HOST`, `VM_USER`, `VM_SSH_KEY`, `VITE_SERVER_URL`.

Generate real secrets:

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 24   # POSTGRES_PASSWORD
```

Deploy the production overlay:

```bash
./scripts/deploy-to-vm.sh k8s/overlays/production deashot
```

## Nginx vs. ingress note

The old `docker/nginx.conf` handled static SPA + reverse proxy + WebSocket
upgrade. In the k8s world the **nginx ingress controller** does that job. If
you prefer to keep a single nginx in front (e.g. for TLS with certbot), you can
serve the `web` Service through it and keep the `/ws` upgrade headers. The
default here uses the ingress path.

## Tearing down

```bash
kubectl delete -f <(kustomize build k8s/overlays/staging)
kubectl delete namespace deashot
```
