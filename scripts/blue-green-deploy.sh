#!/usr/bin/env bash
set -euo pipefail

# 蓝绿部署自动化脚本
# 用法: ./blue-green-deploy.sh [--target green] [--image v1.2.3] [--health-check-url ...]

TARGET_COLOR="green"
IMAGE_TAG="latest"
HEALTH_CHECK_URL="http://localhost:3001/health/simple"
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_INTERVAL=5
TRAFFIC_SWITCH_METHOD="cookie"  # cookie | instant
ROLLBACK_WAIT=120  # 回滚等待时间

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; }

usage() {
    cat <<EOF
蓝绿部署脚本 - A股行情分析平台

用法: $0 [选项]

选项:
  --target COLOR        目标环境 (blue|green, 默认: green)
  --image TAG           Docker镜像标签
  --switch-method M     流量切换方式 (cookie|instant, 默认: cookie)
  --health-check-url URL 健康检查地址
  --rollback-wait SEC   回滚等待窗口 (默认: 120)
  --rollback            回滚到上一个环境
  --status              显示当前部署状态
  --dry-run             仅验证，不执行
  --help                显示帮助

示例:
  $0 --target green --image v2.1.0
  $0 --rollback
  $0 --status
EOF
    exit 0
}

DRY_RUN=false
DO_ROLLBACK=false
SHOW_STATUS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --target) TARGET_COLOR="$2"; shift 2 ;;
        --image) IMAGE_TAG="$2"; shift 2 ;;
        --switch-method) TRAFFIC_SWITCH_METHOD="$2"; shift 2 ;;
        --health-check-url) HEALTH_CHECK_URL="$2"; shift 2 ;;
        --rollback-wait) ROLLBACK_WAIT="$2"; shift 2 ;;
        --rollback) DO_ROLLBACK=true; shift ;;
        --status) SHOW_STATUS=true; shift ;;
        --dry-run) DRY_RUN=true; shift ;;
        --help) usage ;;
        *) error "未知参数: $1"; exit 1 ;;
    esac
done

DEPLOY_ID="bg-$(date +%Y%m%d-%H%M%S)"
DEPLOY_LOG="deployment-log/${DEPLOY_ID}.json"
mkdir -p deployment-log

record_event() {
    local event=$1; local detail=${2:-}
    echo "{\"deploy_id\":\"${DEPLOY_ID}\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"${event}\",\"detail\":\"${detail}\"}" >> "$DEPLOY_LOG"
}

# 获取当前活跃环境
get_active_color() {
    local active=$(curl -sf --max-time 5 "http://localhost/deploy/status" 2>/dev/null | jq -r '.active_color // "blue"' 2>/dev/null || echo "blue")
    echo "$active"
}

# 显示部署状态
show_deploy_status() {
    log "=== 蓝绿部署状态 ==="
    local active=$(get_active_color)
    log "活跃环境: ${active}"
    
    for color in blue green; do
        local health_url="http://localhost/health/${color}"
        local status="停止"
        if curl -sf --max-time 3 "$health_url" > /dev/null 2>&1; then
            status="${GREEN}运行中${NC}"
        fi
        echo -e "  ${color}: $status"
    done
}

# 健康检查
health_check() {
    local color=$1
    local url="http://localhost/health/${color}"
    log "健康检查: ${url}"
    
    for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
        if curl -sf --max-time 5 "$url" > /dev/null 2>&1; then
            success "${color} 健康检查通过"
            return 0
        fi
        sleep $HEALTH_CHECK_INTERVAL
    done
    error "${color} 健康检查失败"
    return 1
}

# 切换流量
switch_traffic() {
    local from=$1; local to=$2
    log "切换流量: ${from} -> ${to} (方式: ${TRAFFIC_SWITCH_METHOD})"
    
    if $DRY_RUN; then
        warn "DRY RUN: 跳过流量切换"
        return 0
    fi
    
    if [[ "$TRAFFIC_SWITCH_METHOD" == "instant" ]]; then
        # 更新 Nginx 配置直接切换
        update_nginx_target "$to"
    else
        # cookie 方式，不需要 Nginx 重载
        log "Cookie 切换模式: 新请求将路由到 ${to}"
    fi
    
    record_event "traffic_switched" "${from} -> ${to}"
    success "流量已切换到 ${to}"
}

