/**
 * Venus Agent Dashboard — Core Logic
 * ═══════════════════════════════════
 * 粒子背景 + 流水线模拟 + Mock 演示 + 后端对接
 */

// ─── 全局配置 ───
const API_BASE = 'http://127.0.0.1:8000';
let backendOnline = false;
let pipelineRunning = false;
let timerInterval = null;
let timerStart = 0;

// ─── DOM 缓存 ───
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ═══════════════════════════════════════
//  粒子背景
// ═══════════════════════════════════════
function initParticles() {
  const canvas = $('#particles-canvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  const PARTICLE_COUNT = 60;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.4 + 0.1,
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(167,139,250,${p.alpha})`;
      ctx.fill();
    }
    // Connection lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(6,182,212,${0.08 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// ═══════════════════════════════════════
//  后端状态检测
// ═══════════════════════════════════════
async function checkBackend() {
  const badge = $('#backend-status');
  try {
    const resp = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    if (resp.ok) {
      backendOnline = true;
      badge.className = 'status-badge online';
      badge.querySelector('.status-text').textContent = 'Engine Online';
      return;
    }
  } catch (e) { /* ignore */ }
  backendOnline = false;
  badge.className = 'status-badge offline';
  badge.querySelector('.status-text').textContent = 'Mock 模式';
}

// ═══════════════════════════════════════
//  文件上传
// ═══════════════════════════════════════
function initUpload() {
  const zone = $('#upload-zone');
  const input = $('#file-input');
  const info = $('#file-info');

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); zone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', () => { if (input.files.length) handleFile(input.files[0]); });

  $('#file-remove').addEventListener('click', () => {
    window._uploadedFile = null;
    info.classList.add('hidden');
    zone.classList.remove('hidden');
    updateRunBtn();
  });
}

function handleFile(file) {
  const exts = ['.xlsx', '.xls', '.csv'];
  if (!exts.some(e => file.name.toLowerCase().endsWith(e))) {
    addAuditLog('warn', `不支持的文件格式: ${file.name}`);
    return;
  }
  window._uploadedFile = file;
  $('#file-name').textContent = file.name;
  $('#file-size').textContent = formatSize(file.size);
  $('#file-info').classList.remove('hidden');
  $('#upload-zone').classList.add('hidden');
  addAuditLog('info', `文件已加载: ${file.name} (${formatSize(file.size)})`);
  updateRunBtn();
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// ═══════════════════════════════════════
//  执行按钮状态
// ═══════════════════════════════════════
function updateRunBtn() {
  const btn = $('#run-btn');
  const hasFile = !!window._uploadedFile;
  const hasInstruction = $('#instruction-input').value.trim().length > 0;
  btn.disabled = pipelineRunning || !(hasFile || hasInstruction);
}

// ═══════════════════════════════════════
//  审计日志
// ═══════════════════════════════════════
function addAuditLog(type, message, hash = null) {
  const log = $('#audit-log');
  const empty = log.querySelector('.audit-empty');
  if (empty) empty.remove();

  const entry = document.createElement('div');
  entry.className = `audit-entry ${type}`;
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  entry.innerHTML = `
    <span class="audit-time">${time}</span>
    <div>
      <div class="audit-msg">${message}</div>
      ${hash ? `<div class="audit-hash">SHA-256: ${hash}</div>` : ''}
    </div>
  `;
  log.prepend(entry);
}

// ═══════════════════════════════════════
//  流水线阶段控制
// ═══════════════════════════════════════
const STAGE_IDS = ['stage-0', 'stage-pii', 'stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-restore'];

function resetPipeline() {
  for (const id of STAGE_IDS) {
    const node = $(`#${id}`);
    node.classList.remove('active', 'done', 'error');
    const badge = node.querySelector('.stage-badge');
    badge.className = 'stage-badge idle';
    badge.textContent = '待命';
    const detail = node.querySelector('.stage-detail');
    if (detail) { detail.classList.add('hidden'); detail.innerHTML = ''; }
  }
  $('#center-message').classList.remove('hidden');
  $('#radar-card').classList.add('hidden');
  $('#result-card').classList.add('hidden');
  $('#metric-rows').textContent = '—';
  $('#metric-issues').textContent = '—';
  $('#metric-ops').textContent = '—';
  $('#metric-time').textContent = '—';
}

