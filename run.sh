#!/bin/bash

trap 'kill $(jobs -p) 2>/dev/null; exit' INT TERM EXIT

ROOT="$(cd "$(dirname "$0")" && pwd)"

MODE="${1:-dev}"
if [[ "$MODE" != "dev" && "$MODE" != "prod" && "$MODE" != "deploy" ]]; then
  echo "사용법: $0 [dev|prod|deploy]"
  echo "  dev    — 개발 모드 (watch)"
  echo "  prod   — 프로덕션 빌드 + HAProxy(port 80) + Fail2Ban"
  echo "  deploy — Docker 이미지 빌드 후 k3s 배포"
  exit 1
fi

# ── Deploy 모드 (k3s) ────────────────────────────────────────────────────────
if [ "$MODE" = "deploy" ]; then
  echo "🚀 k3s 배포 시작..."

  if [ -f "$HOME/.kube/config" ]; then
    _KUBECONFIG_FLAG="--kubeconfig $HOME/.kube/config"
  elif [ -r /etc/rancher/k3s/k3s.yaml ]; then
    _KUBECONFIG_FLAG="--kubeconfig /etc/rancher/k3s/k3s.yaml"
  else
    _KUBECONFIG_FLAG=""
  fi

  if command -v kubectl &>/dev/null; then
    KUBECTL="kubectl $_KUBECONFIG_FLAG"
  elif command -v k3s &>/dev/null; then
    KUBECTL="k3s kubectl $_KUBECONFIG_FLAG"
  else
    echo "❌ kubectl 또는 k3s 가 필요합니다"
    exit 1
  fi

  command -v docker &>/dev/null || { echo "❌ docker 가 필요합니다"; exit 1; }

  ARGOCD_VERSION="${ARGOCD_VERSION:-v2.11.3}"
  ARGOCD_NODEPORT_HTTP="${ARGOCD_NODEPORT_HTTP:-32080}"
  ARGOCD_NODEPORT_HTTPS="${ARGOCD_NODEPORT_HTTPS:-32443}"
  PROMETHEUS_BASIC_AUTH_USER="${PROMETHEUS_BASIC_AUTH_USER:-admin}"
  PROMETHEUS_BASIC_AUTH_PASS="${PROMETHEUS_BASIC_AUTH_PASS:-admin123}"

  _repo_url_for_argocd() {
    local remote="${ARGOCD_REPO_URL:-$(git -C "$ROOT" config --get remote.origin.url 2>/dev/null || true)}"
    if [ -z "$remote" ]; then
      remote="https://github.com/Yoonchulchung/ResearchAI.git"
    fi
    if [[ "$remote" =~ ^git@([^:]+):(.+)$ ]]; then
      remote="https://${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
    fi
    echo "$remote"
  }

  _ensure_prometheus_basic_auth() {
    echo "🔐 Prometheus BasicAuth Secret 확인..."
    $KUBECTL create namespace monitoring --dry-run=client -o yaml | $KUBECTL apply -f -

    if $KUBECTL get secret prometheus-basic-auth -n monitoring &>/dev/null; then
      echo "   ✅ prometheus-basic-auth 이미 존재"
      return 0
    fi

    if command -v htpasswd &>/dev/null; then
      local htpasswd_value
      htpasswd_value="$(htpasswd -nbB "$PROMETHEUS_BASIC_AUTH_USER" "$PROMETHEUS_BASIC_AUTH_PASS")"
      $KUBECTL create secret generic prometheus-basic-auth \
        --from-literal=users="$htpasswd_value" \
        -n monitoring
      echo "   ✅ prometheus-basic-auth 생성 (${PROMETHEUS_BASIC_AUTH_USER}/${PROMETHEUS_BASIC_AUTH_PASS})"
    else
      echo "   ⚠️  htpasswd 없음 — Prometheus Ingress BasicAuth Secret 을 만들지 못했습니다"
      echo "      Ubuntu: sudo apt-get install -y apache2-utils"
      echo "      macOS:  brew install httpd"
    fi
  }

  _ensure_argocd() {
    echo "🧭 ArgoCD 설치/등록 확인..."
    $KUBECTL create namespace argocd --dry-run=client -o yaml | $KUBECTL apply -f -
    $KUBECTL apply -n argocd \
      -f "https://raw.githubusercontent.com/argoproj/argo-cd/${ARGOCD_VERSION}/manifests/install.yaml"

    $KUBECTL wait --for condition=Established crd/applications.argoproj.io --timeout=120s

    echo "🧭 ArgoCD Server NodePort(${ARGOCD_NODEPORT_HTTP}/${ARGOCD_NODEPORT_HTTPS}) 노출..."
    $KUBECTL patch svc argocd-server -n argocd \
      -p "{\"spec\":{\"type\":\"NodePort\",\"ports\":[{\"port\":80,\"targetPort\":8080,\"nodePort\":${ARGOCD_NODEPORT_HTTP},\"name\":\"http\"},{\"port\":443,\"targetPort\":8080,\"nodePort\":${ARGOCD_NODEPORT_HTTPS},\"name\":\"https\"}]}}" \
      >/dev/null

    echo "🧭 ArgoCD /argocd subpath 설정..."
    $KUBECTL patch deployment argocd-server -n argocd --type='json' \
      -p='[
        {"op":"replace","path":"/spec/template/spec/containers/0/args","value":["/usr/local/bin/argocd-server","--staticassets","/shared/app","--basehref","/argocd","--rootpath","/argocd","--insecure"]}
      ]' \
      >/dev/null

    $KUBECTL rollout status deployment/argocd-server -n argocd --timeout=180s

    local repo_url target_revision app_tmp
    repo_url="$(_repo_url_for_argocd)"
    target_revision="${ARGOCD_TARGET_REVISION:-$(git -C "$ROOT" branch --show-current 2>/dev/null || echo main)}"
    [ -n "$target_revision" ] || target_revision="main"

    app_tmp="/tmp/research-ai-argocd-application-$$.yaml"
    sed \
      -e "s#https://github.com/Yoonchulchung/ResearchAI.git#${repo_url}#g" \
      -e "s#targetRevision: main#targetRevision: ${target_revision}#g" \
      "$ROOT/deploy/argocd/application.yaml" > "$app_tmp"

    $KUBECTL apply -f "$app_tmp"
    rm -f "$app_tmp"
    $KUBECTL apply -f "$ROOT/deploy/argocd/ingress.yaml"
    echo "   ✅ ArgoCD Application 등록 (${repo_url} @ ${target_revision})"
  }

  TAG="${2:-latest}"
  BE_IMAGE="research-ai/be:${TAG}"
  FE_IMAGE="research-ai/fe:${TAG}"

  echo "🔨 BE 이미지 빌드 ($BE_IMAGE)..."
  docker build -t "$BE_IMAGE" "$ROOT/BE" || { echo "❌ BE 빌드 실패"; exit 1; }

  echo "🔨 FE 이미지 빌드 ($FE_IMAGE)..."
  docker build -t "$FE_IMAGE" "$ROOT/FE" || { echo "❌ FE 빌드 실패"; exit 1; }

  echo "📦 이미지 tar 저장 중..."
  TMP_TAR="/tmp/research-ai-images-$$.tar"
  docker save "$BE_IMAGE" "$FE_IMAGE" -o "$TMP_TAR" || { echo "❌ 이미지 저장 실패"; exit 1; }

  # master 노드에 import
  echo "📦 [master] k3s containerd 에 이미지 주입 중..."
  sudo k3s ctr images import "$TMP_TAR" || { echo "❌ master 이미지 주입 실패"; rm -f "$TMP_TAR"; exit 1; }

  # worker 노드들에 SSH로 배포
  WORKER_NODES=(192.168.0.2 192.168.0.62)
  WORKER_USER="${WORKER_USER:-yoonchul}"
  for NODE in "${WORKER_NODES[@]}"; do
    echo "📦 [$NODE] 이미지 배포 중..."
    if ssh -o ConnectTimeout=5 -o BatchMode=yes "$WORKER_USER@$NODE" "echo ok" &>/dev/null; then
      scp -q "$TMP_TAR" "$WORKER_USER@$NODE:/tmp/research-ai-images.tar" \
        && ssh "$WORKER_USER@$NODE" "sudo k3s ctr images import /tmp/research-ai-images.tar && rm -f /tmp/research-ai-images.tar" \
        && echo "   ✅ $NODE 완료" \
        || echo "   ⚠️  $NODE 이미지 주입 실패 (계속 진행)"
    else
      echo "   ⚠️  $NODE SSH 접속 불가 — 건너뜀 (pod 가 이 노드에 스케줄링되면 실패할 수 있음)"
    fi
  done

  rm -f "$TMP_TAR"

  SECRET_FILE="$ROOT/deploy/k8s/secret.yaml"
  LEGACY_SECRET_FILE="$ROOT/deploy/k8s/11-secret.yaml"
  if [ -f "$SECRET_FILE" ]; then
    echo "🔑 Secret 적용: $(basename "$SECRET_FILE")"
    $KUBECTL apply -f "$SECRET_FILE"
  elif [ -f "$LEGACY_SECRET_FILE" ]; then
    echo "🔑 Secret 적용: $(basename "$LEGACY_SECRET_FILE")"
    $KUBECTL apply -f "$LEGACY_SECRET_FILE"
  else
    echo "⚠️  secret.yaml 없음 — 11-secret.example.yaml 을 복사해서 값을 채워주세요"
    echo "   cp deploy/k8s/11-secret.example.yaml deploy/k8s/secret.yaml"
  fi

  _ensure_prometheus_basic_auth

  echo "📋 k8s 매니페스트 적용 중..."
  for f in $(ls "$ROOT/deploy/k8s/"[0-9]*.yaml | sort); do
    [[ "$f" == *"secret.example"* ]] && continue
    [[ "$f" == "$LEGACY_SECRET_FILE" ]] && continue
    echo "   → $(basename "$f")"
    $KUBECTL apply -f "$f"
  done

  if [ "$TAG" != "latest" ]; then
    $KUBECTL set image deployment/be be="$BE_IMAGE" -n research-ai
    $KUBECTL set image deployment/fe fe="$FE_IMAGE" -n research-ai
  else
    $KUBECTL rollout restart deployment/be deployment/fe -n research-ai
  fi

  echo "⏳ 롤아웃 대기 중..."
  $KUBECTL rollout status deployment/be -n research-ai --timeout=120s
  $KUBECTL rollout status deployment/fe -n research-ai --timeout=120s

  echo "⏳ Grafana 롤아웃 대기 중..."
  $KUBECTL rollout status deployment/grafana -n monitoring --timeout=180s || true

  _ensure_argocd

  NODE_IP=$($KUBECTL get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null || echo "<node-ip>")
  echo ""
  echo "✅ 배포 완료 — http://${NODE_IP} 에서 접속"
  echo "   Grafana: https://researches.uk/grafana/  또는  http://${NODE_IP}:32030"
  echo "   ArgoCD:  https://researches.uk/argocd/  또는  http://${NODE_IP}:${ARGOCD_NODEPORT_HTTP}"
  echo "   ArgoCD 초기 PW: $KUBECTL -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d"
  exit 0
