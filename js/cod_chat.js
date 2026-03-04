// ========== COD 互動小手機 (LINE 風格版) - Chat 聊天模組 ==========
// 版本：v3.0.0 - TW Customized
// 包含：聊天邏輯、貼圖系統、訊息解析、個人資料

var viewingProfileId = null; // 用來暫存當前正在查看的角色ID

// ==========================================
// 【工具】格式修復與清理
// ==========================================
function fixBrokenFormat(text) {
    if (!text) return text;
    var fixed = text;
    
    // 1. 修復貼圖標記 (LINE 風格)
    fixed = fixed.replace(/\[貼圖?[：:]?\s*([^\]\n]*?)(?:\n|$)/g, function(match, name) {
        if (match.indexOf(']') !== -1) return match;
        var cleanName = (name || '').trim();
        if (!cleanName) cleanName = '默認';
        return '[貼圖:' + cleanName + ']\n';
    });
    
    // 2. 清理未閉合的括號
    var openCount = (fixed.match(/\[/g) || []).length;
    var closeCount = (fixed.match(/\]/g) || []).length;
    if (openCount > closeCount) {
        for (var i = 0; i < openCount - closeCount; i++) {
            fixed += ']';
        }
    }
    
    // 3. 清理思考標籤 (DeepSeek/Gemini 等)
    fixed = fixed.replace(/<think>[\s\S]*?<\/think>/gi, '');
    
    return fixed.trim();
}

function getDisplayName(charId) { 
    if (!S.characters[charId]) return 'Unknown';
    return S.characters[charId].remark || CHARACTERS[charId].displayName; 
}

function getPlayerName() { return S.name === '我' ? '' : S.name; }

// ==========================================
// 【介面更新】
// ==========================================
function updateTime() { 
    var now = new Date(); var t = timeStr(); 
    var weekDays = '日一二三四五六';
    var d = (now.getMonth()+1) + '月' + now.getDate() + '日 星期' + weekDays[now.getDay()]; 
    
    var lockTime = $('lock-time'); if(lockTime) lockTime.textContent = t;
    var lockDate = $('lock-date'); if(lockDate) lockDate.textContent = d;
    var homeTime = $('home-time'); if(homeTime) homeTime.textContent = t;
}

function updateAvatars() { 
    var avatarPlayers = document.querySelectorAll('.avatar-player');
    for (var i = 0; i < avatarPlayers.length; i++) {
        var e = avatarPlayers[i];
        if (S.avatarPlayer) { 
            e.style.backgroundImage = "url('" + S.avatarPlayer + "')"; 
            e.style.backgroundSize = 'cover'; 
            e.textContent = ''; 
        } else { 
            e.style.backgroundImage = ''; 
            e.style.background = '#ccc'; // LINE 預設灰
            e.textContent = ''; 
        } 
    }
    
    // 更新個人資料頁
    var myName = $('my-profile-name'); if(myName) myName.textContent = S.name;
    var myId = $('my-profile-id'); if(myId) myId.textContent = S.wechatId; // 顯示為 ID
}

function updateWallpapers() { 
    var lockBg = $('lock-bg'); if(lockBg) lockBg.style.backgroundImage = "url('" + S.wallLock + "')"; 
    var homeBg = $('home-bg'); if(homeBg) homeBg.style.backgroundImage = "url('" + S.wallHome + "')"; 
    
    // 聊天背景
    var chatBox = $('chat-box');
    if (chatBox) {
        chatBox.style.backgroundImage = S.chatWallpaper ? "url('" + S.chatWallpaper + "')" : '';
        chatBox.style.backgroundSize = 'cover';
    }
}