function setStage(stageId, status, detail = '') {
  const node = $(`#${stageId}`);
  node.classList.remove('active', 'done', 'error');
  const badge = node.querySelector('.stage-badge');

  if (status === 'running') {
    node.classList.add('active');
    badge.className = 'stage-badge running';
    badge.textContent = '运行中';
  } else if (status === 'done') {
    node.classList.add('done');
    badge.className = 'stage-badge done';
    badge.textContent = '完成';
  } else if (status === 'error') {
    node.classList.add('error');
    badge.className = 'stage-badge error';
    badge.textContent = '失败';
  } else if (status === 'skipped') {
    badge.className = 'stage-badge skipped';
    badge.textContent = '跳过';
  }

  if (detail) {
    const detailEl = node.querySelector('.stage-detail');
    if (detailEl) {
      detailEl.classList.remove('hidden');
      detailEl.innerHTML = detail;
    }
  }
}

// ═══════════════════════════════════════
//  Timer
// ═══════════════════════════════════════
function startTimer() {
  timerStart = performance.now();
  const timerDiv = $('#pipeline-timer');
  timerDiv.classList.remove('hidden');
  timerInterval = setInterval(() => {
    const elapsed = ((performance.now() - timerStart) / 1000).toFixed(2);
    $('#timer-value').textContent = elapsed + 's';
  }, 50);
}

function stopTimer() {
  clearInterval(timerInterval);
  return ((performance.now() - timerStart) / 1000).toFixed(2);
}

