#!/usr/bin/env bash
# ResearchAI → k3s 배포 스크립트
# 1) Docker 이미지 빌드
# 2) k3s 내장 containerd 로 이미지 import (레지스트리 불필요)
# 3) kubectl apply 로 매니페스트 적용

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NS="research-ai"
BE_IMG="research-ai/be:latest"
FE_IMG="research-ai/fe:latest"

log() { printf "\n\033[1;34m▶\033[0m %s\n" "$*"; }

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "❌ '$1' 필요"; exit 1; }
}

require docker
require kubectl

# k3s ctr (이미지 import용)
K3S_CTR="sudo k3s ctr"
if ! $K3S_CTR version >/dev/null 2>&1; then
  echo "❌ k3s 가 설치되어 있지 않거나 sudo 권한이 필요합니다."
  exit 1
fi

# kubectl 이 k3s kubeconfig 를 읽을 수 있는지 확인
K3S_KUBECONFIG="/etc/rancher/k3s/k3s.yaml"
KUBECTL_CMD="kubectl"

if ! kubectl version --client >/dev/null 2>&1; then
  echo "❌ kubectl 실행 실패"
  exit 1
fi

# kubeconfig 접근 가능 여부 체크
if ! kubectl get nodes >/dev/null 2>&1; then
  if [ -f "$K3S_KUBECONFIG" ]; then
    if [ -r "$K3S_KUBECONFIG" ]; then
      export KUBECONFIG="$K3S_KUBECONFIG"
      log "KUBECONFIG=$K3S_KUBECONFIG 사용"
    elif sudo -n test -r "$K3S_KUBECONFIG" 2>/dev/null || [ "$EUID" -eq 0 ]; then
      # sudo 로 kubeconfig 를 홈 디렉터리에 복사 (최초 1회)
      USER_KUBECONFIG="$HOME/.kube/config"
      if [ ! -f "$USER_KUBECONFIG" ]; then
        log "kubeconfig 를 $USER_KUBECONFIG 에 복사 (최초 1회)"
        mkdir -p "$HOME/.kube"
        sudo cp "$K3S_KUBECONFIG" "$USER_KUBECONFIG"
        sudo chown "$(id -u):$(id -g)" "$USER_KUBECONFIG"
        chmod 600 "$USER_KUBECONFIG"
      fi
      export KUBECONFIG="$USER_KUBECONFIG"
    else
      # sudo 사용 가능하면 kubectl 을 전부 sudo 로 실행
      if command -v sudo >/dev/null; then
        log "kubeconfig 권한 없음 — sudo kubectl 로 실행합니다"
        KUBECTL_CMD="sudo KUBECONFIG=$K3S_KUBECONFIG kubectl"
      else
        echo "❌ $K3S_KUBECONFIG 읽기 권한이 없고 sudo 도 불가능합니다."
        echo "   sudo chmod 644 $K3S_KUBECONFIG  또는"
        echo "   sudo cp $K3S_KUBECONFIG \$HOME/.kube/config && sudo chown \$USER \$HOME/.kube/config"
        exit 1
      fi
    fi
  else
    echo "❌ k3s kubeconfig ($K3S_KUBECONFIG) 를 찾을 수 없습니다."
    exit 1
  fi
fi

# 최종 접속 확인
if ! $KUBECTL_CMD get nodes >/dev/null 2>&1; then
  echo "❌ kubectl 접속 실패"
  exit 1
fi

# ────────────────────────────────────────────────────────────
log "1/4 Docker 이미지 빌드 (BE / FE)"

docker build -t "$BE_IMG" "$ROOT/BE"
docker build -t "$FE_IMG" "$ROOT/FE"

# ────────────────────────────────────────────────────────────
log "2/4 k3s containerd 로 이미지 import"

TMP_TAR="/tmp/research-ai-images.tar"
docker save -o "$TMP_TAR" "$BE_IMG" "$FE_IMG"
$K3S_CTR images import "$TMP_TAR"
rm -f "$TMP_TAR"

# ────────────────────────────────────────────────────────────
log "3/4 네임스페이스·ConfigMap·Secret 적용"

$KUBECTL_CMD apply -f "$ROOT/deploy/k8s/00-namespace.yaml"
$KUBECTL_CMD apply -f "$ROOT/deploy/k8s/10-configmap.yaml"

# secret.yaml 이 있으면 그것, 없으면 example 을 적용
if [ -f "$ROOT/deploy/k8s/secret.yaml" ]; then
  $KUBECTL_CMD apply -f "$ROOT/deploy/k8s/secret.yaml"
else
  echo "⚠️  secret.yaml 없음 — 11-secret.example.yaml 을 그대로 적용합니다 (API 키 미설정 상태)"
  $KUBECTL_CMD apply -f "$ROOT/deploy/k8s/11-secret.example.yaml"
fi

# ────────────────────────────────────────────────────────────
log "4/5 PVC·Qdrant·BE·FE·Ingress 적용"

$KUBECTL_CMD apply -f "$ROOT/deploy/k8s/20-pvc.yaml"
$KUBECTL_CMD apply -f "$ROOT/deploy/k8s/30-qdrant.yaml"
$KUBECTL_CMD apply -f "$ROOT/deploy/k8s/40-be.yaml"
$KUBECTL_CMD apply -f "$ROOT/deploy/k8s/50-fe.yaml"
$KUBECTL_CMD apply -f "$ROOT/deploy/k8s/60-ingress.yaml"

# Pod 재기동 (이미지 업데이트 반영)
log "이미지 업데이트 반영 위해 롤링 재시작"
$KUBECTL_CMD -n "$NS" rollout restart deployment/be deployment/fe

# ────────────────────────────────────────────────────────────
log "5/5 모니터링 스택 적용 (Prometheus · Loki · Promtail · Grafana)"

$KUBECTL_CMD apply -f "$ROOT/deploy/k8s/70-monitoring-ns.yaml"
$KUBECTL_CMD apply -f "$ROOT/deploy/k8s/71-prometheus.yaml"
$KUBECTL_CMD apply -f "$ROOT/deploy/k8s/72-loki.yaml"
$KUBECTL_CMD apply -f "$ROOT/deploy/k8s/73-promtail.yaml"
$KUBECTL_CMD apply -f "$ROOT/deploy/k8s/74-grafana.yaml"
$KUBECTL_CMD apply -f "$ROOT/deploy/k8s/75-monitoring-ingress.yaml"

# ────────────────────────────────────────────────────────────
log "배포 완료 — 상태 확인"

$KUBECTL_CMD -n "$NS" get pods -o wide
$KUBECTL_CMD -n "$NS" get svc
$KUBECTL_CMD -n "$NS" get ingress

NODE_IP=$($KUBECTL_CMD get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
cat <<EOF

✅ 배포가 완료되었습니다.

접속:
  http://${NODE_IP}/          (앱)
  http://${NODE_IP}/grafana/  (Grafana — admin/admin123, 첫 로그인 후 변경)

상태 확인:
  kubectl -n ${NS} get pods
  kubectl -n monitoring get pods
  kubectl -n ${NS} logs -l app=be -f

제거:
  kubectl delete ns ${NS} monitoring

EOF
