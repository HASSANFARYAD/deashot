/*
 * Deashot CI/CD pipeline for Jenkins.
 *
 * Pipeline stages:
 *   1. checkout            - pull the repo at the parameterized branch
 *   2. setup              - install the pinned Node/pnpm toolchain
 *   3. install            - pnpm install --frozen-lockfile
 *   4. lint & typecheck   - eslint + tsc across the monorepo
 *   5. build              - turbo build (all packages + apps)
 *   6. unit test          - vitest per workspace
 *   7. docker build       - build and tag deashot web/api/game-server images
 *   8. deploy             - [on a VPS] kubectl apply via kustomize
 *
 * Required Jenkins credentials (manage.jenkins.io > Credentials):
 *   - deashot-registry  : (Username with password) Docker Hub / registry login
 *   - deashot-git       : (Username with password) Git repo access
 *   - deashot-kubeconfig: (Secret file) kubeconfig file for the cluster
 *
 * All real values come from Jenkins environment / credentials — nothing
 * sensitive is hardcoded in this repo. Defaults here are DUMMY only.
 *
 * Required Jenkins global env (or job params):
 *   REGISTRY      - e.g. docker.io                     (dummy default: localhost:5000)
 *   DOCKER_REPO   - e.g. youruser/deashot              (dummy default: deashot)
 *   GIT_URL       - repository URL                     (set to your real URL)
 *   APP_NAMESPACE - k8s namespace                      (defaults to deashot)
 *   KUBE_OVERLAY  - kustomize overlay dir              (defaults to k8s/overlays/staging)
 */

pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20', daysToKeepStr: '30'))
  }

  parameters {
    string(name: 'BRANCH', defaultValue: 'main', description: 'Branch / tag to build & deploy')
    string(name: 'GIT_URL', defaultValue: "${env.GIT_URL ?: 'https://github.com/YOUR-ORG/deashot.git'}", description: 'Repository to clone (override above real URL)')
    string(name: 'KUBE_OVERLAY', defaultValue: 'k8s/overlays/staging', description: 'Kustomize overlay to deploy')
    booleanParam(name: 'SKIP_DEPLOY', defaultValue: false, description: 'Only build & test, do not deploy')
  }

  environment {
    NODE_VERSION   = '22'
    PNPM_VERSION   = '11.9.0'
    REGISTRY       = "${env.REGISTRY ?: 'localhost:5000'}"
    DOCKER_REPO    = "${env.DOCKER_REPO ?: 'deashot'}"
    APP_NAMESPACE  = "${env.APP_NAMESPACE ?: 'deashot'}"
    DOCKER_TAG     = "${env.BUILD_NUMBER}-${env.GIT_COMMIT ?: 'local'}"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout([
          $class: 'GitSCM',
          branches: [[name: "${params.BRANCH}"]],
          userRemoteConfigs: [[url: "${params.GIT_URL}"]],
          extensions: [[$class: 'CleanBeforeCheckout']]
        ])
      }
    }

    stage('Setup Toolchain') {
      steps {
        script {
          if (isUnix()) {
            sh 'curl -fsSL https://deb.nodesource.com/setup_22.x | bash -'
            sh 'apt-get update && apt-get install -y nodejs git curl'
          }
        }
        sh 'node -v'
        sh 'npm install -g pnpm@${PNPM_VERSION}'
        sh 'pnpm -v'
      }
    }

    stage('Install Dependencies') {
      steps {
        sh 'pnpm install --frozen-lockfile'
      }
    }

    stage('Lint & Typecheck') {
      parallel {
        stage('Lint') {
          steps { sh 'pnpm lint' }
        }
        stage('Typecheck') {
          steps { sh 'pnpm typecheck' }
        }
      }
    }

    stage('Build') {
      steps { sh 'pnpm build' }
    }

    stage('Unit Tests') {
      steps { sh 'pnpm test:unit' }
    }

    stage('Docker Build & Push') {
      when { expression { !params.SKIP_DEPLOY } }
      steps {
        script {
          withCredentials([
            usernamePassword(credentialsId: 'deashot-registry', usernameVariable: 'REG_USER', passwordVariable: 'REG_PASS')
          ]) {
            sh '''
              echo "$REG_PASS" | docker login "$REGISTRY" -u "$REG_USER" --password-stdin
              docker build -f apps/web/Dockerfile         -t "${REGISTRY}/${DOCKER_REPO}-web:${DOCKER_TAG}"          .
              docker build -f apps/api/Dockerfile         -t "${REGISTRY}/${DOCKER_REPO}-api:${DOCKER_TAG}"          .
              docker build -f apps/game-server/Dockerfile -t "${REGISTRY}/${DOCKER_REPO}-game-server:${DOCKER_TAG}"  .
              docker push "${REGISTRY}/${DOCKER_REPO}-web:${DOCKER_TAG}"
              docker push "${REGISTRY}/${DOCKER_REPO}-api:${DOCKER_TAG}"
              docker push "${REGISTRY}/${DOCKER_REPO}-game-server:${DOCKER_TAG}"
              docker tag "${REGISTRY}/${DOCKER_REPO}-web:${DOCKER_TAG}" "${REGISTRY}/${DOCKER_REPO}-web:latest"
              docker tag "${REGISTRY}/${DOCKER_REPO}-api:${DOCKER_TAG}" "${REGISTRY}/${DOCKER_REPO}-api:latest"
              docker tag "${REGISTRY}/${DOCKER_REPO}-game-server:${DOCKER_TAG}" "${REGISTRY}/${DOCKER_REPO}-game-server:latest"
              docker push "${REGISTRY}/${DOCKER_REPO}-web:latest"
              docker push "${REGISTRY}/${DOCKER_REPO}-api:latest"
              docker push "${REGISTRY}/${DOCKER_REPO}-game-server:latest"
            '''
          }
        }
      }
    }

    stage('Deploy to Kubernetes') {
      when {
        expression { !params.SKIP_DEPLOY }
      }
      steps {
        script {
          withCredentials([file(credentialsId: 'deashot-kubeconfig', variable: 'KUBECONFIG_FILE')]) {
            withEnv(['KUBECONFIG=' + env.KUBECONFIG_FILE]) {
              sh '''
                OVERLAY_NAME="${KUBE_OVERLAY#k8s/overlays/}"
                rm -rf /tmp/k8s-deploy
                cp -r k8s /tmp/k8s-deploy
                cd "/tmp/k8s-deploy/overlays/$OVERLAY_NAME"
                kustomize edit set image \
                  deashot-api="${REGISTRY}/${DOCKER_REPO}-api:${DOCKER_TAG}" \
                  deashot-game-server="${REGISTRY}/${DOCKER_REPO}-game-server:${DOCKER_TAG}" \
                  deashot-web="${REGISTRY}/${DOCKER_REPO}-web:${DOCKER_TAG}"
                kustomize build . > /tmp/deashot-manifests.yaml
                kubectl apply -f /tmp/deashot-manifests.yaml
                kubectl -n "${APP_NAMESPACE}" rollout status deployment/web --timeout=180s
                kubectl -n "${APP_NAMESPACE}" rollout status deployment/api --timeout=180s
                kubectl -n "${APP_NAMESPACE}" rollout status deployment/game-server --timeout=180s
              '''
            }
          }
        }
      }
    }
  }

  post {
    success {
      echo 'Deashot build + deploy succeeded.'
    }
    failure {
      echo 'Deashot pipeline failed. See logs.'
    }
    always {
      cleanWs()
    }
  }
}