function updateBadges() { 
    var total = 0;
    // 計算總未讀數
    if (S.characters) {
        Object.keys(S.characters).forEach(function(id) { 
            total += (S.characters[id].unread || 0); 
        });
    }
    
    // 需要更新紅點的元素 ID 列表
    // badge-chat: 桌面圖示上的紅點
    // tab-badge-chat: 底部導航列上的紅點 (如果有加的話)
    var badgeIds = ['badge-chat', 'badge-chat-tab', 'dock-badge'];
    
    badgeIds.forEach(function(id) {
        var e = document.getElementById(id); 
        if (e) { 
            e.style.display = total > 0 ? 'block' : 'none'; // 改用 block 或 flex
            e.textContent = total > 99 ? '99+' : total; 
        } 
    });
}

// ==========================================
// 【聊天列表】(支援自訂角色)
// ==========================================
function renderChatList() {
    var container = $('chat-list-container'); 
    if (!container) return;
    container.innerHTML = '';
    
    var charIds = Object.keys(S.characters);
    // 按時間排序
    charIds.sort(function(a, b) { return S.characters[b].lastMsgTime - S.characters[a].lastMsgTime; });
    
    for (var i = 0; i < charIds.length; i++) {
        var charId = charIds[i];
        var char = CHARACTERS[charId]; 
        var data = S.characters[charId];
        
        if (!char) continue; // 跳過無效角色
        
        var avatarStyle = data.avatar ? "background-image:url('" + data.avatar + "');background-size:cover" : '';
        var avatarText = data.avatar ? '' : char.avatarText;
        var badgeHtml = data.unread > 0 ? '<div class="chat-badge">' + data.unread + '</div>' : '';
        
        var item = document.createElement('div'); 
        item.className = 'chat-item';
        (function(cid) { item.onclick = function() { openChatWith(cid); }; })(charId);
        
        item.innerHTML = 
            '<div class="avatar ' + (char.avatarClass || 'avatar-custom') + '" style="' + avatarStyle + '" onclick="event.stopPropagation();openProfileFor(\'' + charId + '\')">' + avatarText + '</div>' +
            '<div class="chat-info">' +
                '<div class="chat-name"><span>' + data.remark + '</span></div>' +
                '<div class="chat-preview">' + (data.preview || '') + '</div>' +
            '</div>' +
            '<div class="chat-meta">' +
                '<div class="chat-time">' + data.lastTime + '</div>' +
                badgeHtml +
            '</div>';
        container.appendChild(item);
    }
}

function renderContactsList() {
    var container = $('contacts-list-container'); 
    if(!container) return;
    container.innerHTML = '';
    
    // 顯示添加按鈕 (置頂)
    var addBtn = document.createElement('div');
    addBtn.className = 'chat-item add-contact-item';
    addBtn.onclick = function() { openAddCharacterModal(); };
    addBtn.innerHTML = '<div class="avatar" style="background:#06C755;color:white;display:flex;align-items:center;justify-content:center"><i class="fas fa-plus"></i></div><div class="chat-info"><div class="chat-name">新增聯絡人</div></div>';
    container.appendChild(addBtn);
    
    var charIds = Object.keys(CHARACTERS);
    for (var i = 0; i < charIds.length; i++) {
        var charId = charIds[i];
        var char = CHARACTERS[charId]; 
        var data = S.characters[charId];
        var avatarStyle = data.avatar ? "background-image:url('" + data.avatar + "');background-size:cover" : '';
        
        var item = document.createElement('div'); 
        item.className = 'chat-item';
        (function(cid) { item.onclick = function() { openProfileFor(cid); }; })(charId);
        
        item.innerHTML = '<div class="avatar ' + (char.avatarClass || 'avatar-custom') + '" style="' + avatarStyle + '">' + (data.avatar ? '' : char.avatarText) + '</div><div class="chat-info"><div class="chat-name">' + char.name + '</div><div class="chat-preview">' + char.role + '</div></div>';
        container.appendChild(item);
    }
}

