#!/bin/bash

# 2FA应用部署设置脚本

echo "🚀 2FA应用部署设置脚本"
echo "========================="

# 检查wrangler是否安装
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI 未安装"
    echo "请运行: npm install -g wrangler"
    exit 1
fi

echo "✅ Wrangler CLI 已安装"

# 登录检查
if ! wrangler whoami &> /dev/null; then
    echo "📝 请先登录 Cloudflare"
    wrangler login
fi

echo "✅ Cloudflare 登录状态正常"

# 创建D1数据库
echo "📦 正在创建 D1 数据库..."
DB_RESULT=$(wrangler d1 create 2fa-database 2>/dev/null)

if [ $? -eq 0 ]; then
    DB_ID=$(echo "$DB_RESULT" | grep -o 'database_id = "[^"]*"' | cut -d'"' -f2)
    echo "✅ D1 数据库创建成功: $DB_ID"
else
    echo "⚠️  D1 数据库可能已存在，请检查 wrangler.toml 配置"
fi

# 创建KV命名空间
echo "🗂️  正在创建 KV 命名空间..."
KV_RESULT=$(wrangler kv:namespace create "KV" 2>/dev/null)
KV_PREVIEW_RESULT=$(wrangler kv:namespace create "KV" --preview 2>/dev/null)

if [ $? -eq 0 ]; then
    KV_ID=$(echo "$KV_RESULT" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)
    KV_PREVIEW_ID=$(echo "$KV_PREVIEW_RESULT" | grep -o 'preview_id = "[^"]*"' | cut -d'"' -f2)
    echo "✅ KV 命名空间创建成功"
    echo "   生产环境 ID: $KV_ID"
    echo "   预览环境 ID: $KV_PREVIEW_ID"
else
    echo "⚠️  KV 命名空间可能已存在，请检查 wrangler.toml 配置"
fi

# 更新wrangler.toml
echo "📝 正在更新 wrangler.toml 配置..."

if [ ! -z "$DB_ID" ]; then
    sed -i.bak "s/database_id = \"your-d1-database-id\"/database_id = \"$DB_ID\"/g" wrangler.toml
fi

if [ ! -z "$KV_ID" ]; then
    sed -i.bak "s/id = \"your-kv-namespace-id\"/id = \"$KV_ID\"/g" wrangler.toml
fi

if [ ! -z "$KV_PREVIEW_ID" ]; then
    sed -i.bak "s/preview_id = \"your-kv-preview-id\"/preview_id = \"$KV_PREVIEW_ID\"/g" wrangler.toml
fi

# 初始化数据库
echo "🗄️  正在初始化数据库..."
if wrangler d1 execute 2fa-database --file=./sql/schema.sql; then
    echo "✅ 数据库初始化成功"
else
    echo "❌ 数据库初始化失败"
    exit 1
fi

echo ""
echo "🎉 设置完成！"
echo "========================="
echo "下一步操作："
echo "1. 运行 'npm run dev' 启动本地开发"
echo "2. 运行 'npm run deploy' 部署到生产环境"
echo ""
echo "📚 详细文档请查看 DEPLOYMENT.md"