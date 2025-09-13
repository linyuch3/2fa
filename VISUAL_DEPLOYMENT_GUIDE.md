# 2FA用户系统 - 可视化部署教程

本教程将指导您通过Cloudflare Dashboard可视化界面部署2FA应用，无需复杂的命令行操作。

## 📋 部署前准备

### 必需条件
- Cloudflare账户（免费账户即可）
- GitHub账户
- 项目代码已上传到GitHub

### 预计时间
约15-20分钟完成整个部署过程

---

## 🚀 第一步：创建Cloudflare Pages项目

### 1.1 登录Cloudflare Dashboard
1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 使用您的账户登录

### 1.2 创建Pages项目
1. 在左侧菜单中点击 **"Workers & Pages"**
2. 点击 **"Create application"** 按钮
3. 选择 **"Pages"** 标签
4. 点击 **"Connect to Git"**

### 1.3 连接GitHub仓库
1. 选择 **"GitHub"** 作为Git提供商
2. 如果首次使用，点击 **"Connect GitHub"** 并授权
3. 在仓库列表中找到您的 **"2fa"** 项目
4. 点击项目名称旁的 **"Begin setup"**

### 1.4 配置构建设置
```
项目名称: 2fa-app (或您喜欢的名称)
生产分支: main
构建命令: echo "Static site, no build needed"
构建输出目录: public
```

5. 点击 **"Save and Deploy"**

### 1.5 等待初始部署
- 首次部署大约需要1-2分钟
- 部署完成后会显示绿色的 ✅ "Success"
- 记录下分配的域名，格式类似：`your-app.pages.dev`

---

## 💾 第二步：创建D1数据库

### 2.1 进入D1数据库管理
1. 在Cloudflare Dashboard左侧菜单点击 **"Workers & Pages"**
2. 选择 **"D1 SQL Database"** 标签
3. 点击 **"Create database"** 按钮

### 2.2 创建数据库
1. **数据库名称**: `2fa-database`
2. 点击 **"Create"** 按钮

### 2.3 初始化数据库表
1. 在新创建的数据库页面，点击 **"Console"** 标签
2. 在SQL执行框中粘贴以下SQL语句：

```sql
-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建2FA密钥表
CREATE TABLE IF NOT EXISTS totp_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    secret TEXT NOT NULL,
    digits INTEGER DEFAULT 6,
    period INTEGER DEFAULT 30,
    algorithm TEXT DEFAULT 'SHA1',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_totp_keys_user_id ON totp_keys(user_id);
```

3. 点击 **"Execute"** 按钮
4. 确认看到 "Success" 消息

### 2.4 记录数据库ID
1. 在数据库详情页面的右侧，找到 **"Database ID"**
2. 点击 📋 图标复制数据库ID
3. 保存这个ID，格式类似：`12345678-1234-1234-1234-123456789abc`

---

## 🗂️ 第三步：创建KV存储

### 3.1 进入KV管理
1. 在Cloudflare Dashboard左侧菜单点击 **"Workers & Pages"**
2. 选择 **"KV"** 标签
3. 点击 **"Create a namespace"** 按钮

### 3.2 创建KV命名空间
1. **命名空间名称**: `2fa-sessions`
2. 点击 **"Add"** 按钮

### 3.3 记录命名空间ID
1. 在KV命名空间列表中，找到刚创建的 `2fa-sessions`
2. 复制并保存命名空间ID（格式类似：`abcdef1234567890abcdef1234567890`）

---

## ⚙️ 第四步：配置环境变量和绑定

### 4.1 进入Pages项目设置
1. 回到 **"Workers & Pages"** 主页
2. 点击您的 **"2fa-app"** 项目
3. 点击 **"Settings"** 标签

### 4.2 配置D1数据库绑定
1. 滚动到 **"Functions"** 部分
2. 找到 **"D1 database bindings"**
3. 点击 **"Add binding"**
4. 配置绑定：
   ```
   Variable name: DB
   D1 database: 选择 "2fa-database"
   ```