// ==========================================
// 【聊天室核心】
// ==========================================
function openChatWith(charId) {
    if (!CHARACTERS[charId]) return;
    
    // 儲存當前聊天室狀態
    if (S.currentChat && $('chat-box')) S.chatDOMs[S.currentChat] = $('chat-box').innerHTML;
    
    S.currentChat = charId;
    var char = CHARACTERS[charId]; 
    var data = S.characters[charId];
    
    // 更新標題
    var headerName = $('chat-header-name');
    if(headerName) headerName.textContent = data.remark;
    
    var chatBox = $('chat-box'); 
    chatBox.innerHTML = S.chatDOMs[charId] || '';
    
    // 如果沒有內容但有歷史記錄，重建 (防止空白)
    if (chatBox.innerHTML === '' && data.history.length > 0) {
        rebuildChatFromHistory(charId);
    } else if (data.history.length === 0 && (data.customFirst || char.first)) {
        // 新對話顯示開場白
        var firstMsg = data.customFirst || char.first;
        addMsg('other', firstMsg, 'text', {}, charId);
        data.history.push({ role: 'assistant', content: firstMsg });
    }
    
    // 顯示聊天頁面
    var chatPage = $('chat-page');
    if(chatPage) chatPage.classList.add('active');
    
    // 清除未讀
    data.unread = 0; 
    updateBadges(); 
    scrollChat();
    
    // 綁定長按選單
    bindAllMessageEvents();
}

function closeChat() { 
    if($('chat-box')) S.chatDOMs[S.currentChat] = $('chat-box').innerHTML; 
    var chatPage = $('chat-page');
    if(chatPage) chatPage.classList.remove('active'); 
    closePlus(); 
}

function scrollChat() { 
    setTimeout(function() { 
        var b = $('chat-box'); 
        if(b) b.scrollTop = b.scrollHeight; 
    }, 50); 
}

// ==========================================
// 【訊息處理】(純文字/圖片/貼圖)
// ==========================================
function addMsg(side, text, type, extra, charId) {
    type = type || 'text';
    extra = extra || {};
    charId = charId || S.currentChat;
    
    var box = $('chat-box'); 
    var char = CHARACTERS[charId]; 
    var data = S.characters[charId];
    
    var row = document.createElement('div'); 
    row.className = `msg-row ${side}`; 
    
    var aClass, aStyle, aText, avatarClick;
    if (side === 'self') { 
        aClass = 'avatar-player'; 
        aStyle = S.avatarPlayer ? `background-image:url('${S.avatarPlayer}');background-size:cover` : ''; 
        aText = ''; 
        avatarClick = ''; 
    } else { 
        aClass = `avatar ${char.avatarClass || 'avatar-custom'}`; 
        aStyle = data.avatar ? `background-image:url('${data.avatar}');background-size:cover` : ''; 
        aText = data.avatar ? '' : char.avatarText; 
        avatarClick = `onclick="event.stopPropagation();openProfileFor('${charId}')"`; 
    }
    
    var bubble = '';
    if (type === 'text') {
        bubble = `<div class="bubble text">${text}</div>`;
    } else if (type === 'img') {
        // 點擊放大圖片
        bubble = `<div class="bubble img"><img src="${text}" onclick="openImageViewer(this.src)"></div>`;
    } else if (type === 'sticker') {
        // 貼圖顯示 (LINE 風格：無氣泡背景)
        bubble = `<div class="bubble sticker" style="background:transparent;box-shadow:none;padding:0;"><img src="${extra.stickerUrl}" style="max-width:140px;border-radius:10px;"></div>`;
    }
    
    // 長按選單 (編輯/刪除/重說)
    var menuItems = '<div class="msg-action-item" onclick="deleteMessage(this.parentElement.parentElement)">刪除</div>';
    if (side === 'other') {
        menuItems += '<div class="msg-action-item" onclick="rerollMessage(this.parentElement.parentElement)">重說</div>';
    } else if (type === 'text') {
        menuItems += '<div class="msg-action-item" onclick="editMessage(this.parentElement.parentElement)">編輯</div>';
    }
    
    row.innerHTML = `<div class="msg-action-menu">${menuItems}</div><div class="avatar ${aClass}" style="${aStyle}" ${avatarClick}>${aText}</div><div style="display:flex;flex-direction:column;${side==='self'?'align-items:flex-end':''}">${bubble}<div class="msg-time">${timeStr()}</div></div>`;
    
    bindMessageEvents(row); // 綁定長按事件
    box.appendChild(row);
    
    // 更新預覽
    var preview = text;
    if (type === 'img') preview = '[圖片]';
    if (type === 'sticker') preview = '[貼圖]';
    
    data.preview = side === 'self' ? `我: ${preview.slice(0,12)}` : preview.slice(0, 15);
    data.lastTime = timeStr(); 
    data.lastMsgTime = Date.now();
    
    scrollChat(); 
    return row;
}

