// 用户登录API
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

    // 查找用户
    const user = await env.DB.prepare(
      'SELECT id, username, email, password_hash FROM users WHERE username = ?'
    ).bind(username).first();

    if (!user) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '用户名或密码错误' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 验证密码
    const passwordHash = await hashPassword(password);
    if (passwordHash !== user.password_hash) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '用户名或密码错误' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 生成JWT token
    const token = await generateJWT({
      userId: user.id,
      username: user.username,
      email: user.email
    });

    // 将token存储到KV
    const sessionId = crypto.randomUUID();
    await env.KV.put(`session:${sessionId}`, JSON.stringify({
      userId: user.id,
      username: user.username,
      email: user.email,
      loginTime: new Date().toISOString()
    }), {
      expirationTtl: 7 * 24 * 60 * 60 // 7天过期
    });

    return new Response(JSON.stringify({ 
      success: true, 
      message: '登录成功',
      token: token,
      sessionId: sessionId,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Set-Cookie': `sessionId=${sessionId}; HttpOnly; Secure; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}`
      }
    });

  } catch (error) {
    console.error('登录错误:', error);
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

// 生成简单的JWT token
async function generateJWT(payload) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = {
    ...payload,
    iat: now,
    exp: now + (7 * 24 * 60 * 60) // 7天过期
  };

  const headerB64 = btoa(JSON.stringify(header));
  const payloadB64 = btoa(JSON.stringify(jwtPayload));
  
  const signature = await signJWT(`${headerB64}.${payloadB64}`);
  
  return `${headerB64}.${payloadB64}.${signature}`;
}

// 简单的JWT签名
async function signJWT(data) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode('your-secret-key'); // 在生产环境中应该使用环境变量
  const dataToSign = encoder.encode(data);
  
  const signature = await crypto.subtle.digest('SHA-256', new Uint8Array([...keyData, ...dataToSign]));
  const signatureArray = Array.from(new Uint8Array(signature));
  return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
}