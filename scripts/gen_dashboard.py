#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_dashboard.py —— Clair 工程进度看板数据生成器

从仓库内的 PLAN.md / DECISION_LOG.md 抽取结构化进度数据，产出：
  1. docs/dashboard-data.json   —— 干净 JSON（提交到 github 后，页面可拉取实现自动刷新）
  2. docs/clair-dashboard.html  —— 数据驱动的自包含看板（内嵌快照 + 加载时拉取 raw JSON）

用法：
  python3 scripts/gen_dashboard.py [--repo-root .] [--out docs]
依赖：仅标准库。
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import re
import sys

REPO = "EgoBai/clair"
BRANCH = "main"
RAW_BASE = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}"


# ------------------------- 通用 markdown 工具 -------------------------
def read_text(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def split_rows(line: str) -> list[str]:
    """把 `| a | b | c |` 拆成 ['a','b','c']。"""
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    return [c.strip() for c in s.split("|")]


def is_table_sep(line: str) -> bool:
    return bool(re.match(r"^\s*\|?[\s:|-]+\|?\s*$", line)) and "-" in line


def parse_tables(text: str) -> list[dict]:
    """抽取文本中所有 markdown 表格，返回 [{headers:[...], rows:[[...],...]}, ...]。"""
    tables: list[dict] = []
    lines = text.splitlines()
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        if line.strip().startswith("|") and not is_table_sep(line):
            # 候选表头
            header = split_rows(line)
            j = i + 1
            if j < n and is_table_sep(lines[j]):
                rows: list[list[str]] = []
                k = j + 1
                while k < n and lines[k].strip().startswith("|") and not is_table_sep(lines[k]):
                    rows.append(split_rows(lines[k]))
                    k += 1
                if rows:
                    tables.append({"headers": header, "rows": rows})
                i = k
                continue
        i += 1
    return tables


def find_table(tables: list[dict], *kw: str) -> dict | None:
    """按表头包含的关键字定位表格（所有 kw 都必须出现在某行表头里）。"""
    for t in tables:
        head = " ".join(t["headers"])
        if all(k in head for k in kw):
            return t
    return None


# ------------------------- 各区块解析 -------------------------
def parse_overview(plan: str, log: str = "") -> dict:
    ov: dict = {
        "round": 0,
        "totalTickets": 0,
        "pagesActive": "—",
        "realDataSources": 0,
        "health": "未知",
        "sprint5Progress": "—",
        "stagnation": False,
        "stagnationDetail": "",
    }
    both = plan + "\n" + log
    # 最新轮次：取所有「第N轮」最大值（D19 等停滞记录写在 DECISION_LOG）
    rounds = [int(m) for m in re.findall(r"第(\d+)轮", both)]
    if rounds:
        ov["round"] = max(rounds)
    m = re.search(r"累计完成\s*Ticket\s*\|?\s*(\d+)", plan)
    if m:
        ov["totalTickets"] = int(m.group(1))
    m = re.search(r"全部\s*(\d+)\s*页均有导航入口", plan)
    if m:
        ov["pagesActive"] = f"{m.group(1)}·{m.group(1)}"
    m = re.search(r"Sprint 5 完成率\s*\|\s*(\d+%)", plan)
    if m:
        ov["sprint5Progress"] = m.group(1)
    # 健康 / 停滞：以「最近一轮」行（当前状态快照）为准做否定感知判定，
    # 全文关键词匹配会误报历史记录（如「安全无需 PAUSE」「D19 已解除」），曾与 D20 自污染误判同源
    m_latest = re.search(r"\|\s*最近一轮\s*\|\s*(.+)", plan)
    signal = m_latest.group(1) if m_latest else both

    def _pause_signal(text: str) -> bool:
        for kw in ("PAUSE", "停滞", "红线连续"):
            for km in re.finditer(kw, text):
                ctx = text[max(0, km.start() - 16):km.end() + 16]
                if re.search(r"无需|未触发|不触发|已解除|非停滞|无风险|已恢复|已收口", ctx):
                    continue
                return True
        return False

    if _pause_signal(signal):
        ov["stagnation"] = True
        m = re.search(r"D19[^\n]*?(红线连续\d+轮触发[^\n]*)", plan)
        ov["stagnationDetail"] = (m.group(1).strip() if m else "工作区停滞，automation 严守红线 PAUSE")
        ov["health"] = "🟠 暂停（PAUSE 红线·工作区停滞）"
    else:
        ov["health"] = "🟢 全绿（待命）" if "待命" in signal else "🟢 全绿"
    # 真实数据源计数：§七·六 B 表中 已落地 + 进行中 的条数
    bt = parse_tables(plan)
    btab = find_table(btab_all(bt, plan), "Ticket", "真实源")
    if btab:
        ov["realDataSources"] = len(btab["rows"])
    return ov


def btab_all(tables, plan):
    # §七·六 B 表头：阶段|Ticket|范围|真实源|优先级
    for t in tables:
        h = " ".join(t["headers"])
        if "Ticket" in h and "真实源" in h and "优先级" in h:
            return [t]
    return []


def parse_sprints(plan: str) -> list[dict]:
    sprints: list[dict] = []
    lines = plan.splitlines()
    cur = None
    for line in lines:
        m = re.match(r"###\s*Sprint\s*(\d+)[：:]\s*(.+)", line)
        if m:
            if cur:
                sprints.append(cur)
            cur = {"id": f"Sprint{m.group(1)}", "title": m.group(2).strip(), "done": 0, "total": 0}
            continue
        if cur is not None:
            # 任务行形如 | S1-1 | ... | 或 | S5-3 | ... |
            if line.strip().startswith("|") and re.search(r"\bS\d+-\d+\b", line):
                cur["total"] += 1
                if "✅" in line:
                    cur["done"] += 1
    if cur:
        sprints.append(cur)
    for s in sprints:
        s["pct"] = round(100 * s["done"] / s["total"]) if s["total"] else 0
        s["status"] = "✅ 完成" if s["done"] == s["total"] else ("⏳ 进行中" if s["done"] else "⬜ 未启动")
    return sprints


def parse_real_sources(plan: str) -> list[dict]:
    tables = parse_tables(plan)
    t = find_table(btab_all(tables, plan), "Ticket", "真实源")
    out: list[dict] = []
    if not t:
        return out
    for r in t["rows"]:
        # 列：阶段|Ticket|范围|真实源|优先级
        if len(r) < 5:
            continue
        m = re.match(r"\**\s*(T\d+[a-z]?)", r[1])
        if not m:
            continue  # 跳过「暂缓」汇总行等非数据源行
        ticket = m.group(1)
        scope = r[2]
        landed = "✅" in r[1] or "已落地" in scope
        status = "✅ 已落地" if landed else ("⏸ 暂缓" if "暂缓" in r[0] or "阻塞" in scope else "🔵 进行中")
        name = re.sub(r"^\s*\**\s*✅?\s*已落地（[^）]*）[：:]\s*", "", scope)
        name = re.sub(r"已落地（第\d+轮）", "", name).strip()
        out.append({
            "ticket": ticket,
            "name": name[:60],
            "status": status,
            "source": r[3].strip(),
            "priority": r[4].strip(),
        })
    return out


def parse_decisions(log: str) -> list[dict]:
    tables = parse_tables(log)
    t = find_table(tables, "事项", "状态")
    out: list[dict] = []
    if not t:
        return out
    for r in t["rows"]:
        if len(r) < 5:
            continue
        rid = r[0].strip()
        if not re.match(r"^D\d+$", rid):
            continue
        status_raw = r[-1]  # 状态在最末列（5/6 列均兼容）
        if "已决" in status_raw or "✅" in status_raw:
            st = "✅ 已决"
        elif "搁置" in status_raw or "⏸" in status_raw:
            st = "⏸ 搁置"
        elif "阻塞" in status_raw or "⚠️" in status_raw:
            st = "⚠️ 阻塞"
        elif "停滞" in status_raw:
            st = "🔴 停滞"
        else:
            st = "🟡 待决策"
        out.append({
            "id": rid,
            "date": r[1].strip(),
            "level": r[2].strip(),
            "title": re.sub(r"\s+", " ", r[3]).strip()[:50],
            "status": st,
        })
    return out


def parse_tech_debts(plan: str) -> list[dict]:
    # §八 技术债：定位以 | T2 | 开头的表
    out: list[dict] = []
    in_sec = False
    for line in plan.splitlines():
        if line.strip().startswith("## 八"):
            in_sec = True
            continue
        if in_sec and line.strip().startswith("## "):
            break
        if in_sec and line.strip().startswith("|") and re.match(r"\|\s*T[\w-]+\s*\|", line):
            cells = split_rows(line)
            if len(cells) < 4:
                continue
            tid = cells[0].strip()
            desc = re.sub(r"~~[^~]+~~", "", cells[1]).strip()  # 去删除线
            desc = re.sub(r"\*\*✅[^*|]*", "", desc).strip()
            desc = re.sub(r"\*\*", "", desc).strip()
            priority = cells[2].strip()
            cleared = "✅" in cells[1] or "已清" in cells[3]
            status = "✅ 已清" if cleared else "🔧 在管"
            out.append({"id": tid, "desc": desc[:60], "priority": priority, "status": status})
    return out


def parse_swarm_subs(plan: str) -> list[dict]:
    # §七·六 D：| SUB-1 | 范围 | 归属 |
    out: list[dict] = []
    for line in plan.splitlines():
        if re.match(r"\|\s*SUB-\d+\s*\|", line):
            cells = split_rows(line)
            if len(cells) < 3:
                continue
            out.append({"id": cells[0].strip(), "scope": cells[1].strip()[:70], "owner": cells[2].strip()})
    return out


def parse_orchestrator(plan: str) -> list[dict]:
    # §七·六 E：| **S2-1** ... | 内容 | 文件域 | 验收 |
    out: list[dict] = []
    for line in plan.splitlines():
        m = re.match(r"\|\s*\*\*(S2-\d+|FAC-\d+|MP-\d+)\*\*\s*([^|]+)\|", line)
        if m:
            out.append({"id": m.group(1), "title": m.group(2).strip()[:60]})
    return out


def parse_timeline(plan: str) -> list[dict]:
    out: list[dict] = []
    for line in plan.splitlines():
        m = re.search(r"第(\d+)轮\s*\|\s*\*\*（([^）]+)）\*\*[：:]\s*([^\n|]+)", line)
        if m:
            out.append({"round": int(m.group(1)), "tag": m.group(2).strip()[:40], "summary": m.group(3).strip()[:90]})
    # 取最新若干
    out.sort(key=lambda x: x["round"], reverse=True)
    return out[:8]


# ------------------------- HTML 模板 -------------------------
HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Clair 澄观 · 工程进度看板</title>
<style>
  :root{
    --bg:#0d1117; --panel:#161b22; --panel2:#1c2330; --line:#2a3441;
    --txt:#e6edf3; --muted:#8b98a9; --up:#ff4d4f; --down:#26a69a;
    --accent:#3b82f6; --gold:#f0b90b; --green:#2ea043; --orange:#d29922; --red:#f85149;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--txt);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
    line-height:1.5;font-size:14px}
  .wrap{max-width:1180px;margin:0 auto;padding:24px 18px 60px}
  header.top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px}
  h1{font-size:22px;margin:0;letter-spacing:.5px}
  h1 .sub{color:var(--muted);font-size:13px;font-weight:400;margin-left:8px}
  .badge{font-size:12px;padding:4px 10px;border-radius:20px;border:1px solid var(--line);background:var(--panel2);color:var(--muted)}
  .badge.live{color:var(--green);border-color:var(--green)}
  .badge.off{color:var(--orange);border-color:var(--orange)}
  .priority{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 22px}
  .priority span{font-size:12px;background:var(--panel2);border:1px solid var(--line);padding:4px 10px;border-radius:6px;color:var(--muted)}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:26px}
  .kpi{background:linear-gradient(160deg,var(--panel),var(--panel2));border:1px solid var(--line);border-radius:12px;padding:16px 18px}
  .kpi .v{font-size:28px;font-weight:700;line-height:1.1}
  .kpi .l{color:var(--muted);font-size:12px;margin-top:6px}
  .kpi.good .v{color:var(--green)} .kpi.warn .v{color:var(--orange)} .kpi.bad .v{color:var(--red)}
  section{margin-bottom:28px}
  h2{font-size:16px;border-left:3px solid var(--accent);padding-left:10px;margin:0 0 14px}
  h2 .hint{color:var(--muted);font-size:12px;font-weight:400;margin-left:8px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  @media(max-width:760px){.grid2{grid-template-columns:1fr}}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
  th{color:var(--muted);font-weight:600;font-size:12px}
  tr:last-child td{border-bottom:none}
  .bar{height:8px;background:var(--panel2);border-radius:6px;overflow:hidden;min-width:80px}
  .bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--green))}
  .pill{font-size:11px;padding:2px 8px;border-radius:10px;white-space:nowrap}
  .p-green{background:rgba(46,160,67,.18);color:var(--green)}
  .p-orange{background:rgba(210,153,34,.18);color:var(--orange)}
  .p-red{background:rgba(248,81,73,.18);color:var(--red)}
  .p-blue{background:rgba(59,130,246,.18);color:var(--accent)}
  .p-gray{background:rgba(139,152,169,.16);color:var(--muted)}
  .muted{color:var(--muted)}
  .alert{background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.4);border-radius:10px;padding:12px 16px;color:#ffb4b0}
  .stagnation-banner{display:none;position:sticky;top:0;z-index:50;margin:0 0 18px;padding:14px 18px;
    background:linear-gradient(90deg,#f85149,#9e1b1b);color:#fff;border:1px solid #ff8a85;border-radius:10px;
    box-shadow:0 6px 18px rgba(248,81,73,.35);align-items:center;gap:12px}
  .stagnation-banner.show{display:flex;animation:pulseRed 2.2s ease-in-out infinite}
  .stagnation-banner .ic{font-size:26px;line-height:1}
  .stagnation-banner .bt{font-weight:700;font-size:15px}
  .stagnation-banner .det{font-weight:400;font-size:12px;opacity:.95;margin-top:2px}
  @keyframes pulseRed{0%,100%{box-shadow:0 6px 18px rgba(248,81,73,.35)}50%{box-shadow:0 6px 26px rgba(248,81,73,.7)}}
  .tl{position:relative;border-left:2px solid var(--line);padding-left:16px;margin-left:6px}
  .tl .it{position:relative;margin-bottom:14px}
  .tl .it::before{content:"";position:absolute;left:-22px;top:4px;width:10px;height:10px;border-radius:50%;background:var(--accent);border:2px solid var(--bg)}
  .tl .it .r{font-weight:700;color:var(--accent)}
  footer{color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:14px;margin-top:10px}
  a{color:var(--accent);text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  <div id="stagnationBanner" class="stagnation-banner"><span class="ic">🛑</span><div><div id="stagnationTitle" class="bt"></div><div class="det" id="stagnationDetail"></div></div></div>
  <header class="top">
    <h1>Clair 澄观 · 工程进度看板<span class="sub">a-stock-website · 真实数据优先</span></h1>
    <div id="srcBadge" class="badge">加载中…</div>
  </header>
  <div class="priority">
    <span>🎯 重心：基础功能体验完善</span>
    <span>💹 金融交易数据处理与整合</span>
    <span>🛡 系统稳定跑通</span>
  </div>

  <div class="kpis" id="kpis"></div>

  <section>
    <h2>开发路线图 <span class="hint">Sprint 完成度</span></h2>
    <div class="card"><table id="sprints"><thead><tr><th>Sprint</th><th>目标</th><th>进度</th><th style="width:160px">完成度</th><th>状态</th></tr></thead><tbody></tbody></table></div>
  </section>

  <div class="grid2">
    <section>
      <h2>真实金融数据源 <span class="hint">dataSource=real 接入</span></h2>
      <div class="card"><table id="real"><thead><tr><th>ID</th><th>模块</th><th>状态</th><th>数据源</th></tr></thead><tbody></tbody></table></div>
    </section>
    <section>
      <h2>决策事项 <span class="hint">DECISION_LOG</span></h2>
      <div class="card"><table id="dec"><thead><tr><th>#</th><th>事项</th><th>状态</th></tr></thead><tbody></tbody></table></div>
    </section>
  </div>

  <div class="grid2">
    <section>
      <h2>技术债 <span class="hint">§八</span></h2>
      <div class="card"><table id="debt"><thead><tr><th>ID</th><th>描述</th><th>级别</th><th>状态</th></tr></thead><tbody></tbody></table></div>
    </section>
    <section>
      <h2>蜂群一路 · 前端数据真实化 <span class="hint">§七·六 D</span></h2>
      <div class="card"><table id="swarm"><thead><tr><th>ID</th><th>范围</th><th>归属</th></tr></thead><tbody></tbody></table></div>
    </section>
  </div>

  <section>
    <h2>Orchestrator 收尾工单 <span class="hint">§七·六 E（S2 / FAC / MP）</span></h2>
    <div class="card"><table id="orch"><thead><tr><th>工单</th><th>内容</th></tr></thead><tbody></tbody></table></div>
  </section>

  <section>
    <h2>循环时间线 <span class="hint">最近轮次</span></h2>
    <div class="card"><div class="tl" id="tl"></div></div>
  </section>

  <footer id="footer"></footer>
</div>

<script>
const EMBEDDED = __EMBEDDED_JSON__;
const RAW = "__RAW_BASE__/docs/dashboard-data.json";
const SRC = "__RAW_BASE__";

function pill(text){
  const t=text||"";
  let cls="p-gray";
  if(/已决|已清|已落地|✅/.test(t)) cls="p-green";
  else if(/阻塞|停滞|⚠|🔴/.test(t)) cls="p-red";
  else if(/进行中|🔵|待决策|🟡|⏸|搁置/.test(t)) cls="p-orange";
  else if(/暂缓/.test(t)) cls="p-gray";
  return `<span class="pill ${cls}">${t}</span>`;
}
function el(id){return document.getElementById(id);}

function render(d, mode){
  const ov=d.overview||{};
  // KPI
  const kpis=[
    {v:ov.round||"—",l:"当前循环轮次",c:ov.stagnation?"warn":"good"},
    {v:ov.totalTickets||"—",l:"累计完成 Ticket",c:"good"},
    {v:ov.pagesActive||"—",l:"页面闭环（激活·导航）",c:"good"},
    {v:ov.realDataSources||"—",l:"真实金融数据源",c:"good"},
    {v:ov.health||"—",l:"系统健康",c:ov.stagnation?"bad":"good"},
  ];
  el("kpis").innerHTML=kpis.map(k=>`<div class="kpi ${k.c}"><div class="v">${k.v}</div><div class="l">${k.l}</div></div>`).join("");

  // Sprint
  el("sprints").querySelector("tbody").innerHTML=(d.sprints||[]).map(s=>
    `<tr><td><b>${s.id}</b></td><td class="muted">${s.title}</td><td>${s.done}/${s.total}</td>
     <td><div class="bar"><i style="width:${s.pct}%"></i></div><span class="muted" style="font-size:11px">${s.pct}%</span></td>
     <td>${pill(s.status)}</td></tr>`).join("");

  // Real sources
  el("real").querySelector("tbody").innerHTML=(d.realDataSources||[]).map(r=>
    `<tr><td><b>${r.ticket}</b></td><td>${r.name}</td><td>${pill(r.status)}</td><td class="muted">${r.source}</td></tr>`).join("");

  // Decisions
  el("dec").querySelector("tbody").innerHTML=(d.decisions||[]).map(x=>
    `<tr><td><b>${x.id}</b></td><td>${x.title}<div class="muted" style="font-size:11px">${x.date} · ${x.level}</div></td><td>${pill(x.status)}</td></tr>`).join("");

  // Tech debts
  el("debt").querySelector("tbody").innerHTML=(d.techDebts||[]).map(t=>
    `<tr><td><b>${t.id}</b></td><td class="muted">${t.desc}</td><td>${t.priority}</td><td>${pill(t.status)}</td></tr>`).join("");

  // Swarm
  el("swarm").querySelector("tbody").innerHTML=(d.swarmLane&&d.swarmLane.subs||[]).map(s=>
    `<tr><td><b>${s.id}</b></td><td class="muted">${s.scope}</td><td>${s.owner}</td></tr>`).join("");

  // Orchestrator
  el("orch").querySelector("tbody").innerHTML=(d.orchestratorTickets||[]).map(o=
    `<tr><td><b>${o.id}</b></td><td class="muted">${o.title}</td></tr>`).join("");

  // Timeline
  el("tl").innerHTML=(d.timeline||[]).map(t=>
    `<div class="it"><div><span class="r">第${t.round}轮</span> · <span class="muted">${t.tag}</span></div><div class="muted" style="font-size:12px">${t.summary}</div></div>`).join("");

  // Stagnation prominent banner (顶部醒目红色横幅)
  const sb=el("stagnationBanner");
  if(ov.stagnation){
    sb.classList.add("show");
    el("stagnationTitle").textContent="⚠️ 工程进度停滞告警（PAUSE 红线已触发）";
    el("stagnationDetail").textContent=(ov.stagnationDetail||"工作区存在未提交在途改动，automation 严守红线暂停开发，待用户收口后自动恢复。")+" · 公开看板将随收口与下一轮循环自动更新。";
  } else {
    sb.classList.remove("show");
  }

  // Badge + footer
  const b=el("srcBadge");
  const ts=ov.generatedAt||"—";
  if(mode==="live"){b.className="badge live";b.textContent=`● 实时（GitHub main）· ${ts}`;}
  else{b.className="badge off";b.textContent=`○ 离线快照 · ${ts}`;}
  el("footer").innerHTML=`数据源：<a href="${SRC}" target="_blank">github.com/${"__REPO__"}</a> · 本看板由 scripts/gen_dashboard.py 生成 · 自动刷新优先拉取 main 分支 dashboard-data.json，失败回退内嵌快照。`;
}

// 先渲染内嵌快照（秒开），再异步尝试拉取最新
render(EMBEDDED,"embedded");
try{
  fetch(RAW,{cache:"no-store"}).then(r=>{if(!r.ok)throw 0;return r.json();}).then(d=>{
    const a=(EMBEDDED.generatedAt||""), b=(d.generatedAt||"");
    if(b && b>a){render(d,"live");}
  }).catch(()=>{});
}catch(e){}
</script>
</body>
</html>
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-root", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ap.add_argument("--out", default="docs")
    args = ap.parse_args()

    root = args.repo_root
    plan = read_text(os.path.join(root, "PLAN.md"))
    log = read_text(os.path.join(root, "DECISION_LOG.md"))

    data = {
        "generatedAt": _dt.datetime.now(_dt.timezone(_dt.timedelta(hours=8))).strftime("%Y-%m-%dT%H:%M:%S+08:00"),
        "repo": REPO,
        "branch": BRANCH,
        "overview": parse_overview(plan, log),
        "sprints": parse_sprints(plan),
        "realDataSources": parse_real_sources(plan),
        "decisions": parse_decisions(log),
        "techDebts": parse_tech_debts(plan),
        "swarmLane": {"title": "前端数据真实化", "subs": parse_swarm_subs(plan)},
        "orchestratorTickets": parse_orchestrator(plan),
        "timeline": parse_timeline(plan),
    }
    # KPI 真实数据源计数与实际列表一致
    data["overview"]["realDataSources"] = len(data["realDataSources"])

    out_dir = os.path.join(root, args.out)
    os.makedirs(out_dir, exist_ok=True)
    json_path = os.path.join(out_dir, "dashboard-data.json")
    html_path = os.path.join(out_dir, "clair-dashboard.html")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    embedded = json.dumps(data, ensure_ascii=False)
    html = (HTML_TEMPLATE
            .replace("__EMBEDDED_JSON__", embedded)
            .replace("__RAW_BASE__", RAW_BASE)
            .replace("__REPO__", REPO))
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)

    # 校验 JSON 可被解析
    with open(json_path, "r", encoding="utf-8") as f:
        json.load(f)

    print(f"OK generatedAt={data['generatedAt']}")
    print(f"  round={data['overview']['round']} tickets={data['overview']['totalTickets']} "
          f"realSrc={data['overview']['realDataSources']} sprints={len(data['sprints'])} "
          f"decisions={len(data['decisions'])} debts={len(data['techDebts'])} "
          f"swarm={len(data['swarmLane']['subs'])} orch={len(data['orchestratorTickets'])} "
          f"timeline={len(data['timeline'])}")
    print(f"  -> {json_path}")
    print(f"  -> {html_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
