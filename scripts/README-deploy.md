# 部署/同步工具

## gh-push-treediff.sh — tree-diff 安全推送（标准通道）
```bash
bash scripts/gh-push-treediff.sh "$TOKEN" "commit message"
```
- 每次先拉取远端 main 最新 tree，只推送本地 deploy 与远端的差异（容忍看板自动化并行写入）
- 自动排除 `.github/workflows/*`（需 workflow scope，走 GitHub 网页端或 device flow `repo workflow` 授权）
- Token 来源：OAuth 设备流（repo scope）或任何有 repo 写权限的 token
- REST 通道：api.github.com Git Data API（blob→tree→commit→ref），规避 github.com TLS 干扰

## 已知约束
- `.github/workflows/collect-history.yml` 待补传：文件在本地 deploy 分支，也可从 `/workspace/collect-history-待手动补传.yml` 复制内容在 GitHub 网页端创建
- python urllib 的 POST 在部分沙箱网络被拦（TLS 指纹），统一用 curl
