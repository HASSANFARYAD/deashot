# Deashot — Full Deployment Guide (Jenkins + Kubernetes on a VM)

This is the **complete, step-by-step** guide to deploying the Deashot FPS on a
Virtual Machine using **Jenkins** (build/test/CI) and **Kubernetes** (runtime
deployment). It covers everything from scratch: what to install on the VM, how
to configure Jenkins, how to push the app to Kubernetes, and finally how
end-users play the game.

> **Important:** This guide ships with **DUMMY credentials** everywhere. Replace
> every `DUMMY`, `REPLACE_ME`, and `YOUR...` value with real ones before going
> to production. See `jenkins/dummy-credentials.md`.

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [What you need before you start](#2-what-you-need-before-you-start)
3. [Setup the VM (what to install)](#3-setup-the-vm-what-to-install)
4. [Install Jenkins](#4-install-jenkins)
5. [Configure Jenkins (plugins + credentials)](#5-configure-jenkins-plugins--credentials)
6. [Set up the Kubernetes cluster on the VM](#6-set-up-the-kubernetes-cluster-on-the-vm)
7. [Install Kubernetes tooling (kubectl, kustomize, ingress)](#7-install-kubernetes-tooling-kubectl-kustomize-ingress)
8. [Create the Jenkins pipeline job](#8-create-the-jenkins-pipeline-job)
9. [Run the pipeline](#9-run-the-pipeline)
10. [Manual first deploy (in case you skip Jenkins)](#10-manual-first-deploy-in-case-you-skip-jenkins)
11. [Verify everything is running](#11-verify-everything-is-running)
12. [Set real secrets before production](#12-set-real-secrets-before-production)
13. [How end-users use the application](#13-how-end-users-use-the-application)
14. [How developers/ops maintain the app](#14-how-developersops-maintain-the-app)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Architecture overview

```
  Developer pushes to Git (GitHub/GitLab)
        │
        ▼
┌─────────────────┐   Jenkins: install → lint → typecheck → build → unit test
│   Jenkins CI/CD │──────────────────────────────────────────────┐
└─────────────────┘   then docker build & push images            │
        │                                                       │
        ▼                       images                          ▼
┌─────────────────┐      ┌──────────────────┐   ┌──────────────────────────┐
│ Docker registry │◄─────│  Jenkins agent   │──▶│     VM Kubernetes cluster │
└─────────────────┘      └──────────────────┘   │  kubectl apply (kustomize)│
                                                ├──────────────────────────┤
                                                │  web  (static web + API/  │
                                                │        WebSocket proxy)    │
                                                │  api  (Fastify REST)       │
                                                │  game-server (Colyseus)    │
                                                │  postgres (profiles)       │
                                                │  redis (presence)          │
                                                └──────────────────────────┘
```

- **`web`** is the only service exposed to the user (port 80). It serves the
  game client and proxies `/api` → api and `/ws` (WebSocket) → game-server.
- `api`, `game-server`, `postgres`, `redis` are internal (ClusterIP) and only
  reachable inside the cluster.

---

## 1.5 What happens when you commit (the workflow in one paragraph)

You **commit → push to GitHub**. Two things fire automatically:

1. **GitHub Actions `ci.yml`** — install → lint → typecheck → build → unit +
   integration tests, and a `docker-build` job that builds (but does not push)
   the images. This is your safety net: if it goes red, stop and check.
2. **GitHub Actions `deploy.yml`** — once you have set the GitHub Secrets and
   the VM is prepared (sections 4–12), every push to `main` builds the three
   images with your registry + `VITE_SERVER_URL`, **pushes** them, SSHes into
   the VM, injects the secrets from the VM's gitignored `.env`, rewrites the
   image tags, and `kubectl apply`s + waits for rollout.

So the **one-time** setup you do manually:
- Prepare the VM (install Jenkins, k3s, kubectl, kustomize).
- Create the Jenkins credentials and job (if you also want the Jenkins path).
- Create the GitHub repo Secrets (registry + VM SSH + URL).
- Create the VM's `.env` from `.env.example.k8s` once, with real values.

After that, you **never touch the VM again** for day-to-day deploys — every
push deploys itself. You only go back to the VM to change non-code config
(e.g. bump resources) or real secrets.

> In the "Both" setup the GitHub Actions `deploy.yml` is the primary auto-deploy
> path; **Jenkins** is the alternative/secondary pipeline that you can also bang
> manually (`SKIP_DEPLOY=false`) to deploy the same manifests. Either way the
> k8s Secret/ConfigMap come from the VM `.env` via `setup-secrets.sh` — never
> from git, so credentials are never committed.

---

## 2. What you need before you start

- **A VM** with at least **2 vCPU, 4 GB RAM, 30 GB disk** (Ubuntu 22.04 LTS
  recommended). A single-node cluster is fine for testing.
- **A Git repository** hosting this code (GitHub/GitLab/Bitbucket).
- **A Docker registry** — Docker Hub, a private registry, or the built-in one
  on your VM (e.g. `localhost:5000`).
- **SSH access** to the VM.
- Computer / thumb-drive not needed — everything is done on the VM or Jenkins.

Decide the **network layout** you'll use:

- **Option A (recommended for beginners):** expose via **NodePort + port-forward**
  and open `http://<VM_IP>:<port>`.
- **Option B (recommended for production):** install the **nginx ingress
  controller** and point a real DNS name at the VM.

We cover both below.

---

## 3. Setup the VM (what to install)

### 3.1 Update the system

```bash
sudo apt update && sudo apt upgrade -y
sudo reboot
```

### 3.2 Install base packages

```bash
sudo apt install -y curl wget git vim htop net-tools ufw openssl ca-certificates
```

### 3.3 Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker            # or re-login
docker --version         # verify
# Enable docker so it starts on boot
sudo systemctl enable docker
sudo systemctl start docker
```

### 3.4 Disable swap (required by Kubernetes)

```bash
sudo swapoff -a
# make it permanent: comment out any swap line in /etc/fstab
sudo sed -i '/ swap / s/^/#/' /etc/fstab
```

### 3.5 Load kernel modules & set sysctl (required by Kubernetes)

```bash
sudo modprobe overlay
sudo modprobe br_netfilter

cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF

cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.ipv4.ip_forward                 = 1
net.bridge.bridge-nf-call-ip6tables = 1
EOF

sudo sysctl --system
```

### 3.6 Install a container runtime interface (CRI)*

The container runtime has changed over time. For **containerd** (used by k3s and
most clusters):

```bash
sudo apt install -y containerd
```

> If you plan to use **k3s** (recommended for a single-node test VM), k3s bundles
> its own containerd automatically, so you can **skip steps 3.4–3.6** and go
> straight to section 6. k3s handles modules, sysctl, and CRI for you.

---

## 4. Install Jenkins

Jenkins runs on the VM (or a separate box). Here we install it on the VM.

### 4.1 Add the official Jenkins repository (Debian/Ubuntu)

```bash
curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key | sudo tee \
  /usr/share/keyrings/jenkins-keyring.asc > /dev/null

echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] \
  https://pkg.jenkins.io/debian-stable binary/" | sudo tee \
  /etc/apt/sources.list.d/jenkins.list > /dev/null

sudo apt update
```

### 4.2 Install Java (Jenkins requires Java 11, 17 or 21)

```bash
sudo apt install -y openjdk-17-jre
java -version
```

### 4.3 Install and start Jenkins

```bash
sudo apt install -y jenkins
sudo systemctl enable jenkins
sudo systemctl start jenkins
sudo systemctl status jenkins     # verify "active (running)"
```

### 4.4 Unlock Jenkins

```bash
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

Open `http://<VM_IP>:8080`, paste the password, then:
- Choose **Install suggested plugins**.
- Create your admin user (remember it).
- Set the Jenkins URL to `http://<VM_IP>:8080`.

### 4.5 Open the firewall for Jenkins + web

```bash
sudo ufw allow 8080/tcp     # Jenkins
sudo ufw allow 80/tcp       # web frontend
sudo ufw allow 22/tcp       # SSH (usually already open)
sudo ufw enable
```

---

## 5. Configure Jenkins (plugins + credentials)

### 5.1 Install required plugins

Go to **Manage Jenkins → Plugins → Available plugins** and install:

- **Pipeline** (usually included)
- **Git**
- **Docker Pipeline** / **Docker**
- **Credentials Binding**
- **Kubernetes CLI** (adds `kubectl` tool installer)
- **Timestamper** (nicer logs)
- **Workspace Cleanup**

### 5.2 Add Docker to the Jenkins user

So the Jenkins agent can run `docker`:

```bash
sudo usermod -aG docker jenkins
sudo systemctl restart jenkins
```

### 5.3 Make `kubectl`, `kustomize`, `git` available to Jenkins

The simplest robust approach is to give Jenkins direct access to the CLI tools:

```bash
# Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# Install kustomize
curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" | bash
sudo mv kustomize /usr/local/bin/

# Install Node + pnpm for building (the pipeline also auto-installs these)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
sudo npm install -g pnpm@11.9.0
```

Verify:

```bash
kubectl version --client
kustomize version
node -v
pnpm -v
```

### 5.4 Create Jenkins credentials (DUMMY)

Go to **Manage Jenkins → Credentials → System → Global credentials → Add**:

**Credential 1 — Docker registry login**
- Kind: **Username with password**
- ID: `deashot-registry`
- Username: `dockerdummy` *(replace later)*
- Password: `dockerdummy` *(replace later)*

**Credential 2 — Kubernetes kubeconfig**
- Kind: **Secret file**
- ID: `deashot-kubeconfig`
- File: upload your `~/.kube/config` *(create in section 6 first)*

> You can also run `jenkins/configure-jenkins-credentials.sh` to create these
> programmatically.

### 5.5 (Optional) Add Jenkins global env

Manage Jenkins → **System** → **Global properties** → **Environment variables**:

| Name | Value |
|---|---|
| `REGISTRY` | `localhost:5000` (or your registry) |
| `DOCKER_REPO` | `deashot` |

If you skip these, the `Jenkinsfile` defaults handle it — but the defaults may
not match your registry, so set them to be explicit.

---

## 6. Set up the Kubernetes cluster on the VM

### 6.1 Recommended: install k3s (single-node, simplest)

```bash
curl -sfL https://get.k3s.io | sh -
sudo chmod 644 /etc/rancher/k3s/k3s.yaml
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

kubectl get nodes   # should show your VM as Ready
```

> k3s bundles its own containerd, flannel networking, and a Traefik ingress
> controller. It also auto-installs `crictl`/`kubectl` management.

Copy the kubeconfig for Jenkins:

```bash
mkdir -p $HOME/.kube
cp /etc/rancher/k3s/k3s.yaml $HOME/.kube/config
```

### 6.2 Alternative: kubeadm (full control, more steps)

```bash
# Install kubeadm, kubelet, kubectl
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.31/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.31/deb/ /" | sudo tee /etc/apt/sources.list.d/kubernetes.list
sudo apt update
sudo apt install -y kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl

# Initialize cluster
sudo kubeadm init --pod-network-cidr=10.244.0.0/16

# Configure kubectl for your user
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

# Install a pod network (Flannel)
kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml

# Allow pods to schedule on the control-plane node (single node)
kubectl taint nodes --all node-role.kubernetes.io/control-plane-
```

Whichever you choose, confirm the node is Ready:

```bash
kubectl get nodes
```

---

## 7. Install Kubernetes tooling (kubectl, kustomize, ingress)

Installation for the local operator machine or the Jenkins box (covered in 5.3):
- `kubectl` — cluster command line
- `kustomize` — manifest templating

### 7.1 Enable an ingress controller

- **k3s** already ships **Traefik** as the default ingress controller — no step
  needed.
- **kubeadm** cluster: install nginx-ingress:

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.11.1/deploy/static/provider/baremetal/deploy.yaml
kubectl get pods -n ingress-nginx   # wait until running
```

### 7.2 (Optional) Fix the ingress host

Our manifests use host `deashot.local` / `staging.deashot.local`. Either:
- Add a DNS entry, **or**
- Test locally by adding to your local machine's `hosts` file:

```bash
# /etc/hosts  (Linux/Mac) or C:\Windows\System32\drivers\etc\hosts (Windows)
<VM_IP>  deashot.local
```

If you don't want to use a hostname at all, you can remove the `host` from the
ingress so it matches any host, or use NodePort (section 11).

---

## 8. Create the Jenkins pipeline job

1. On the Jenkins dashboard click **New Item**.
2. Name: `deashot`, type: **Pipeline**, click OK.
3. Scroll to the **Pipeline** section.
4. **Definition:** *Pipeline script from SCM*.
5. **SCM:** Git.
   - **Repository URL:** your repo URL (e.g. `https://github.com/yourorg/deashot.git`)
   - **Credentials:** (add your Git credentials if the repo is private)
   - **Branches to build:** `*/main`
   - **Script Path:** `Jenkinsfile`
6. **Save**.

The `Jenkinsfile` at the repo root already contains the full pipeline:
checkout → toolchain → install → lint/typecheck → build → unit tests → docker
build/push → deploy to k8s.

> **First run tip:** Before enabling auto-deploy, kick off the job with the
> `SKIP_DEPLOY=true` build parameter so it only validates build + tests against
> your VM. Afterwards, run it again with `SKIP_DEPLOY=false` to deploy.

---

## 9. Run the pipeline

### 9.1 Build parameters

On the job page click **Build with Parameters**:

| Parameter | Value | Notes |
|---|---|---|
| `BRANCH` | `main` | branch/tag to build |
| `GIT_URL` | your repo URL | |
| `KUBE_OVERLAY` | `k8s/overlays/staging` | or `k8s/overlays/production` |
| `SKIP_DEPLOY` | `false` | `true` = build/test only |

### 9.2 Start the build

- Click **Build**. Watch the stage view progress.
- The pipeline: checkout → setup → install → lint+typecheck → build → unit test
  → docker build & push → `kubectl apply` + rollout status.

### 9.3 Verify the deploy ran

The final `Deploy to Kubernetes` stage runs:

```bash
kustomize build k8s/overlays/staging > manifests.yaml
kubectl apply -f manifests.yaml
kubectl -n deashot rollout status deployment/api
kubectl -n deashot rollout status deployment/game-server
kubectl -n deashot rollout status deployment/web
```

---

## 10. Manual first deploy (in case you skip Jenkins)

On the VM (or the machine holding the kubeconfig), run the helper:

```bash
./scripts/deploy-to-vm.sh k8s/overlays/staging deashot
```

This builds the manifests with kustomize, applies them, and waits for the
rollouts to finish.

If you'd rather do it by hand:

```bash
kustomize build k8s/overlays/staging > /tmp/manifests.yaml
kubectl apply -f /tmp/manifests.yaml
kubectl -n deashot rollout status deployment/api --timeout=180s
kubectl -n deashot rollout status deployment/game-server --timeout=180s
kubectl -n deashot rollout status deployment/web --timeout=180s
```

---

## 11. Verify everything is running

```bash
# Check all pods in the deashot namespace
kubectl -n deashot get pods -o wide

# Check services
kubectl -n deashot get svc

# Live logs
kubectl -n deashot logs deployment/api -f
kubectl -n deashot logs deployment/game-server -f
kubectl -n deashot logs deployment/web -f
```

### 11.1 Expose it (choose one)

**Option A — NodePort + port-forward (simplest for testing):**

```bash
kubectl -n deashot port-forward svc/web-service 8080:80 &
open http://<VM_IP>:8080
```

**Option B — Via the ingress controller (production):**

If your ingress host is `deashot.local`, and you've added the hosts entry:

```bash
curl http://deashot.local/ping        # should return {"status":"ok"}
open http://deashot.local
```

If using the nginx-ingress with NodePort, find the port:

```bash
kubectl get svc -n ingress-nginx
# e.g. 10.102.x.x:80:32123/TCP → open http://<VM_IP>:32123
```

> If the page loads but the game can't connect, check the WebSocket route:
> `ws://<host>/ws` must reach game-server with TCP **upgrade** headers (already
> configured in the ingress annotations).

---

## 12. Set real secrets (never commit them)

Do **not** ship the dummy secrets, and never commit real ones. All secrets are
injected at deploy time from a gitignored `.env` on the VM and from GitHub
Secrets — the repo contains no real values.

### 12.1 Generate real secrets

```bash
openssl rand -hex 32     # → JWT_SECRET
openssl rand -hex 24     # → POSTGRES_PASSWORD
```

### 12.2 Prepare `.env` on the VM (gitignored, source of the k8s Secret)

Copy the template and fill it in **on the VM** (`/opt/deashot/.env`):

```bash
cp .env.example.k8s .env
# edit: DEASHOT_SECRET_JWT_SECRET, DEASHOT_SECRET_POSTGRES_PASSWORD,
#       DEASHOT_SECRET_ALLOWED_ORIGINS, DEASHOT_CONFIG_VITE_SERVER_URL, ...
```

Then inject into the cluster:

```bash
./scripts/setup-secrets.sh
```

This creates `deashot-secrets` (Secret) and `deashot-config` (ConfigMap) on the
cluster from those values. Every subsequent deploy runs this script first.

> The k8s base manifests do **not** contain `secrets.yaml`/`configmap.yaml`
> anymore — those resources are owned by `setup-secrets.sh`. That's what keeps
> real values out of git.

### 12.3 Update Jenkins credentials

- `deashot-registry` → real registry user + token.
- `deashot-kubeconfig` → real cluster kubeconfig.

### 12.4 GitHub Secrets (needed for the automatic GitHub Actions deploy)

Set these once in your repo: **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `REGISTRY` | your registry, e.g. `ghcr.io/you` |
| `DOCKER_REPO` | repo prefix, e.g. `yourname/deashot` |
| `REGISTRY_USERNAME` / `REGISTRY_PASSWORD` | registry login |
| `VM_HOST` / `VM_USER` / `VM_SSH_KEY` | VM SSH access for the deploy step |
| `VITE_SERVER_URL` | public WS URL players use, e.g. `ws://your-host/ws` |

(with `APP_NAMESPACE` and `KUBE_OVERLAY` optional.)

### 12.5 Re-deploy the production overlay

```bash
./scripts/deploy-to-vm.sh k8s/overlays/production deashot
```

---

## 13. How end-users use the application

Once deployed, players just open a browser:

1. **Open the URL** — `http://<host>` (e.g. `http://deashot.local` or
   `http://<VM_IP>:<port>`).
2. **Sign in / guest login** — the API issues a guest token automatically
   (username rules enforced by the API). Optionally set a profile.
3. **Click the canvas to lock the mouse** — the pointer locks and the game
   starts.
4. **Play** (Team Deathmatch):
   - **WASD** — move
   - **Mouse** — look
   - **Left click** — shoot (hold for auto-fire, 30-round mag, 600 RPM)
   - **Right click** — aim down sights (zoom, slows movement)
   - **R** — reload (2.1s; auto-reloads at 0)
   - **Space** — jump
   - **Esc** — unlock the pointer / pause overlay
5. **Objective** — two teams (blue/red), first to **50 kills** (or highest score
   after **10 minutes**) wins. Respawn after death. Watch the leaderboard /
   scoreboard in the HUD.

### 13.1 Controls reference (HUD)

| Control | Action |
|---|---|
| WASD / Space | Move / jump |
| Mouse | Look |
| Left click | Shoot (auto) |
| Right click | ADS zoom |
| R | Reload |
| Esc | Unlock pointer / pause |

### 13.2 What users see

- **Home page** — login/guest + join match.
- **Match** — 3D first-person arena, HUD (health, ammo, crosshair), minimap,
  scoreboard.
- **Match end screen** — winner + final scores.

---

## 14. How developers/ops maintain the app

### 14.1 Rolling updates

The web deployment uses 2 replicas by default — `kubectl rollout restart` or a
new Jenkins build rolls the pods without downtime.

```bash
kubectl -n deashot rollout restart deployment/web
kubectl -n deashot rollout status deployment/web
```

### 14.2 Scale

```bash
kubectl -n deashot scale deployment/web --replicas=3
kubectl -n deashot scale deployment/game-server --replicas=1
```

### 14.3 Add a new env var / config

Edit `k8s/base/configmap.yaml`, then re-apply. Pods pick it up on restart:

```bash
kubectl -n deashot apply -f k8s/base/configmap.yaml
kubectl -n deashot rollout restart deployment/api deployment/game-server deployment/web
```

### 14.4 Backups (Postgres)

```bash
kubectl -n deashot exec -it deploy/postgres -- pg_dump -U deashot deashot > backup.sql
```

Restore:

```bash
cat backup.sql | kubectl -n deashot exec -i deploy/postgres -- psql -U deashot deashot
```

### 14.5 Update the Docker images used by k8s

The k8s manifests reference images by **name** (`deashot-web`, `deashot-api`,
`deashot-game-server`). The deploy paths rewrite those to full
`registry/repo-service:tag` names via `kustomize edit set image`, so the repo
keeps only the bare names — no registry/cred in git. Registry auth for pulling
is handled by the `deashot-registry-cred` imagePullSecret created by
`scripts/setup-secrets.sh` from `.env`'s `DEASHOT_REGISTRY*` vars.

### 14.6 Logs & errors (Sentry optional)

- Console logs: `kubectl -n deashot logs -f deploy/<name>`.
- Errors: if `SENTRY_DSN` is set, exceptions are reported to Sentry.

---

## 15. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Jenkins shows "not found" / anonymous | Unlock + plugins not done | Finish 4.4 / 5.1 |
| Pipeline fails at `docker build` | Jenkins user not in `docker` group | `sudo usermod -aG docker jenkins; sudo systemctl restart jenkins` |
| `kubectl` not able to connect | Wrong/absent kubeconfig | Set `KUBECONFIG`, copy `~/.kube/config` into Jenkins secret |
| `CreateContainerConfigError` | Secret/ConfigMap missing (base doesn't ship them) | Run `./scripts/setup-secrets.sh` once on the VM |
| Pods stuck `Pending` | No registry image / imagePullPolicy / node not ready | `kubectl describe pod`, check node `Ready`, image name |
| `web` page loads but game won't connect | WebSocket route broken | Check `/ws` ingress uses upgrade headers; confirm game-server Service port 2567 |
| `api` restarting | DB not reachable / wrong DATABASE_URL | Check init container wait for postgres; check secret POSTGRES_PASSWORD |
| `CrashLoopBackOff` on game-server | Missing `JWT_SECRET` in production | App refuses to start without it in prod — set secret |
| `NODE_ENV=production` won't start | JWT_SECRET not set | Same as above |
| No ingress controller | kubeadm cluster has none | Apply nginx-ingress (7.1) |
| Ports blocked | UFW / cloud firewall | Allow 80, 8080, relevant NodePort |
| `app.kubernetes.io` label issues | Common identity fine | Usually cosmetic; verify `kubectl get all -n deashot` |

### Quick health checks

```bash
# All pods Ready? (1/1 Running)
kubectl -n deashot get pods

# Web liveness endpoint
curl http://<host>/ping

# API health
kubectl -n deashot exec -it deploy/web -- wget -qO- http://api-service:4000/health

# Game server health
kubectl -n deashot exec -it deploy/web -- wget -qO- http://game-server-service:2567/healthz
```

---

### Final checklist before going live

- [ ] VM updated, swap off, Docker + Node + pnpm installed.
- [ ] Jenkins installed, unlocked, plugins present.
- [ ] Kubernetes cluster on the VM is `Ready`.
- [ ] `deashot-registry` + `deashot-kubeconfig` credentials created in Jenkins.
- [ ] GitHub repo Secrets set: `REGISTRY`, `DOCKER_REPO`, `REGISTRY_USERNAME`,
      `REGISTRY_PASSWORD`, `VM_HOST`, `VM_USER`, `VM_SSH_KEY`, `VITE_SERVER_URL`.
- [ ] VM `.env` created from `.env.example.k8s` with real values; ran
      `./scripts/setup-secrets.sh` (k8s Secret/ConfigMap created).
- [ ] Jenkins pipeline job `deashot` created, first run passes with `SKIP_DEPLOY=true`.
- [ ] Deploy run with `SKIP_DEPLOY=false` succeeds.
- [ ] GitHub Actions `deploy.yml` green on a push to `main`.
- [ ] `web` reachable; `/ping` returns `{"status":"ok"}`.
- [ ] Real secrets set (JWT_SECRET, POSTGRES_PASSWORD, ALLOWED_ORIGINS).
- [ ] (Optional) Sentry DSN set for error tracking.
- [ ] Two players can connect and see each other (test `/ws`).

Good luck launching **Deashot**!
