#!/usr/bin/env bash
# ── ArgoCD 설치 & ResearchAI 앱 등록 스크립트 ──────────────────────────────
# 실행 전: k3s 클러스터가 동작 중이어야 합니다.
# 사용법:
#   chmod +x deploy/argocd/install.sh
#   ./deploy/argocd/install.sh
#
# 이후 ArgoCD UI: http://<node-ip>:32080
# 초기 비밀번호:  kubectl -n argocd get secret argocd-initial-admin-secret \
#                          -o jsonpath="{.data.password}" | base64 -d

set -euo pipefail

ARGOCD_VERSION="v2.11.3"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

log()  { printf "\n\033[1;34m▶\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m✔\033[0m %s\n"   "$*"; }
warn() { printf "\033[1;33m⚠\033[0m %s\n"   "$*"; }

# ── 1. ArgoCD 네임스페이스 & 설치 ────────────────────────────────────────────
log "ArgoCD ${ARGOCD_VERSION} 설치 중..."
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -n argocd \
  -f "https://raw.githubusercontent.com/argoproj/argo-cd/${ARGOCD_VERSION}/manifests/install.yaml"

# ── 2. ArgoCD Server NodePort 노출 (32080) ───────────────────────────────────
log "ArgoCD Server → NodePort 32080 패치..."
kubectl patch svc argocd-server -n argocd \
  -p '{"spec":{"type":"NodePort","ports":[{"port":80,"targetPort":8080,"nodePort":32080,"name":"http"},{"port":443,"targetPort":8080,"nodePort":32443,"name":"https"}]}}'

# ── 3. ArgoCD 준비 대기 ───────────────────────────────────────────────────────
log "ArgoCD 파드 Ready 대기 (최대 3분)..."
kubectl rollout status deployment/argocd-server -n argocd --timeout=180s
ok "ArgoCD 서버 준비 완료"

# ── 4. application.yaml 의 repoURL 확인 ──────────────────────────────────────
APP_YAML="${ROOT}/deploy/argocd/application.yaml"
if grep -q "YOUR_USERNAME" "${APP_YAML}"; then
  warn "deploy/argocd/application.yaml 의 repoURL을 실제 Git 저장소 URL로 변경 후"
  warn "다음 명령을 실행하세요:"
  echo ""
  echo "  kubectl apply -f ${APP_YAML}"
  echo ""
  warn "비공개 저장소라면 먼저 ArgoCD에 자격증명을 등록하세요:"
  echo "  argocd repo add https://github.com/YOUR_USERNAME/ResearchAI.git \\"
  echo "    --username YOUR_USERNAME --password YOUR_PAT"
else
  log "ArgoCD Application 등록..."
  kubectl apply -f "${APP_YAML}"
  ok "Application 등록 완료"
fi

# ── 5. 초기 admin 비밀번호 출력 ───────────────────────────────────────────────
log "초기 admin 비밀번호:"
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" 2>/dev/null | base64 -d && echo
echo ""
ok "완료! ArgoCD UI → http://$(hostname -I | awk '{print $1}'):32080"
ok "  ID: admin  /  PW: 위 비밀번호"
