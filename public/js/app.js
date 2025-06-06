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
      isQrModalActive: false, // Controls the QR code modal visibility
      qrCodeKeyName: '', // Holds the name of the key for the QR modal
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

    processBatchInput: function(isFromPaste = false) {
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
            id: generateUUID(),
            name: name || `密钥 ${this.keys.length + newKeysToAdd.length + 1}`,
            secret: strippedSecret.toUpperCase(),
            digits: parseInt(this.batchDefaultSettings.digits, 10) || 6,
            period: parseInt(this.batchDefaultSettings.period, 10) || 30,
            algorithm: 'SHA1',
            token: '',
            updatingIn: 0,
            isEditingName: false,
            editingNameValue: name || `密钥 ${this.keys.length + newKeysToAdd.length + 1}`,
          };
          newKeysToAdd.push(keyToAdd);
        } catch (e) {
          failedCount++;
          console.warn(`批量添加失败 (行 ${index + 1}): "${line}". 原因: ${e.message}`);
        }
      });

      if (newKeysToAdd.length > 0) {
        this.keys.push(...newKeysToAdd);
        this.saveKeysToStorage();
        this.updateAllTokens();
        addedCount = newKeysToAdd.length;
      }

      if (addedCount > 0 || failedCount > 0 || currentInput.trim()) {
         this.batchSecretsInput = '';
      }

      let message = '';
      if (addedCount > 0) {
        message += `成功添加 ${addedCount} 个密钥。`;
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
      try {
        const storedKeys = localStorage.getItem('totpKeys_v5_3_qr'); // New storage key
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
          // Add migration logic from older versions if needed
          const prevV5_2Keys = localStorage.getItem('totpKeys_v5_2_final');
          if (prevV5_2Keys) {
              const parsedV5_2 = JSON.parse(prevV5_2Keys);
              this.keys = parsedV5_2.map(key => ({
                  ...key,
                  id: key.id || generateUUID(),
                  isEditingName: false,
                  editingNameValue: key.name || '',
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