fi

# ── 이하 dev / prod 모드 ─────────────────────────────────────────────────────

echo "🚀 AI 리서치 시스템 시작 중... (${MODE} 모드)"

# ── Qdrant 벡터 DB ────────────────────────────────────────────────────────────
QDRANT_BIN="$ROOT/data/qdrant-bin/qdrant"
QDRANT_PID=""

_start_qdrant() {
  mkdir -p "$ROOT/data/qdrant"
  QDRANT__STORAGE__STORAGE_PATH="$ROOT/data/qdrant" "$QDRANT_BIN" &>/dev/null &
  QDRANT_PID=$!
  echo -n "   Qdrant 준비 대기"
  for i in $(seq 1 15); do
    if curl -sf http://localhost:6333/collections >/dev/null 2>&1; then
      echo " ✅"
      return 0
    fi
    echo -n "."
    sleep 1
  done
  echo " ⚠️  타임아웃"
}

if curl -sf http://localhost:6333/collections >/dev/null 2>&1; then
  echo "🗄️  Qdrant 이미 실행 중"
elif [ -f "$QDRANT_BIN" ]; then
  echo "🗄️  Qdrant 시작 중..."
  _start_qdrant
else
  echo "🗄️  Qdrant 바이너리 다운로드 중..."
  mkdir -p "$ROOT/data/qdrant-bin"
  ARCH=$(uname -m)
  if [ "$ARCH" = "arm64" ]; then
    QDRANT_URL="https://github.com/qdrant/qdrant/releases/latest/download/qdrant-aarch64-apple-darwin.tar.gz"
  else
    QDRANT_URL="https://github.com/qdrant/qdrant/releases/latest/download/qdrant-x86_64-apple-darwin.tar.gz"
  fi
  if curl -fL "$QDRANT_URL" | tar xz -C "$ROOT/data/qdrant-bin"; then
    chmod +x "$QDRANT_BIN"
    echo "🗄️  Qdrant 시작 중..."
    _start_qdrant
  else
    echo "⚠️  Qdrant 다운로드 실패 — 벡터 검색 비활성화"
  fi