function sendMessage() { 
    var input = $('msg-input');
    var text = input.textContent.trim(); 
    if (!text) return;
    
    addMsg('self', text); 
    input.textContent = ''; 
    closePlus(); // 發送後關閉+號選單
    
    // 記錄歷史
    var data = getCurrentCharData();
    data.history.push({ role: 'user', content: text, timestamp: Date.now() });
    
    // 觸發 AI 回覆
    if (S.aiEnabled) characterReply(text, S.currentChat);
}

// 監聽輸入框 Enter 發送
var inputEl = $('msg-input');
if(inputEl) {
    inputEl.addEventListener('keydown', e => { 
        if (e.key === 'Enter' && !e.shiftKey) { 
            e.preventDefault(); 
            sendMessage(); 
        } 
    });
}

// ==========================================
// 【修正】網址路徑補全小幫手
// ==========================================
function getAPIEndpoint(baseUrl) {
    // 移除尾部的斜線
    var url = baseUrl.replace(/\/$/, '');
    
    // 如果網址已經包含 /chat/completions，直接回傳
    if (url.endsWith('/chat/completions')) {
        return url;
    }
    
    // 如果是 Anthropic (Claude)，路徑是 /messages
    if (url.includes('anthropic')) {
        return url + '/messages';
    }
    
    // 其他 (OpenAI, Gemini, DeepSeek) 都是加 /chat/completions
    return url + '/chat/completions';
}

// ==========================================
// 【AI 回覆邏輯】(已修正 API 呼叫路徑)
// ==========================================
async function characterReply(msg, charId) { 
    var char = CHARACTERS[charId];
    var data = S.characters[charId];
    
    showTyping(charId);
    
    // 準備 Prompt
    var playerName = S.name || '你';
    var playerContext = '\n用戶的暱稱是"' + playerName + '"。';
    
    // 時間感知
    var now = new Date();
    var hour = now.getHours();
    var timeContext = `現在是 ${hour} 點。`;
    
    // 貼圖提示
    var stickerPrompt = S.stickerEnabled ? '\n# 功能指令\n想發貼圖請單獨一行寫：[貼圖:文件名] (例如：[貼圖:親親.webp])' : '';
    
    // 狀態提示
    var stateDesc = typeof CharacterStateManager !== 'undefined' ? CharacterStateManager.getStateDescription(charId) : '';
    
    var systemPrompt = (data.customPrompt || char.prompt) + playerContext + '\n' + timeContext + '\n' + stateDesc + stickerPrompt + '\n\n請保持像在用 LINE 聊天一樣自然，回覆簡短，可以分段發送。';
    
    // 如果有 API 設定
    if (S.api.ok && S.api.url && S.api.key) {
        try {
            var apiMessages = [{ role: 'system', content: systemPrompt }];
            var historySlice = data.history.slice(-S.historyContextCount || -10);
            apiMessages = apiMessages.concat(historySlice);
            
            // 【修正】這裡使用 getAPIEndpoint 來確保網址正確
            var endpoint = getAPIEndpoint(S.api.url);
            
            console.log('正在請求 API:', endpoint); // 除錯用

            var res = await fetch(endpoint, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.api.key }, 
                body: JSON.stringify({ model: S.api.model, messages: apiMessages, max_tokens: 2048, temperature: 0.85 }) 
            });
            
            if (res.ok) { 
                var apiData = await res.json(); 
                var reply = apiData.choices[0].message.content;
                
                reply = fixBrokenFormat(reply); 
                sendParsedMessages(reply, charId, data); 
                return; 
            } else {
                // 印出錯誤代碼
                console.error('API 回傳錯誤:', res.status, res.statusText);
                toast('API 錯誤: ' + res.status);
            }
        } catch (e) { 
            console.error('API 連線失敗:', e);
            toast('連線失敗 (請按 F12 看 Console)');
        }
    }
    
    // 本地回覆 fallback
    setTimeout(function() {
        var replyText = '...';
        var lm = msg.toLowerCase();
        
        if (lm.includes('愛') || lm.includes('喜歡')) replyText = char.localReply.love[0];
        else if (lm.includes('想你')) replyText = char.localReply.miss[0];
        else if (lm.includes('早安') || lm.includes('晚安')) replyText = char.localReply.greeting[0];
        else replyText = char.localReply.default[Math.floor(Math.random() * char.localReply.default.length)];
        
        addMsg('other', replyText, 'text', {}, charId);
        data.history.push({ role: 'assistant', content: replyText });
        hideTyping(charId);
    }, 1500);
}

