// Helper functions
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
      },
      intervalHandle: null,
      toastTimeout: null,
      inputDebounceTimer: null, // For debouncing textarea input
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
    if (this.inputDebounceTimer) clearTimeout(this.inputDebounceTimer);
  },

  methods: {
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
            label: 'OTPAuth:' + (keyEntry.name || keyEntry.secret.substring(0,6)),
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

    processBatchInput: function() {
      if (!this.batchSecretsInput.trim()) {
        // this.showToast("输入框为空。", true); // Optional: notify if input is empty on explicit button click
        return;
      }

      const lines = this.batchSecretsInput.split('\n');
      let addedCount = 0;
      let failedCount = 0;
      let newKeysToAdd = [];

      lines.forEach((line, index) => {
        let name = '';
        let secretPart = line.trim();
        
        if (!secretPart) return; 

        // Try to parse "email\tsecret" or "name:secret"
        // Prefer Tab as a more distinct separator for email like names
        let parts;
        if (secretPart.includes('\t')) {
            parts = secretPart.split('\t');
        } else if (secretPart.includes(':')) {
            parts = secretPart.split(':');
        }

        if (parts && parts.length > 1) {
            name = parts.shift().trim(); 
            secretPart = parts.join(parts.length > 1 && secretPart.includes('\t') ? '\t' : ':').trim(); // Rejoin if separator was in secret
        }


        try {
          OTPAuth.Secret.fromBase32(stripSpaces(secretPart)); 
          
          const keyToAdd = {
            id: generateUUID(),
            name: name || `密钥 ${this.keys.length + newKeysToAdd.length + 1}`,
            secret: stripSpaces(secretPart.toUpperCase()),
            digits: parseInt(this.batchDefaultSettings.digits, 10) || 6,
            period: parseInt(this.batchDefaultSettings.period, 10) || 30,
            algorithm: 'SHA1', 
            token: '',
            updatingIn: 0,
            isEditingName: false, 
            editingNameValue: name || `密钥 ${this.keys.length + newKeysToAdd.length + 1}`,
          };
          newKeysToAdd.push(keyToAdd);
          addedCount++;
        } catch (e) {
          failedCount++;
          console.warn(`批量添加失败 (行 ${index + 1}): "${line}". 原因: ${e.message}`);
        }
      });

      if (newKeysToAdd.length > 0) {
        this.keys.push(...newKeysToAdd);
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
      if (!message && lines.some(s => s.trim())) {
        message = "没有输入有效密钥。";
      } else if (!message) {
        return; 
      }
      this.showToast(message, failedCount > 0 && addedCount === 0);
    },
    
    // Debounce processing for textarea input to avoid too frequent updates
    debounceProcessBatchInput: function() {
        clearTimeout(this.inputDebounceTimer);
        this.inputDebounceTimer = setTimeout(() => {
            // We don't auto-process on every input for better UX. 
            // User can click the button or it processes on blur.
            // If you want auto-processing on input, call this.processBatchInput() here.
        }, 750); // 750ms delay
    },

    handlePaste: function(event) {
        this.$nextTick(() => { // Allow textarea to update with pasted content
             clearTimeout(this.inputDebounceTimer); // Clear any pending debounce
             this.processBatchInput(); // Process immediately on paste
        });
    },
    
    startEditKeyName: function(keyEntry, index) {
      this.keys.forEach((k, i) => { 
        if (k.isEditingName && i !== index) {
            this.saveKeyName(k);
        }
        k.isEditingName = (i === index);
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

    saveKeyName: function(keyEntry) {
      if (keyEntry.isEditingName) { 
        keyEntry.name = keyEntry.editingNameValue.trim();
        keyEntry.isEditingName = false;
        this.saveKeysToStorage();
      }
    },

    removeKey: function (index) {
      const removedKeyName = this.keys[index].name || `密钥 ${index + 1}`;
      this.keys.splice(index, 1);
      this.saveKeysToStorage();
      this.showToast(`密钥 "${removedKeyName}" 已删除。`);
    },

    clearAllKeysWithConfirmation: function() {
        if (window.confirm("确定要清空所有密钥吗？此操作不可撤销！")) {
            this.keys = [];
            this.saveKeysToStorage();
            this.showToast("所有密钥已清空。");
        }
    },

    saveKeysToStorage: function () {
      try {
        const keysToSave = this.keys.map(k => {
            const { isEditingName, editingNameValue, ...rest } = k;
            return rest;
        });
        localStorage.setItem('totpKeys_v4_grid_auto', JSON.stringify(keysToSave)); // Updated storage key
      } catch (e) {
        console.error("Error saving keys to localStorage:", e);
        this.showToast("无法保存密钥到本地存储。", true);
      }
    },

    loadKeysFromStorage: function () {
      try {
        const storedKeys = localStorage.getItem('totpKeys_v4_grid_auto'); // Updated storage key
        if (storedKeys) {
          const parsedKeys = JSON.parse(storedKeys);
          this.keys = parsedKeys.map(key => ({
            id: key.id || generateUUID(), 
            name: key.name || '',
            secret: key.secret || '',
            digits: parseInt(key.digits, 10) || 6,
            period: parseInt(key.period, 10) || 30,
            algorithm: key.algorithm || 'SHA1', // Keep stored algorithm, even if UI defaults to SHA1 for new adds
            token: '', 
            updatingIn: 0,
            isEditingName: false, 
            editingNameValue: key.name || '', 
          }));
        } else {
          // Attempt to migrate from 'totpKeys_v3_grid_auto' (previous grid version)
          const prevGridKeys = localStorage.getItem('totpKeys_v3_grid_auto');
          if (prevGridKeys) {
            const parsedOldGrid = JSON.parse(prevGridKeys);
            this.keys = parsedOldGrid.map(key => ({
              ...key, 
              id: key.id || generateUUID(),
              name: key.name || '',
              isEditingName: false,
              editingNameValue: key.name || '',
            }));
            this.saveKeysToStorage(); 
            localStorage.removeItem('totpKeys_v3_grid_auto');
            this.showToast("密钥已迁移到最新格式。");
            return;
          }
          // ... (keep other older migration logic if necessary, or remove if not relevant anymore)
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
