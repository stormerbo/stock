#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------
# release.sh — 升级版本 → 提交 → tag → 推送
# 用法:
#   ./release.sh              # 自动 bump patch (1.2.3 → 1.2.4)
#   ./release.sh minor        # 1.2.3 → 1.3.0
#   ./release.sh major        # 1.2.3 → 2.0.0
#   ./release.sh 1.5.0        # 指定版本号
# -----------------------------------------------------------

cd "$(git rev-parse --show-toplevel)"

# 读取当前版本（从 manifest.json）
CURRENT=$(jq -r '.version' manifest.json)
echo "当前版本: v$CURRENT"

# 计算新版本
if [ $# -eq 0 ]; then
  # 默认 bump patch
  NEW=$(echo "$CURRENT" | awk -F. '{print $1"."$2"."$3+1}')
elif [ "$1" = "major" ]; then
  NEW=$(echo "$CURRENT" | awk -F. '{print $1+1".0.0"}')
elif [ "$1" = "minor" ]; then
  NEW=$(echo "$CURRENT" | awk -F. '{print $1"."$2+1".0"}')
else
  NEW="$1"
fi

# 验证版本号格式
if ! echo "$NEW" | grep -qE '^\d+\.\d+\.\d+$'; then
  echo "❌ 无效版本号: $NEW (期望 x.y.z)"
  exit 1
fi

echo "新版本: v$NEW"

# 确认
read -p "确定发布 v$NEW ? (y/N) " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "已取消"
  exit 0
fi

# 更新 manifest.json
jq --arg v "$NEW" '.version = $v' manifest.json > manifest.json.tmp && mv manifest.json.tmp manifest.json
echo "✓ manifest.json → $NEW"

# 更新 package.json
jq --arg v "$NEW" '.version = $v' package.json > package.json.tmp && mv package.json.tmp package.json
echo "✓ package.json → $NEW"

# 构建
echo "🏗️  构建中..."
npm run build 2>/dev/null || npm run build
echo "✓ 构建完成"

# 提交
git add manifest.json package.json
git commit -m "chore: bump version to v$NEW"
echo "✓ 已提交"

# tag
git tag "v$NEW"
echo "✓ 已创建标签 v$NEW"

# 推送
git push
git push --tags
echo "✓ 已推送"

echo ""
echo "🎉 v$NEW 发布完成！GitHub Actions 正在自动构建..."
