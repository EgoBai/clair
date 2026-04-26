/**
 * Session 管理组件
 * 显示活跃设备、支持远程登出
 */
import { useState, useEffect } from 'react';

interface SessionInfo {
  id: string;
  device: string;
  location: string;
  ip: string;
  lastActive: string;
  isCurrent: boolean;
}

export function SessionManager({ sessions, onRevoke, onRevokeAll }: {
  sessions: SessionInfo[];
  onRevoke: (sessionId: string) => Promise<void>;
  onRevokeAll: () => Promise<void>;
}) {
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  const handleRevoke = async (sessionId: string) => {
    setRevoking(sessionId);
    try {
      await onRevoke(sessionId);
    } finally {
      setRevoking(null);
    }
  };

  const handleRevokeAll = async () => {
    setRevoking('all');
    try {
      await onRevokeAll();
      setConfirmRevokeAll(false);
    } finally {
      setRevoking(null);
    }
  };

  const otherSessions = sessions.filter(s => !s.isCurrent);
  const currentSession = sessions.find(s => s.isCurrent);

  return (
    <div className="session-manager">
      <h2>活跃设备管理</h2>
      <p className="description">管理您的登录设备，可以远程退出其他设备的登录</p>

      {currentSession && (
        <div className="session-section">
          <h3>当前设备</h3>
          <div className="session-card current">
            <div className="session-info">
              <span className="device-icon">💻</span>
              <div className="session-details">
                <strong>{currentSession.device}</strong>
                <span className="meta">{currentSession.location} · {currentSession.ip}</span>
                <span className="meta">最近活动: {currentSession.lastActive}</span>
              </div>
            </div>
            <span className="current-badge">当前设备</span>
          </div>
        </div>
      )}

      {otherSessions.length > 0 && (
        <div className="session-section">
          <div className="section-header">
            <h3>其他设备 ({otherSessions.length})</h3>
            <button
              type="button"
              className="danger-button small"
              onClick={() => setConfirmRevokeAll(true)}
              disabled={revoking !== null}
            >
              退出所有其他设备
            </button>
          </div>

          {otherSessions.map(session => (
            <div key={session.id} className="session-card">
              <div className="session-info">
                <span className="device-icon">
                  {session.device.includes('iOS') ? '📱' : session.device.includes('Android') ? '🤖' : '💻'}
                </span>
                <div className="session-details">
                  <strong>{session.device}</strong>
                  <span className="meta">{session.location} · {session.ip}</span>
                  <span className="meta">最近活动: {session.lastActive}</span>
                </div>
              </div>
              <button
                type="button"
                className="danger-outline-button small"
                onClick={() => handleRevoke(session.id)}
                disabled={revoking !== null}
              >
                {revoking === session.id ? '退出中...' : '退出'}
              </button>
            </div>
          ))}
        </div>
      )}

      {otherSessions.length === 0 && (
        <p className="no-other-sessions">没有其他设备的登录记录</p>
      )}

      {confirmRevokeAll && (
        <div className="confirm-modal">
          <div className="modal-content">
            <h3>确认退出所有设备？</h3>
            <p>其他所有设备将被强制退出，您需要在这些设备上重新登录</p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setConfirmRevokeAll(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={handleRevokeAll}
                disabled={revoking !== null}
              >
                {revoking === 'all' ? '退出中...' : '确认退出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(SessionManager);
