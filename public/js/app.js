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
      inputDebounceTimer: null, 
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

    processBatchInput: function(isFromPaste = false) {
      const currentInput = this.batchSecretsInput; // Capture current input
      if (!currentInput.trim()) {
        if (!isFromPaste) { // Only show toast if not from paste, paste is silent
            // this.showToast("输入框为空。", true); 
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
        // Prioritize Tab for separation, as colon can be part of a name more easily
        if (secretPart.includes('\t')) { 
            parts = secretPart.split('\t');
        } else if (secretPart.includes(':')) {
            parts = secretPart.split(/:,(.*)/s); // Split only on the first colon
             if(parts.length === 1 && secretPart.includes(':')) { // Handle case where split might not work as expected
                let firstColonIndex = secretPart.indexOf(':');
                parts = [secretPart.substring(0, firstColonIndex), secretPart.substring(firstColonIndex + 1)];
            }
        }


        if (parts && parts.length > 1) {
            name = parts[0].trim(); 
            secretPart = parts.slice(1).join(secretPart.includes('\t') ? '\t' : ':').trim();
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
          // addedCount++; // Increment count after successful push
        } catch (e) {
          failedCount++;
          console.warn(`批量添加失败 (行 ${index + 1}): "${line}". 原因: ${e.message}`);
        }
      });
      
      if (newKeysToAdd.length > 0) {
        this.keys.push(...newKeysToAdd);
        this.saveKeysToStorage();
        this.updateAllTokens();
        addedCount = newKeysToAdd.length; // Correctly count added keys
      }
      
      this.batchSecretsInput = ''; // Clear textarea only after processing
      
      let message = '';
      if (addedCount > 0) {
        message += `成功添加 ${addedCount} 个密钥。`;
      }
      if (failedCount > 0) {
        message += (message ? ' ' : '') + `${failedCount} 个密钥添加失败 (格式无效)。`;
      }
      // Only show toast if there was something to process or an error occurred
      if ((addedCount > 0 || failedCount > 0) || (currentInput.trim() && addedCount === 0 && failedCount === 0) ){
           if (!message) message = "没有新的有效密钥被添加。";
           this.showToast(message, failedCount > 0 && addedCount === 0);
      }
    },
    
    processBatchInputOnBlur: function() {
        // Process whatever is in the input on blur, unless it's empty
        if (this.batchSecretsInput.trim()) {
            this.processBatchInput(false);
        }
    },

    debounceProcessBatchInput: function() {
        clearTimeout(this.inputDebounceTimer);
        // No auto-processing on input, user will use blur or paste
        // If you want to auto-process after typing stops, uncomment below:
        // this.inputDebounceTimer = setTimeout(() => {
        //     this.processBatchInput(false); 
        // }, 1500); // 1.5s delay after last input
    },

    handlePaste: function(event) {
        event.preventDefault(); // Prevent default paste behavior
        const pasteData = (event.clipboardData || window.clipboardData).getData('text');
        this.batchSecretsInput = pasteData; // Manually set textarea value
        this.$nextTick(() => { 
             clearTimeout(this.inputDebounceTimer); 
             this.processBatchInput(true); // Process immediately on paste
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
      // Direct delete without confirmation
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
        localStorage.setItem('totpKeys_v5_final', JSON.stringify(keysToSave)); // New storage key
      } catch (e) {
        console.error("Error saving keys to localStorage:", e);
        this.showToast("无法保存密钥到本地存储。", true);
      }
    },

    loadKeysFromStorage: function () {
      try {
        const storedKeys = localStorage.getItem('totpKeys_v5_final'); // New storage key
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
            isEditingName: false, 
            editingNameValue: key.name || '', 
          }));
        } else {
          // Migration from 'totpKeys_v4_grid_auto'
          const prevV4Keys = localStorage.getItem('totpKeys_v4_grid_auto');
          if (prevV4Keys) {
            const parsedV4 = JSON.parse(prevV4Keys);
            this.keys = parsedV4.map(key => ({
              ...key,
              id: key.id || generateUUID(),
              name: key.name || '',
              isEditingName: false,
              editingNameValue: key.name || '',
            }));
            this.saveKeysToStorage();
            localStorage.removeItem('totpKeys_v4_grid_auto');
            this.showToast("密钥已从 V4 迁移。");
            return;
          }
          // Add other older migration logic if necessary
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
