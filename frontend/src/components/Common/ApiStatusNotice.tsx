/**
 * 统一接口状态提示组件 —— 三类「取不到数据」形态的**唯一渲染出口**
 *
 * ## 为什么要有统一出口
 *
 * 在它之前，每个页面/组件各自写死一段失败文案：
 *
 *   - `市场宽度接口请求失败：{error}。这表示未能取到数据，不代表全市场没有涨跌家数。`
 *   - `大宗交易接口请求失败：{fetchError}。这表示未能取到数据，不代表当天没有大宗交易。`
 *   - `接口请求失败` / `数据不可用` / `暂无数据` …
 *
 * 这些文案对**本地全量后端**是对的；但线上接的是 Cloudflare Worker，
 * 大量端点压根没挂载，页面拿到的是 `HTTP 404 + {success:false,error:'Not found'}`。
 * 此时继续显示「接口请求失败」是在撒谎——用户会以为产品坏了，
 * 真相是「演示环境没挂这个接口」。反过来，把「对方真的没有数据」说成
 * 「接口没挂载」同样是撒谎。两件事必须各说各话。
 *
 * 本组件只做一件事：拿到 `ApiStatus`，按 kind 渲染对应文案。所有改动过的页面
 * 都消费同一个组件，文案只有一处真源（`utils/apiStatus.ts` 的 describeApiStatus）。
 *
 * ## 与 ErrorBoundary 的分工
 *
 * `components/ErrorBoundary.tsx` 兜的是**渲染崩溃**（JS 抛异常、组件树挂掉）；
 * 本组件兜的是**数据态**（接口返回了，但告诉我们它取不到东西）。两者职责不同，
 * 本文件不参与任何 ErrorBoundary 逻辑。
 */

import React, { useEffect, useState } from 'react';
import { Alert, Button, Space } from 'antd';
import { ApiOutlined, InboxOutlined, ReloadOutlined } from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import {
  type ApiStatus,
  type ApiStatusKind,
  describeApiStatus,
  shortApiStatusText,
} from '../../utils/apiStatus';
import {
  type EndpointRecord,
  clearNotDeployed,
  snapshotNotDeployed,
  subscribeNotDeployed,
} from '../../services/apiGateway';

export interface ApiStatusNoticeProps {
  status?: ApiStatus | null;
  /** 模块展示名，如「市场宽度」「龙虎榜」——用于把「哪一块没有」说清楚 */
  moduleName?: string;
  onRetry?: () => void;
  /** 紧凑模式：只显示一行，用于卡片内部占位 */
  compact?: boolean;
  /** 自定义补充文案（追加在默认说明之后） */
  extra?: string;
  style?: React.CSSProperties;
}

const KIND_META: Record<Exclude<ApiStatusKind, 'ok'>, { type: 'info' | 'warning' | 'error'; color: string }> = {
  // 未部署是**环境事实**，不是故障 → 用 info，避免误导成页面出错
  'not-deployed': { type: 'info', color: '#64748b' },
  // 接口在、数据确实没有 → 用 warning 偏中性
  unavailable: { type: 'warning', color: '#94a3b8' },
  // 真失败 → error，且必须给重试
  failed: { type: 'error', color: '#ef4444' },
};

/**
 * 按 `ApiStatus.kind` 渲染对应解释。`kind === 'ok'` 或不传 status 时渲染空。
 *
 * 数据测试属性 `data-testid="api-status-notice"` + `data-status="<kind>"`：
 * 用于自动化断言页面上出现的**是**哪一类文案（见 verification 脚本）。
 */
