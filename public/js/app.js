const { createApp, reactive, toRefs, onMounted } = Vue;
function genId() {
  return 'id-' + Math.random().toString(36).substr(2, 9);
}
createApp({
  setup() {
    const state = reactive({
      keyList: [],
      showAdd: false,
      newKey: { remark: '', secret: '', digits: 6, period: 30 },
    });

    // 加载本地存储
    function load() {
      const arr = localStorage.getItem('totpKeyList');
      if (arr) state.keyList = JSON.parse(arr);
    }
    function save() {
      localStorage.setItem('totpKeyList', JSON.stringify(state.keyList));
    }

    // 生成所有token
    function updateTokens() {
      const now = Date.now() / 1000;
      state.keyList.forEach(item => {
        try {
          const totp = new OTPAuth.TOTP({
            secret: OTPAuth.Secret.fromBase32(item.secret.replace(/\s+/g, '')),
            digits: item.digits,
            period: item.period,
            algorithm: 'SHA1',
          });
          item.token = totp.generate();
          item.remain = item.period - (Math.floor(now) % item.period);
        } catch {
          item.token = '------';
          item.remain = 0;
        }
      });
    }
    setInterval(updateTokens, 1000);

    // 新增密钥
    function addKey() {
      if (!state.newKey.secret) return alert('密钥不能为空');
      state.keyList.push({
        ...state.newKey,
        id: genId(),
        digits: Number(state.newKey.digits) || 6,
        period: Number(state.newKey.period) || 30,
        token: '',
        remain: 0,
      });
      state.showAdd = false;
      state.newKey = { remark: '', secret: '', digits: 6, period: 30 };
      save();
      updateTokens();
    }
    // 删除密钥
    function removeKey(id) {
      state.keyList = state.keyList.filter(x => x.id !== id);
      save();
    }
    // 复制验证码
    function copyToken(val) {
      navigator.clipboard.writeText(val);
      alert('已复制: ' + val);
    }
    // 导出
    function exportKeys() {
      const str = JSON.stringify(state.keyList, null, 2);
      const blob = new Blob([str], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'totp-keys.json';
      a.click();
    }
    // 导入
    function importKeys() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
          try {
            const arr = JSON.parse(e.target.result);
            if (Array.isArray(arr)) {
              state.keyList = arr.map(x => ({ ...x, id: genId() }));
              save();
              updateTokens();
            } else {
              alert('格式不正确');
            }
          } catch {
            alert('导入失败，文件格式错误');
          }
        };
        reader.readAsText(file);
      };
      input.click();
    }

    onMounted(() => {
      load();
      updateTokens();
    });

    return {
      ...toRefs(state),
      addKey,
      removeKey,
      copyToken,
      exportKeys,
      importKeys,
    };
  }
}).mount('#app');
