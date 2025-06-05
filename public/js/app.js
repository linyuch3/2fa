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
      // newKey (for single add) is removed as per request
      batchSecretsInput: '', // For the textarea input
      batchDefaultSettings: { // Default settings for batch adding
        digits: 6,
        period: 30,
        algorithm: 'SHA1', // Algorithm is now fixed to SHA1 for batch add
      },
      // activeTab is removed as single add is removed
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
            label: 'OTPAuth:' + (keyEntry.name || keyEntry.secret.substring(0,6)),
            algorithm: keyEntry.algorithm || 'SHA1', // Use key's own algorithm or default to SHA1
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

    // addKey method is removed as per request (only batch add remains)

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
            algorithm: 'SHA1', // Algorithm fixed to SHA1 for batch add
            token: '',
            updatingIn: 0,
            isEditingName: false, // For inline name editing
            editingNameValue: '', // For inline name editing
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

      this.batchSecretsInput = ''; 
      
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
    
    startEditKeyName: function(keyEntry, index) {
      this.keys.forEach(k => k.isEditingName = false); // Close other editing inputs
      keyEntry.editingNameValue = keyEntry.name;
      keyEntry.isEditingName = true;
      this.$nextTick(() => { // Wait for DOM update
        const inputEl = document.getElementById('name-input-' + keyEntry.id);
        if (inputEl) {
          inputEl.focus();
        }
      });
    },

    saveKeyName: function(keyEntry) {
      if (keyEntry.isEditingName) { // Only save if it was actually in editing mode
        keyEntry.name = keyEntry.editingNameValue.trim();
        keyEntry.isEditingName = false;
        this.saveKeysToStorage();
        this.showToast("名称已更新。");
      }
    },

    removeKey: function (index) {
      const keyToConfirm = this.keys[index];
      // Using a custom modal for confirm is better. For now, window.confirm
      const userName = keyToConfirm.name || `密钥 ${index + 1}`;
      if (window.confirm(`确定要删除密钥 "${userName}" (${keyToConfirm.secret.substring(0,10)}...) 吗? 这将从本地存储中移除它。`)) {
        this.keys.splice(index, 1);
        this.saveKeysToStorage();
        this.showToast("密钥已删除。");
      }
    },

    // resetNewKeyForm is removed as single add is removed

    saveKeysToStorage: function () {
      try {
        // Before saving, remove temporary editing state properties
        const keysToSave = this.keys.map(k => {
            const { isEditingName, editingNameValue, ...rest } = k;
            return rest;
        });
        localStorage.setItem('totpKeys_v2_grid', JSON.stringify(keysToSave)); // Changed storage key
      } catch (e) {
        console.error("Error saving keys to localStorage:", e);
        this.showToast("无法保存密钥到本地存储。", true);
      }
    },

    loadKeysFromStorage: function () {
      try {
        const storedKeys = localStorage.getItem('totpKeys_v2_grid'); // Changed storage key
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
            isEditingName: false, // Initialize editing state
            editingNameValue: key.name || '', // Initialize editing value
          }));
        } else {
          // Migration from totpKeys_v2 (previous multi-key, non-grid version)
          const oldMultiStoredKeys = localStorage.getItem('totpKeys_v2');
          if (oldMultiStoredKeys) {
              const oldParsed = JSON.parse(oldMultiStoredKeys);
              this.keys = oldParsed.map(key => ({
                id: key.id || generateUUID(),
                name: key.name || '',
                secret: key.secret || '',
                digits: parseInt(key.digits, 10) || 6,
                period: parseInt(key.period, 10) || 30,
                algorithm: key.algorithm || 'SHA1',
                token: '',
                updatingIn: 0,
                isEditingName: false,
                editingNameValue: key.name || '',
              }));
              this.saveKeysToStorage(); // Save in new format
              localStorage.removeItem('totpKeys_v2'); // Remove old multi-key storage
              this.showToast("密钥已迁移到新布局格式。");
              return; // Exit after migration
          }
          
          // Migration from original single key format
          const oldSingleSecret = localStorage.getItem('totp_secret_key');
          if (oldSingleSecret) {
            this.keys.push({
              id: generateUUID(),
              name: '默认密钥 (旧版)',
              secret: oldSingleSecret,
              digits: parseInt(localStorage.getItem('totp_digits'), 10) || 6,
              period: parseInt(localStorage.getItem('totp_period'), 10) || 30,
              algorithm: localStorage.getItem('totp_algorithm') || 'SHA1',
              token: '',
              updatingIn: 0,
              isEditingName: false,
              editingNameValue: '默认密钥 (旧版)',
            });
            localStorage.removeItem('totp_secret_key');
            localStorage.removeItem('totp_digits');
            localStorage.removeItem('totp_period');
            localStorage.removeItem('totp_algorithm');
            this.saveKeysToStorage(); 
            this.showToast("旧版单密钥已成功迁移。");
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