export const ApiStatusNotice: React.FC<ApiStatusNoticeProps> = ({
  status,
  moduleName,
  onRetry,
  compact,
  extra,
  style,
}) => {
  if (!status || status.kind === 'ok') return null;

  const meta = KIND_META[status.kind];
  const copy = describeApiStatus(status, moduleName);

  if (compact) {
    return (
      <div
        data-testid="api-status-notice"
        data-status={status.kind}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--text-secondary, #94a3b8)',
          background: 'rgba(148,163,184,0.10)',
          border: '1px solid rgba(148,163,184,0.28)',
          ...style,
        }}
      >
        <ApiOutlined />
        <span>{shortApiStatusText(status)}</span>
        {status.endpoint && (
          <code style={{ fontSize: 11, opacity: 0.85 }}>{status.endpoint}</code>
        )}
        {extra && <span style={{ opacity: 0.85 }}>{extra}</span>}
        {onRetry && (
          <Button size="small" type="text" icon={<ReloadOutlined />} onClick={onRetry} style={{ marginLeft: 'auto' }}>
            重试
          </Button>
        )}
      </div>
    );
  }

  const icon =
    status.kind === 'unavailable' ? <InboxOutlined /> : <ApiOutlined />;

  return (
    // 用外层 div 承载 data-* ：antd Alert 是否把未知 props 透传到根节点取决于版本，
    // 断言脚本必须稳定拿到这两个属性，故不依赖其内部实现。
    <div data-testid="api-status-notice" data-status={status.kind} style={style}>
      <Alert
        type={meta.type}
        showIcon
        icon={icon}
      message={<span style={{ fontWeight: 600 }}>{copy.title}</span>}
      description={
        <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
          <div>{copy.description}</div>
          {status.endpoint && (
            <div style={{ marginTop: 4, opacity: 0.85 }}>
              端点：<code>{status.endpoint}</code>
            </div>
          )}
          {extra && <div style={{ marginTop: 4 }}>{extra}</div>}
          {onRetry && (
            <Space style={{ marginTop: 8 }}>
              <Button size="small" icon={<ReloadOutlined />} onClick={onRetry}>
                重试
              </Button>
            </Space>
          )}
        </div>
      }
      />
    </div>
  );
};

/**
 * 语义明确的「暂无数据」提示。**仅在已确认是数据缺失（而非端点未部署）时使用**。
 * 不确定时请传 `status` 给 `ApiStatusNotice`，让它去判别——直接写死「暂无数据」
 * 正是本项目历史上把「未部署」伪装成「无数据」的老毛病。
 */
export const UnavailableNotice: React.FC<{ moduleName?: string; reason?: string; onRetry?: () => void }> = ({
  moduleName,
  reason,
  onRetry,
}) => (
  <ApiStatusNotice
    moduleName={moduleName}
    onRetry={onRetry}
    status={{ kind: 'unavailable', reason }}
  />
);

/**
 * 全局兜底 Banner —— 给「还没有逐页改造」的那些页面用的诚实降级
 *
 * 本工单逐一改造了若干代表性页面，但线上 Worker 缺口的端点涉及几十处调用点。
 * 未被改造的页面仍可能出现空白/含糊空态，本 Banner 在页面顶部给出**环境级说明**，
 * 让「演示环境没挂这个接口」这件事实不被吞掉。
 *
 * ⚠️ 部署位置约束：必须挂在 AppLayout 里、且排在 `<Outlet />` **之前**。
 * React 的 effect 按树序执行，Banner 在前才能保证它的「导航即清空、并记录基线时间」
 * 早于页面自身的取数 effect，否则会出现「页面已取数但 Banner 基线更晚 → 条目被过滤掉」。
 */
export const NotDeployedBanner: React.FC = () => {
  const location = useLocation();
  const [entries, setEntries] = useState<EndpointRecord[]>([]);

  useEffect(() => {
    // 换页面就是换上下文：上一页确认过的「未部署」结论不能污染当前页
    clearNotDeployed();
    const since = Date.now();
    const refresh = () => setEntries(snapshotNotDeployed().filter((e) => e.at >= since));
    refresh();
    return subscribeNotDeployed(refresh);
  }, [location.pathname]);

  if (entries.length === 0) return null;

  return (
    <Alert
      data-testid="not-deployed-banner"
      type="info"
      showIcon
      style={{ margin: '12px 16px 0', borderRadius: 10 }}
      message={
        <span style={{ fontWeight: 600 }}>
          本页部分模块需要连接完整后端才能查看
        </span>
      }
      description={
        <div style={{ fontSize: 12.5, lineHeight: 1.8 }}>
          <div>
            当前线上部署的是轻量演示后端（Cloudflare Worker），以下接口在其中未挂载。
            这不是「暂无数据」，也不是请求失败——要查看这些模块的真实数据，请连接完整后端服务。
          </div>
          <div style={{ marginTop: 4, opacity: 0.9 }}>
            未挂载端点：
            {entries.map((e) => (
              <code key={e.endpoint} style={{ marginRight: 8, fontSize: 11.5 }}>
                {e.endpoint}
              </code>
            ))}
          </div>
        </div>
      }
    />
  );
};
