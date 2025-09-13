// 用户注册API
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { username, password } = await request.json();

    // 验证输入
    if (!username || !password) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '用户名和密码都是必需的' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (username.length < 3 || username.length > 20) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '用户名长度必须在3-20个字符之间' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '密码长度不能少于6个字符' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 检查用户是否已存在
    const existingUser = await env.DB.prepare(
      'SELECT id FROM users WHERE username = ?'
    ).bind(username).first();

    if (existingUser) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '用户名已存在' 
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 生成密码哈希
    const passwordHash = await hashPassword(password);

    // 插入新用户
    const result = await env.DB.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).bind(username, username + '@local.com', passwordHash).run();

    if (result.success) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: '注册成功',
        user: {
          id: result.meta.last_row_id,
          username: username,
          email: username + '@local.com'
        }
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      throw new Error('注册失败');
    }

  } catch (error) {
    console.error('注册错误:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      message: '服务器内部错误' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
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