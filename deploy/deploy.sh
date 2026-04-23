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

kubectl apply -f "$ROOT/deploy/k8s/00-namespace.yaml"
kubectl apply -f "$ROOT/deploy/k8s/10-configmap.yaml"

# secret.yaml 이 있으면 그것, 없으면 example 을 적용
if [ -f "$ROOT/deploy/k8s/secret.yaml" ]; then
  kubectl apply -f "$ROOT/deploy/k8s/secret.yaml"
else
  echo "⚠️  secret.yaml 없음 — 11-secret.example.yaml 을 그대로 적용합니다 (API 키 미설정 상태)"
  kubectl apply -f "$ROOT/deploy/k8s/11-secret.example.yaml"
fi

# ────────────────────────────────────────────────────────────
log "4/4 PVC·Qdrant·BE·FE·Ingress 적용"

kubectl apply -f "$ROOT/deploy/k8s/20-pvc.yaml"
kubectl apply -f "$ROOT/deploy/k8s/30-qdrant.yaml"
kubectl apply -f "$ROOT/deploy/k8s/40-be.yaml"
kubectl apply -f "$ROOT/deploy/k8s/50-fe.yaml"
kubectl apply -f "$ROOT/deploy/k8s/60-ingress.yaml"

# Pod 재기동 (이미지 업데이트 반영)
log "이미지 업데이트 반영 위해 롤링 재시작"
kubectl -n "$NS" rollout restart deployment/be deployment/fe

# ────────────────────────────────────────────────────────────
log "배포 완료 — 상태 확인"

kubectl -n "$NS" get pods -o wide
kubectl -n "$NS" get svc
kubectl -n "$NS" get ingress

NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
cat <<EOF

✅ 배포가 완료되었습니다.

접속:
  http://${NODE_IP}/     (또는 http://<노드IP>/)

상태 확인:
  kubectl -n ${NS} get pods
  kubectl -n ${NS} logs -l app=be -f
  kubectl -n ${NS} logs -l app=fe -f

제거:
  kubectl delete ns ${NS}

EOF