// 解析 AI 回覆 (支援分段與貼圖)
function sendParsedMessages(reply, charId, data) {
    var messages = [];
    var lines = reply.split(/\n+/); // 按換行分段
    
    lines.forEach(line => {
        line = line.trim();
        if (!line) return;
        
        // 檢查是否為貼圖格式 [貼圖:xxx]
        var stickerMatch = line.match(/\[貼圖[：:]\s*([^\]]+)\]/);
        
        if (stickerMatch) {
            var stickerName = stickerMatch[1].trim();
            // 補全檔名
            if (!/\.(jpg|png|gif|webp)$/i.test(stickerName)) stickerName += '.webp';
            
            // 檢查是否為本地預設貼圖 (如果不是，嘗試從 Library 找，或直接用路徑)
            // 這裡簡化處理：假設所有貼圖都在 assets/stickers/ 下
            // 或者如果是 Base64 (AI 偷圖的情況)
            var stickerUrl = 'assets/stickers/' + stickerName;
            
            messages.push({ type: 'sticker', content: stickerUrl });
        } else {
            messages.push({ type: 'text', content: line });
        }
    });
    
    // 逐條發送
    var delay = 0;
    messages.forEach((msg, index) => {
        setTimeout(() => {
            if (msg.type === 'sticker') {
                addMsg('other', '', 'sticker', { stickerUrl: msg.content }, charId);
                data.history.push({ role: 'assistant', content: '[貼圖]' });
            } else {
                addMsg('other', msg.content, 'text', {}, charId);
                data.history.push({ role: 'assistant', content: msg.content });
            }
            
            if (index === messages.length - 1) hideTyping(charId);
        }, delay);
        delay += 1000 + Math.random() * 800; // 模擬打字延遲
    });
}

function showTyping(charId) { 
    if (S.currentChat === charId) $('chat-header-name').textContent = '輸入中...'; 
}

function hideTyping(charId) { 
    if (S.currentChat === charId) $('chat-header-name').textContent = S.characters[charId].remark; 
}

// ==========================================
// 【貼圖系統】(從 App2 移植並優化)
// ==========================================
function openStickerPanel() {
    var panel = $('sticker-panel');
    if(panel) {
        panel.classList.toggle('active');
        renderStickerGrid();
    }
}

function renderStickerGrid() {
    var grid = $('sticker-grid');
    if (!grid) return;
    
    var stickers = S.stickerLibrary || [];
    
    if (stickers.length === 0) {
        grid.innerHTML = '<div class="sticker-empty">還沒有貼圖喔<br>點擊「+」新增</div>';
        return;
    }
    
    var html = '';
    stickers.forEach(function(s, index) {
        // 使用 onerror 處理圖片載入失敗，顯示預設圖
        html += `<div class="sticker-item" onclick="sendSticker('${s.url}')">
            <img src="${s.url}" style="width:100%;height:100%;object-fit:contain;">
        </div>`;
    });
    grid.innerHTML = html;
}

