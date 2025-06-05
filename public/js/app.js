// Helper functions (remains mostly the same)
function getCurrentSeconds() {
  return Math.round(new Date().getTime() / 1000.0);
}

function stripSpaces(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/\s/g, '');
}

function truncateTo(str, digits) {
  if (typeof str !== 'string') str = String(str);
  if (str.length <= digits) {
    return str;
  }
  return str.slice(-digits);
}

// UUID generator for unique key IDs
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}


const app = Vue.createApp({
  data() {
    return {
      keys: [], // Array to store multiple key entries
      newKey: { // Data for the "add new key" form
        id: null,
        name: '',
        secret: '',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        // token and updatingIn are per-key, not for the form
      },
      batchSecretsInput: '', // For the textarea input
      batchDefaultSettings: { // Default settings for batch adding
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
      },
      activeTab: 'single', // 'single' or 'batch'
      intervalHandle: null,
      toastTimeout: null,
    };
  },

  mounted: function () {
    this.loadKeysFromStorage();
    this.updateAllTokens();
    this.intervalHandle = setInterval(this.updateAllTokens, 1000);
  },

  beforeUnmount: function () {
    clearInterval(this.intervalHandle);
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  },

  methods: {
    updateAllTokens: function () {
      this.keys.forEach(keyEntry => {
        try {
          if (!keyEntry.secret || stripSpaces(keyEntry.secret).length === 0) {
            keyEntry.token = "密钥无效";
            keyEntry.updatingIn = (keyEntry.period || 30);
            return; 
          }
          const totp = new OTPAuth.TOTP({
            issuer: keyEntry.name || '',
            label: 'OTPAuth:' + (keyEntry.name || keyEntry.secret.substring(0,6)), // More unique label
            algorithm: keyEntry.algorithm || 'SHA1',
            digits: parseInt(keyEntry.digits, 10) || 6,
            period: parseInt(keyEntry.period, 10) || 30,
            secret: OTPAuth.Secret.fromBase32(stripSpaces(keyEntry.secret)),
          });
          keyEntry.token = truncateTo(totp.generate(), keyEntry.digits || 6);
          keyEntry.updatingIn = (keyEntry.period || 30) - (getCurrentSeconds() % (keyEntry.period || 30));
        } catch (error) {
          console.error("Error generating token for key:", keyEntry.name || keyEntry.secret, error);
          keyEntry.token = "错误";
          keyEntry.updatingIn = (keyEntry.period || 30);
        }
      });
    },

    addKey: function () {
      const secretTrimmed = this.newKey.secret.trim();
      if (!secretTrimmed) {
        this.showToast("密钥不能为空！", true);
        return;
      }
      try {
        OTPAuth.Secret.fromBase32(stripSpaces(secretTrimmed));
      } catch (e) {
        this.showToast("无效的Base32密钥格式！请检查密钥。", true);
        console.error("Invalid secret format:", e);
        return;
      }

      const keyToAdd = {
        id: generateUUID(),
        name: this.newKey.name.trim() || '', // Default to empty string if no name
        secret: stripSpaces(secretTrimmed.toUpperCase()),
        digits: parseInt(this.newKey.digits, 10) || 6,
        period: parseInt(this.newKey.period, 10) || 30,
        algorithm: this.newKey.algorithm || 'SHA1',
        token: '',
        updatingIn: 0,
      };
      this.keys.push(keyToAdd);
      this.saveKeysToStorage();
      this.resetNewKeyForm();
      this.updateAllTokens(); 
      this.showToast("密钥添加成功!");
    },

    addKeysInBatch: function() {
      const secrets = this.batchSecretsInput.split('\n');
      let addedCount = 0;
      let failedCount = 0;

      secrets.forEach((secretLine, index) => {
        const secretTrimmed = secretLine.trim();
        if (!secretTrimmed) {
          return; // Skip empty lines
        }

        try {
          OTPAuth.Secret.fromBase32(stripSpaces(secretTrimmed)); // Validate format
          
          const keyToAdd = {
            id: generateUUID(),
            name: `密钥 ${this.keys.length + addedCount + 1}`, // Auto-generate name
            secret: stripSpaces(secretTrimmed.toUpperCase()),
            digits: parseInt(this.batchDefaultSettings.digits, 10) || 6,
            period: parseInt(this.batchDefaultSettings.period, 10) || 30,
            algorithm: this.batchDefaultSettings.algorithm || 'SHA1',
            token: '',
            updatingIn: 0,
          };
          this.keys.push(keyToAdd);
          addedCount++;
        } catch (e) {
          failedCount++;
          console.warn(`批量添加失败 (行 ${index + 1}): "${secretTrimmed}". 原因: ${e.message}`);
        }
      });

      if (addedCount > 0) {
        this.saveKeysToStorage();
        this.updateAllTokens();
      }

      this.batchSecretsInput = ''; // Clear textarea
      
      let message = '';
      if (addedCount > 0) {
        message += `成功添加 ${addedCount} 个密钥。`;
      }
      if (failedCount > 0) {
        message += (message ? ' ' : '') + `${failedCount} 个密钥添加失败 (格式无效)。`;
      }
      if (!message) {
        message = "没有输入有效密钥。";
      }
      this.showToast(message, failedCount > 0 && addedCount === 0);
    },
    
    editKeyName: function(keyEntry) {
        const newName = prompt(`为密钥 "${keyEntry.secret.substring(0,10)}..." 输入新名称:`, keyEntry.name);
        if (newName !== null) { // null if user pressed cancel
            keyEntry.name = newName.trim();
            this.saveKeysToStorage();
            this.showToast("名称已更新。");
        }
    },

    removeKey: function (index) {
      if (window.confirm(`确定要删除密钥 "${this.keys[index].name || '该密钥'}" 吗? 这将从本地存储中移除它。`)) {
        this.keys.splice(index, 1);
        this.saveKeysToStorage();
        this.showToast("密钥已删除。");
      }
    },

    resetNewKeyForm: function () {
      this.newKey.name = '';
      this.newKey.secret = '';
      this.newKey.digits = 6;
      this.newKey.period = 30;
      this.newKey.algorithm = 'SHA1';
    },

    saveKeysToStorage: function () {
      try {
        localStorage.setItem('totpKeys_v2', JSON.stringify(this.keys));
      } catch (e) {
        console.error("Error saving keys to localStorage:", e);
        this.showToast("无法保存密钥到本地存储。", true);
      }
    },

    loadKeysFromStorage: function () {
      try {
        const storedKeys = localStorage.getItem('totpKeys_v2');
        if (storedKeys) {
          const parsedKeys = JSON.parse(storedKeys);
          this.keys = parsedKeys.map(key => ({
            id: key.id || generateUUID(), 
            name: key.name || '',
            secret: key.secret || '',
            digits: parseInt(key.digits, 10) || 6,
            period: parseInt(key.period, 10) || 30,
            algorithm: key.algorithm || 'SHA1',
            token: '', 
            updatingIn: 0,
          }));
        } else {
          const oldSecret = localStorage.getItem('totp_secret_key');
          if (oldSecret) {
            this.keys.push({
              id: generateUUID(),
              name: '默认密钥 (旧版)',
              secret: oldSecret,
              digits: parseInt(localStorage.getItem('totp_digits'), 10) || 6,
              period: parseInt(localStorage.getItem('totp_period'), 10) || 30,
              algorithm: localStorage.getItem('totp_algorithm') || 'SHA1',
              token: '',
              updatingIn: 0,
            });
            localStorage.removeItem('totp_secret_key');
            localStorage.removeItem('totp_digits');
            localStorage.removeItem('totp_period');
            localStorage.removeItem('totp_algorithm');
            this.saveKeysToStorage(); 
            this.showToast("旧版密钥已成功迁移。");
          }
        }
      } catch (e) {
        console.error("Error loading keys from localStorage:", e);
        this.keys = []; 
        this.showToast("无法从本地存储加载密钥。请检查浏览器控制台获取更多信息。", true);
      }
    },

    copyToken: function (token, keyId) {
      if (!token || token === "错误" || token === "密钥无效") {
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
            textArea.style.position = "fixed";
            textArea.style.top = "0";
            textArea.style.left = "0";
            textArea.style.width = "2em";
            textArea.style.height = "2em";
            textArea.style.padding = "0";
            textArea.style.border = "none";
            textArea.style.outline = "none";
            textArea.style.boxShadow = "none";
            textArea.style.background = "transparent";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
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