# 更新 Nginx 目标
update_nginx_target() {
    local target=$1
    log "更新 Nginx 路由目标: ${target}"
    
    cat > nginx/blue-green.conf <<NGINX_EOF
upstream backend_blue {
    server backend-blue:3001;
}

upstream backend_green {
    server backend-green:3001;
}

map \$cookie_deployment \$backend_target {
    default  backend_${target};
    blue     backend_blue;
    green    backend_green;
}

server {
    listen 80;
    server_name localhost;

    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://\$backend_target;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Deployment-Target \$backend_target;
    }

    location /ws {
        proxy_pass http://backend_${target};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
    }

    location /health/blue {
        proxy_pass http://backend_blue/health;
        access_log off;
    }

    location /health/green {
        proxy_pass http://backend_green/health;
        access_log off;
    }

    location /health {
        proxy_pass http://backend_${target}/health;
        access_log off;
    }

    location /deploy/status {
        default_type application/json;
        return 200 '{"active_color":"${target}","switch_method":"${TRAFFIC_SWITCH_METHOD}"}';
    }
}
NGINX_EOF
    
    docker compose -f docker-compose.yml -f docker-compose.blue-green.yml exec nginx-router nginx -s reload 2>/dev/null || true
}

# 回滚
do_rollback() {
    local active=$(get_active_color)
    local rollback_target="blue"
    [[ "$active" == "blue" ]] && rollback_target="green"
    
    log "=== 执行回滚: ${active} -> ${rollback_target} ==="
    record_event "rollback_start" "${active} -> ${rollback_target}"
    
    switch_traffic "$active" "$rollback_target"
    record_event "rollback_complete"
    success "回滚完成: 已切换到 ${rollback_target}"
}

# ======== 主流程 ========

if $SHOW_STATUS; then
    show_deploy_status
    exit 0
fi

if $DO_ROLLBACK; then
    do_rollback
    exit 0
fi

# 确定当前活跃环境
ACTIVE_COLOR=$(get_active_color)
if [[ "$TARGET_COLOR" == "$ACTIVE_COLOR" ]]; then
    TARGET_COLOR="green"
    [[ "$ACTIVE_COLOR" == "green" ]] && TARGET_COLOR="blue"
    warn "目标环境与活跃环境相同，自动切换为 ${TARGET_COLOR}"
fi

log "=== 蓝绿部署: ${DEPLOY_ID} ==="
log "当前活跃: ${ACTIVE_COLOR} | 部署目标: ${TARGET_COLOR} | 镜像: ${IMAGE_TAG}"

record_event "deploy_start" "target=${TARGET_COLOR},image=${IMAGE_TAG}"

# Step 1: 启动目标环境
log "Step 1: 启动 ${TARGET_COLOR} 环境..."
if ! $DRY_RUN; then
    docker compose -f docker-compose.yml -f docker-compose.blue-green.yml --profile "$TARGET_COLOR" \
        up -d "backend-${TARGET_COLOR}" 2>&1 | tail -3
    record_event "target_started"
fi

# Step 2: 健康检查
log "Step 2: ${TARGET_COLOR} 健康检查..."
if ! $DRY_RUN; then
    if ! health_check "$TARGET_COLOR"; then
        error "${TARGET_COLOR} 环境启动失败"
        record_event "deploy_failed" "健康检查失败"
        # 停止失败的环境
        docker compose -f docker-compose.yml -f docker-compose.blue-green.yml --profile "$TARGET_COLOR" \
            stop "backend-${TARGET_COLOR}" 2>/dev/null || true
        exit 1
    fi
fi

# Step 3: 流量切换
log "Step 3: 切换流量到 ${TARGET_COLOR}..."
switch_traffic "$ACTIVE_COLOR" "$TARGET_COLOR"

# Step 4: 等待并观察
log "Step 4: 观察窗口 (${ROLLBACK_WAIT}s)..."
if ! $DRY_RUN; then
    log "如需回滚: $0 --rollback"
    sleep "$ROLLBACK_WAIT"
fi

# Step 5: 停止旧环境
log "Step 5: 停止 ${ACTIVE_COLOR} 环境..."
if ! $DRY_RUN; then
    docker compose -f docker-compose.yml -f docker-compose.blue-green.yml --profile "$ACTIVE_COLOR" \
        stop "backend-${ACTIVE_COLOR}" 2>/dev/null || true
fi

record_event "deploy_complete" "${TARGET_COLOR} 环境已接管"
success "🎉 蓝绿部署完成! 活跃环境: ${TARGET_COLOR}"
