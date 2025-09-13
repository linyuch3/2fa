// 获取用户的所有密钥
export async function onRequestGet(context) {
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

    // 获取用户的所有密钥
    const keys = await env.DB.prepare(
      'SELECT id, name, secret, digits, period, algorithm, category, created_at FROM totp_keys WHERE user_id = ? ORDER BY created_at ASC'
    ).bind(user.userId).all();

    return new Response(JSON.stringify({ 
      success: true, 
      keys: keys.results || []
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('获取密钥错误:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      message: '服务器内部错误' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 添加新密钥
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

    const { name, secret, digits = 6, period = 30, algorithm = 'SHA1', category = 'other' } = await request.json();

    // 验证输入
    if (!name || !secret) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '名称和密钥都是必需的' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 验证密钥格式（Base32）
    if (!/^[A-Z2-7]+=*$/.test(secret.replace(/\s/g, '').toUpperCase())) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '密钥格式不正确，请确保是有效的Base32格式' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 插入新密钥
    const result = await env.DB.prepare(
      'INSERT INTO totp_keys (user_id, name, secret, digits, period, algorithm, category) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(user.userId, name, secret.replace(/\s/g, '').toUpperCase(), digits, period, algorithm, category).run();

    if (result.success) {
      const newKey = await env.DB.prepare(
        'SELECT id, name, secret, digits, period, algorithm, category, created_at FROM totp_keys WHERE id = ?'
      ).bind(result.meta.last_row_id).first();

      return new Response(JSON.stringify({ 
        success: true, 
        message: '密钥添加成功',
        key: newKey
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      throw new Error('密钥添加失败');
    }

  } catch (error) {
    console.error('添加密钥错误:', error);
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