// ═══════════════════════════════════════
//  Mock 演示数据
// ═══════════════════════════════════════
const MOCK_DEMOS = {
  clean: {
    filename: 'employee_salary.xlsx',
    instruction: '清洗员工薪资表：填充空值、去除重复行、修正异常值',
    rows: 1247,
    schema: [
      { name: '员工ID', dtype: 'integer', ratio: 1.0 },
      { name: '姓名', dtype: 'text', ratio: 0.98 },
      { name: '部门', dtype: 'text', ratio: 0.95 },
      { name: '基本工资', dtype: 'float', ratio: 0.87 },
      { name: '入职日期', dtype: 'date', ratio: 0.92 },
      { name: '手机号', dtype: 'text', ratio: 0.78 },
    ],
    radar: [
      { severity: '🔴', col: '基本工资', desc: '发现 162 个空值 (13%)，建议用部门中位数填充' },
      { severity: '🟡', col: '姓名', desc: '发现 23 个隐藏字符（\\u200b 零宽空格）' },
      { severity: '🟡', col: '手机号', desc: '发现 274 个空值 (22%)' },
      { severity: '🔵', col: '员工ID', desc: '发现 15 行完全重复' },
      { severity: '🔵', col: '入职日期', desc: '混合格式：yyyy-MM-dd / yyyy/MM/dd / 时间戳' },
    ],
    zasa: { intent: 'DATA_CLEAN', compiled: '批量清洗：fill_missing(基本工资, method=median_by_group, group=部门) → deduplicate(key=员工ID) → trim_hidden_chars(姓名)' },
    ops: [
      { type: 'FILL_MISSING', target: '基本工资', affected: 162, code: 'df["基本工资"].fill_null(strategy="median", group_by="部门")' },
      { type: 'DEDUPLICATE', target: '员工ID', affected: 15, code: 'df.unique(subset=["员工ID"], keep="first")' },
      { type: 'WRITE_COLUMN', target: '姓名', affected: 23, code: 'df["姓名"].str.replace_all("\\\\u200b", "")' },
    ],
    resultPreview: [
      ['1001', '张明', '技术部', '15,600', '2023-01-15', '138****5678'],
      ['1002', '李芳', '市场部', '12,800', '2022-08-03', '139****1234'],
      ['1003', '王强', '技术部', '16,200', '2023-03-22', '137****9876'],
      ['1004', '赵丽', '人事部', '11,500', '2021-11-08', '—'],
      ['1005', '刘洋', '技术部', '15,600', '2024-01-10', '136****5432'],
    ]
  },
  pii: {
    filename: 'student_roster.xlsx',
    instruction: '对学生花名册进行 PII 脱敏处理，保护身份证号和手机号',
    rows: 523,
    schema: [
      { name: '学号', dtype: 'integer', ratio: 1.0 },
      { name: '姓名', dtype: 'text', ratio: 1.0 },
      { name: '身份证号', dtype: 'text', ratio: 0.96 },
      { name: '手机号', dtype: 'text', ratio: 0.88 },
      { name: '成绩', dtype: 'float', ratio: 0.94 },
    ],
    radar: [
      { severity: '🔴', col: '身份证号', desc: 'PII 风险：502 个身份证号明文暴露' },
      { severity: '🔴', col: '手机号', desc: 'PII 风险：460 个手机号明文暴露' },
      { severity: '🟡', col: '姓名', desc: 'PII 风险：姓名为可识别个人信息' },
      { severity: '🔵', col: '成绩', desc: '31 个空值 (6%)' },
    ],
    zasa: { intent: 'DATA_CLEAN', compiled: 'pii_sanitize(身份证号, 手机号, 姓名) → fill_missing(成绩, method=median)' },
    ops: [
      { type: 'WRITE_COLUMN', target: '身份证号', affected: 502, code: 'hmac_sha256(身份证号) → tok_idn_***' },
      { type: 'WRITE_COLUMN', target: '手机号', affected: 460, code: 'hmac_sha256(手机号) → tok_phn_***' },
      { type: 'FILL_MISSING', target: '成绩', affected: 31, code: 'df["成绩"].fill_null(df["成绩"].median())' },
    ],
    resultPreview: [
      ['2024001', '张**', 'tok_idn_7a3f...', 'tok_phn_b2c1...', '89.5'],
      ['2024002', '李**', 'tok_idn_e8d2...', 'tok_phn_f4a6...', '92.0'],
      ['2024003', '王**', 'tok_idn_1b5c...', 'tok_phn_d9e3...', '78.5'],
      ['2024004', '赵**', 'tok_idn_c4f8...', '—', '85.0'],
      ['2024005', '刘**', 'tok_idn_9a2d...', 'tok_phn_a1b7...', '91.5'],
    ]
  },
  rule: {
    filename: 'sales_data.csv',
    instruction: '删除重复的订单行',
    rows: 8542,
    schema: [
      { name: '订单ID', dtype: 'integer', ratio: 1.0 },
      { name: '客户名', dtype: 'text', ratio: 1.0 },
      { name: '商品', dtype: 'text', ratio: 1.0 },
      { name: '金额', dtype: 'float', ratio: 0.99 },
      { name: '日期', dtype: 'date', ratio: 1.0 },
    ],
    radar: [
      { severity: '🔵', col: '订单ID', desc: '发现 342 行完全重复 (4%)' },
    ],
    zasa: { intent: 'DATA_CLEAN', compiled: 'deduplicate(key=订单ID, keep=first) — ⚡ 规则引擎命中，零 LLM' },
    ops: [
      { type: 'DEDUPLICATE', target: '订单ID', affected: 342, code: 'df.unique(subset=["订单ID"], keep="first")' },
    ],
    resultPreview: [
      ['10001', '云峰科技', 'GPU 服务器', '128,000', '2026-03-15'],
      ['10002', '星海教育', '在线课程平台', '45,600', '2026-03-16'],
      ['10003', '天元物流', '智能分拣系统', '89,200', '2026-03-18'],
      ['10004', '瀚海生物', '基因检测套件', '23,800', '2026-03-20'],
      ['10005', '云峰科技', '数据中台', '215,000', '2026-03-22'],
    ],
    isRuleEngine: true,
  }
};

