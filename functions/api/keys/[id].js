// 操作单个密钥：更新或删除
export async function onRequestPut(context) {
  const { request, env, params } = context;

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

    const keyId = params.id;
    const { name, secret, digits, period, algorithm, category } = await request.json();

    // 验证密钥是否属于当前用户
    const existingKey = await env.DB.prepare(
      'SELECT id FROM totp_keys WHERE id = ? AND user_id = ?'
    ).bind(keyId, user.userId).first();

    if (!existingKey) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '密钥不存在或无权限访问' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 构建更新SQL
    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (secret !== undefined) {
      // 验证密钥格式
      const cleanSecret = secret.replace(/\s/g, '').toUpperCase();
      if (!/^[A-Z2-7]+=*$/.test(cleanSecret)) {
        return new Response(JSON.stringify({ 
          success: false, 
          message: '密钥格式不正确' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      updateFields.push('secret = ?');
      updateValues.push(cleanSecret);
    }
    if (digits !== undefined) {
      updateFields.push('digits = ?');
      updateValues.push(digits);
    }
    if (period !== undefined) {
      updateFields.push('period = ?');
      updateValues.push(period);
    }
    if (algorithm !== undefined) {
      updateFields.push('algorithm = ?');
      updateValues.push(algorithm);
    }
    if (category !== undefined) {
      updateFields.push('category = ?');
      updateValues.push(category);
    }

    if (updateFields.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '没有提供要更新的字段' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(keyId);

    const updateSQL = `UPDATE totp_keys SET ${updateFields.join(', ')} WHERE id = ?`;
    
    const result = await env.DB.prepare(updateSQL).bind(...updateValues).run();

    if (result.success) {
      // 获取更新后的密钥
      const updatedKey = await env.DB.prepare(
        'SELECT id, name, secret, digits, period, algorithm, category, created_at, updated_at FROM totp_keys WHERE id = ?'
      ).bind(keyId).first();

      return new Response(JSON.stringify({ 
        success: true, 
        message: '密钥更新成功',
        key: updatedKey
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      throw new Error('密钥更新失败');
    }

  } catch (error) {
    console.error('更新密钥错误:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      message: '服务器内部错误' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 删除密钥
export async function onRequestDelete(context) {
  const { request, env, params } = context;

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

    const keyId = params.id;

    // 验证密钥是否属于当前用户
    const existingKey = await env.DB.prepare(
      'SELECT id, name FROM totp_keys WHERE id = ? AND user_id = ?'
    ).bind(keyId, user.userId).first();

    if (!existingKey) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '密钥不存在或无权限访问' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 删除密钥
    const result = await env.DB.prepare(
      'DELETE FROM totp_keys WHERE id = ? AND user_id = ?'
    ).bind(keyId, user.userId).run();

    if (result.success) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: `密钥 "${existingKey.name}" 删除成功`
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      throw new Error('密钥删除失败');
    }

  } catch (error) {
    console.error('删除密钥错误:', error);
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