fi

# ── Ollama 서버 ──────────────────────────────────────────────────────────────
if command -v ollama &>/dev/null; then
  if ! curl -sf http://localhost:11434 >/dev/null 2>&1; then
    echo "🦙 Ollama 서버 시작 중..."
    ollama serve &>/dev/null &
    for i in $(seq 1 10); do
      if curl -sf http://localhost:11434 >/dev/null 2>&1; then break; fi
      sleep 1
    done
    echo "🦙 Ollama 서버 실행 중"
  else
    echo "🦙 Ollama 이미 실행 중"
  fi

  if ! ollama list 2>/dev/null | grep -q 'nomic-embed-text'; then
    echo "⬇️  임베딩 모델 다운로드 중 (nomic-embed-text, 약 274MB)..."
    ollama pull nomic-embed-text
  else
    echo "📊 임베딩 모델 준비됨 (nomic-embed-text)"
  fi
else
  echo "⚠️  Ollama 미설치 — Ollama 및 임베딩 비활성화"
fi

# ── 의존성 설치 ──────────────────────────────────────────────────────────────
if [ ! -d "$ROOT/BE/node_modules" ]; then
  echo "📦 BE node_modules 설치 중..."
  cd "$ROOT/BE" && pnpm install
fi

if [ ! -d "$ROOT/FE/node_modules" ]; then
  echo "📦 FE node_modules 설치 중..."
  cd "$ROOT/FE" && npm install