// ═══════════════════════════════════════
//  Mock 流水线执行
// ═══════════════════════════════════════
async function runMockPipeline(demoKey) {
  const demo = MOCK_DEMOS[demoKey];
  if (!demo) return;

  pipelineRunning = true;
  const btn = $('#run-btn');
  btn.classList.add('running');
  btn.querySelector('span:last-child').textContent = '流水线运行中...';
  btn.disabled = true;

  resetPipeline();
  $('#center-message').classList.add('hidden');
  startTimer();

  const fakeHash = () => {
    const chars = '0123456789abcdef';
    return Array.from({length: 64}, () => chars[Math.floor(Math.random() * 16)]).join('');
  };

  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  try {
    // Stage 0: Schema
    setStage('stage-0', 'running');
    addAuditLog('info', `📂 数据源: ${demo.filename} — ${demo.rows.toLocaleString()} 行`);
    await wait(600);
    const schemaHtml = demo.schema.map(c =>
      `<div>${c.name}: <span style="color:#a78bfa">${c.dtype}</span> (${(c.ratio*100).toFixed(0)}%)</div>`
    ).join('');
    setStage('stage-0', 'done', schemaHtml);
    addAuditLog('success', `Schema 锚定完成: ${demo.schema.length} 列已推断`, fakeHash());
    $('#metric-rows').textContent = demo.rows.toLocaleString();

    // PII Guard
    setStage('stage-pii', 'running');
    await wait(400);
    const hasPII = demo.radar.some(r => r.desc.includes('PII'));
    if (hasPII) {
      setStage('stage-pii', 'done');
      addAuditLog('success', '🛡️ PII 脱敏: HMAC-SHA256 令牌化完成', fakeHash());
    } else {
      setStage('stage-pii', 'done');
      addAuditLog('info', '🛡️ PII 扫描: 未发现敏感字段');
    }

    // Stage 1: Radar
    setStage('stage-1', 'running');
    await wait(800);
    const radarHtml = demo.radar.map(r =>
      `<div>${r.severity} [${r.col}] ${r.desc}</div>`
    ).join('');
    setStage('stage-1', 'done', radarHtml);
    addAuditLog('success', `📡 雷达扫描完成: 发现 ${demo.radar.length} 个问题`, fakeHash());
    $('#metric-issues').textContent = demo.radar.length;

    // Show radar card
    const radarCard = $('#radar-card');
    radarCard.classList.remove('hidden');
    const radarFindings = $('#radar-findings');
    radarFindings.innerHTML = demo.radar.map(r => `
      <div class="radar-item">
        <span class="radar-severity">${r.severity}</span>
        <div><span class="radar-col">${r.col}</span> — <span class="radar-desc">${r.desc}</span></div>
      </div>
    `).join('');

    // Stage 2: Dispatcher
    setStage('stage-2', 'running');
    if (demo.isRuleEngine) {
      await wait(90);
      setStage('stage-2', 'done', `⚡ 规则引擎命中 — 零 LLM<br>Intent: ${demo.zasa.intent}`);
      addAuditLog('success', '⚡ 规则引擎命中! 跳过 LLM 调用 (0.09s)');
    } else {
      await wait(1200);
      setStage('stage-2', 'done', `Intent: ${demo.zasa.intent}<br>${demo.zasa.compiled}`);
      addAuditLog('success', `🧠 意图编译完成: ${demo.zasa.intent}`, fakeHash());
    }

    // Stage 3: Judge
    setStage('stage-3', 'running');
    if (demo.isRuleEngine) {
      await wait(50);
      setStage('stage-3', 'done', '规则引擎路径 — 自动批准');
      addAuditLog('success', '⚖️ 规则引擎自动批准');
    } else {
      await wait(1000);
      setStage('stage-3', 'done', `审批通过 ✓<br>预检问答: 3/3 正确<br>样本 Diff 验证通过`);
      addAuditLog('success', '⚖️ 法官审批通过: 预检 3/3, 样本验证 ✓', fakeHash());
    }

    // Stage 4: Workers
    setStage('stage-4', 'running');
    let prevHash = fakeHash();
    let totalAffected = 0;
    for (let i = 0; i < demo.ops.length; i++) {
      const op = demo.ops[i];
      await wait(600);
      totalAffected += op.affected;
      const hash = fakeHash();
      addAuditLog('success',
        `⚒️ [${op.type}] ${op.target} → ${op.affected} 行受影响<br><span style="font-family:var(--font-mono);font-size:0.68rem;color:var(--text-muted)">${op.code}</span>`,
        hash
      );
      prevHash = hash;
    }
    const opsHtml = demo.ops.map(op =>
      `<div>✓ ${op.type} → ${op.target} (${op.affected} 行)</div>`
    ).join('');
    setStage('stage-4', 'done', opsHtml);
    $('#metric-ops').textContent = demo.ops.length;

    // PII Restore
    setStage('stage-restore', 'running');
    await wait(300);
    if (demoKey === 'pii') {
      setStage('stage-restore', 'done');
      addAuditLog('success', '🔓 PII 还原完成: token → 原始值');
    } else {
      setStage('stage-restore', 'done');
      addAuditLog('info', '🔓 PII 还原: 无需还原');
    }

    // Done
    const totalTime = stopTimer();
    $('#metric-time').textContent = totalTime + 's';

    // Show result
    const resultCard = $('#result-card');
    resultCard.classList.remove('hidden');
    const headers = demo.schema.map(c => c.name);
    const previewHtml = `
      <table>
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${demo.resultPreview.map(row =>
          `<tr>${row.map(cell => {
            const cls = cell === '—' ? 'cell-null' : cell.startsWith('tok_') ? 'cell-changed' : '';
            return `<td class="${cls}">${cell}</td>`;
          }).join('')}</tr>`
        ).join('')}</tbody>
      </table>
      <div style="text-align:center;margin-top:8px;font-size:0.7rem;color:var(--text-muted)">显示前 5 行 / 共 ${(demo.rows - totalAffected).toLocaleString()} 行</div>
    `;
    $('#data-preview').innerHTML = previewHtml;

    addAuditLog('success', `✅ 流水线完成: ${totalAffected} 行受影响, 耗时 ${totalTime}s`);

  } catch (e) {
    addAuditLog('error', `流水线异常: ${e.message}`);
  } finally {
    pipelineRunning = false;
    btn.classList.remove('running');
    btn.querySelector('span:last-child').textContent = '启动 Agent 流水线';
    updateRunBtn();
  }
}

