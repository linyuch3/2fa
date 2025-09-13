// 修改密码API
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

    const { currentPassword, newPassword } = await request.json();

    // 验证输入
    if (!currentPassword || !newPassword) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '当前密码和新密码都是必需的' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (newPassword.length < 6) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '新密码长度不能少于6个字符' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 获取用户当前密码哈希
    const userRecord = await env.DB.prepare(
      'SELECT password_hash FROM users WHERE id = ?'
    ).bind(user.userId).first();

    if (!userRecord) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '用户不存在' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 验证当前密码
    const currentPasswordHash = await hashPassword(currentPassword);
    if (currentPasswordHash !== userRecord.password_hash) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '当前密码错误' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 生成新密码哈希
    const newPasswordHash = await hashPassword(newPassword);

    // 更新密码
    const result = await env.DB.prepare(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(newPasswordHash, user.userId).run();

    if (result.success) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: '密码修改成功'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      throw new Error('密码更新失败');
    }

  } catch (error) {
    console.error('修改密码错误:', error);
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

// 简单的密码哈希函数
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}