5. 点击 **"Save"**

### 4.3 配置KV存储绑定
1. 在同一页面找到 **"KV namespace bindings"**
2. 点击 **"Add binding"**
3. 配置绑定：
   ```
   Variable name: KV
   KV namespace: 选择 "2fa-sessions"
   ```
4. 点击 **"Save"**

---

## 🔄 第五步：重新部署应用

### 5.1 触发重新部署
1. 在项目页面点击 **"Deployments"** 标签
2. 点击 **"Retry deployment"** 或推送新代码到GitHub
3. 等待部署完成（约1-2分钟）

### 5.2 验证部署
1. 部署完成后，点击 **"Visit site"** 按钮
2. 您应该看到2FA应用的主界面
3. 尝试点击 **"注册"** 按钮验证用户系统是否正常工作

---

## 🧪 第六步：测试功能

### 6.1 测试用户注册
1. 在应用中点击 **"注册"** 按钮
2. 填写测试信息：
   ```
   用户名: testuser
   密码: test123456
   ```
3. 点击 **"注册"** 确认功能正常

### 6.2 测试用户登录
1. 使用刚才注册的账户信息登录
2. 确认能看到 "登录成功" 提示
3. 页面应显示用户信息和 "云端已保存 0 个密钥"

### 6.3 测试密钥添加
1. 在密钥输入框中添加测试密钥：
   ```
   测试密钥:JBSWY3DPEHPK3PXP
   ```
2. 点击 **"添加输入框中的密钥"**
3. 确认密钥被成功添加并显示验证码

---

## 📊 第七步：监控和维护

### 7.1 查看应用分析
1. 在Pages项目页面点击 **"Analytics"** 标签
2. 查看访问量、请求数等数据

### 7.2 查看D1数据库使用情况
1. 进入D1数据库管理页面
2. 点击 **"Metrics"** 查看查询统计

### 7.3 查看KV存储使用情况
1. 进入KV命名空间页面
2. 查看存储的键值对数量和请求统计

---

## 🛠️ 常见问题解决

### 问题1：API请求失败
**症状**: 注册或登录时显示 "网络错误"
**解决方案**:
1. 检查D1数据库绑定是否正确配置
2. 确认数据库表已正确创建
3. 重新部署应用

### 问题2：会话状态丢失
**症状**: 登录后刷新页面需要重新登录
**解决方案**:
1. 检查KV存储绑定是否正确配置
2. 确认KV命名空间已创建

### 问题3：密钥无法保存
**症状**: 添加密钥后看不到
**解决方案**:
1. 确认已成功登录
2. 检查浏览器控制台是否有错误信息
3. 在D1数据库控制台查询数据：
   ```sql
   SELECT * FROM totp_keys;
   ```

### 问题4：部署失败
**症状**: 在Deployments页面看到红色错误
**解决方案**:
1. 检查GitHub仓库中的代码完整性
2. 确认 `wrangler.toml` 文件存在
3. 重新触发部署

---

## 🔧 高级配置

### 自定义域名
1. 在Pages项目设置中点击 **"Custom domains"**
2. 点击 **"Set up a custom domain"**
3. 输入您的域名并按提示配置DNS

### 环境分离
1. 在项目设置中配置 **Preview** 和 **Production** 环境
2. 为不同环境创建不同的D1数据库和KV命名空间

### 安全增强
1. 在D1数据库中定期备份数据
2. 监控异常登录和API调用
3. 定期更新依赖包

---

## 📚 其他资源

- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Cloudflare D1 文档](https://developers.cloudflare.com/d1/)
- [Cloudflare KV 文档](https://developers.cloudflare.com/workers/runtime-apis/kv/)

---

## 🎉 恭喜！

您已经成功通过可视化界面部署了2FA用户系统！现在您的用户可以：

✅ 注册和登录账户  
✅ 将2FA密钥保存到云端  
✅ 在多设备间同步密钥  
✅ 享受安全可靠的服务  

如果遇到任何问题，请参考常见问题解决部分或查看详细的API文档。