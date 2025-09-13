// Helper functions
function getCurrentSeconds() {
  return Math.round(new Date().getTime() / 1000.0);
}

function stripSpaces(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/\s/g, '').toUpperCase();
}

function truncateTo(str, digits) {
  if (typeof str !== 'string') str = String(str);
  if (str.length <= digits) {
    return str;
  }
  return str.slice(-digits);
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const app = Vue.createApp({
  data() {
    return {
      keys: [],
      batchSecretsInput: '',
      batchDefaultSettings: {
        digits: 6,
        period: 30,
        category: 'other'
      },
      intervalHandle: null,
      toastTimeout: null,
      isQrModalActive: false,
      qrCodeKeyName: '',
      // 用户系统相关数据
      user: {
        isLoggedIn: false,
        id: null,
        username: '',
        email: '',
        sessionId: ''
      },
      authModal: {
        isActive: false,
        mode: 'login', // 'login' or 'register'
        isLoading: false,
        error: '',
        form: {
          username: '',
          password: ''
        }
      },
      changePasswordModal: {
        isActive: false,
        isLoading: false,
        error: '',
        form: {
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        }
      },
      editKeyModal: {
        isActive: false,
        isLoading: false,
        error: '',
        currentKey: null,
        form: {
          name: '',
          secret: '',
          digits: 6,
          period: 30,
          algorithm: 'SHA1'
        }
      },
      localKeysCount: 0,
      showUserDropdown: false,
      userMenuModal: {
        isActive: false
      },
      isCloudMode: false,
      // 搜索和分类相关数据
      searchQuery: '',
      selectedCategory: '',
      sortBy: 'name',
      categories: [
        { id: 'social', name: '社交媒体', icon: '📱', keywords: ['twitter', 'facebook', 'instagram', 'linkedin', 'discord', 'telegram', 'wechat', '微信', 'qq'] },
        { id: 'work', name: '工作工具', icon: '💼', keywords: ['github', 'gitlab', 'slack', 'teams', 'notion', 'trello', 'jira', 'confluence'] },
        { id: 'cloud', name: '云服务', icon: '☁️', keywords: ['google', 'microsoft', 'aws', 'azure', 'alibaba', 'aliyun', '阿里云', 'tencent', '腾讯云'] },
        { id: 'finance', name: '金融服务', icon: '💰', keywords: ['bank', 'paypal', 'alipay', '支付宝', 'stripe', 'coinbase', 'binance'] },
        { id: 'gaming', name: '游戏娱乐', icon: '🎮', keywords: ['steam', 'epic', 'blizzard', 'riot', 'ubisoft', 'ea', 'nintendo'] },
        { id: 'email', name: '邮箱服务', icon: '📧', keywords: ['gmail', 'outlook', 'yahoo', 'protonmail', 'icloud', 'qq邮箱'] },
        { id: 'shopping', name: '电商购物', icon: '🛒', keywords: ['amazon', 'taobao', '淘宝', 'jd', '京东', 'tmall', '天猫', 'shopify'] },
        { id: 'other', name: '其他服务', icon: '🔧', keywords: [] }
      ]
    };
  },

  computed: {
    filteredKeys() {
      let filtered = this.keys.slice();
      
      // 确保每个密钥都有分类信息（但不重建对象）
      filtered.forEach(key => {
        if (key.category === undefined || key.category === null) {
          // 只有当分类确实未设置时才自动检测
          key.category = this.autoDetectCategory(key.name || key.secret);
        }
      });
      
      // 搜索过滤
      if (this.searchQuery.trim()) {
        const query = this.searchQuery.toLowerCase().trim();
        filtered = filtered.filter(key => {
          const name = (key.name || '').toLowerCase();
          const secret = (key.secret || '').toLowerCase();
          return name.includes(query) || secret.includes(query);
        });
      }
      
      // 分类过滤
      if (this.selectedCategory) {
        filtered = filtered.filter(key => key.category === this.selectedCategory);
      }
      
      // 排序
      if (this.sortBy === 'name') {
        filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      } else if (this.sortBy === 'created') {
        filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      } else if (this.sortBy === 'category') {
        filtered.sort((a, b) => {
          const categoryA = this.getCategoryName(a.category);
          const categoryB = this.getCategoryName(b.category);
          if (categoryA === categoryB) {
            return (a.name || '').localeCompare(b.name || '');
          }
          return categoryA.localeCompare(categoryB);
        });
      }
      
      return filtered;
    }
  },

  mounted: function () {
    this.checkUserSession();
    this.loadKeysFromStorage();
    this.updateAllTokens();
    this.intervalHandle = setInterval(this.updateAllTokens, 1000);
  },

  beforeUnmount: function () {
    clearInterval(this.intervalHandle);
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  },

  methods: {
    // 搜索和分类相关方法
    onSearchInput() {
      // 实时搜索，可以在这里添加防抖逻辑
    },
    
    onCategoryChange() {
      // 分类改变时的处理
    },
    
    onSortChange() {
      // 排序改变时的处理
    },
    
    clearSearch() {
      this.searchQuery = '';
      this.selectedCategory = '';
    },
    
    autoDetectCategory(serviceName) {
      if (!serviceName) return 'other';
      
      const name = serviceName.toLowerCase();
      
      for (const category of this.categories) {
        if (category.keywords.some(keyword => name.includes(keyword.toLowerCase()))) {
          return category.id;
        }
      }
      
      return 'other';
    },
    
    getCategoryName(categoryId) {
      const category = this.categories.find(c => c.id === categoryId);
      return category ? category.name : '其他服务';
    },
    
    getCategoryCount(categoryId) {
      return this.keys.filter(key => 
        (key.category || this.autoDetectCategory(key.name || key.secret)) === categoryId
      ).length;
    },

    // 用户菜单控制
    showUserMenu: function() {
      this.userMenuModal.isActive = true;
    },
    
    closeUserMenu: function() {
      this.userMenuModal.isActive = false;
    },

    showChangePasswordModalFromMenu: function() {
      this.closeUserMenu();
      this.showChangePasswordModal();
    },

    logoutFromMenu: function() {
      this.closeUserMenu();
      this.logout();
    },

    // 用户认证相关方法
    checkUserSession: function() {
      const sessionId = localStorage.getItem('sessionId');
      const userData = localStorage.getItem('userData');
      
      if (sessionId && userData) {
        try {
          const user = JSON.parse(userData);
          this.user.isLoggedIn = true;
          this.user.id = user.id;
          this.user.username = user.username;
          this.user.email = user.email;
          this.user.sessionId = sessionId;
          this.isCloudMode = true;
          this.loadKeysFromCloud();
        } catch (error) {
          console.error('解析用户数据失败:', error);
          this.clearUserSession();
        }
      } else {
        this.checkLocalKeys();
      }
    },

    checkLocalKeys: function() {
      try {
        const localKeys = localStorage.getItem('totpKeys_v5_3_qr');
        if (localKeys) {
          const parsedKeys = JSON.parse(localKeys);
          this.localKeysCount = parsedKeys.length;
        }
      } catch (error) {
        console.error('检查本地密钥失败:', error);
      }
    },

    showAuthModal: function(mode) {
      this.authModal.mode = mode;
      this.authModal.isActive = true;
      this.authModal.error = '';
      this.authModal.form = {
        username: '',
        password: ''
      };
    },

    closeAuthModal: function() {
      this.authModal.isActive = false;
      this.authModal.isLoading = false;
      this.authModal.error = '';
    },

    toggleAuthMode: function() {
      this.authModal.mode = this.authModal.mode === 'login' ? 'register' : 'login';
      this.authModal.error = '';
    },

    async register() {
      this.authModal.isLoading = true;
      this.authModal.error = '';

      try {
        const response = await fetch('/api/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username: this.authModal.form.username,
            password: this.authModal.form.password
          })
        });

        const result = await response.json();

        if (result.success) {
          this.showToast('注册成功！请登录');
          this.authModal.mode = 'login';
          this.authModal.form.password = '';
        } else {
          this.authModal.error = result.message || '注册失败';
        }
      } catch (error) {
        console.error('注册错误:', error);
        this.authModal.error = '网络错误，请稍后重试';
      } finally {
        this.authModal.isLoading = false;
      }
    },

    async login() {
      this.authModal.isLoading = true;
      this.authModal.error = '';

      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username: this.authModal.form.username,
            password: this.authModal.form.password
          })
        });

        const result = await response.json();

        if (result.success) {
          // 保存用户信息
          localStorage.setItem('sessionId', result.sessionId);
          localStorage.setItem('userData', JSON.stringify(result.user));
          
          this.user.isLoggedIn = true;
          this.user.id = result.user.id;
          this.user.username = result.user.username;
          this.user.email = result.user.email;
          this.user.sessionId = result.sessionId;
          this.isCloudMode = true;

          this.closeAuthModal();
          this.showToast('登录成功！');
          
          // 检查是否有本地密钥需要迁移
          this.checkLocalKeys();
          
          // 加载云端密钥
          await this.loadKeysFromCloud();
        } else {
          this.authModal.error = result.message || '登录失败';
        }
      } catch (error) {
        console.error('登录错误:', error);
        this.authModal.error = '网络错误，请稍后重试';
      } finally {
        this.authModal.isLoading = false;
      }
    },

    async logout() {
      try {
        await fetch('/api/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sessionId: this.user.sessionId
          })
        });
      } catch (error) {
        console.error('注销请求失败:', error);
      }

      this.clearUserSession();
      this.showToast('已注销登录');
    },

    clearUserSession: function() {
      localStorage.removeItem('sessionId');
      localStorage.removeItem('userData');
      
      this.user.isLoggedIn = false;
      this.user.id = null;
      this.user.username = '';
      this.user.email = '';
      this.user.sessionId = '';
      this.isCloudMode = false;
      
      // 重新加载本地密钥
      this.loadKeysFromStorage();
    },

    async loadKeysFromCloud() {
      if (!this.user.isLoggedIn) return;

      try {
        const response = await fetch('/api/keys', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.user.sessionId}`,
            'Content-Type': 'application/json'
          }
        });

        const result = await response.json();

        if (result.success) {
          this.keys = result.keys.map(key => ({
            id: key.id,
            name: key.name,
            secret: key.secret,
            digits: key.digits,
            period: key.period,
            algorithm: key.algorithm,
            category: key.category,
            token: '',
            updatingIn: 0,
            isEditingName: false,
            editingNameValue: key.name,
            isCloudKey: true
          }));
        } else if (response.status === 401) {
          // 会话过期
          this.clearUserSession();
          this.showToast('会话已过期，请重新登录', true);
        }
      } catch (error) {
        console.error('加载云端密钥失败:', error);
        this.showToast('加载云端密钥失败', true);
      }
    },

    async migrateLocalKeys() {
      try {
        const localKeys = localStorage.getItem('totpKeys_v5_3_qr');
        if (!localKeys) return;

        const parsedKeys = JSON.parse(localKeys);
        const keysToMigrate = parsedKeys.map(key => ({
          name: key.name,
          secret: key.secret,
          digits: key.digits || 6,
          period: key.period || 30,
          algorithm: key.algorithm || 'SHA1'
        }));

        const response = await fetch('/api/keys/batch', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.user.sessionId}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ keys: keysToMigrate })
        });

        const result = await response.json();

        if (result.success) {
          this.showToast(`成功迁移 ${result.addedKeys.length} 个密钥到云端`);
          
          // 清除本地数据
          localStorage.removeItem('totpKeys_v5_3_qr');
          this.localKeysCount = 0;
          
          // 重新加载云端密钥
          await this.loadKeysFromCloud();
        } else {
          this.showToast('密钥迁移失败: ' + result.message, true);
        }
      } catch (error) {
        console.error('迁移密钥失败:', error);
        this.showToast('密钥迁移失败', true);
      }
    },

    ignoreLocalKeys: function() {
      this.localKeysCount = 0;
    },

    // 修改密码相关方法
    showChangePasswordModal: function() {
      this.changePasswordModal.isActive = true;
      this.changePasswordModal.error = '';
      this.changePasswordModal.form = {
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      };
    },

    closeChangePasswordModal: function() {
      this.changePasswordModal.isActive = false;
      this.changePasswordModal.isLoading = false;
      this.changePasswordModal.error = '';
    },

    async changePassword() {
      this.changePasswordModal.isLoading = true;
      this.changePasswordModal.error = '';

      // 验证输入
      if (this.changePasswordModal.form.newPassword !== this.changePasswordModal.form.confirmPassword) {
        this.changePasswordModal.error = '新密码两次输入不一致';
        this.changePasswordModal.isLoading = false;
        return;
      }

      if (this.changePasswordModal.form.newPassword.length < 6) {
        this.changePasswordModal.error = '新密码长度不能少于6个字符';
        this.changePasswordModal.isLoading = false;
        return;
      }

      try {
        const response = await fetch('/api/change-password', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.user.sessionId}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            currentPassword: this.changePasswordModal.form.currentPassword,
            newPassword: this.changePasswordModal.form.newPassword
          })
        });

        const result = await response.json();

        if (result.success) {
          this.showToast('密码修改成功');
          this.closeChangePasswordModal();
        } else {
          this.changePasswordModal.error = result.message || '密码修改失败';
        }
      } catch (error) {
        console.error('修改密码错误:', error);
        this.changePasswordModal.error = '网络错误，请稍后重试';
      } finally {
        this.changePasswordModal.isLoading = false;
      }
    },

    // 编辑密钥相关方法
    showEditKeyModal: function(keyEntry) {
      this.editKeyModal.isActive = true;
      this.editKeyModal.error = '';
      this.editKeyModal.currentKey = keyEntry;
      this.editKeyModal.form = {
        name: keyEntry.name,
        secret: keyEntry.secret,
        digits: keyEntry.digits,
        period: keyEntry.period,
        algorithm: keyEntry.algorithm || 'SHA1',
        category: keyEntry.category || 'other'
      };
    },

    closeEditKeyModal: function() {
      this.editKeyModal.isActive = false;
      this.editKeyModal.isLoading = false;
      this.editKeyModal.error = '';
      this.editKeyModal.currentKey = null;
    },

    async updateKey() {
      this.editKeyModal.isLoading = true;
      this.editKeyModal.error = '';

      try {
        // 验证密钥格式
        const cleanSecret = this.editKeyModal.form.secret.replace(/\s/g, '').toUpperCase();
        if (!/^[A-Z2-7]+=*$/.test(cleanSecret)) {
          this.editKeyModal.error = '密钥格式不正确，请确保是有效的Base32格式';
          this.editKeyModal.isLoading = false;
          return;
        }

        if (this.isCloudMode && this.user.isLoggedIn) {
          // 云端模式：更新服务器
          const response = await fetch(`/api/keys/${this.editKeyModal.currentKey.id}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${this.user.sessionId}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: this.editKeyModal.form.name,
              secret: cleanSecret,
              digits: this.editKeyModal.form.digits,
              period: this.editKeyModal.form.period,
              algorithm: this.editKeyModal.form.algorithm,
              category: this.editKeyModal.form.category
            })
          });

          const result = await response.json();

          if (result.success) {
            // 更新本地数据
            Object.assign(this.editKeyModal.currentKey, {
              name: this.editKeyModal.form.name,
              secret: cleanSecret,
              digits: this.editKeyModal.form.digits,
              period: this.editKeyModal.form.period,
              algorithm: this.editKeyModal.form.algorithm,
              category: this.editKeyModal.form.category
            });
            this.editKeyModal.currentKey.editingNameValue = this.editKeyModal.form.name;
            this.showToast('密钥更新成功');
            this.closeEditKeyModal();
          } else {
            throw new Error(result.message || '更新失败');
          }
        } else {
          // 本地模式：直接更新
          Object.assign(this.editKeyModal.currentKey, {
            name: this.editKeyModal.form.name,
            secret: cleanSecret,
            digits: this.editKeyModal.form.digits,
            period: this.editKeyModal.form.period,
            algorithm: this.editKeyModal.form.algorithm,
            category: this.editKeyModal.form.category
          });
          this.editKeyModal.currentKey.editingNameValue = this.editKeyModal.form.name;
          this.saveKeysToStorage();
          this.showToast('密钥更新成功');
          this.closeEditKeyModal();
        }
      } catch (error) {
        console.error('更新密钥失败:', error);
        this.editKeyModal.error = '更新密钥失败: ' + error.message;
      } finally {
        this.editKeyModal.isLoading = false;
      }
    },
    updateAllTokens: function () {
      this.keys.forEach(keyEntry => {
        try {
          if (!keyEntry.secret || stripSpaces(keyEntry.secret).length === 0) {
            keyEntry.token = "密钥无效";
            keyEntry.updatingIn = (parseInt(keyEntry.period, 10) || 30);
            return;
          }
          const totp = new OTPAuth.TOTP({
            issuer: keyEntry.name || '',
            label: keyEntry.name || 'OTPAuth',
            algorithm: 'SHA1',
            digits: parseInt(keyEntry.digits, 10) || 6,
            period: parseInt(keyEntry.period, 10) || 30,
            secret: OTPAuth.Secret.fromBase32(stripSpaces(keyEntry.secret)),
          });
          keyEntry.token = truncateTo(totp.generate(), keyEntry.digits || 6);
          keyEntry.updatingIn = (parseInt(keyEntry.period, 10) || 30) - (getCurrentSeconds() % (parseInt(keyEntry.period, 10) || 30));
        } catch (error) {
          console.error("Error generating token for key:", keyEntry.name || keyEntry.secret, error);
          keyEntry.token = "格式错误";
          keyEntry.updatingIn = (parseInt(keyEntry.period, 10) || 30);
        }
      });
    },

    processBatchInput: async function(isFromPaste = false) {
      const currentInput = this.batchSecretsInput;
      if (!currentInput.trim()) {
        if (!isFromPaste && !document.activeElement.classList.contains('action-button')) {
            this.showToast("输入框为空，请输入密钥。", true);
        }
        return;
      }

      const lines = currentInput.split('\n');
      let addedCount = 0;
      let failedCount = 0;
      let newKeysToAdd = [];

      lines.forEach((line, index) => {
        let name = '';
        let secretPart = line.trim();

        if (!secretPart) return;

        let parts;
        // First, check for a tab separator
        if (secretPart.includes('\t')) {
            parts = secretPart.split('\t');
        }
        // MODIFIED: Removed the logic that splits by space.
        // Now only checks for a colon if no tab was found.
        else if (secretPart.includes(':')) {
            const firstColonIndex = secretPart.indexOf(':');
            parts = [secretPart.substring(0, firstColonIndex), secretPart.substring(firstColonIndex + 1)];
        }

        // If parts were found (split by tab or colon), separate name and secret.
        if (parts && parts.length > 1) {
            name = parts[0].trim();
            secretPart = parts.slice(1).join(secretPart.includes('\t') ? '\t' : ':').trim();
        }

        try {
          // The entire secretPart (with spaces if any) is now processed.
          // The stripSpaces function will remove them before validation.
          const strippedSecret = stripSpaces(secretPart);
          if (!strippedSecret) throw new Error("Secret part is empty after stripping spaces.");

          // Validate the Base32 secret key
          OTPAuth.Secret.fromBase32(strippedSecret);

          const keyToAdd = {
            name: name || `密钥 ${this.keys.length + newKeysToAdd.length + 1}`,
            secret: strippedSecret.toUpperCase(),
            digits: parseInt(this.batchDefaultSettings.digits, 10) || 6,
            period: parseInt(this.batchDefaultSettings.period, 10) || 30,
            algorithm: 'SHA1',
            category: this.batchDefaultSettings.category || 'other'
          };
          newKeysToAdd.push(keyToAdd);
        } catch (e) {
          failedCount++;
          console.warn(`批量添加失败 (行 ${index + 1}): "${line}". 原因: ${e.message}`);
        }
      });

      if (newKeysToAdd.length > 0) {
        if (this.isCloudMode && this.user.isLoggedIn) {
          // 云端模式：保存到服务器
          try {
            // 为密钥添加分类信息
            const keysWithCategory = newKeysToAdd.map(key => ({
              ...key,
              category: key.category === 'other' ? this.autoDetectCategory(key.name) : key.category
            }));

            const response = await fetch('/api/keys/batch', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.user.sessionId}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ keys: keysWithCategory })
            });

            const result = await response.json();

            if (result.success) {
              addedCount = result.addedKeys.length;
              if (result.failedKeys && result.failedKeys.length > 0) {
                failedCount += result.failedKeys.length;
              }
              // 重新加载云端密钥
              await this.loadKeysFromCloud();
            } else {
              throw new Error(result.message || '保存到云端失败');
            }
          } catch (error) {
            console.error('云端保存失败:', error);
            this.showToast('保存到云端失败: ' + error.message, true);
            return;
          }
        } else {
          // 本地模式：保存到localStorage
          const localKeys = newKeysToAdd.map(key => ({
            id: generateUUID(),
            ...key,
            category: key.category === 'other' ? this.autoDetectCategory(key.name) : key.category,
            createdAt: new Date().toISOString(),
            token: '',
            updatingIn: 0,
            isEditingName: false,
            editingNameValue: key.name,
          }));
          this.keys.push(...localKeys);
          this.saveKeysToStorage();
          this.updateAllTokens();
          addedCount = newKeysToAdd.length;
        }
      }

      if (addedCount > 0 || failedCount > 0 || currentInput.trim()) {
         this.batchSecretsInput = '';
      }

      let message = '';
      if (addedCount > 0) {
        message += `成功添加 ${addedCount} 个密钥${this.isCloudMode ? '到云端' : ''}。`;
      }
      if (failedCount > 0) {
        message += (message ? ' ' : '') + `${failedCount} 个密钥添加失败 (格式或内容无效)。`;
      }

      if ((addedCount > 0 || failedCount > 0) || (currentInput.trim() && addedCount === 0 && failedCount === 0) ){
           if (!message && currentInput.trim()) message = "没有新的有效密钥被添加。请检查格式。";
           if (message) this.showToast(message, failedCount > 0 && addedCount === 0);
      }
    },

    processBatchInputOnBlur: function() {
        if (this.batchSecretsInput.trim() && (!document.activeElement || !document.activeElement.closest('.action-button'))) {
            this.processBatchInput(false);
        }
    },

    handlePaste: function(event) {
        event.preventDefault();
        const pasteData = (event.clipboardData || window.clipboardData).getData('text');
        this.batchSecretsInput = pasteData;
        this.$nextTick(() => {
             this.processBatchInput(true);
        });
    },

    startEditKeyName: function(keyEntry) {
      // 关闭其他正在编辑的密钥名称
      this.keys.forEach(k => {
        if (k.isEditingName && k.id !== keyEntry.id) {
            this.saveKeyName(k);
        }
        k.isEditingName = (k.id === keyEntry.id);
      });
      keyEntry.editingNameValue = keyEntry.name;
      this.$nextTick(() => {
        const inputEl = document.getElementById('name-input-' + keyEntry.id);
        if (inputEl) {
          inputEl.focus();
          inputEl.select();
        }
      });
    },

    saveKeyName: async function(keyEntry) {
      if (keyEntry.isEditingName) {
        const newName = keyEntry.editingNameValue.trim();
        
        if (this.isCloudMode && this.user.isLoggedIn && keyEntry.id) {
          // 云端模式：更新服务器
          try {
            const response = await fetch(`/api/keys/${keyEntry.id}`, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${this.user.sessionId}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ name: newName })
            });

            const result = await response.json();

            if (result.success) {
              keyEntry.name = newName;
              keyEntry.isEditingName = false;
            } else {
              throw new Error(result.message || '更新失败');
            }
          } catch (error) {
            console.error('更新密钥名称失败:', error);
            this.showToast('更新密钥名称失败: ' + error.message, true);
            // 恢复原名称
            keyEntry.editingNameValue = keyEntry.name;
          }
        } else {
          // 本地模式
          keyEntry.name = newName;
          keyEntry.isEditingName = false;
          this.saveKeysToStorage();
        }
      }
    },

    removeKey: async function (index) {
      const keyToRemove = this.keys[index];
      const removedKeyName = keyToRemove.name || `密钥 ${index + 1}`;
      
      if (this.isCloudMode && this.user.isLoggedIn && keyToRemove.id) {
        // 云端模式：从服务器删除
        try {
          const response = await fetch(`/api/keys/${keyToRemove.id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${this.user.sessionId}`,
              'Content-Type': 'application/json'
            }
          });

          const result = await response.json();

          if (result.success) {
            this.keys.splice(index, 1);
            this.showToast(`密钥 "${removedKeyName}" 已从云端删除。`);
          } else {
            throw new Error(result.message || '删除失败');
          }
        } catch (error) {
          console.error('删除密钥失败:', error);
          this.showToast('删除密钥失败: ' + error.message, true);
        }
      } else {
        // 本地模式：从localStorage删除
        this.keys.splice(index, 1);
        this.saveKeysToStorage();
        this.showToast(`密钥 "${removedKeyName}" 已删除。`);
      }
    },

    removeKeyById: async function (keyId) {
      const keyIndex = this.keys.findIndex(key => key.id === keyId);
      if (keyIndex === -1) {
        this.showToast('密钥不存在', true);
        return;
      }

      const keyToRemove = this.keys[keyIndex];
      const removedKeyName = keyToRemove.name || `密钥 ${keyIndex + 1}`;
      
      if (this.isCloudMode && this.user.isLoggedIn && keyToRemove.id) {
        // 云端模式：从服务器删除
        try {
          const response = await fetch(`/api/keys/${keyToRemove.id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${this.user.sessionId}`,
              'Content-Type': 'application/json'
            }
          });

          const result = await response.json();

          if (result.success) {
            this.keys.splice(keyIndex, 1);
            this.showToast(`密钥 "${removedKeyName}" 已从云端删除。`);
          } else {
            throw new Error(result.message || '删除失败');
          }
        } catch (error) {
          console.error('删除密钥失败:', error);
          this.showToast('删除密钥失败: ' + error.message, true);
        }
      } else {
        // 本地模式：从localStorage删除
        this.keys.splice(keyIndex, 1);
        this.saveKeysToStorage();
        this.showToast(`密钥 "${removedKeyName}" 已删除。`);
      }
    },

    clearAllKeysWithConfirmation: async function() {
        const confirmMessage = this.isCloudMode 
          ? "确定要清空所有云端密钥吗？此操作不可撤销！" 
          : "确定要清空所有密钥吗？此操作不可撤销！";
          
        if (window.confirm(confirmMessage)) {
          if (this.isCloudMode && this.user.isLoggedIn) {
            // 云端模式：逐个删除
            try {
              const deletePromises = this.keys.map(key => 
                fetch(`/api/keys/${key.id}`, {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `Bearer ${this.user.sessionId}`,
                    'Content-Type': 'application/json'
                  }
                })
              );
              
              await Promise.all(deletePromises);
              this.keys = [];
              this.showToast("所有云端密钥已清空。");
            } catch (error) {
              console.error('清空密钥失败:', error);
              this.showToast('清空密钥失败', true);
            }
          } else {
            // 本地模式
            this.keys = [];
            this.saveKeysToStorage();
            this.showToast("所有密钥已清空。");
          }
        }
    },

    showQrCode: function(keyEntry) {
        try {
            const totp = new OTPAuth.TOTP({
                issuer: keyEntry.name || 'TOTP Generator', // Use name as issuer, fallback
                label: keyEntry.name || undefined, // Use name as label if available
                algorithm: keyEntry.algorithm || 'SHA1',
                digits: parseInt(keyEntry.digits, 10) || 6,
                period: parseInt(keyEntry.period, 10) || 30,
                secret: OTPAuth.Secret.fromBase32(stripSpaces(keyEntry.secret)),
            });

            const uri = totp.toString();
            this.qrCodeKeyName = keyEntry.name || keyEntry.secret.substring(0, 16) + '...';
            this.isQrModalActive = true;

            this.$nextTick(() => {
                const container = document.getElementById('qrcode-container');
                if (container) {
                    container.innerHTML = ''; // Clear previous QR code
                    const qr = qrcode(0, 'M'); // type 0: auto-detect, 'M' for medium error correction
                    qr.addData(uri);
                    qr.make();
                    container.innerHTML = qr.createImgTag(5, 8); // (module size, margin)
                }
            });
        } catch (error) {
            console.error("Could not generate QR code URI:", error);
            this.showToast("生成二维码失败，密钥格式可能不正确。", true);
        }
    },

    closeQrModal: function() {
        this.isQrModalActive = false;
        const container = document.getElementById('qrcode-container');
        if (container) {
            container.innerHTML = ''; // Clear QR code on close
        }
    },

    saveKeysToStorage: function () {
      try {
        const keysToSave = this.keys.map(k => {
            const { isEditingName, editingNameValue, ...rest } = k;
            return rest;
        });
        localStorage.setItem('totpKeys_v5_3_qr', JSON.stringify(keysToSave)); // New storage key
      } catch (e) {
        console.error("Error saving keys to localStorage:", e);
        this.showToast("无法保存密钥到本地存储。", true);
      }
    },

    loadKeysFromStorage: function () {
      // 只在非云端模式下加载本地密钥
      if (this.isCloudMode) {
        return;
      }
      
      try {
        const storedKeys = localStorage.getItem('totpKeys_v5_3_qr');
        if (storedKeys) {
          const parsedKeys = JSON.parse(storedKeys);
          this.keys = parsedKeys.map(key => ({
            id: key.id || generateUUID(),
            name: key.name || '',
            secret: key.secret || '',
            digits: parseInt(key.digits, 10) || 6,
            period: parseInt(key.period, 10) || 30,
            algorithm: key.algorithm || 'SHA1',
            category: key.category,
            token: '',
            updatingIn: 0,
            isEditingName: false,
            editingNameValue: key.name || '',
            isCloudKey: false
          }));
        } else {
          // Add migration logic from older versions if needed
          const prevV5_2Keys = localStorage.getItem('totpKeys_v5_2_final');
          if (prevV5_2Keys) {
              const parsedV5_2 = JSON.parse(prevV5_2Keys);
              this.keys = parsedV5_2.map(key => ({
                  ...key,
                  id: key.id || generateUUID(),
                  category: key.category,
                  isEditingName: false,
                  editingNameValue: key.name || '',
                  isCloudKey: false
              }));
              this.saveKeysToStorage();
              localStorage.removeItem('totpKeys_v5_2_final');
              this.showToast("密钥已迁移至 V5.3 版本。");
          }
        }
      } catch (e) {
        console.error("Error loading keys from localStorage:", e);
        this.keys = [];
        this.showToast("无法从本地存储加载密钥。请检查浏览器控制台获取更多信息。", true);
      }
    },

    copyToken: function (token, keyId) {
      if (!token || token === "错误" || token === "密钥无效" || token === "格式错误") {
        this.showToast("无法复制无效的验证码！", true);
        return;
      }
      navigator.clipboard.writeText(token).then(() => {
        this.showToast(`验证码 "${token}" 已复制!`);
      }).catch(err => {
        console.error('Failed to copy: ', err);
        try {
            const textArea = document.createElement("textarea");
            textArea.value = token;
            textArea.style.position = "fixed"; textArea.style.top = "0"; textArea.style.left = "0";
            textArea.style.width = "2em"; textArea.style.height = "2em";
            textArea.style.padding = "0"; textArea.style.border = "none";
            textArea.style.outline = "none"; textArea.style.boxShadow = "none";
            textArea.style.background = "transparent";
            document.body.appendChild(textArea);
            textArea.focus(); textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showToast(`验证码 "${token}" 已复制 (备用方法)!`);
        } catch (execCommandErr) {
            console.error('Fallback copy failed:', execCommandErr);
            this.showToast("复制失败，请手动复制。", true);
        }
      });
    },
    showToast: function (message, isError = false) {
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = message;
        toast.style.backgroundColor = isError ? 'var(--danger-color)' : 'var(--secondary-color)';
        toast.classList.add('show');
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
          toast.classList.remove('show');
        }, 3000);
      }
    },
  }
});

app.mount('#app');
