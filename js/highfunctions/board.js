/**
 * features/envelope.js - 信封投递 Envelope Feature & Appearance Panel
 * 信封功能与外观面板切换
 */

let envelopeData = { outbox: [], inbox: [] }; 
let currentEnvTab = 'outbox';
let editingEnvId = null; 
let editingEnvSection = null; 

async function loadEnvelopeData() {
    const saved = await localforage.getItem(getStorageKey('envelopeData'));
    if (saved) envelopeData = saved;
    const oldPending = await localforage.getItem(getStorageKey('pending_envelope'));
    if (oldPending && envelopeData.outbox.length === 0) {
        envelopeData.outbox.push({
            id: 'legacy_' + Date.now(),
            content: '（历史寄出的信件）',
            sentTime: oldPending.sentTime,
            replyTime: oldPending.replyTime,
            status: 'pending'
        });
        await localforage.removeItem(getStorageKey('pending_envelope'));
        saveEnvelopeData();
    }
}

function saveEnvelopeData() {
    localforage.setItem(getStorageKey('envelopeData'), envelopeData);
}

async function checkEnvelopeStatus() {
    await loadEnvelopeData();
    const now = Date.now();
    let changed = false;
    let newReplyLetter = null;
    envelopeData.outbox.forEach(letter => {
        if (letter.status === 'pending' && now >= letter.replyTime) {
            letter.status = 'replied';
            const replyContent = generateEnvelopeReplyText();
            const replyId = 'reply_' + Date.now() + '_' + Math.random().toString(36).substr(2,4);
            const inboxLetter = {
                id: replyId,
                refId: letter.id,
                originalContent: letter.content,
                content: replyContent,
                receivedTime: Date.now(),
                isNew: true
            };
            envelopeData.inbox.push(inboxLetter);
            newReplyLetter = inboxLetter;
            changed = true;
            playSound('message');
        }
    });
    if (changed) {
        saveEnvelopeData();
        if (newReplyLetter) showEnvelopeReplyPopup(newReplyLetter);
    }
}

function showEnvelopeReplyPopup(letter) {
    const existing = document.getElementById('envelope-reply-popup');
    if (existing) existing.remove();
    const popup = document.createElement('div');
    popup.id = 'envelope-reply-popup';
    popup.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--secondary-bg);border:1px solid var(--border-color);border-radius:20px;padding:18px 20px;z-index:8000;max-width:320px;width:88%;box-shadow:0 8px 32px rgba(0,0,0,0.18);display:flex;flex-direction:column;gap:12px;animation:slideUpNotif 0.4s cubic-bezier(0.22,1,0.36,1);';
    popup.innerHTML = `
        <style>@keyframes slideUpNotif{from{opacity:0;transform:translateX(-50%) translateY(24px) scale(0.9)}60%{transform:translateX(-50%) translateY(-4px) scale(1.02)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}</style>
        <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:26px;">📌</span>
            <div>
                <div style="font-size:14px;font-weight:700;color:var(--text-primary);">收到了一条回复</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;opacity:0.8;">Ta 给你回复了，快去看看吧~</div>
            </div>
        </div>
        <div style="display:flex;gap:8px;">
            <button onclick="document.getElementById('envelope-reply-popup').remove();" style="flex:1;padding:8px 0;border-radius:12px;border:1px solid var(--border-color);background:var(--primary-bg);color:var(--text-secondary);font-size:13px;cursor:pointer;">稍后查看</button>
            <button onclick="openEnvelopeAndViewReply('${letter.id}');" style="flex:2;padding:8px 0;border-radius:12px;border:none;background:var(--accent-color);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">立即查看 ✨</button>
        </div>`;
    document.body.appendChild(popup);
    setTimeout(() => { if (popup.parentNode) popup.remove(); }, 8000);
}

