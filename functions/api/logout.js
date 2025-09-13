// 用户注销API
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // 从cookie或header中获取sessionId
    const cookies = request.headers.get('cookie');
    let sessionId = null;
    
    if (cookies) {
      const sessionCookie = cookies.split(';').find(c => c.trim().startsWith('sessionId='));
      if (sessionCookie) {
        sessionId = sessionCookie.split('=')[1];
      }
    }

    // 也尝试从请求体中获取
    if (!sessionId) {
      try {
        const body = await request.json();
        sessionId = body.sessionId;
      } catch (e) {
        // 忽略JSON解析错误
      }
    }

    if (sessionId) {
      // 从KV中删除会话
      await env.KV.delete(`session:${sessionId}`);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: '注销成功' 
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Set-Cookie': 'sessionId=; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
      }
    });

  } catch (error) {
    console.error('注销错误:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      message: '服务器内部错误' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}