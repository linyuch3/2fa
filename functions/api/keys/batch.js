// 批量添加密钥
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const user = await authenticateUser(request, env);
    if (!user) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '未授权访问' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { keys } = await request.json();

    if (!Array.isArray(keys) || keys.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '密钥数组不能为空' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const addedKeys = [];
    const failedKeys = [];

    // 处理每个密钥
    for (const keyData of keys) {
      try {
        const { name, secret, digits = 6, period = 30, algorithm = 'SHA1', category = 'other' } = keyData;

        // 验证输入
        if (!name || !secret) {
          failedKeys.push({ keyData, reason: '名称和密钥都是必需的' });
          continue;
        }

        // 验证密钥格式（Base32）
        const cleanSecret = secret.replace(/\s/g, '').toUpperCase();
        if (!/^[A-Z2-7]+=*$/.test(cleanSecret)) {
          failedKeys.push({ keyData, reason: '密钥格式不正确' });
          continue;
        }

        // 插入密钥
        const result = await env.DB.prepare(
          'INSERT INTO totp_keys (user_id, name, secret, digits, period, algorithm, category) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(user.userId, name, cleanSecret, digits, period, algorithm, category).run();

        if (result.success) {
          const newKey = await env.DB.prepare(
            'SELECT id, name, secret, digits, period, algorithm, category, created_at FROM totp_keys WHERE id = ?'
          ).bind(result.meta.last_row_id).first();
          addedKeys.push(newKey);
        } else {
          failedKeys.push({ keyData, reason: '数据库插入失败' });
        }
      } catch (error) {
        failedKeys.push({ keyData, reason: error.message });
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `成功添加 ${addedKeys.length} 个密钥${failedKeys.length > 0 ? `，${failedKeys.length} 个失败` : ''}`,
      addedKeys,
      failedKeys: failedKeys.length > 0 ? failedKeys : undefined
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('批量添加密钥错误:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      message: '服务器内部错误' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 用户认证函数
async function authenticateUser(request, env) {
  try {
    // 从cookie中获取sessionId
    const cookies = request.headers.get('cookie');
    let sessionId = null;
    
    if (cookies) {
      const sessionCookie = cookies.split(';').find(c => c.trim().startsWith('sessionId='));
      if (sessionCookie) {
        sessionId = sessionCookie.split('=')[1];
      }
    }

    // 也尝试从Authorization header中获取
    if (!sessionId) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        sessionId = authHeader.substring(7);
      }
    }

    if (!sessionId) {
      return null;
    }

    // 从KV中获取会话信息
    const sessionData = await env.KV.get(`session:${sessionId}`);
    if (!sessionData) {
      return null;
    }

    return JSON.parse(sessionData);
  } catch (error) {
    console.error('认证错误:', error);
    return null;
  }
}