function sendSticker(url) {
    addMsg('self', '', 'sticker', { stickerUrl: url });
    $('sticker-panel').classList.remove('active');
    
    var data = getCurrentCharData();
    data.history.push({ role: 'user', content: '[發送了貼圖]', timestamp: Date.now() });
    
    // AI 反應 (偷圖或回貼圖)
    if (S.aiEnabled) {
        setTimeout(() => {
            // 30% 機率 AI 會偷圖 (加入它的收藏)
            if (Math.random() < 0.3) {
                var stealPhrases = ['這張圖不錯，我收下了', '哈哈這張好笑，偷走', '收藏了'];
                var reply = stealPhrases[Math.floor(Math.random() * stealPhrases.length)];
                addMsg('other', reply, 'text', {}, S.currentChat);
                // 邏輯上存入 AI 的 stickers 陣列 (core.js 定義)
                var charData = getCurrentCharData();
                if(!charData.stickers) charData.stickers = [];
                charData.stickers.push({ url: url });
            } else {
                characterReply('[發送了貼圖]', S.currentChat);
            }
        }, 1000);
    }
}

// ==========================================
// 【+號選單】(精簡版：只留相簿)
// ==========================================
function togglePlus() { 
    var panel = $('plus-panel');
    if(panel) panel.classList.toggle('open'); 
}

function closePlus() { 
    var panel = $('plus-panel');
    if(panel) panel.classList.remove('open'); 
}

// 圖片上傳監聽
var imgInput = $('img-input');
if(imgInput) {
    imgInput.addEventListener('change', function(e) { 
        var f = e.target.files[0]; 
        if (!f || !f.type.startsWith('image/')) return; 
        
        var r = new FileReader(); 
        r.onload = ev => { 
            var imgBase64 = ev.target.result;
            addMsg('self', imgBase64, 'img'); 
            
            // 存到相簿
            S.photos.unshift(imgBase64); 
            
            var data = getCurrentCharData();
            data.history.push({ role: 'user', content: '[發送了圖片]', timestamp: Date.now() });
            
            // 觸發 AI 回覆
            if (S.aiEnabled) characterReply('[發送了圖片]', S.currentChat);
        }; 
        r.readAsDataURL(f); 
        this.value = ''; 
        closePlus();
    });
}

// ==========================================
// 【個人資料與狀態】(ID 修正版)
// ==========================================
function openProfileFor(charId) {
    S.viewingProfile = charId;
    var char = CHARACTERS[charId]; 
    var data = S.characters[charId];
    
    if (!char) return;

    // 修正：對應 index.html 裡的 ID (profile-name-large, profile-id-text...)
    var nameEl = $('profile-name'); // 這是大頭貼下面的名字
    if (nameEl) nameEl.textContent = char.name;
    
    var idEl = $('profile-id');
    if (idEl) idEl.textContent = 'ID: ' + char.wechatId;
    
    var bioEl = $('profile-bio');
    if (bioEl) bioEl.textContent = char.quote || '';
    
    // 如果您用的是我給的 index.html，ID 其實是這些：
    var largeName = document.querySelector('.profile-name-large');
    if (largeName) largeName.textContent = char.name;
    
    var idText = document.querySelector('.profile-id-text');
    if (idText) idText.textContent = 'ID: ' + char.wechatId;
    
    var bioText = document.querySelector('.profile-bio-text');
    if (bioText) bioText.textContent = char.quote || '';

    // 頭貼處理
    var avatar = $('profile-avatar'); // 這是對應 .profile-avatar-large
    if (avatar) {
        if (data.avatar) { 
            avatar.style.backgroundImage = "url('" + data.avatar + "')"; 
            avatar.textContent = ''; 
            avatar.className = 'profile-avatar-large';
        } else { 
            avatar.style.backgroundImage = ''; 
            avatar.textContent = char.avatarText; 
            avatar.className = 'profile-avatar-large ' + (char.avatarClass || 'avatar-custom');
        }
    }
    
    // 【狀態顯示】只顯示 Thought (心想)
    var statusBox = $('profile-status-box');
    if (statusBox) {
        // 從 Core 的 CharacterStateManager 獲取或更新狀態
        var status = (typeof CharacterStateManager !== 'undefined') 
            ? CharacterStateManager.getState(charId) 
            : { thought: '...', lastUpdate: Date.now() };
            
        statusBox.innerHTML = `
            <div class="status-thought">
                <i class="far fa-comment-dots"></i> ${status.thought}
            </div>
            <div class="status-time">更新於剛剛</div>
        `;
    }
    
    // 確保設定頁面關閉，避免擋住
    var settingsPage = $('chat-settings-page');
    if (settingsPage) settingsPage.classList.remove('active');

    openPage('character-profile');
}