const APPEARANCE_PANEL_TITLES = {
    'theme': '主题配色', 'font': '字体设置', 'background': '聊天背景',
    'bubble': '气泡样式', 'avatar': '聊天头像', 'css': '自定义CSS',
    'font-bg': '背景 & 字体', 'bubble-css': '气泡 & CSS'
};
window.showAppearancePanel = function(panel) {
    const panelMap = {
        'font-bg': ['font', 'background'],
        'bubble-css': ['bubble', 'css']
    };
    document.getElementById('appearance-nav-grid').style.display = 'none';
    var unBtn = document.getElementById('update-notice-btn');
    if (unBtn) unBtn.style.display = 'none';
    var galleryBanner = document.getElementById('gallery-banner-entry');
    if (galleryBanner) galleryBanner.style.display = 'none';
    document.getElementById('appearance-panel-container').style.display = 'block';
    document.getElementById('appearance-panel-title').textContent = APPEARANCE_PANEL_TITLES[panel] || panel;
    document.querySelectorAll('.appearance-sub-panel').forEach(p => p.style.display = 'none');
    if (panelMap[panel]) {
        panelMap[panel].forEach(sub => {
            const target = document.getElementById('appearance-panel-' + sub);
            if (target) target.style.display = 'block';
        });
    } else {
        const target = document.getElementById('appearance-panel-' + panel);
        if (target) target.style.display = 'block';
    }
    if (panel === 'bubble' || panel === 'bubble-css') { setTimeout(() => { if (typeof window.updateBubblePreviewFn === 'function') window.updateBubblePreviewFn(); }, 50); }
};
window.hideAppearancePanel = function() {
    document.getElementById('appearance-nav-grid').style.display = 'grid';
    document.getElementById('appearance-panel-container').style.display = 'none';
    document.querySelectorAll('.appearance-sub-panel').forEach(p => p.style.display = 'none');
    var unBtn = document.getElementById('update-notice-btn');
    if (unBtn) unBtn.style.display = 'flex';
    var galleryBanner = document.getElementById('gallery-banner-entry');
    if (galleryBanner) galleryBanner.style.display = 'flex';
};

window.openEnvelopeAndViewReply = function(replyId) {
    const popup = document.getElementById('envelope-reply-popup');
    if (popup) popup.remove();
    const envelopeModal = document.getElementById('envelope-modal');
    showModal(envelopeModal);
    setTimeout(() => {
        switchEnvTab('inbox');
        viewEnvLetter('inbox', replyId);
    }, 200);
};

/*function generateEnvelopeReplyText() {
    const sourcePool = [...customReplies];
    const sentenceCount = Math.floor(Math.random() * (12 - 8 + 1)) + 8;
    let replyContent = "";
    for (let i = 0; i < sentenceCount; i++) {
        const randomSentence = sourcePool[Math.floor(Math.random() * sourcePool.length)];
        const punctuation = Math.random() < 0.2 ? "！" : (Math.random() < 0.2 ? "..." : "。");
        replyContent += randomSentence + punctuation;
    }
    return replyContent;
}*/
function generateEnvelopeReplyText() {
    const pool = [...customReplies];
    if (pool.length === 0) return '（回复库为空，请先添加字卡回复）';

    // 随机选 5~9 句
    const count = Math.floor(Math.random() * 13) + 8;
    const picked = [];
    for (let i = 0; i < count; i++) {
        picked.push(pool[Math.floor(Math.random() * pool.length)]);
    }

    // 随机分组：有的句子单独一行，有的2~3句拼一起
    const result = [];
    let i = 0;
    while (i < picked.length) {
        const rand = Math.random();
        if (rand < 0.35 && i + 1 < picked.length) {
            // 35%概率：两句拼一行
            result.push(picked[i] + picked[i + 1]);
            i += 2;
        } else if (rand < 0.5 && i + 2 < picked.length) {
            // 15%概率：三句拼一行
            result.push(picked[i] + picked[i + 1] + picked[i + 2]);
            i += 3;
        } else {
            // 50%概率：单独一行
            result.push(picked[i]);
            i += 1;
        }
    }

    return result.join('\n');
}

window.switchEnvTab = function(tab) {
    currentEnvTab = tab;
    document.getElementById('env-tab-outbox').classList.toggle('active', tab === 'outbox');
    document.getElementById('env-tab-inbox').classList.toggle('active', tab === 'inbox');
    document.getElementById('env-outbox-section').style.display = tab === 'outbox' ? 'block' : 'none';
    document.getElementById('env-inbox-section').style.display = tab === 'inbox' ? 'block' : 'none';
    document.getElementById('env-compose-form').style.display = 'none';
    document.getElementById('env-main-close-btn').style.display = 'flex';
    renderEnvelopeLists();
};



