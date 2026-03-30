#!/usr/bin/env bash
set -euo pipefail

# 灰度发布自动化脚本
# 用法: ./canary-deploy.sh [--weight 10] [--image v1.2.3] [--auto-promote] [--health-check-url http://...]

CANARY_WEIGHT=10
IMAGE_TAG="latest"
AUTO_PROMOTE=false
HEALTH_CHECK_URL="http://localhost:3001/health/simple"
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_INTERVAL=10
ROLLBACK_ON_FAILURE=true
METRICS_ENDPOINT="http://localhost:9090/api/v1/query"
ERROR_RATE_THRESHOLD=0.05
LATENCY_THRESHOLD_MS=2000
MONITORING_DURATION=300  # 5分钟监控窗口

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
灰度发布脚本 - A股行情分析平台

用法: $0 [选项]

选项:
  --weight NUM          灰度流量权重 (1-100, 默认: 10)
  --image TAG           Docker镜像标签 (默认: latest)
  --auto-promote        监控通过后自动提升流量
  --health-check-url URL 健康检查地址
  --monitoring-duration SEC 监控窗口秒数 (默认: 300)
  --no-rollback         失败时不自动回滚
  --dry-run             仅验证配置，不执行部署
  --help                显示此帮助

示例:
  $0 --weight 20 --image v2.1.0 --auto-promote
  $0 --dry-run
EOF
    exit 0
}

DRY_RUN=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --weight) CANARY_WEIGHT="$2"; shift 2 ;;
        --image) IMAGE_TAG="$2"; shift 2 ;;
        --auto-promote) AUTO_PROMOTE=true; shift ;;
        --health-check-url) HEALTH_CHECK_URL="$2"; shift 2 ;;
        --monitoring-duration) MONITORING_DURATION="$2"; shift 2 ;;
        --no-rollback) ROLLBACK_ON_FAILURE=false; shift ;;
        --dry-run) DRY_RUN=true; shift ;;
        --help) usage ;;
        *) error "未知参数: $1"; exit 1 ;;
    esac
done

# 验证参数
if [[ $CANARY_WEIGHT -lt 1 || $CANARY_WEIGHT -gt 100 ]]; then
    error "灰度权重必须在 1-100 之间"
    exit 1
fi

DEPLOY_ID="canary-$(date +%Y%m%d-%H%M%S)"
DEPLOY_LOG="deployment-log/${DEPLOY_ID}.json"

mkdir -p deployment-log

log "=== 灰度发布: ${DEPLOY_ID} ==="
log "权重: ${CANARY_WEIGHT}% | 镜像: ${IMAGE_TAG} | 自动提升: ${AUTO_PROMOTE}"

if $DRY_RUN; then
    warn "DRY RUN 模式 - 仅验证配置"
fi

# 记录部署事件
record_event() {
    local event=$1
    local detail=${2:-}
    local ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    echo "{\"deploy_id\":\"${DEPLOY_ID}\",\"timestamp\":\"${ts}\",\"event\":\"${event}\",\"detail\":\"${detail}\"}" >> "${DEPLOY_LOG}"
}

# 健康检查
health_check() {
    local url=$1
    local retries=${2:-$HEALTH_CHECK_RETRIES}
    
    log "健康检查: ${url}"
    for i in $(seq 1 $retries); do
        if curl -sf --max-time 5 "$url" > /dev/null 2>&1; then
            success "健康检查通过 (第${i}次尝试)"
            return 0
        fi
        warn "健康检查失败 (${i}/${retries})"
        sleep "$HEALTH_CHECK_INTERVAL"
    done
    error "健康检查失败，已达最大重试次数"
    return 1
}

# 更新 Nginx 灰度权重
update_canary_weight() {
    local weight=$1
    log "更新灰度权重: ${weight}%"
    
    if $DRY_RUN; then
        warn "DRY RUN: 跳过权重更新"
        return 0
    fi
    
    # 生成新的 nginx 配置
    cat > nginx/canary.conf <<NGINX_EOF
upstream backend_stable {
    server backend:3001;
}

upstream backend_canary {
    server backend-canary:3001;
}

split_clients "\${remote_addr}\${http_user_agent}" \$backend_group {
    ${weight}%    canary;
    *             stable;
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
        proxy_pass http://backend_\$backend_group;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Deployment-Group \$backend_group;
    }

    location /ws {
        proxy_pass http://backend_stable;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
    }

    location /health {
        proxy_pass http://backend_stable/health;
        access_log off;
    }

    # Canary 健康检查
    location /health/canary {
        proxy_pass http://backend_canary/health;
        access_log off;
    }

    # 部署状态接口
    location /deploy/status {
        default_type application/json;
        return 200 '{"deployment":"canary","weight":${weight},"version":"${IMAGE_TAG}"}';
    }
}
NGINX_EOF
    
    # 重载 nginx
    docker compose -f docker-compose.yml -f docker-compose.canary.yml exec nginx-canary nginx -s reload 2>/dev/null || true
    success "灰度权重已更新为 ${weight}%"
}

