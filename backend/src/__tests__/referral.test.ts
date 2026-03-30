/**
 * 邀请码与推广系统 - Round 180
 * 覆盖：邀请码生成/验证、返利计算、推广统计
 */
import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';

interface InviteCode {
  code: string;
  creatorId: string;
  maxUses: number;
  currentUses: number;
  expiresAt: number;
  rewardDays: number; // 邀请人获得的奖励天数
  bonusDays: number; // 被邀请人获得的额外天数
  active: boolean;
}

interface ReferralRecord {
  inviteCode: string;
  inviterId: string;
  inviteeId: string;
  timestamp: number;
  rewardGranted: boolean;
}

class ReferralSystem {
  private codes: Map<string, InviteCode> = new Map();
  private referrals: ReferralRecord[] = [];

  generateCode(creatorId: string, opts: Partial<InviteCode> = {}): string {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    this.codes.set(code, {
      code,
      creatorId,
      maxUses: opts.maxUses || 10,
      currentUses: 0,
      expiresAt: opts.expiresAt || Date.now() + 30 * 24 * 60 * 60 * 1000,
      rewardDays: opts.rewardDays || 7,
      bonusDays: opts.bonusDays || 3,
      active: true,
    });
    return code;
  }

  validateCode(code: string, now: number = Date.now()): { valid: boolean; reason?: string; invite?: InviteCode } {
    const invite = this.codes.get(code);
    if (!invite) return { valid: false, reason: '邀请码不存在' };
    if (!invite.active) return { valid: false, reason: '邀请码已停用' };
    if (invite.expiresAt < now) return { valid: false, reason: '邀请码已过期' };
    if (invite.currentUses >= invite.maxUses) return { valid: false, reason: '邀请码使用次数已满' };
    return { valid: true, invite };
  }

  useCode(code: string, inviteeId: string, now: number = Date.now()): { success: boolean; reason?: string; rewardDays?: number; bonusDays?: number } {
    const validation = this.validateCode(code, now);
    if (!validation.valid) return { success: false, reason: validation.reason };

    const invite = validation.invite!;
    invite.currentUses++;

    const record: ReferralRecord = {
      inviteCode: code,
      inviterId: invite.creatorId,
      inviteeId,
      timestamp: now,
      rewardGranted: true,
    };
    this.referrals.push(record);

    return {
      success: true,
      rewardDays: invite.rewardDays,
      bonusDays: invite.bonusDays,
    };
  }

  getStats(userId: string): { totalInvites: number; totalRewardDays: number; activeInvitees: string[] } {
    const userReferrals = this.referrals.filter(r => r.inviterId === userId);
    let totalRewardDays = 0;
    for (const r of userReferrals) {
      const code = this.codes.get(r.inviteCode);
      if (code) totalRewardDays += code.rewardDays;
    }
    return {
      totalInvites: userReferrals.length,
      totalRewardDays,
      activeInvitees: userReferrals.map(r => r.inviteeId),
    };
  }

  deactivateCode(code: string): boolean {
    const invite = this.codes.get(code);
    if (!invite) return false;
    invite.active = false;
    return true;
  }
}

describe('邀请码与推广系统', () => {
  let system: ReferralSystem;
  let code: string;

  beforeEach(() => {
    system = new ReferralSystem();
    code = system.generateCode('inviter1');
  });

  describe('邀请码生成', () => {
    it('应生成8字符邀请码', () => {
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[A-F0-9]+$/);
    });

    it('多次生成应不同', () => {
      const codes = new Set(Array.from({ length: 100 }, () => system.generateCode('user')));
      expect(codes.size).toBe(100);
    });
  });

  describe('邀请码验证', () => {
    it('有效邀请码应通过', () => {
      const result = system.validateCode(code);
      expect(result.valid).toBe(true);
    });

    it('不存在的邀请码应失败', () => {
      const result = system.validateCode('INVALID1');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('邀请码不存在');
    });

    it('过期邀请码应失败', () => {
      const expiredCode = system.generateCode('user', { expiresAt: Date.now() - 1000 });
      const result = system.validateCode(expiredCode);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('邀请码已过期');
    });

    it('用尽邀请码应失败', () => {
      const limitedCode = system.generateCode('user', { maxUses: 1 });
      system.useCode(limitedCode, 'invitee1');
      const result = system.validateCode(limitedCode);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('已满');
    });

    it('停用邀请码应失败', () => {
      system.deactivateCode(code);
      const result = system.validateCode(code);
      expect(result.valid).toBe(false);
    });
  });

  describe('使用邀请码', () => {
    it('使用邀请码应成功', () => {
      const result = system.useCode(code, 'newuser1');
      expect(result.success).toBe(true);
      expect(result.rewardDays).toBe(7);
      expect(result.bonusDays).toBe(3);
    });

    it('应记录推荐关系', () => {
      system.useCode(code, 'newuser1');
      const stats = system.getStats('inviter1');
      expect(stats.totalInvites).toBe(1);
      expect(stats.activeInvitees).toContain('newuser1');
    });

    it('多次使用应计数', () => {
      system.useCode(code, 'user1');
      system.useCode(code, 'user2');
      const stats = system.getStats('inviter1');
      expect(stats.totalInvites).toBe(2);
      expect(stats.totalRewardDays).toBe(14);
    });

    it('使用无效邀请码应失败', () => {
      const result = system.useCode('INVALID', 'user1');
      expect(result.success).toBe(false);
    });
  });

  describe('推广统计', () => {
    it('应正确统计总奖励天数', () => {
      system.useCode(code, 'user1');
      system.useCode(code, 'user2');
      system.useCode(code, 'user3');
      const stats = system.getStats('inviter1');
      expect(stats.totalRewardDays).toBe(21);
    });

    it('无推荐记录应返回0', () => {
      const stats = system.getStats('nobody');
      expect(stats.totalInvites).toBe(0);
      expect(stats.totalRewardDays).toBe(0);
    });
  });
});
