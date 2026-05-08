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

# ── 2. ArgoCD Server: insecure 모드 + rootpath 설정 ──────────────────────────
log "ArgoCD Server --insecure + --rootpath=/argocd 패치..."
kubectl patch deployment argocd-server -n argocd --type='json' -p='[
  {"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--insecure"},
  {"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--rootpath=/argocd"}
]' 2>/dev/null || true

# NodePort도 유지 (직접 IP:32080 접근 용)
kubectl patch svc argocd-server -n argocd \
  -p '{"spec":{"type":"NodePort","ports":[{"port":80,"targetPort":8080,"nodePort":32080,"name":"http"},{"port":443,"targetPort":8080,"nodePort":32443,"name":"https"}]}}' 2>/dev/null || true

# ── 3. ArgoCD 준비 대기 ───────────────────────────────────────────────────────
log "ArgoCD 파드 Ready 대기 (최대 3분)..."
kubectl rollout status deployment/argocd-server -n argocd --timeout=180s
ok "ArgoCD 서버 준비 완료"

# ── 4. Prometheus BasicAuth Secret 생성 ──────────────────────────────────────
# monitoring 네임스페이스가 없으면 먼저 생성
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

if kubectl get secret prometheus-basic-auth -n monitoring &>/dev/null; then
  ok "prometheus-basic-auth Secret 이미 존재 — 건너뜀"
else
  if ! command -v htpasswd &>/dev/null; then
    warn "htpasswd 없음 — apache2-utils / httpd-tools 설치 필요"
    warn "  Ubuntu: sudo apt-get install -y apache2-utils"
    warn "  직접 생성 후 재실행하세요."
  else
    log "Prometheus BasicAuth Secret 생성 (기본: admin / admin123)"
    warn "보안을 위해 나중에 비밀번호를 변경하세요:"
    warn "  htpasswd -nb admin NEW_PASSWORD | kubectl create secret generic \\"
    warn "    prometheus-basic-auth --from-file=users=/dev/stdin -n monitoring --dry-run=client -o yaml | kubectl apply -f -"
    HTPASSWD=$(htpasswd -nbB admin admin123)
    kubectl create secret generic prometheus-basic-auth \
      --from-literal=users="${HTPASSWD}" \
      -n monitoring
    ok "prometheus-basic-auth Secret 생성 완료"
  fi
fi

# ── 5. application.yaml 의 repoURL 확인 ──────────────────────────────────────
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