# 检查 Prometheus 指标
check_metrics() {
    log "检查 Prometheus 指标..."
    
    # 检查错误率
    local error_rate=$(curl -sf --max-time 5 \
        "${METRICS_ENDPOINT}?query=rate(http_requests_total{status=~\"5..\",deployment=\"canary\"}[5m])/rate(http_requests_total{deployment=\"canary\"}[5m])" \
        2>/dev/null | jq -r '.data.result[0].value[1] // "0"' 2>/dev/null || echo "0")
    
    # 检查 P99 延迟
    local latency=$(curl -sf --max-time 5 \
        "${METRICS_ENDPOINT}?query=histogram_quantile(0.99,rate(http_request_duration_seconds_bucket{deployment=\"canary\"}[5m]))" \
        2>/dev/null | jq -r '.data.result[0].value[1] // "0"' 2>/dev/null || echo "0")
    
    log "Canary 错误率: ${error_rate} | P99延迟: ${latency}s"
    
    # 比较阈值
    local error_ok=$(echo "$error_rate < $ERROR_RATE_THRESHOLD" | bc -l 2>/dev/null || echo "1")
    local latency_ok=$(echo "$latency * 1000 < $LATENCY_THRESHOLD_MS" | bc -l 2>/dev/null || echo "1")
    
    if [[ "$error_ok" == "1" && "$latency_ok" == "1" ]]; then
        success "指标检查通过"
        return 0
    else
        error "指标异常: 错误率=${error_rate} 延迟=${latency}s"
        return 1
    fi
}

# 回滚
rollback() {
    error "执行回滚..."
    record_event "rollback_start" "自动回滚触发"
    
    if $DRY_RUN; then
        warn "DRY RUN: 跳过回滚"
        return 0
    fi
    
    # 停止 canary 容器
    docker compose -f docker-compose.yml -f docker-compose.canary.yml stop backend-canary 2>/dev/null || true
    
    # 恢复原始 nginx 配置（无 canary）
    update_canary_weight 0
    
    record_event "rollback_complete" "Canary 已停止，流量恢复"
    success "回滚完成"
}

# 提升流量
promote_traffic() {
    local new_weight=$1
    log "提升灰度流量至 ${new_weight}%"
    
    update_canary_weight "$new_weight"
    record_event "promote" "权重提升至 ${new_weight}%"
    
    # 监控一段时间
    log "监控 ${MONITORING_DURATION}s ..."
    local elapsed=0
    while [[ $elapsed -lt $MONITORING_DURATION ]]; do
        if ! check_metrics; then
            if $ROLLBACK_ON_FAILURE; then
                rollback
                return 1
            fi
        fi
        sleep 30
        elapsed=$((elapsed + 30))
    done
    
    success "监控通过"
    return 0
}

# ======== 主流程 ========

record_event "deploy_start" "weight=${CANARY_WEIGHT},image=${IMAGE_TAG}"

# 1. 构建并启动 canary 容器
log "Step 1: 构建 Canary 镜像..."
if ! $DRY_RUN; then
    docker compose -f docker-compose.yml -f docker-compose.canary.yml build backend-canary \
        --build-arg IMAGE_TAG="${IMAGE_TAG}" 2>&1 | tail -5
    docker compose -f docker-compose.yml -f docker-compose.canary.yml up -d backend-canary
    record_event "canary_started"
fi

# 2. 健康检查
log "Step 2: Canary 健康检查..."
if ! $DRY_RUN; then
    if ! health_check "http://localhost:3001/health/simple" 20; then
        error "Canary 启动失败"
        record_event "deploy_failed" "健康检查失败"
        if $ROLLBACK_ON_FAILURE; then
            rollback
        fi
        exit 1
    fi
fi

# 3. 设置灰度权重
log "Step 3: 设置灰度权重 ${CANARY_WEIGHT}%..."
update_canary_weight "$CANARY_WEIGHT"
record_event "weight_set" "weight=${CANARY_WEIGHT}"

# 4. 监控期
log "Step 4: 监控阶段 (${MONITORING_DURATION}s)..."
if ! $DRY_RUN; then
    local_monitor_ok=true
    elapsed=0
    while [[ $elapsed -lt $MONITORING_DURATION ]]; do
        if ! check_metrics; then
            local_monitor_ok=false
            break
        fi
        sleep 30
        elapsed=$((elapsed + 30))
        log "监控进度: ${elapsed}/${MONITORING_DURATION}s"
    done
    
    if ! $local_monitor_ok; then
        error "监控阶段发现异常"
        if $ROLLBACK_ON_FAILURE; then
            rollback
            exit 1
        fi
    fi
    success "监控阶段通过"
fi

# 5. 自动提升
if $AUTO_PROMOTE && ! $DRY_RUN; then
    log "Step 5: 自动提升流量..."
    
    for weight in 25 50 75 100; do
        if [[ $weight -gt $CANARY_WEIGHT ]]; then
            if promote_traffic $weight; then
                if [[ $weight -eq 100 ]]; then
                    success "🎉 Canary 已完全提升为生产版本!"
                    record_event "deploy_complete" "全量发布成功"
                fi
            else
                error "流量提升失败"
                exit 1
            fi
        fi
    done
else
    record_event "deploy_complete" "灰度部署完成，等待手动提升"
    success "灰度部署完成！当前权重: ${CANARY_WEIGHT}%"
    log "手动提升: $0 --weight <新权重>"
fi
