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
        token: '',
        updatingIn: 0,
      },
      intervalHandle: null,
      toastTimeout: null, // For managing toast display
    };
  },

  mounted: function () {
    this.loadKeysFromStorage(); // Load keys from localStorage
    this.updateAllTokens();
    this.intervalHandle = setInterval(this.updateAllTokens, 1000);
  },

  beforeUnmount: function () { // Changed from destroyed for Vue 3
    clearInterval(this.intervalHandle);
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  },

  methods: {
    // Update all tokens and their countdowns
    updateAllTokens: function () {
      this.keys.forEach(keyEntry => {
        try {
          // Ensure secret is not empty or just spaces before processing
          if (!keyEntry.secret || stripSpaces(keyEntry.secret).length === 0) {
            keyEntry.token = "密钥无效";
            keyEntry.updatingIn = (keyEntry.period || 30);
            return; // Skip this key if secret is invalid
          }
          const totp = new OTPAuth.TOTP({
            issuer: keyEntry.name || '', // Optional: use name as issuer
            label: 'OTPAuth', // Optional: a label
            algorithm: keyEntry.algorithm || 'SHA1',
            digits: parseInt(keyEntry.digits, 10) || 6,
            period: parseInt(keyEntry.period, 10) || 30,
            secret: OTPAuth.Secret.fromBase32(stripSpaces(keyEntry.secret)),
          });
          keyEntry.token = truncateTo(totp.generate(), keyEntry.digits || 6);
          keyEntry.updatingIn = (keyEntry.period || 30) - (getCurrentSeconds() % (keyEntry.period || 30));
        } catch (error) {
          console.error("Error generating token for key:", keyEntry.name || keyEntry.secret, error);
          keyEntry.token = "错误"; // Display error for this specific token
          keyEntry.updatingIn = (keyEntry.period || 30); // Reset countdown
        }
      });
    },

    // Add a new key
    addKey: function () {
      const secretTrimmed = this.newKey.secret.trim();
      if (!secretTrimmed) {
        this.showToast("密钥不能为空！", true);
        return;
      }
      try {
        // Validate secret by attempting to create a secret object
        OTPAuth.Secret.fromBase32(stripSpaces(secretTrimmed));
      } catch (e) {
        this.showToast("无效的Base32密钥格式！请检查密钥。", true);
        console.error("Invalid secret format:", e);
        return;
      }

      const keyToAdd = {
        id: generateUUID(),
        name: this.newKey.name.trim(),
        secret: stripSpaces(secretTrimmed.toUpperCase()), // Store secret without spaces and uppercase
        digits: parseInt(this.newKey.digits, 10) || 6,
        period: parseInt(this.newKey.period, 10) || 30,
        algorithm: this.newKey.algorithm || 'SHA1',
        token: '',
        updatingIn: 0,
      };
      this.keys.push(keyToAdd);
      this.saveKeysToStorage();
      this.resetNewKeyForm();
      this.updateAllTokens(); // Update immediately after adding
      this.showToast("密钥添加成功!");
    },

    // Remove a key
    removeKey: function (index) {
      // It's better to ask for confirmation before deleting
      // Using a custom modal for confirm is better than window.confirm
      // For simplicity, using window.confirm here.
      // In a real app, replace with a custom modal.
      if (window.confirm(`确定要删除密钥 "${this.keys[index].name || '该密钥'}" 吗? 这将从本地存储中移除它。`)) {
        this.keys.splice(index, 1);
        this.saveKeysToStorage();
        this.showToast("密钥已删除。");
      }
    },

    // Reset the new key form
    resetNewKeyForm: function () {
      this.newKey.name = '';
      this.newKey.secret = '';
      this.newKey.digits = 6;
      this.newKey.period = 30;
      this.newKey.algorithm = 'SHA1';
    },

    // Save keys to localStorage
    saveKeysToStorage: function () {
      try {
        localStorage.setItem('totpKeys_v2', JSON.stringify(this.keys));
      } catch (e) {
        console.error("Error saving keys to localStorage:", e);
        this.showToast("无法保存密钥到本地存储。", true);
      }
    },

    // Load keys from localStorage
    loadKeysFromStorage: function () {
      try {
        const storedKeys = localStorage.getItem('totpKeys_v2');
        if (storedKeys) {
          const parsedKeys = JSON.parse(storedKeys);
          // Ensure all keys have default values if some are missing from older storage
          this.keys = parsedKeys.map(key => ({
            id: key.id || generateUUID(), // Add ID if missing
            name: key.name || '',
            secret: key.secret || '',
            digits: parseInt(key.digits, 10) || 6,
            period: parseInt(key.period, 10) || 30,
            algorithm: key.algorithm || 'SHA1',
            token: '', // Initialize token and updatingIn
            updatingIn: 0,
          }));
        } else {
           // Attempt to load from old single key format for migration
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
            // Clean up old storage items
            localStorage.removeItem('totp_secret_key');
            localStorage.removeItem('totp_digits');
            localStorage.removeItem('totp_period');
            localStorage.removeItem('totp_algorithm');
            this.saveKeysToStorage(); // Save in new format
            this.showToast("旧版密钥已成功迁移。");
          }
        }
      } catch (e) {
        console.error("Error loading keys from localStorage:", e);
        this.keys = []; // Reset to empty if localStorage is corrupt
        this.showToast("无法从本地存储加载密钥。请检查浏览器控制台获取更多信息。", true);
      }
    },

    // Copy token to clipboard
    copyToken: function (token, keyId) {
      if (!token || token === "错误" || token === "密钥无效") {
        this.showToast("无法复制无效的验证码！", true);
        return;
      }
      navigator.clipboard.writeText(token).then(() => {
        this.showToast(`验证码 "${token}" 已复制!`);
      }).catch(err => {
        console.error('Failed to copy: ', err);
        // Fallback for older browsers or iframes without clipboard permission
        // This is a basic fallback, might not work in all restricted environments
        try {
            const textArea = document.createElement("textarea");
            textArea.value = token;
            textArea.style.position = "fixed"; // Prevent scrolling to bottom of page in MS Edge.
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
    // Show toast message
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
