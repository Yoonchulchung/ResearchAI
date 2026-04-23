# ResearchAI → k3s 배포 가이드

## 아키텍처

```
                 ┌──────── Ingress (Traefik, :80) ─────────┐
 외부 접속 ────▶ │ /api,/ws,/backgrounds → BE  │  / → FE  │
                 └──────────────┬──────────────┬───────────┘
                                │              │
                ┌───────────────▼──┐   ┌───────▼──────────┐
                │ BE (NestJS)      │   │ FE (Next.js)     │
                │ replicas: 1      │   │ replicas: 2      │
                │ :3001            │   │ :3000            │
                └──┬───────────┬───┘   └──────────────────┘
                   │           │
     ┌─────────────▼─┐  ┌──────▼──────────┐
     │ PVC: be-data  │  │ Service: qdrant │
     │ (SQLite+미디어)│  │ :6333           │
     └───────────────┘  └────────┬────────┘
                                 │
                      ┌──────────▼──────────┐
                      │ Qdrant              │
                      │ PVC: qdrant-data    │
                      └─────────────────────┘
```

| 컴포넌트 | 복제본 | 비고 |
|---------|-------|-----|
| FE | **2** | Stateless, HA |
| BE | **1** | SQLite 파일 공유 제약 |
| Qdrant | 1 | Stateful, PVC |

> **BE 를 2+ 로 확장하려면**: `DATABASE_URL` 을 PostgreSQL 로 변경하고 SQLite 전용 코드 경로를 제거해야 합니다.

---

## 사전 준비

- **k3s** 설치 (https://k3s.io) — Traefik + local-path storage 기본 포함
- **Docker** 설치 (이미지 빌드용)
- **kubectl** 가 k3s 에 연결됨:

  ```bash
  sudo cat /etc/rancher/k3s/k3s.yaml > ~/.kube/config
  chmod 600 ~/.kube/config
  ```

---

## 1. API 키 설정

```bash
cp deploy/k8s/11-secret.example.yaml deploy/k8s/secret.yaml
# secret.yaml 을 열어 실제 값 입력
#   JWT_SECRET (임의의 긴 문자열)
#   DEFAULT_GOOGLE_API_KEY  ← 미로그인/개인키 없는 사용자용 Gemini
#   DEFAULT_GROQ_API_KEY    ← Gemini 쿼터 초과 시 자동 폴백
```

> `secret.yaml` 은 `.gitignore` 에 이미 포함되어 있습니다.

---

## 2. 배포

```bash
./deploy/deploy.sh
```

스크립트가 하는 일:
1. BE/FE Docker 이미지 빌드
2. `k3s ctr images import` 로 클러스터에 이미지 로드 (레지스트리 불필요)
3. `kubectl apply` 로 모든 매니페스트 적용
4. 롤링 재시작

---

## 3. 접속

배포 완료 후 안내에 표시되는 Node IP 로 접속:

```
http://<NODE_IP>/
```

원격 장비에서 접속하려면 해당 포트(80)가 방화벽에서 열려 있어야 합니다.

### 도메인 사용

`deploy/k8s/60-ingress.yaml` 의 `rules` 밑에 `host:` 추가:

```yaml
rules:
  - host: research.example.com
    http:
      paths:
        ...
```

그리고 `deploy/k8s/10-configmap.yaml` 의 `GMAIL_REDIRECT_URI` 등 URL 기반 설정을 해당 도메인으로 업데이트.

### HTTPS

Let's Encrypt 를 쓰려면 cert-manager + Traefik TLS 설정 추가:

```yaml
# Ingress annotations 에 추가
cert-manager.io/cluster-issuer: letsencrypt-prod
# spec.tls:
tls:
  - hosts:
      - research.example.com
    secretName: research-ai-tls
```

---

## 4. 외부 의존성 (Ollama / llama.cpp)

이 매니페스트는 Ollama, llama.cpp 를 **클러스터 외부**로 가정합니다.
호스트(노드) 에서 실행 중이라면 ConfigMap 을 수정:

```yaml
# 노드 IP 또는 k3s 내부 특수 호스트
OLLAMA_BASE_URL: "http://<node-ip>:11434"
```

혹은 호스트와 공유 네트워크를 쓰려면 BE Deployment 에 `hostNetwork: true` 추가 (단, 포트 충돌 주의).

---

## 운영

### 로그

```bash
kubectl -n research-ai logs -l app=be -f
kubectl -n research-ai logs -l app=fe -f
```

### 상태

```bash
kubectl -n research-ai get pods -o wide
kubectl -n research-ai describe pod <pod-name>
```

### 이미지 재빌드 + 재배포

```bash
./deploy/deploy.sh
```

### 롤백

```bash
kubectl -n research-ai rollout undo deployment/be
kubectl -n research-ai rollout undo deployment/fe
```

### 스케일 조정

```bash
kubectl -n research-ai scale deployment/fe --replicas=4
```

### 완전 제거

```bash
kubectl delete ns research-ai
```

---

## 트러블슈팅

**Pod 가 `ImagePullBackOff`**
→ `k3s ctr images ls | grep research-ai` 로 이미지가 import 됐는지 확인. 안 돼 있으면 `deploy.sh` 재실행.

**BE 가 `CrashLoopBackOff`**
→ 보통 `JWT_SECRET` 또는 `DEFAULT_GOOGLE_API_KEY` 누락. `kubectl -n research-ai logs deploy/be` 확인.

**웹에서 접속 안 됨**
→ Traefik LoadBalancer 상태 확인:
```
kubectl -n kube-system get svc traefik
```
→ 방화벽/보안그룹 80 포트 열림 확인.

**SQLite 잠김 (database is locked)**
→ BE replicas 가 2 이상이면 발생. `40-be.yaml` 의 `replicas: 1` 확인.