// ═══════════════════════════════════════
//  真实后端调用
// ═══════════════════════════════════════
async function runRealPipeline() {
  const file = window._uploadedFile;
  const instruction = $('#instruction-input').value.trim();
  if (!file || !instruction) return;

  pipelineRunning = true;
  const btn = $('#run-btn');
  btn.classList.add('running');
  btn.querySelector('span:last-child').textContent = '流水线运行中...';
  btn.disabled = true;
  resetPipeline();
  $('#center-message').classList.add('hidden');
  startTimer();

  // 逐阶段标记 running
  for (const id of STAGE_IDS) setStage(id, 'running');
  addAuditLog('info', `🚀 真实引擎调用: ${file.name}`);

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('instruction', instruction);

    const resp = await fetch(`${API_BASE}/api/run`, { method: 'POST', body: formData });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || '后端错误');
    }
    const data = await resp.json();
    const totalTime = stopTimer();

    // 渲染 Schema
    if (data.schema) {
      const html = data.schema.columns.map(c =>
        `<div>${c.name}: <span style="color:#a78bfa">${c.dtype}</span> (${(c.non_null_ratio*100).toFixed(0)}%)</div>`
      ).join('');
      setStage('stage-0', 'done', html);
      $('#metric-rows').textContent = data.schema.row_count.toLocaleString();
    } else { setStage('stage-0', 'done'); }

    setStage('stage-pii', 'done');
    addAuditLog('success', '🛡️ PII Guard 完成');

    // 渲染 Radar
    if (data.radar) {
      const sevMap = { critical: '🔴', warning: '🟡', info: '🔵' };
      const html = data.radar.findings.map(f =>
        `<div>${sevMap[f.severity]||'🔵'} [${f.column}] ${f.description}</div>`
      ).join('');
      setStage('stage-1', 'done', html);
      $('#metric-issues').textContent = data.radar.total_issues;
      $('#radar-card').classList.remove('hidden');
      $('#radar-findings').innerHTML = data.radar.findings.map(f => `
        <div class="radar-item">
          <span class="radar-severity">${sevMap[f.severity]||'🔵'}</span>
          <div><span class="radar-col">${f.column}</span> — <span class="radar-desc">${f.description}</span></div>
        </div>
      `).join('');
    } else { setStage('stage-1', 'done'); }

    // Dispatcher
    if (data.zasa) {
      setStage('stage-2', 'done', `Intent: ${data.zasa.intent}<br>${data.zasa.compiled_instruction}`);
    } else { setStage('stage-2', 'done'); }

    // Judge
    if (data.plan) {
      if (data.plan.verdict === 'approved') {
        setStage('stage-3', 'done', '审批通过 ✓');
      } else {
        setStage('stage-3', 'error', `驳回: ${data.plan.rejection_reason}`);
      }
    } else { setStage('stage-3', 'done'); }

    // Workers
    if (data.sandbox) {
      const logs = data.sandbox.logs || [];
      const html = logs.map(l => `<div>${l.status === 'success' ? '✓' : '✗'} ${l.operation_type} → ${l.target_columns.join(',')} (${l.rows_affected} 行)</div>`).join('');
      setStage('stage-4', 'done', html);
      $('#metric-ops').textContent = logs.length;
      logs.forEach(l => addAuditLog(l.status === 'success' ? 'success' : 'error',
        `⚒️ [${l.operation_type}] ${l.target_columns.join(',')} → ${l.rows_affected} 行`, l.block_hash));
    } else { setStage('stage-4', 'done'); }

    setStage('stage-restore', 'done');
    $('#metric-time').textContent = (data.elapsed_seconds || totalTime) + 's';

    // Download
    if (data.download_url) {
      $('#result-card').classList.remove('hidden');
      $('#data-preview').innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:16px">处理完成，点击下方按钮下载结果</div>';
      $('#download-btn').onclick = () => window.open(`${API_BASE}${data.download_url}`, '_blank');
    }

    addAuditLog('success', `✅ 真实流水线完成, 耗时 ${data.elapsed_seconds}s`);

  } catch (e) {
    stopTimer();
    addAuditLog('error', `流水线异常: ${e.message}`);
    for (const id of STAGE_IDS) {
      const node = $(`#${id}`);
      if (node.classList.contains('active')) setStage(id, 'error');
    }
  } finally {
    pipelineRunning = false;
    btn.classList.remove('running');
    btn.querySelector('span:last-child').textContent = '启动 Agent 流水线';
    updateRunBtn();
  }
}

