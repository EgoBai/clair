/**
 * 成长中心（JourneyPage）— 澄观Clair 游戏化二期
 *
 * 数据全部来自 useGamificationStore（progression / achievements / quests / companion），
 * 配置来自 config/gamification.ts（LevelConfig / AchievementConfig / QuestConfig）。
 * 完整覆盖：①成长概览 ②成就墙 ③任务面板 ④伴生助手，兼容空态/初始态渲染。
 */

import React, { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Card, Row, Col, Progress, Tag, Typography, Tooltip } from 'antd';
import {
  useProgression,
  useAchievements,
  useCompanion,
  useGamificationStore,
} from '../store/useGamificationStore';
import { LevelConfig, AchievementConfig, QuestConfig, type QuestType } from '../config/gamification';
import { THEME } from '../styles/theme-constants';

const { Title, Text } = Typography;

const BG = THEME.bg;
const CARD_BG = THEME.cardBg;
const BORDER = THEME.border;
const TEXT = THEME.text;
const TEXT_SEC = THEME.textSec;
const ACCENT = THEME.accent;

// 伴生情绪 → emoji（仅展示用，情绪类型来自 config 的 CompanionMood）
const MOOD_EMOJI: Record<string, string> = {
  excited: '🤩',
  happy: '😊',
  calm: '😌',
  sleepy: '😴',
};
const MOOD_LABEL: Record<string, string> = {
  excited: '兴奋',
  happy: '开心',
  calm: '平静',
  sleepy: '困倦',
};

// 计数器 key → 中文标签（仅展示用，全部为 config 中真实存在的 key）
const COUNTER_LABEL: Record<string, string> = {
  stock_viewed: '查看个股',
  note_created: '创建笔记',
  backtest_run: '运行回测',
  ai_chat: 'AI 对话',
  page_visited_distinct: '访问页面',
  watchlist_added: '自选股',
  report_generated: '生成研报',
  factor_run: '因子分析',
  risk_checked: '风险中心',
};

const QUEST_TYPE_LABEL: Record<QuestType, string> = {
  daily: '每日任务',
  weekly: '每周任务',
  onboarding: '新手任务',
};

// 由累计 XP 推导当前等级信息 + 到下一级的进度
function levelInfo(level: number, xp: number) {
  const cur = LevelConfig.find((l) => l.level === level) ?? LevelConfig[0];
  const next = LevelConfig.find((l) => l.level === level + 1);
  if (!next) {
    return { name: cur.name, pct: 100, curXp: xp, spanXp: 0, max: true, nextName: '' };
  }
  const span = next.xpRequired - cur.xpRequired;
  const done = Math.min(Math.max(xp - cur.xpRequired, 0), span);
  return { name: cur.name, pct: Math.round((done / span) * 100), curXp: done, spanXp: span, max: false, nextName: next.name };
}

