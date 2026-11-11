export function createDouyinUI({ React, h, SettingRow, TaskControl, LegacyNodeSettings }) {
    function DouyinConfigForm({ state, uid = '', act, busy, part = 'all' }) {
      const base = { times: ['20:00'], repeat: 'daily', platformAI: true, saveVideo: false, saveAudio: false, transcribe: false, maxFileMB: 256, python: 'python3', ffmpeg: 'ffmpeg', modelPath: '', threads: 2, ...(state.douyin?.config || {}) };
      const [value, setValue] = React.useState(() => ({ ...base, ...(state.douyin?.overrides?.[uid] || {}) }));
      const [inherit, setInherit] = React.useState(!!uid && !state.douyin?.overrides?.[uid]);
      const [message, setMessage] = React.useState('');
      const change = (key, val) => { if (uid && inherit) { setInherit(false); setMessage('已切换为这位博主的独立配置，保存后生效'); } else setMessage(''); setValue(old => ({ ...old, [key]: val })); };
      const disabled = busy;
      return h('form', { className: 'st-douyin-config', 'aria-label': uid ? '抖音博主配置' : '抖音平台默认配置', onSubmit: async event => {
        event.preventDefault();
        if (await act('/douyin/config', { platform: 'douyin', uid: uid || undefined, inherit, section: part, config: value })) setMessage('抖音配置已保存');
      } },
        uid ? h(SettingRow, { label: '跟随平台', description: '修改下方选项会自动切换为独立配置，其他博主不受影响' }, h('input', { type: 'checkbox', role: 'switch', 'aria-label': '跟随抖音平台配置', checked: inherit, disabled: busy, onChange: event => { setInherit(event.target.checked); if (event.target.checked) setValue(base); } })) : h('p', { className: 'st-caption' }, '只更新跟随平台的博主；独立配置保持不变。'),
        part !== 'media' ? h('section', { 'aria-label': '抖音定时检查' }, h('h3', null, '定时检查'),
          h(SettingRow, { label: '执行日期' }, h('select', { 'aria-label': '抖音检查日期', value: value.repeat, disabled, onChange: event => change('repeat', event.target.value) }, h('option', { value: 'daily' }, '每天'), h('option', { value: 'weekdays' }, '工作日（周一至周五）'))),
          value.times.map((time, index) => h(SettingRow, { key: index, label: '检查时间 ' + (index + 1), description: '北京时间' }, h('div', { className: 'st-actions' }, h('input', { type: 'time', 'aria-label': '抖音检查时间 ' + (index + 1), value: time, required: true, disabled, onChange: event => change('times', value.times.map((item, at) => at === index ? event.target.value : item)) }),
            value.times.length > 1 ? h('button', { type: 'button', disabled, onClick: () => change('times', value.times.filter((item, at) => at !== index)) }, '删除') : null))),
          h('button', { type: 'button', disabled: disabled || value.times.length >= 8, onClick: () => change('times', [...value.times, '']) }, '+ 添加检查时间'),
          h('p', { className: 'st-caption' }, '只在指定时间检查；重启后会补查离线更新。下载与转写单独排队，不阻塞检查。')) : null,
        part !== 'frequency' ? h('section', { 'aria-label': '抖音内容保存' }, h('h3', null, '内容保存'),
          [['platformAI', '平台 AI 解析', '保存平台返回的摘要与章节，不是作者逐字原话'], ['saveVideo', '保存视频', '把新发现的视频下载到本地'], ['saveAudio', '保存音频', '从视频音轨提取，不把背景音乐当人声'], ['transcribe', '本地转写', '用本地 SenseVoice 生成识别稿；一次处理一个作品']].map(([key, label, description]) => h(SettingRow, { key, label, description }, h('input', { type: 'checkbox', role: 'switch', 'aria-label': label, checked: value[key], disabled, onChange: event => change(key, event.target.checked) }))),
          h(SettingRow, { label: '单文件上限', description: 'MB，超过上限会停止该文件下载' }, h('input', { type: 'number', 'aria-label': '抖音单文件上限', min: 16, max: 2048, value: value.maxFileMB, disabled, onChange: event => change('maxFileMB', Number(event.target.value)) })),
          value.saveAudio || value.transcribe ? h(SettingRow, { label: 'ffmpeg', description: '程序名或完整路径；音频和转写需要' }, h('input', { 'aria-label': 'ffmpeg 程序', value: value.ffmpeg, disabled, onChange: event => change('ffmpeg', event.target.value) })) : null,
          value.transcribe ? h(React.Fragment, null,
            h(SettingRow, { label: 'Python', description: '需安装 FunASR、PyTorch 依赖' }, h('input', { 'aria-label': '转写 Python', value: value.python, disabled, onChange: event => change('python', event.target.value) })),
            h(SettingRow, { label: '模型目录', description: '已下载的 SenseVoice 本地目录；不会自动下载模型' }, h('input', { 'aria-label': 'SenseVoice 模型目录', value: value.modelPath, disabled, onChange: event => change('modelPath', event.target.value) })),
            h(SettingRow, { label: 'CPU 线程', description: '1–4；空闲时不常驻模型' }, h('input', { type: 'number', 'aria-label': '转写 CPU 线程', min: 1, max: 4, value: value.threads, disabled, onChange: event => change('threads', Number(event.target.value)) }))) : null,
          h('p', { className: 'st-caption' }, '关闭选项会停止后续处理，已有文件保留；音频和转写支持一小时以内的作品。图集保留配图，不生成音轨。')) : null,
        message ? h('p', { role: 'status', className: 'st-caption' }, message) : null,
        h('button', { className: 'st-primary', disabled: busy, type: 'submit' }, '保存抖音配置'));
    }
    function DouyinNodeSettings(props) {
      const { context, state, act, busy, close, embedded } = props;
      const dialog = React.useRef(null), [tab, setTab] = React.useState(context.tab || 'frequency');
      const target = state.targets.find(item => item.uid === context.uid);
      React.useEffect(() => { if (!embedded) dialog.current?.showModal(); }, []);
      return h(embedded ? 'section' : 'dialog', { ref: embedded ? undefined : dialog, className: embedded ? 'st-inline-settings' : 'st-node-dialog', 'aria-label': '抖音详细设置', onCancel: close },
        !embedded ? h('div', { className: 'st-dialog-head' }, h('h2', null, (target?.name || '抖音平台') + '的详细设置'), h('button', { onClick: close, 'aria-label': '关闭监控设置' }, '×')) : null,
        h('div', { className: 'st-platform-tabs', role: 'tablist', 'aria-label': '抖音配置分组' }, [['frequency', '定时检查'], ['media', '内容保存'], ['history', '历史缓存']].map(([id, title]) => h('button', { key: id, type: 'button', role: 'tab', 'aria-selected': tab === id, onClick: () => setTab(id) }, title))),
        props.error ? h('p', { role: 'alert', className: 'st-inline-error' }, props.error) : null,
        h('div', { hidden: tab === 'history' }, target && tab === 'frequency' ? h(TaskControl, { state, target, kind: 'updates', act, busy, openSettings: props.openSettings }) : null, h(DouyinConfigForm, { state, uid: target?.uid, act, busy, part: tab === 'media' ? 'media' : 'frequency' })), tab === 'history' ? h(LegacyNodeSettings, { ...props, embedded: true, context: { ...context, tab: 'history' } }) : null);
    }
  return { DouyinConfigForm, DouyinNodeSettings };
}