fi

# ── 서버 실행 ────────────────────────────────────────────────────────────────
if [ "$MODE" = "dev" ]; then
  echo "📦 백엔드 시작 (NestJS · http://localhost:3001)"
  cd "$ROOT/BE" && pnpm run start:dev &
  BE_PID=$!

  echo "🌐 프론트엔드 시작 (Next.js · http://localhost:3000)"
  cd "$ROOT/FE" && npm run dev &
  FE_PID=$!
else
  echo "📦 백엔드 빌드 중..."
  cd "$ROOT/BE" && pnpm run build

  echo "📦 백엔드 시작 (NestJS · http://localhost:3001)"
  node "$ROOT/BE/dist/main" &
  BE_PID=$!

  echo "🌐 프론트엔드 빌드 중..."
  cd "$ROOT/FE" && npm run build

  echo "🌐 프론트엔드 시작 (Next.js · http://localhost:3000)"
  cd "$ROOT/FE" && node_modules/.bin/next start &
  FE_PID=$!
fi

# ── HAProxy 보안 파일 생성 ────────────────────────────────────────────────────
_write_security_lists() {
  # 악성 봇 / 스캐너 User-Agent (substring 매칭)
  cat > /tmp/haproxy-bad-ua.lst << 'EOF'
python-requests
python-urllib
go-http-client
masscan
nikto
sqlmap
nmap
zgrab
nuclei
dirsearch
gobuster
wfuzz
hydra
burpsuite
metasploit
scrapy
semrushbot
ahrefsbot
dotbot
mj12bot
petalbot
bingbot/2
yandexbot
EOF

  # 스캐너가 자주 노리는 경로 (path_beg 매칭)
  cat > /tmp/haproxy-scanner-paths.lst << 'EOF'
/wp-admin
/wp-login
/phpmyadmin
/.env
/.git
/.svn
/etc/
/config.php
/admin.php
/xmlrpc.php
/cgi-bin
/actuator
/console
/.well-known/security
/autodiscover
/owa/
EOF

  # 스캐너가 자주 노리는 확장자 (path_end 매칭)
  cat > /tmp/haproxy-scanner-ext.lst << 'EOF'
.php
.asp
.aspx
.jsp
.cgi
.sh
.bash
.exe
.dll
EOF
}