const JourneyPage: React.FC = () => {
  const progression = useProgression();
  const achievements = useAchievements();
  const companion = useCompanion();
  const counters = useGamificationStore(useShallow((s) => s.counters));
  const quests = useGamificationStore(useShallow((s) => s.quests));

  const lv = useMemo(() => levelInfo(progression.level, progression.xp), [progression.level, progression.xp]);
  const unlockedCount = Object.keys(achievements.unlocked).length;

  // 任务按类型分组（顺序：新手 / 每日 / 每周）
  const grouped = useMemo(() => {
    const g: Record<QuestType, typeof QuestConfig> = { onboarding: [], daily: [], weekly: [] };
    for (const q of QuestConfig) g[q.type].push(q);
    return g;
  }, []);

  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '24px 32px', color: TEXT }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Title level={3} style={{ color: TEXT, marginBottom: 4 }}>
          成长中心
        </Title>
        <Text style={{ color: TEXT_SEC }}>你的澄观投研成长旅程 · 等级、成就、任务与伴生助手</Text>

        {/* ========== ① 成长概览卡 ========== */}
        <Card
          style={{ background: CARD_BG, border: `1px solid ${BORDER}`, marginTop: 20, marginBottom: 16, borderRadius: 12 }}
          bodyStyle={{ padding: '20px 24px' }}
        >
          <Row align="middle" gutter={24}>
            <Col xs={24} md={5} style={{ textAlign: 'center' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%', margin: '0 auto',
                background: 'rgba(59,130,246,0.15)', border: `2px solid ${ACCENT}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, fontWeight: 800, color: ACCENT,
              }}>
                Lv.{progression.level}
              </div>
            </Col>
            <Col xs={24} md={13}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>{lv.name}</span>
                <Tag color="blue" style={{ borderRadius: 6 }}>投研称号</Tag>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: TEXT_SEC, marginBottom: 4 }}>
                  <span>{lv.max ? '已达最高等级' : `距离「${lv.nextName}」`}</span>
                  <span>{lv.max ? `${progression.xp} XP` : `${lv.curXp} / ${lv.spanXp} XP`}</span>
                </div>
                <Progress percent={lv.pct} showInfo={false} strokeColor={ACCENT} trailColor="rgba(148,163,184,0.2)" />
                <div style={{ fontSize: 12, color: TEXT_SEC, marginTop: 4 }}>
                  累计经验 <Text strong style={{ color: TEXT }}>{progression.xp}</Text> XP
                </div>
              </div>
            </Col>
            <Col xs={24} md={6}>
              <Row gutter={[0, 12]}>
                <Col span={12} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: TEXT }}>{progression.streakDays}</div>
                  <div style={{ fontSize: 12, color: TEXT_SEC }}>连续打卡(天)</div>
                </Col>
                <Col span={12} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: TEXT }}>{unlockedCount}/{AchievementConfig.length}</div>
                  <div style={{ fontSize: 12, color: TEXT_SEC }}>成就解锁</div>
                </Col>
              </Row>
            </Col>
          </Row>
        </Card>

        {/* ========== ② 成就墙 ========== */}
        <Card
          title={<span style={{ color: TEXT }}>🏆 成就墙 <span style={{ fontSize: 12, color: TEXT_SEC, fontWeight: 400 }}>（{unlockedCount}/{AchievementConfig.length} 已解锁）</span></span>}
          style={{ background: CARD_BG, border: `1px solid ${BORDER}`, marginBottom: 16, borderRadius: 12 }}
          bodyStyle={{ padding: 16 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {AchievementConfig.map((a) => {
              const unlocked = !!achievements.unlocked[a.id];
              const at = achievements.unlocked[a.id];
              return (
                <Tooltip key={a.id} title={unlocked ? `解锁于 ${new Date(at).toLocaleString('zh-CN')}` : a.desc}>
                  <div style={{
                    background: unlocked ? 'rgba(59,130,246,0.10)' : 'transparent',
                    border: `1px solid ${unlocked ? ACCENT : BORDER}`,
                    borderRadius: 12, padding: '14px 16px', opacity: unlocked ? 1 : 0.55,
                    transition: 'all 0.2s',
                  }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{a.icon}</div>
                    <div style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>{a.title}</div>
                    <div style={{ color: TEXT_SEC, fontSize: 12, marginTop: 4, lineHeight: 1.6 }}>{a.desc}</div>
                    {unlocked ? (
                      <Tag color="green" style={{ marginTop: 10, fontSize: 11, borderRadius: 4 }}>
                        已解锁{at ? ` · ${new Date(at).toLocaleDateString('zh-CN')}` : ''}
                      </Tag>
                    ) : (
                      <Tag style={{ marginTop: 10, fontSize: 11, borderRadius: 4, color: TEXT_SEC, borderColor: BORDER }}>未解锁</Tag>
                    )}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </Card>

        {/* ========== ③ 任务面板 ========== */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
          {(Object.keys(grouped) as QuestType[]).map((type) => (
            <Card
              key={type}
              title={<span style={{ color: TEXT }}>{QUEST_TYPE_LABEL[type]} <span style={{ fontSize: 12, color: TEXT_SEC, fontWeight: 400 }}>（{grouped[type].length}）</span></span>}
              style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12 }}
              bodyStyle={{ padding: 16 }}
            >
              {grouped[type].length === 0 ? (
                <div style={{ color: TEXT_SEC, fontSize: 13 }}>暂无任务</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {grouped[type].map((q) => {
                    const qp = quests.progress[q.id];
                    const done = !!quests.completed[q.id];
                    let totalTarget = 0;
                    let totalCur = 0;
                    const steps = q.steps.map((st) => {
                      const target = st.target;
                      const cur = Math.min(qp?.[st.key] ?? 0, target);
                      totalTarget += target;
                      totalCur += cur;
                      return { key: st.key, target, cur };
                    });
                    const pct = totalTarget ? Math.round((totalCur / totalTarget) * 100) : 0;
                    return (
                      <div key={q.id} style={{
                        border: `1px solid ${done ? ACCENT : BORDER}`,
                        borderRadius: 10, padding: '12px 14px',
                        background: done ? 'rgba(59,130,246,0.08)' : 'transparent',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>{q.title}</span>
                          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <Tag color="gold" style={{ fontSize: 11, borderRadius: 4, margin: 0 }}>+{q.xpReward} XP</Tag>
                            {done && <Tag color="green" style={{ fontSize: 11, borderRadius: 4, margin: 0 }}>已完成</Tag>}
                          </span>
                        </div>
                        <Progress percent={pct} showInfo={false} strokeColor={done ? '#22c55e' : ACCENT} trailColor="rgba(148,163,184,0.2)" />
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                          {steps.map((st) => (
                            <Tag key={st.key} style={{ fontSize: 11, borderRadius: 4, color: st.cur >= st.target ? '#22c55e' : TEXT_SEC, borderColor: st.cur >= st.target ? '#22c55e' : BORDER, margin: 0 }}>
                              {COUNTER_LABEL[st.key] ?? st.key}: {st.cur}/{st.target}
                            </Tag>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* ========== ④ 伴生助手卡 ========== */}
        <Card
          title={<span style={{ color: TEXT }}>🤖 伴生助手</span>}
          style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12 }}
          bodyStyle={{ padding: '20px 24px' }}
        >
          <Row align="middle" gutter={20}>
            <Col flex="none">
              <div style={{ fontSize: 48, lineHeight: 1 }}>{MOOD_EMOJI[companion.mood]}</div>
            </Col>
            <Col flex="auto">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: TEXT }}>{companion.name}</span>
                <Tag color="purple" style={{ borderRadius: 6 }}>{MOOD_LABEL[companion.mood]}</Tag>
                <Tag style={{ borderRadius: 6, color: TEXT_SEC, borderColor: BORDER, margin: 0 }}>连续打卡 {progression.streakDays} 天</Tag>
              </div>
              <div style={{ fontSize: 13, color: TEXT_SEC, marginTop: 8, lineHeight: 1.7 }}>{companion.message}</div>
            </Col>
          </Row>
        </Card>
      </div>
    </div>
  );
};

export default JourneyPage;