// ==========================================
// 【訊息操作】編輯/刪除/重說
// ==========================================
function deleteMessage(row) {
    if(confirm('確定要刪除這條訊息嗎？')) {
        row.remove();
        // 更新 DOM 緩存
        S.chatDOMs[S.currentChat] = $('chat-box').innerHTML;
        saveData();
    }
}

function rerollMessage(row) {
    if (!S.aiEnabled) { toast('請先開啟 AI'); return; }
    
    row.remove(); // 刪除舊訊息
    toast('正在重新生成...');
    showTyping(S.currentChat);
    
    // 簡單的重試邏輯：讓 AI 再回覆一次最後一句話
    // 實際應用中可能需要更複雜的 context 管理，這裡做簡化處理
    var data = getCurrentCharData();
    var lastUserMsg = '[請換個方式回答]';
    // 嘗試找上一條用戶訊息
    for(var i=data.history.length-1; i>=0; i--) {
        if(data.history[i].role === 'user') {
            lastUserMsg = data.history[i].content;
            break;
        }
    }
    characterReply(lastUserMsg, S.currentChat);
}

function bindAllMessageEvents() {
    // 綁定長按選單事件 (行動裝置支援)
    var rows = document.querySelectorAll('.msg-row');
    rows.forEach(row => {
        row.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            // 顯示選單邏輯 (CSS 控制 .show-menu)
            this.querySelector('.msg-action-menu').classList.toggle('show');
        });
    });
}

// 全局點擊關閉選單
document.addEventListener('click', function(e) {
    if (!e.target.closest('.msg-action-menu')) {
        document.querySelectorAll('.msg-action-menu.show').forEach(m => m.classList.remove('show'));
    }
});

// 重建聊天記錄 (從 History)
function rebuildChatFromHistory(charId) {
    var data = S.characters[charId];
    if (!data || !data.history) return;
    
    var box = $('chat-box');
    box.innerHTML = ''; // 清空
    
    data.history.forEach(h => {
        var side = h.role === 'user' ? 'self' : 'other';
        var type = 'text';
        var content = h.content;
        
        // 簡單判斷類型
        if (content.includes('[貼圖]')) type = 'sticker'; // 歷史記錄中貼圖通常無法完美還原 URL，這裡僅做示意
        else if (content.includes('[圖片]')) type = 'img';
        
        // 這裡無法還原具體 stickerUrl，如果是舊紀錄只能顯示文字替代
        // 新紀錄建議在 history 中存儲 type 字段
        
        addMsg(side, content, 'text', {}, charId);
    });
}

// ==========================================
// 【補丁】修復聊天室報錯與選單功能
// ==========================================

function bindMessageEvents(row) {
    // 為每一條訊息綁定滑鼠右鍵 (電腦) 或長按 (手機) 事件
    row.addEventListener('contextmenu', function(e) {
        e.preventDefault(); // 阻止瀏覽器預設選單
        
        // 先關閉其他已開啟的選單
        document.querySelectorAll('.msg-action-menu.show').forEach(function(m) {
            m.classList.remove('show');
        });

        // 顯示當前訊息的選單
        var menu = this.querySelector('.msg-action-menu');
        if (menu) {
            menu.classList.add('show');
        }
    });
}

