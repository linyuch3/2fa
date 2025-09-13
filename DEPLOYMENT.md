# 2FA用户系统部署指南

这个2FA应用现在支持用户注册登录功能，使用Cloudflare的D1数据库和KV存储来保存用户数据和密钥。

## 部署前准备

### 1. 安装Wrangler CLI
```bash
npm install -g wrangler
```

### 2. 登录Cloudflare
```bash
wrangler login
```

## 设置Cloudflare资源

### 1. 创建D1数据库
```bash
# 创建D1数据库
wrangler d1 create 2fa-database

# 记录返回的database_id，更新wrangler.toml中的database_id
```

### 2. 创建KV命名空间
```bash
# 创建KV命名空间
wrangler kv:namespace create "KV"

# 创建预览KV命名空间
wrangler kv:namespace create "KV" --preview

# 记录返回的id，更新wrangler.toml中的id和preview_id
```

### 3. 初始化数据库
```bash
# 执行数据库初始化脚本
wrangler d1 execute 2fa-database --file=./sql/schema.sql
```

## 更新配置文件

编辑 `wrangler.toml` 文件，替换以下占位符：

```toml
[[d1_databases]]
binding = "DB"
database_name = "2fa-database"
database_id = "your-d1-database-id"  # 替换为实际的database_id

[[kv_namespaces]]
binding = "KV"
id = "your-kv-namespace-id"         # 替换为实际的KV namespace id
preview_id = "your-kv-preview-id"   # 替换为实际的preview id
```

## 部署应用

### 1. 本地开发
```bash
# 安装依赖
npm install

# 启动本地开发服务器
npm run dev
```

### 2. 部署到Cloudflare Pages
```bash
# 部署到生产环境
npm run deploy
```

## 功能特性

### 用户系统
- ✅ 用户注册和登录
- ✅ 基于JWT的会话管理
- ✅ 密码哈希存储
- ✅ 用户数据验证

### 密钥管理
- ✅ 云端密钥存储
- ✅ 批量密钥添加
- ✅ 密钥CRUD操作
- ✅ 本地数据迁移

### 安全特性
- ✅ 密码哈希（SHA-256）
- ✅ 会话管理（KV存储）
- ✅ 用户数据隔离
- ✅ API认证保护

## API接口

### 用户认证
- `POST /api/register` - 用户注册
- `POST /api/login` - 用户登录
- `POST /api/logout` - 用户注销

### 密钥管理
- `GET /api/keys` - 获取用户密钥列表
- `POST /api/keys` - 添加单个密钥
- `POST /api/keys/batch` - 批量添加密钥
- `PUT /api/keys/{id}` - 更新密钥
- `DELETE /api/keys/{id}` - 删除密钥

## 使用说明

## 注册用户
1. 填写用户名和密码
2. 点击"注册"按钮
3. 注册成功后自动登录

### 现有用户（有本地数据）
1. 注册并登录账户
2. 系统会提示迁移本地密钥到云端
3. 选择"迁移到云端"完成数据迁移

### 密钥管理
- 登录后所有密钥操作都会同步到云端
- 支持批量添加密钥
- 可以编辑密钥名称
- 支持删除单个或所有密钥

## 注意事项

1. **安全性**: 在生产环境中，建议使用更强的JWT密钥
2. **备份**: 定期备份D1数据库数据
3. **监控**: 监控KV存储的使用量和请求数
4. **更新**: 保持Wrangler CLI和依赖包最新版本

## 故障排除

### 常见问题

1. **数据库连接失败**
   - 检查wrangler.toml中的database_id是否正确
   - 确认数据库已正确初始化

2. **KV存储错误**
   - 检查KV命名空间ID是否正确
   - 确认KV命名空间已创建

3. **会话过期**
   - 会话默认7天过期，可在代码中调整
   - 用户需要重新登录

4. **本地开发问题**
   - 确保安装了最新版本的Wrangler
   - 检查本地网络连接

## 扩展建议

- 添加邮箱验证功能
- 实现密码重置功能
- 添加2FA密钥分类功能
- 支持密钥导入/导出
- 添加使用统计功能