// HTML转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function initBoardModals() {
  if (!document.getElementById('envelope-board-modal')) {
    const modal = document.createElement('div');
    modal.id = 'envelope-board-modal';
    modal.className = 'modal';
    modal.innerHTML = '<div class="modal-content" id="envelope-board-container"></div>';
    document.body.appendChild(modal);
  }
  if (!document.getElementById('board-detail-modal')) {
    const modal = document.createElement('div');
    modal.id = 'board-detail-modal';
    modal.className = 'modal';
    modal.innerHTML = '<div class="modal-content" id="board-detail-content"></div>';
    document.body.appendChild(modal);
  }
  if (!document.getElementById('board-compose-modal')) {
    const modal = document.createElement('div');
    modal.id = 'board-compose-modal';
    modal.className = 'modal';
    modal.innerHTML = '<div class="modal-content" id="board-compose-container"></div>';
    document.body.appendChild(modal);
  }
}


// 渲染留言板列表
function renderEnvelopeBoard() {
  initBoardModals();

  const container = document.getElementById('envelope-board-container');
  if (!container) return;

  let listHtml = '';
  if (envelopeData.outbox.length === 0) {
    listHtml = `
      <div class="board-empty">
        <i class="fas fa-sticky-note"></i>
        <p>还没有任何留言</p>
        <p style="font-size: 12px; margin-top: 6px; opacity: 0.5;">写下你的碎碎念吧~</p>
      </div>
    `;
  } else {
    listHtml = envelopeData.outbox.slice().reverse().map(letter => {
      const reply = envelopeData.inbox.find(r => r.refId === letter.id);
      const preview = letter.content.length > 45 ? letter.content.substring(0, 45) + '...' : letter.content;
      const date = new Date(letter.sentTime).toLocaleDateString('zh-CN', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      const statusClass = reply ? 'replied' : 'pending';
      const statusText = reply ? '已回复' : '等待中';

      return `
        <div class="board-card" onclick="openBoardDetail('${letter.id}')">
          <div class="board-card-top-line"></div>
          <div class="board-card-body">
            <div class="board-card-preview">${escapeHtml(preview)}</div>
            <div class="board-card-meta">
              <span class="board-card-date">${date}</span>
              <span class="board-card-status ${statusClass}">${statusText}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
    container.innerHTML = `
    <div class="board-wrapper">
      <div class="board-header">
        <div class="board-header-title">
          <i class="fas fa-thumbtack"></i>
          <span>留言板</span>
        </div>
        <button class="board-close-btn" onclick="hideModal(document.getElementById('envelope-board-modal'))">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="board-body" id="board-list-body">
        ${listHtml}
      </div>
      <div class="board-footer">
        <button class="board-add-btn" onclick="openBoardCompose()">
          <i class="fas fa-plus"></i>
          写新留言
        </button>
      </div>
    </div>
  `;
  
}

// 打开新建留言模态框
window.openBoardCompose = function() {
  initBoardModals();

  const container = document.getElementById('board-compose-container');
  if (!container) return;

  container.innerHTML = `
    <div class="board-compose-wrapper">
      <div class="board-compose-header">
        <div class="board-compose-title">
          <i class="fas fa-pen-fancy"></i>
          <span>写新留言</span>
        </div>
        <button class="board-compose-close" onclick="hideModal(document.getElementById('board-compose-modal'))">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="board-compose-paper">
        <textarea id="board-compose-input" placeholder="写下你的碎碎念..."></textarea>
      </div>
      <div class="board-compose-footer">
        <button class="board-compose-btn cancel" onclick="hideModal(document.getElementById('board-compose-modal'))">取消</button>
        <button class="board-compose-btn send" onclick="sendBoardMessage()">发布</button>
      </div>
    </div>
  `;

  showModal(document.getElementById('board-compose-modal'));

  // 自动聚焦输入框
  setTimeout(() => {
    const input = document.getElementById('board-compose-input');
    if (input) input.focus();
  }, 300);
};

// 发送留言
window.sendBoardMessage = function() {
  const input = document.getElementById('board-compose-input');
  const text = input ? input.value.trim() : '';

  if (!text) {
    showNotification('留言内容不能为空', 'warning');
    return;
  }

  const minHours = 6, maxHours = 12;
  const randomHours = Math.random() * (maxHours - minHours) + minHours;
  const replyTime = Date.now() + randomHours * 60 * 60 * 1000;
  const newId = 'board_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);

  envelopeData.outbox.push({
    id: newId,
    content: text,
    sentTime: Date.now(),
    replyTime,
    status: 'pending'
  });

  saveEnvelopeData();

  // 关闭撰写框，刷新列表
  hideModal(document.getElementById('board-compose-modal'));
  renderEnvelopeBoard();
  showNotification(`留言已发布，预计 ${Math.floor(randomHours)} 小时后收到回复 📌`, 'success');
};


// 打开留言板详情
window.openBoardDetail = function(letterId) {
  initBoardModals();

  const letter = envelopeData.outbox.find(l => l.id === letterId);
  if (!letter) return;

  const reply = envelopeData.inbox.find(r => r.refId === letterId);
  const date = new Date(letter.sentTime).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  });
  const myName = (typeof settings !== 'undefined' && settings.myName) || '我';
  const partnerName = (typeof settings !== 'undefined' && settings.partnerName) || '对方';

  const contentArea = document.getElementById('board-detail-content');
  if (!contentArea) return;

  const replySectionHtml = reply ? `
    <div class="board-divider">
      <span class="board-divider-label">REPLY</span>
    </div>
    <div class="board-reply-section" id="board-reply-section-${reply.id}">
      <div class="board-reply-label">${partnerName} 的回复</div>
      <div class="board-reply-text" id="board-reply-text-${reply.id}">${escapeHtml(reply.content)}</div>
    </div>
  ` : `
    <div class="board-waiting-reply" id="board-waiting-${letterId}">
      <i class="fas fa-hourglass-half"></i>
      等待回复中...
    </div>
  `;

  contentArea.innerHTML = `
    <div class="board-detail-wrapper">
      <div class="board-detail-header">
        <button class="board-detail-back" onclick="hideModal(document.getElementById('board-detail-modal'))">
          <i class="fas fa-arrow-left"></i>
        </button>
        <div class="board-detail-title">留言详情</div>
        <div class="board-detail-actions">
          <button class="board-detail-action-btn" onclick="editBoardUserText('${letterId}')" title="编辑我的留言">
            <i class="fas fa-pen"></i>
          </button>
          ${reply ? `
            <button class="board-detail-action-btn" onclick="editBoardReplyText('${reply.id}')" title="编辑回复">
              <i class="fas fa-pen-to-square"></i>
            </button>
          ` : ''}
          <button class="board-detail-action-btn delete" onclick="deleteBoardItem('${letterId}')" title="删除">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="board-paper">
        <div class="board-paper-top-line"></div>
        <div class="board-paper-content">
          <div class="board-user-section" id="board-user-section-${letterId}">
            <div class="board-user-label">${myName} 的留言</div>
            <div class="board-user-text" id="board-user-text-${letterId}">${escapeHtml(letter.content)}</div>
          </div>
          ${replySectionHtml}
          <div class="board-detail-date">${date}</div>
        </div>
      </div>
    </div>
  `;

  showModal(document.getElementById('board-detail-modal'));
};

// 编辑用户留言
window.editBoardUserText = function(letterId) {
  const textEl = document.getElementById(`board-user-text-${letterId}`);
  if (!textEl || textEl.classList.contains('editing')) return;

  const originalText = textEl.textContent;
  textEl.contentEditable = true;
  textEl.classList.add('editing');
  textEl.focus();

  // 选中全部文本
  const range = document.createRange();
  range.selectNodeContents(textEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  // 添加操作按钮
  const section = document.getElementById(`board-user-section-${letterId}`);
  if (section && !section.querySelector('.board-edit-actions')) {
    const actions = document.createElement('div');
    actions.className = 'board-edit-actions';
    actions.innerHTML = `
      <button class="board-edit-btn cancel" onclick="cancelBoardUserEdit('${letterId}')">取消</button>
      <button class="board-edit-btn save" onclick="saveBoardUserEdit('${letterId}')">保存</button>
    `;
    section.appendChild(actions);
  }

  textEl.dataset.originalText = originalText;
};

// 保存用户留言编辑
window.saveBoardUserEdit = function(letterId) {
  const textEl = document.getElementById(`board-user-text-${letterId}`);
  if (!textEl) return;

  const newText = textEl.textContent.trim();
  if (!newText) {
    showNotification('内容不能为空', 'warning');
    return;
  }

  const letter = envelopeData.outbox.find(l => l.id === letterId);
  if (letter) {
    letter.content = newText;
    saveEnvelopeData();
    showNotification('留言已保存', 'success');
  }

  exitBoardEditMode(textEl, `board-user-section-${letterId}`);
};

// 取消用户留言编辑
window.cancelBoardUserEdit = function(letterId) {
  const textEl = document.getElementById(`board-user-text-${letterId}`);
  if (!textEl) return;

  textEl.textContent = textEl.dataset.originalText || '';
  exitBoardEditMode(textEl, `board-user-section-${letterId}`);
};

// 编辑对方回复
window.editBoardReplyText = function(replyId) {
  const textEl = document.getElementById(`board-reply-text-${replyId}`);
  if (!textEl || textEl.classList.contains('editing')) return;

  const originalText = textEl.textContent;
  textEl.contentEditable = true;
  textEl.classList.add('editing');
  textEl.focus();

  const range = document.createRange();
  range.selectNodeContents(textEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const section = document.getElementById(`board-reply-section-${replyId}`);
  if (section && !section.querySelector('.board-edit-actions')) {
    const actions = document.createElement('div');
    actions.className = 'board-edit-actions';
    actions.innerHTML = `
      <button class="board-edit-btn cancel" onclick="cancelBoardReplyEdit('${replyId}')">取消</button>
      <button class="board-edit-btn save" onclick="saveBoardReplyEdit('${replyId}')">保存</button>
    `;
    section.appendChild(actions);
  }

  textEl.dataset.originalText = originalText;
};

// 保存回复编辑
window.saveBoardReplyEdit = function(replyId) {
  const textEl = document.getElementById(`board-reply-text-${replyId}`);
  if (!textEl) return;

  const newText = textEl.textContent.trim();
  if (!newText) {
    showNotification('内容不能为空', 'warning');
    return;
  }

  const reply = envelopeData.inbox.find(r => r.id === replyId);
  if (reply) {
    reply.content = newText;
    saveEnvelopeData();
    showNotification('回复已保存', 'success');
  }

  exitBoardEditMode(textEl, `board-reply-section-${replyId}`);
};

// 取消回复编辑
window.cancelBoardReplyEdit = function(replyId) {
  const textEl = document.getElementById(`board-reply-text-${replyId}`);
  if (!textEl) return;

  textEl.textContent = textEl.dataset.originalText || '';
  exitBoardEditMode(textEl, `board-reply-section-${replyId}`);
};

// 退出编辑模式
function exitBoardEditMode(textEl, sectionId) {
  textEl.contentEditable = false;
  textEl.classList.remove('editing');
  delete textEl.dataset.originalText;

  const section = document.getElementById(sectionId);
  if (section) {
    const actions = section.querySelector('.board-edit-actions');
    if (actions) actions.remove();
  }
}

// 删除留言板
window.deleteBoardItem = function(letterId) {
  if (!confirm('确定要删除这条留言吗？')) return;

  envelopeData.outbox = envelopeData.outbox.filter(l => l.id !== letterId);
  envelopeData.inbox = envelopeData.inbox.filter(r => r.refId !== letterId);

  saveEnvelopeData();
  hideModal(document.getElementById('board-detail-modal'));
  renderEnvelopeBoard();
  showNotification('已删除', 'success');
};

// 页面加载后自动检查留言板回复（无需打开留言板功能）
/*window.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        checkEnvelopeStatus();
    }, 2000); // 延迟 2 秒，等页面基础组件加载完
});*/
// 页面加载后自动检查，并启动定时器持续检查
window.addEventListener('DOMContentLoaded', function() {
    // 初始检查一次
    setTimeout(function() {
        checkEnvelopeStatus();
    }, 2000);
    
    // 每60秒检查一次，页面挂着就能检测到
    setInterval(function() {
        checkEnvelopeStatus();
    }, 180000);
});