// ==========================================
// 【補丁】個人資料頁的按鈕功能
// ==========================================

// 點擊「聊天」按鈕
function openChatWithCurrent() {
    if (viewingProfileId) {
        // 1. 關閉個人資料頁
        closePage('character-profile');
        
        // 2. 切換到底下的 LINE App 視窗 (確保它有開)
        openApp('wechat');
        
        // 3. 進入聊天室
        openChatWith(viewingProfileId);
    }
}

// 點擊「設定備註」按鈕
function openEditRemark() {
    if (!viewingProfileId) return;
    
    var currentName = S.characters[viewingProfileId].remark;
    var newName = prompt('請輸入新的顯示名稱：', currentName);
    
    if (newName && newName.trim() !== '') {
        // 更新資料
        S.characters[viewingProfileId].remark = newName.trim();
        saveData(); // 存檔
        
        // 更新介面顯示
        var remarkEl = document.getElementById('profile-remark');
        if(remarkEl) remarkEl.textContent = newName.trim();
        
        // 重新整理外部列表
        renderChatList();
        renderContactsList();
        
        toast('備註已更新');
    }
}

// ==========================================
// 【補丁】個人資料頁按鈕功能
// ==========================================

// 1. 從資料頁跳轉聊天
function openChatWithCurrent() {
    // 獲取當前查看的角色 ID
    var charId = S.viewingProfile;
    if (!charId) return;
    
    // 關閉資料頁
    closePage('character-profile');
    
    // 如果是從「主頁」進來的，可能要先切換到底部導航的「聊天」分頁
    if (typeof switchWechatTab === 'function') {
        switchWechatTab('chats');
    }
    
    // 打開聊天室
    setTimeout(function() {
        openChatWith(charId);
    }, 200); // 稍微延遲讓動畫順暢
}

// 2. 打開修改備註頁面
function openEditRemark() {
    var charId = S.viewingProfile;
    if (!charId) return;
    
    var data = S.characters[charId];
    
    // 動態建立修改備註頁面 (如果不存在)
    var page = $('edit-remark-page');
    if (!page) {
        page = document.createElement('div');
        page.id = 'edit-remark-page';
        page.className = 'sub-page';
        page.style.background = '#f5f5f5';
        document.querySelector('.screen').appendChild(page);
    }
    
    page.innerHTML = `
        <div class="sub-header">
            <i class="fas fa-arrow-left" onclick="document.getElementById('edit-remark-page').classList.remove('active')"></i>
            <span>更改顯示名稱</span>
            <span onclick="saveRemark()" style="color:#06C755;font-weight:bold">儲存</span>
        </div>
        <div class="settings-content">
            <div class="input-group">
                <input type="text" id="input-remark" value="${data.remark}" class="input-full" style="padding:15px; border:none; border-bottom:2px solid #06C755; background:transparent; font-size:18px; width:100%;">
                <div style="font-size:12px;color:#999;margin-top:10px;"自由的備註他的名字吧。</div>
            </div>
        </div>
    `;
    
    page.classList.add('active');
}

// 3. 儲存備註
function saveRemark() {
    var charId = S.viewingProfile;
    var newName = document.getElementById('input-remark').value.trim();
    
    if (newName) {
        // 更新資料
        S.characters[charId].remark = newName;
        saveData();
        
        // 更新 UI
        // 1. 更新資料頁上的名字
        var nameLarge = document.querySelector('.profile-name-large');
        if(nameLarge) nameLarge.textContent = newName;
        // 2. 更新聊天列表
        if(typeof renderChatList === 'function') renderChatList();
        if(typeof renderContactsList === 'function') renderContactsList();
        
        toast('名稱已更改');
        document.getElementById('edit-remark-page').classList.remove('active');
    } else {
        toast('名稱不能為空');
    }
}

console.log('【系統】聊天模組載入完成');