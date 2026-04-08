/** * board-v2.js - 双向线程留言板 (绝对隔离引擎版) */
(function() {
'use strict';

const STORAGE_KEY = 'boardDataV2';
let currentView = 'me';
let currentThreadId = null;
let currentComposeMode = null;
let currentComposeType = null;
let selectedImage = null;

// --- 完全隔离的底层数据与配置 ---
let boardData = {
  myThreads: [], partnerThreads: [], boardReplyPool: [],unreadPartnerCount: 0, // <--- 加上这句
  settings: {
    autoPostEnabled: false, nextAutoPostTime: 0
  }
};

// --- 工具函数 ---
function genId() { return 'v2_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6); }
function formatTime(ts) { return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
function getUniqueShuffled(arr, count) {
  if (!arr || arr.length === 0) return [];
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  const unique = [], seen = new Set();
  for(const s of shuffled) { if(!seen.has(s)) { unique.push(s); seen.add(s); } if(unique.length >= count) break; }
  return unique;
}

// --- 数据存取与初始化隔离 ---
async function loadData() {
  try {
    const saved = await localforage.getItem(STORAGE_KEY);
    if (saved) boardData = { ...boardData, ...saved };
    if (boardData.boardReplyPool.length === 0 && typeof customReplies !== 'undefined' && customReplies.length > 0) {
      boardData.boardReplyPool = JSON.parse(JSON.stringify(customReplies));
      await saveData();
    }
    window.boardDataV2 = boardData;
  } catch(e) { console.warn('BoardV2 load error', e); }
}
async function saveData() { try { await localforage.setItem(STORAGE_KEY, boardData);window.boardDataV2 = boardData; } catch(e) { console.warn('BoardV2 save error', e); } }

// --- 核心：绝对时间锚点引擎 ---
function checkStatus() {
  const now = Date.now();
    // === 神奇测试模式（上线前记得关） ===
  /*if (boardData.settings._testMode) {
    // 踩掉缓存里的未来时间，强制变成3秒后
    boardData.settings.nextAutoPostTime = now + 3000; 
    // 测试概率：1是100%必发，改成0.3就是测概率不命中
    boardData.settings._testProb = 1; 
  }*/

  let needRefreshList = false;
  const processReplies = (threads) => {
    threads.forEach(thread => {
      if (!thread.expectedReplyTime && thread.replies.length > 0) {
        const last = thread.replies[thread.replies.length - 1];
        if (last.sender === 'me') {
          thread.expectedReplyTime = last.timestamp + ((6 + Math.random() * 6) * 3600 * 1000);
          saveData();
          
        }
      }
      if (thread.expectedReplyTime && now >= thread.expectedReplyTime) {
        const reply = generatePartnerReply();
        if (reply) {
          thread.replies.push(...reply); delete thread.expectedReplyTime; thread.unread = true; // 标记这条留言有未读回复
          saveData();
          if (currentThreadId === thread.id) setTimeout(() => openDetail(thread.id, currentView), 1000);
          else needRefreshList = true;
        }
      }
    });
  };
    processReplies(boardData.myThreads);
    processReplies(boardData.partnerThreads);
  if (needRefreshList && document.getElementById('envelope-board-modal')?.style.display === 'flex') switchTab(currentView);
      if (boardData.settings.autoPostEnabled && (typeof settings === 'undefined' || settings.boardPartnerWriteEnabled)) {
        if (!boardData.settings.nextAutoPostTime || now >= boardData.settings.nextAutoPostTime) {
          boardData.settings.nextAutoPostTime = now + (4 * 3600 * 1000);
          saveData();
          
          console.log("[主动留言] 骰子掷出..."); // 加这句
          if (Math.random() < 0.2) {
            const reply = generatePartnerReply();
            console.log("[主动留言] 生成结果:", reply ? "成功" : "被拦截(null)"); // 加这句
            if (reply) {
              //boardData.partnerThreads.push({ id: genId(), starter: 'partner', createdAt: now, replies: reply });
              boardData.partnerThreads.push({ id: genId(), starter: 'partner', createdAt: now, replies: reply, unread: true });
              // --- 新增：提示逻辑 ---
              // 2. 页面内轻提示（你正看网页时能看到的）
              if (typeof showNotification === 'function') {
                const partnerName = (typeof settings !== 'undefined' && settings.partnerName) || '对方';
                showNotification(partnerName + '在留言板写了新内容', 'info', 2000);
              }
              // 3. 切到后台时的系统通知
              if (typeof window._sendPartnerNotification === 'function') {
                const partnerName = (typeof settings !== 'undefined' && settings.partnerName) || '对方';
                window._sendPartnerNotification('留言板新动态', partnerName + '给你留了言');
              }
              // --- 提示逻辑结束 ---

              saveData();
              if (currentView === 'partner') switchTab('partner');
            }
          }
        }
      }

}

function generatePartnerReply() {
  const pool = boardData.boardReplyPool;
  const stickers = (typeof stickerLibrary !== 'undefined' && stickerLibrary.length > 0) ? [...stickerLibrary] : [];
  const emojis = (typeof customEmojis !== 'undefined' && customEmojis.length > 0) ? [...customEmojis] : [];
  if (pool.length === 0 && stickers.length === 0) return null;

  const resultArray = [];
  const punctuations = ['。', '！', '…', '～', '，', '、'];

  // 1. 拼文本
  const count = 8 + Math.floor(Math.random() * 5);
  const uniquePool = getUniqueShuffled(pool, count);
  let text = uniquePool.map(s => s + punctuations[Math.floor(Math.random() * punctuations.length)]).join('');

  // 2. 15%概率混入emoji（直接改text本身，不要推两遍）
  if (emojis.length > 0 && Math.random() < 0.15) {
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    const randomPos = Math.floor(Math.random() * text.length);
    text = text.slice(0, randomPos) + emoji + text.slice(randomPos);
  }

  // 3. 统一推一次文本
  resultArray.push({ id: genId(), sender: 'partner', text, image: null, sticker: null, timestamp: Date.now() });

  // 4. 0.35概率发表情包
  if (stickers.length > 0 && Math.random() < 0.35) {
    const stickerCount = Math.random() < 0.5 ? 1 : 2;
    const pickedStickers = getUniqueShuffled(stickers, stickerCount);
    pickedStickers.forEach(st => {
      resultArray.push({ id: genId(), sender: 'partner', text: '', image: null, sticker: st, timestamp: Date.now() });
    });
  }

  return resultArray.length > 0 ? resultArray : null;
}



// ==========================================
// 关键修复：不创建新模态框，寄生原系统节点
// ==========================================
// ==========================================
// 关键修复：具备自举能力，没有壳就自己建
// ==========================================
function initModals() {
  // 1. 列表框
  let listModal = document.getElementById('envelope-board-modal');
  if (!listModal) {
    listModal = document.createElement('div');
    listModal.id = 'envelope-board-modal';
    listModal.className = 'modal'; // 必须加这个class，原系统CSS才认
    listModal.innerHTML = '<div class="modal-content" id="board-v2-list-container"></div>';
    document.body.appendChild(listModal);
  } else {
    if (!document.getElementById('board-v2-list-container')) {
      const old = listModal.querySelector('.modal-content');
      if (old) old.id = 'board-v2-list-container';
      else { const c = document.createElement('div'); c.id = 'board-v2-list-container'; listModal.appendChild(c); }
    }
  }

  // 2. 详情框
  let detailModal = document.getElementById('board-detail-modal');
  if (!detailModal) {
    detailModal = document.createElement('div');
    detailModal.id = 'board-detail-modal';
    detailModal.className = 'modal';
    detailModal.innerHTML = '<div class="modal-content" id="board-v2-detail-container"></div>';
    document.body.appendChild(detailModal);
  } else {
    if (!document.getElementById('board-v2-detail-container')) {
      const old = detailModal.querySelector('.modal-content');
      if (old) old.id = 'board-v2-detail-container';
      else { const c = document.createElement('div'); c.id = 'board-v2-detail-container'; detailModal.appendChild(c); }
    }
  }

  // 3. 撰写框
  let composeModal = document.getElementById('board-compose-modal');
  if (!composeModal) {
    composeModal = document.createElement('div');
    composeModal.id = 'board-compose-modal';
    composeModal.className = 'modal';
    composeModal.innerHTML = '<div class="modal-content" id="board-v2-compose-container"></div>';
    document.body.appendChild(composeModal);
  } else {
    if (!document.getElementById('board-v2-compose-container')) {
      const old = composeModal.querySelector('.modal-content');
      if (old) old.id = 'board-v2-compose-container';
      else { const c = document.createElement('div'); c.id = 'board-v2-compose-container'; composeModal.appendChild(c); }
    }
  }
}


window.renderEnvelopeBoard = async function() {
    await loadData();
    initModals();
    // 如果关了主动写留言板，且当前在对方界面，强制切回我的
    if (!(typeof settings !== 'undefined' && settings.boardPartnerWriteEnabled) && currentView === 'partner') {
        currentView = 'me';
    }
    switchTab(currentView);
  // 优雅地打开原系统的弹窗
  const modal = document.getElementById('envelope-board-modal') || document.getElementById('envelope-modal');
  if (modal && typeof showModal === 'function') showModal(modal);
};

// --- UI 渲染层 (列表) ---
function switchTab(type) {
    const canViewPartner = typeof settings !== 'undefined' && settings.boardPartnerWriteEnabled;
    if (!canViewPartner) {
        type = 'me';
    }
  currentView = type;
  const container = document.getElementById('board-v2-list-container');
  if (!container) return;
  const isMe = type === 'me';
  const threads = isMe ? boardData.myThreads : boardData.partnerThreads;
  const myName = (typeof settings !== 'undefined' && settings.myName) || '我';
  const partnerName = (typeof settings !== 'undefined' && settings.partnerName) || '对方';
  const s = boardData.settings;

    container.innerHTML = `
    <div class="board-wrapper">
        <div class="board-header" style="justify-content: space-between; align-items: center;">
        <!-- 左边：图钉 + 标题 -->
        <div style="display:flex; align-items:center; gap:6px; flex-shrink: 0;">
            <i class="fas fa-thumbtack" style="font-size: 14px; color: var(--accent-color);"></i>
            <span style="font-weight: 600; font-size: 15px;"> 留言板</span>
        </div>

        <!-- 中间：人物切换 (仅开启主动留言时显示) -->
        ${canViewPartner ? `
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="board-tab-btn ${isMe ? 'active' : ''}" onclick="window._bv2_switchTab('me')" style="padding:6px 14px; border-radius:20px; border:1px solid var(--border-color); background:${isMe ? 'var(--accent-color)' : 'transparent'}; color:${isMe ? '#fff' : 'var(--text-secondary)'}; font-size:12px; font-weight:600; cursor:pointer; position:relative;">
            ${myName}
            ${boardData.myThreads.some(t => t.unread) ? `<span style="position:absolute;top:-6px;right:-6px;font-size:14px;">✨</span>` : ''}
          </button>
          <button class="board-tab-btn ${!isMe ? 'active' : ''}" onclick="window._bv2_switchTab('partner')" style="padding:6px 14px; border-radius:20px; border:1px solid var(--border-color); background:${!isMe ? 'var(--accent-color)' : 'transparent'}; color:${!isMe ? '#fff' : 'var(--text-secondary)'}; font-size:12px; font-weight:600; cursor:pointer; position:relative;">
            ${partnerName}
            ${boardData.partnerThreads.some(t => t.unread) ? `<span style="position:absolute;top:-6px;right:-6px;font-size:14px;">✨</span>` : ''}
          </button>
        </div>
        ` : '<div></div>'}


        <!-- 右边：导出 + 关闭 -->
        <div style="display:flex; align-items:center; gap:10px; flex-shrink: 0;">
            <button onclick="window._bv2_exportTxt('${type}')" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:13px;" title="导出记录"><i class="fa-solid fa-file-export"></i></button>
            <button class="board-close-btn" onclick="hideModal(document.getElementById('envelope-board-modal'))"><i class="fas fa-times"></i></button>
        </div>
    </div>
    <div class="board-body" style="padding: 14px 16px;">
      ${threads.length === 0 ? `<div class="board-empty"><i class="fas fa-sticky-note"></i><p>${isMe ? '还没有留言' : 'Ta还没有主动留言'}</p></div>` : threads.slice().reverse().map(t => {
        const last = t.replies[t.replies.length - 1];
        let statusText = '等待回复', statusClass = 'pending';
        if (last && ((isMe && last.sender === 'partner') || (!isMe && last.sender === 'me'))) { statusText = '已回复'; statusClass = 'replied'; }
        const preview = t.replies[0] ? (t.replies[0].image ? '🖼 图片留言' : escapeHtml((t.replies[0].text||'').substring(0, 40))) : '';
        //return `<div class="board-card" onclick="window._bv2_openDetail('${t.id}','${type}')"><div class="board-card-top-line"></div>
        const unreadStar = t.unread ? `<span style="position:absolute;top:12px;right:12px;font-size:14px;z-index:2;">✨</span>` : '';
        return `<div class="board-card" onclick="window._bv2_openDetail('${t.id}','${type}')" style="position:relative;">${unreadStar}<div class="board-card-top-line"></div>
        <div class="board-card-body"><div class="board-card-preview">${preview}</div><div class="board-card-meta"><span class="board-card-date">${formatTime(t.createdAt)}</span><span class="board-card-status ${statusClass}">${statusText}</span></div></div></div>`;
      }).join('')}
    </div>
    <div class="board-footer">${isMe ? `<button class="board-add-btn" onclick="window._bv2_openCompose('new',null,'me')"><i class="fas fa-plus"></i> 写新留言</button>` : ''}</div>
  </div>`;

}


// --- UI 渲染层 (详情、撰写、导出) ---
function openDetail(threadId, type) {
  currentThreadId = threadId;
  const threads = type === 'me' ? boardData.myThreads : boardData.partnerThreads;
  const thread = threads.find(t => t.id === threadId);
  if (!thread) return;
  // 看了就标记为已读，去掉星星
  if (thread.unread) {
    thread.unread = false;
    saveData();
    // 刷新列表，把列表上的星星也立刻去掉
    if (document.getElementById('envelope-board-modal')?.style.display === 'flex') {
      switchTab(currentView);
    }
  }

  const myName = (typeof settings !== 'undefined' && settings.myName) || '我';
  const partnerName = (typeof settings !== 'undefined' && settings.partnerName) || '对方';
  const isMe = type === 'me';
  let bodyHtml = '';
    thread.replies.forEach((r, idx) => {
      const isSenderMe = r.sender === 'me';
      const isStarter = (idx === 0); // 第一条永远是主留言
      
      let cHtml = '';
      if (r.image) cHtml += `<img src="${r.image}" style="max-width:150px;border-radius:8px;display:block;margin-bottom:8px;margin-left:40px;cursor:pointer;" onclick="viewImage('${r.image}')">`;
      if (r.sticker) cHtml += `<img src="${r.sticker}" style="max-width:120px;border-radius:8px;display:block;margin-top:8px;margin-left:40px;">`;
      if (r.text) cHtml += `<div class="${isSenderMe ? 'board-user-text' : 'board-reply-text'}" id="bv2-text-${r.id}">${escapeHtml(r.text)}</div>`;
      
      // 样式和文案修复：第一条永远是有颜色的"留言"，后面的永远是"回复"
      const sectionClass = isStarter ? 'board-user-section' : 'board-reply-section';
      const labelClass = isStarter ? 'board-user-label' : 'board-reply-label';
      const labelText = isStarter ? ' 的留言' : ' 的回复';
      const senderName = isSenderMe ? myName : partnerName;

      bodyHtml += `<div class="${sectionClass}" id="bv2-section-${r.id}"><div class="${labelClass}">${senderName}${labelText}</div>${cHtml}</div>`;
    });

  const last = thread.replies[thread.replies.length - 1];
  let actionHtml = '';
  if (last) {
    if (isMe && last.sender === 'partner') actionHtml = `<button class="board-add-btn" style="margin-top:16px;" onclick="window._bv2_openCompose('continue','${threadId}','me')"><i class="fas fa-pen"></i> 继续留言</button>`;
    else if (!isMe && last.sender === 'partner') actionHtml = `<button class="board-add-btn" style="margin-top:16px;" onclick="window._bv2_openCompose('reply','${threadId}','partner')"><i class="fas fa-reply"></i> 回复</button>`;
    else actionHtml = `<div class="board-waiting-reply" style="margin-top:16px;"><i class="fas fa-hourglass-half"></i> 等待回复中...</div>`;
  }
  document.getElementById('board-v2-detail-container').innerHTML = `<div class="board-detail-wrapper"><div class="board-detail-header"><button class="board-detail-back" onclick="hideModal(document.getElementById('board-detail-modal'))"><i class="fas fa-arrow-left"></i></button><div class="board-detail-title">留言详情</div>
  <div class="board-detail-actions">${thread.replies.map(r => r.text ? `<button class="board-detail-action-btn" onclick="window._bv2_editText('${r.id}')" title="编辑"><i class="fas fa-pen"></i></button>` : '').join('')}<button class="board-detail-action-btn delete" onclick="window._bv2_deleteThread('${threadId}','${type}')"><i class="fas fa-trash"></i></button></div>
  </div><div class="board-paper"><div class="board-paper-top-line"></div><div class="board-paper-content">${bodyHtml}${actionHtml}<div class="board-detail-date">${new Date(thread.createdAt).toLocaleDateString('zh-CN', {year:'numeric',month:'long',day:'numeric',weekday:'long'})}</div></div></div></div>`;
  
  hideModal(document.getElementById('envelope-board-modal'));
  setTimeout(() => { showModal(document.getElementById('board-detail-modal')); const p = document.querySelector('.board-paper'); if(p) p.scrollTop = p.scrollHeight; }, 200);
}

function openCompose(mode, threadId, type) {
  currentComposeMode = mode; currentThreadId = threadId; currentComposeType = type; selectedImage = null;
  document.getElementById('board-v2-compose-container').innerHTML = `<div class="board-compose-wrapper"><div class="board-compose-header"><div class="board-compose-title"><i class="fas fa-pen-fancy"></i><span>${mode==='new'?'写新留言':(mode==='continue'?'继续留言':'回复Ta')}</span></div><button class="board-compose-close" onclick="hideModal(document.getElementById('board-compose-modal'))"><i class="fas fa-times"></i></button></div><div class="board-compose-paper"><textarea id="bv2-compose-text" placeholder="写下你的碎碎念..." style="background:transparent!important;border:none!important;outline:none!important;font-family:var(--font-family)!important;font-size:14px!important;line-height:29px!important;color:var(--text-primary)!important;width:100%;resize:none;padding:14px 16px 14px 50px;min-height:180px;position:relative;z-index:1;"></textarea></div><div style="padding:0 16px 10px;display:flex;justify-content:space-between;align-items:center;"><label style="cursor:pointer;color:var(--text-secondary);font-size:18px;"><i class="fas fa-image"></i><input type="file" accept="image/*" id="bv2-compose-img-input" style="display:none;" onchange="window._bv2_handleImgSelect(event)"></label><span id="bv2-img-hint" style="font-size:11px;color:var(--accent-color);display:none;">已选图片</span></div><div class="board-compose-footer"><button class="board-compose-btn cancel" onclick="hideModal(document.getElementById('board-compose-modal'))">取消</button><button class="board-compose-btn send" onclick="window._bv2_submitPost()">发布</button></div></div>`;
  hideModal(document.getElementById('board-detail-modal'));
  setTimeout(() => { showModal(document.getElementById('board-compose-modal')); setTimeout(() => document.getElementById('bv2-compose-text')?.focus(), 300); }, 200);
}

function handleImgSelect(e) {
  const file = e.target.files[0]; if (!file) return;
  if (typeof optimizeImage === 'function') { optimizeImage(file).then(b => { selectedImage = b; document.getElementById('bv2-img-hint').style.display = 'inline'; }); }
  else { const r = new FileReader(); r.onload = ev => { selectedImage = ev.target.result; document.getElementById('bv2-img-hint').style.display = 'inline'; }; r.readAsDataURL(file); }
}

async function submitPost() {
  const text = document.getElementById('bv2-compose-text')?.value.trim() || '';
  if (!text && !selectedImage) { if(typeof showNotification === 'function') showNotification('内容不能为空', 'warning'); return; }
  const newReply = { id: genId(), sender: 'me', text, image: selectedImage || null, sticker: null, timestamp: Date.now() };
  if (currentComposeMode === 'new') { boardData.myThreads.push({ id: genId(), starter: 'me', createdAt: Date.now(), replies: [newReply] }); }
  else { const t = (currentComposeType === 'me' ? boardData.myThreads : boardData.partnerThreads).find(t => t.id === currentThreadId); if(t) { t.replies.push(newReply); delete t.expectedReplyTime; } }
  await saveData();
  checkStatus();
  hideModal(document.getElementById('board-compose-modal'));
  if(typeof showNotification === 'function') showNotification('发布成功', 'success');
  if (currentComposeMode === 'new') { switchTab(currentComposeType); showModal(document.getElementById('envelope-board-modal')); }
  else openDetail(currentThreadId, currentComposeType);
}

  function findReplyById(id) {
    for (let t of boardData.myThreads) { const r = t.replies.find(x => x.id === id); if(r) return r; }
    for (let t of boardData.partnerThreads) { const r = t.replies.find(x => x.id === id); if(r) return r; }
    return null;
  }

  function editText(replyId) {
    const textEl = document.getElementById(`bv2-text-${replyId}`);
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
    const section = document.getElementById(`bv2-section-${replyId}`);
    if (section && !section.querySelector('.board-edit-actions')) {
      const actions = document.createElement('div');
      actions.className = 'board-edit-actions';
      actions.innerHTML = `<button class="board-edit-btn cancel" onclick="window._bv2_cancelEdit('${replyId}')">取消</button><button class="board-edit-btn save" onclick="window._bv2_saveEdit('${replyId}')">保存</button>`;
      section.appendChild(actions);
    }
    textEl.dataset.originalText = originalText;
  }

  async function saveEdit(replyId) {
    const textEl = document.getElementById(`bv2-text-${replyId}`);
    if (!textEl) return;
    const newText = textEl.textContent.trim();
    if (!newText) { if(typeof showNotification === 'function') showNotification('内容不能为空', 'warning'); return; }
    const reply = findReplyById(replyId);
    if (reply) { reply.text = newText; await saveData(); if(typeof showNotification === 'function') showNotification('已保存', 'success'); }
    exitEditMode(replyId);
  }

  function cancelEdit(replyId) {
    const textEl = document.getElementById(`bv2-text-${replyId}`);
    if (!textEl) return;
    textEl.textContent = textEl.dataset.originalText || '';
    exitEditMode(replyId);
  }

  function exitEditMode(replyId) {
    const textEl = document.getElementById(`bv2-text-${replyId}`);
    if(textEl) { textEl.contentEditable = false; textEl.classList.remove('editing'); delete textEl.dataset.originalText; }
    const section = document.getElementById(`bv2-section-${replyId}`);
    if (section) { const actions = section.querySelector('.board-edit-actions'); if (actions) actions.remove(); }
  }

async function deleteThread(id, type) {
  if (!confirm('确定删除这条留言记录吗？')) return;
  if (type === 'me') boardData.myThreads = boardData.myThreads.filter(t => t.id !== id);
  else boardData.partnerThreads = boardData.partnerThreads.filter(t => t.id !== id);
  await saveData();
  hideModal(document.getElementById('board-detail-modal'));
  switchTab(type); showModal(document.getElementById('envelope-board-modal'));
  if(typeof showNotification === 'function') showNotification('已删除', 'success');
}

function exportTxt(type) {
  const threads = type === 'me' ? boardData.myThreads : boardData.partnerThreads;
  if (threads.length === 0) { if(typeof showNotification === 'function') showNotification('没有可导出的内容', 'info'); return; }
  const myName = (typeof settings !== 'undefined' && settings.myName) || '我';
  const partnerName = (typeof settings !== 'undefined' && settings.partnerName) || '对方';
  let txt = `========================\n【${type === 'me' ? '我的' : 'Ta的'}留言板】\n========================\n\n`;
  threads.forEach(t => { t.replies.forEach(r => { txt += `[${new Date(r.timestamp).toLocaleString('zh-CN')}]\n${r.sender === 'me' ? myName : partnerName}: ${r.image ? '[图片]\n' : ''}${r.text || ''}${r.sticker ? '[表情包]\n' : ''}\n`; }); txt += '------------------------\n\n'; });
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' }); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `留言板-${new Date().toLocaleDateString()}.txt`; a.click();
  if(typeof showNotification === 'function') showNotification('导出成功', 'success');
}

// --- 暴露全局接口 ---
window.loadEnvelopeData = loadData;
window.checkEnvelopeStatus = checkStatus;
window._bv2_switchTab = switchTab; window._bv2_openDetail = openDetail;
window._bv2_openCompose = openCompose; window._bv2_handleImgSelect = handleImgSelect;
window._bv2_submitPost = submitPost; 
window._bv2_editText = editText;
window._bv2_saveEdit = saveEdit;
window._bv2_cancelEdit = cancelEdit;
window._bv2_deleteThread = deleteThread;
window._bv2_exportTxt = exportTxt;
window.setBoardDataV2 = function(newData) {
    boardData = { ...boardData, ...newData };
    window.boardDataV2 = boardData;
    saveData();
};

// --- 启动 ---
loadData().then(() => { setInterval(checkStatus, 60000); checkStatus(); });

})();