// ═══════════════════════════════════════
//  事件绑定
// ═══════════════════════════════════════
function init() {
  initParticles();
  initUpload();
  checkBackend();
  setInterval(checkBackend, 15000);

  // Instruction input
  $('#instruction-input').addEventListener('input', updateRunBtn);

  // Run button — 后端在线+真实文件 → 真实调用，否则 Mock
  $('#run-btn').addEventListener('click', () => {
    if (pipelineRunning) return;
    const file = window._uploadedFile;
    const isRealFile = file instanceof File;
    if (backendOnline && isRealFile) {
      runRealPipeline();
    } else {
      runMockPipeline('clean');
    }
  });

  // Demo buttons — 始终用 Mock
  for (const btn of $$('.btn-demo')) {
    btn.addEventListener('click', () => {
      if (pipelineRunning) return;
      const demo = btn.dataset.demo;
      const data = MOCK_DEMOS[demo];
      if (!data) return;

      $('#instruction-input').value = data.instruction;
      window._uploadedFile = { name: data.filename, size: Math.floor(Math.random() * 500000 + 50000) };
      $('#file-name').textContent = data.filename;
      $('#file-size').textContent = formatSize(window._uploadedFile.size);
      $('#file-info').classList.remove('hidden');
      $('#upload-zone').classList.add('hidden');

      updateRunBtn();
      runMockPipeline(demo);
    });
  }

  // Download button
  $('#download-btn').addEventListener('click', () => {
    addAuditLog('info', '📥 下载功能需连接后端引擎');
  });
}

document.addEventListener('DOMContentLoaded', init);