# ── Fail2Ban 설정 ─────────────────────────────────────────────────────────────
_setup_fail2ban() {
  local log_file="$1"

  # fail2ban 설정 경로 탐지
  if [ -d /etc/fail2ban ]; then
    FB_CFG=/etc/fail2ban
  elif [ -d /opt/homebrew/etc/fail2ban ]; then
    FB_CFG=/opt/homebrew/etc/fail2ban
  elif [ -d /usr/local/etc/fail2ban ]; then
    FB_CFG=/usr/local/etc/fail2ban
  else
    echo "   ⚠️  fail2ban 설정 경로 없음 — 'brew install fail2ban' 또는 'apt install fail2ban'"
    return 1
  fi

  mkdir -p "$FB_CFG/filter.d" "$FB_CFG/jail.d"

  # 필터 1: 요청 속도 초과 (429)
  cat > "$FB_CFG/filter.d/haproxy-req-limit.conf" << 'EOF'
[Definition]
failregex = ^<HOST>:\d+ \[.+?\] \S+ \S+ \S+ 429 .*$
ignoreregex =
datepattern = \[%%d/%%b/%%Y:%%H:%%M:%%S
EOF

  # 필터 2: 스캐너 경로 탐지 (403/404)
  cat > "$FB_CFG/filter.d/haproxy-scanner.conf" << 'EOF'
[Definition]
failregex = ^<HOST>:\d+ \[.+?\] \S+ \S+ \S+ (?:403|404) .* "(?:GET|POST|HEAD|PUT|DELETE) (?:/wp-admin|/wp-login|/phpmyadmin|/\.env|/\.git|/etc/|/xmlrpc|/actuator|/console).*".*$
ignoreregex =
datepattern = \[%%d/%%b/%%Y:%%H:%%M:%%S
EOF

  # 필터 3: 로그인 브루트포스 (401)
  cat > "$FB_CFG/filter.d/haproxy-auth.conf" << 'EOF'
[Definition]
failregex = ^<HOST>:\d+ \[.+?\] \S+ \S+ \S+ 401 .* "POST /api/auth/login.*".*$
ignoreregex =
datepattern = \[%%d/%%b/%%Y:%%H:%%M:%%S
EOF

  # Jail 설정
  cat > "$FB_CFG/jail.d/haproxy-research-ai.conf" << EOF
# 생성: run.sh (prod 모드)

[haproxy-req-limit]
enabled  = true
filter   = haproxy-req-limit
logpath  = ${log_file}
maxretry = 10
findtime = 60
bantime  = 1800

[haproxy-scanner]
enabled  = true
filter   = haproxy-scanner
logpath  = ${log_file}
maxretry = 5
findtime = 60
bantime  = 86400

[haproxy-auth]
enabled  = true
filter   = haproxy-auth
logpath  = ${log_file}
maxretry = 10
findtime = 300
bantime  = 3600
EOF

  # Fail2Ban 재시작/리로드
  if command -v fail2ban-client &>/dev/null; then
    if fail2ban-client ping &>/dev/null 2>&1; then
      fail2ban-client reload &>/dev/null && echo "   🛡️  Fail2Ban 재로드 완료"
    else
      if command -v systemctl &>/dev/null && systemctl is-active fail2ban &>/dev/null 2>&1; then
        systemctl restart fail2ban &>/dev/null && echo "   🛡️  Fail2Ban 재시작 완료"
      else
        fail2ban-server -b -s /var/run/fail2ban/fail2ban.sock &>/dev/null \
          && echo "   🛡️  Fail2Ban 시작 완료" \
          || echo "   ⚠️  Fail2Ban 시작 실패 — sudo 권한이 필요할 수 있습니다"
      fi
    fi
  fi
}

# ── HAProxy (prod 모드 전용) ─────────────────────────────────────────────────
HAPROXY_PID=""

if [ "$MODE" = "prod" ] && command -v haproxy &>/dev/null; then
  HAPROXY_PORT="${HAPROXY_PORT:-80}"
  HAPROXY_CFG="/tmp/haproxy-research-ai.cfg"
  HAPROXY_LOG="/tmp/haproxy-research-ai.log"

  _write_security_lists

  cat > "$HAPROXY_CFG" << EOF
global
  log stderr local0 info
  maxconn 2048

defaults
  mode http
  log global
  option httplog
  option forwardfor
  timeout connect  5s
  timeout client  60s
  timeout server  60s
  timeout tunnel   1h

frontend research_ai
  bind *:${HAPROXY_PORT}

  # ── Rate Limiting (stick table) ──────────────────────────────
  # 동일 IP 에서 10초 내 200 req 초과 → 429
  # 동일 IP 동시 연결 50개 초과 → 429
  stick-table type ip size 200k expire 10s store http_req_rate(10s),conn_cur
  http-request track-sc0 src
  http-request deny deny_status 429 if { sc_http_req_rate(0) gt 200 }
  http-request deny deny_status 429 if { sc_conn_cur(0) gt 50 }

  # ── Bot / Scanner UA 차단 ─────────────────────────────────────
  acl bad_ua    req.hdr(User-Agent) -i -m sub -f /tmp/haproxy-bad-ua.lst
  http-request deny deny_status 403 if bad_ua

  # ── Scanner 경로 / 확장자 차단 ───────────────────────────────
  acl scan_path path_beg -f /tmp/haproxy-scanner-paths.lst
  acl scan_ext  path_end -f /tmp/haproxy-scanner-ext.lst
  http-request deny deny_status 404 if scan_path OR scan_ext

  # ── 보안 응답 헤더 ────────────────────────────────────────────
  http-response set-header X-Content-Type-Options  "nosniff"
  http-response set-header X-Frame-Options         "SAMEORIGIN"
  http-response set-header Referrer-Policy         "strict-origin-when-cross-origin"
  http-response set-header X-XSS-Protection        "1; mode=block"

  # ── 서버 정보 노출 제거 ───────────────────────────────────────
  http-response del-header Server
  http-response del-header X-Powered-By

  # ── 백엔드 라우팅 ─────────────────────────────────────────────
  acl is_ws_upgrade hdr(Upgrade) -i websocket
  acl is_api        path_beg /api
  acl is_ws         path_beg /ws
  acl is_bg         path_beg /backgrounds
  use_backend be if is_ws_upgrade
  use_backend be if is_api
  use_backend be if is_ws
  use_backend be if is_bg
  default_backend fe

backend be
  http-request set-header X-Forwarded-Proto http
  server be1 127.0.0.1:3001 check

backend fe
  http-request set-header X-Forwarded-Proto http
  server fe1 127.0.0.1:3000 check
EOF

  echo "🔀 HAProxy 시작 (port ${HAPROXY_PORT})..."
  # daemon 없이 실행 → stderr(=access log) 를 파일로 리디렉션
  haproxy -f "$HAPROXY_CFG" 2>>"$HAPROXY_LOG" &
  HAPROXY_PID=$!
  sleep 1

  if kill -0 "$HAPROXY_PID" 2>/dev/null; then
    echo "🔀 HAProxy 실행 중 (http://localhost:${HAPROXY_PORT})"
    echo "   📄 액세스 로그: $HAPROXY_LOG"

    # Fail2Ban 연동
    if command -v fail2ban-client &>/dev/null; then
      echo "🛡️  Fail2Ban 설정 중..."
      _setup_fail2ban "$HAPROXY_LOG"
    else
      echo "   ℹ️  Fail2Ban 미설치 — 'brew install fail2ban' 또는 'apt install fail2ban'"
    fi
  else
    echo "⚠️  HAProxy 시작 실패 — port ${HAPROXY_PORT} 권한 문제일 수 있습니다"
    echo "   → HAPROXY_PORT=8080 ./run.sh prod"
    HAPROXY_PID=""
  fi
elif [ "$MODE" = "prod" ]; then
  echo "⚠️  haproxy 미설치 — FE: http://localhost:3000, BE: http://localhost:3001"
  echo "   → brew install haproxy"
fi

echo ""
if [ "$MODE" = "prod" ] && [ -n "$HAPROXY_PID" ]; then
  echo "✅ 실행 중 — http://localhost:${HAPROXY_PORT} 에서 접속하세요"
else
  echo "✅ 실행 중 — http://localhost:3000 에서 접속하세요"
fi
echo "   종료하려면 Ctrl+C"
echo ""

wait $BE_PID $FE_PID ${QDRANT_PID} ${HAPROXY_PID}
