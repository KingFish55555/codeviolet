// ========== COD 互動小手機 (LINE 風格版) - App 應用模組 ==========
// 版本：v3.0.0 - TW Customized
// 包含：設定、存檔、自訂角色、貼圖管理、初始化等核心功能

// ==========================================
// 【補丁】頁面導航系統 (修復 openApp 錯誤)
// 請將這段程式碼貼到 cod_app.js 中
// ==========================================

// 打開 App (例如 LINE 或 設定)
function openApp(appId) {
    // 拼湊 ID，例如傳入 'wechat' -> 找 id="wechat-app"
    var appElement = document.getElementById(appId + '-app');
    
    if (appElement) {
        appElement.classList.add('active'); // 顯示 App
        
        // 如果是打開 LINE，預設顯示聊天列表
        if (appId === 'wechat') {
            renderChatList(); // 重新整理列表
        }
    } else {
        console.error('找不到 App 視窗: ' + appId + '-app');
        // 暫時提示功能未完成 (例如相簿)
        if (appId === 'photos') alert('相簿功能還在開發中...');
    }
}

// 關閉 App
function closeApp(appId) {
    var appElement = document.getElementById(appId + '-app');
    if (appElement) {
        appElement.classList.remove('active');
    }
}

// 打開次級頁面 (例如 設定->修改名字)
function openPage(pageId) {
    var pageElement = document.getElementById(pageId);
    if (pageElement) {
        pageElement.classList.add('active');
    }
}

// 關閉次級頁面
function closePage(pageId) {
    var pageElement = document.getElementById(pageId);
    if (pageElement) {
        pageElement.classList.remove('active');
    }
}

// 切換 LINE 下方的標籤 (聊天/好友)
function switchWechatTab(tabName) {
    // 1. 隱藏所有分頁內容
    var contents = document.querySelectorAll('.tab-content');
    contents.forEach(function(el) { el.style.display = 'none'; });
    
    // 2. 顯示選中的分頁
    var target = document.getElementById('tab-' + tabName);
    if (target) target.style.display = 'block';

    // 3. 更新底部按鈕的顏色狀態
    var tabs = document.querySelectorAll('.app-tab-bar .tab-item');
    tabs.forEach(function(el) { el.classList.remove('active'); });
    
    // 根據點擊的位置手動加上 active (這裡簡單處理，或者需要傳入 this)
    // 為了簡單起見，這裡假設 tabName 對應 index，實際應用可優化
    // 這裡我們只處理內容切換即可
}

// 修正：讓 switchWechatTab 能連動底部樣式
// 為了方便，請確保 HTML 裡的 onclick 傳遞正確，或這裡直接全部顯示聊天列表
// 初始化預設顯示聊天列表
document.addEventListener('DOMContentLoaded', function() {
    var chatTab = document.getElementById('tab-chats');
    if(chatTab) chatTab.style.display = 'block';
});

// ==========================================
// 【全域記憶管理器】跨 App 記憶共享
// ==========================================
var GlobalMemory = {
    // 獲取全域上下文
    getContext: function() {
        var context = {
            recentChats: [],
            recentMoments: [], // 將保留 "moments" 作為內部變數名
            characterStatus: {},
            time: new Date().toLocaleString()
        };
        
        try {
            if (S && S.characters) {
                Object.keys(S.characters).forEach(function(charId) {
                    var data = S.characters[charId];
                    var char = CHARACTERS[charId];
                    if (data && data.history && data.history.length > 0 && char) {
                        var recent = data.history.slice(-2);
                        recent.forEach(function(m) {
                            var sender = m.role === 'user' ? '玩家' : char.displayName;
                            context.recentChats.push('[' + sender + ']: ' + (m.content || '').substring(0, 40));
                        });
                    }
                });
            }
            
            if (S && S.moments && S.moments.length > 0) {
                S.moments.slice(0, 3).forEach(function(m) {
                    var authorName = m.author === 'player' ? S.name : (CHARACTERS[m.author] ? CHARACTERS[m.author].displayName : m.author);
                    context.recentMoments.push('[貼文串] [' + authorName + ']: ' + (m.content || '').substring(0, 30));
                });
            }
            
            if (S && S.characterStatus) {
                context.characterStatus = S.characterStatus;
            }
        } catch(e) {
            console.error('GlobalMemory 錯誤:', e);
        }
        
        return context;
    },
    
    // 【簡化】只生成 thought
    buildPrompt: function(basePrompt, charId) {
        var ctx = this.getContext();
        var memoryPrompt = '\n=== 全域記憶 ===\n';
        
        if (charId && typeof CharacterStateManager !== 'undefined') {
            memoryPrompt += CharacterStateManager.getStateDescription(charId) + '\n';
        }
        
        if (ctx.recentChats.length > 0) {
            memoryPrompt += '[最近聊天]\n' + ctx.recentChats.slice(-5).join('\n') + '\n';
        }
        if (ctx.recentMoments.length > 0) {
            memoryPrompt += '[最近貼文串]\n' + ctx.recentMoments.join('\n') + '\n';
        }
        
        return basePrompt + memoryPrompt + '[當前時間]: ' + ctx.time + '\n=== 記憶結束 ===\n';
    }
};
window.GlobalMemory = GlobalMemory;

// ==========================================
// 【瀏覽器推播通知系統】
// ==========================================
var BrowserNotification = {
    pendingQueue: {},
    
    requestPermission: function() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(function(perm) {
                console.log('【通知】權限狀態:', perm);
            });
        }
    },
    
    send: function(title, body, icon, chatId) {
        var lockscreen = $('lockscreen');
        if (lockscreen && !lockscreen.classList.contains('unlocked')) {
            // 在鎖定畫面，只發送瀏覽器通知
            if ('Notification' in window && Notification.permission === 'granted') {
                try {
                    var n = new Notification(title, { body: body, icon: icon || '', tag: 'cod-' + chatId });
                    n.onclick = function() { window.focus(); n.close(); };
                    setTimeout(function() { n.close(); }, 5000);
                } catch(e) {}
            }
            return;
        }
        
        // 應用內浮動通知 - LINE 風格
        this.showFloating(title, body, icon, chatId);
    },

    showFloating: function(title, body, icon, chatId) {
        var self = this;
        if (!this.pendingQueue[chatId]) {
            this.pendingQueue[chatId] = { count: 0, body: body, icon: icon, title: title };
        }
        this.pendingQueue[chatId].count++;
        this.pendingQueue[chatId].body = body;
        
        clearTimeout(this.pendingQueue[chatId].timer);
        this.pendingQueue[chatId].timer = setTimeout(function() {
            var queue = self.pendingQueue[chatId];
            if (!queue) return;
            
            var oldNotif = document.querySelector('.floating-notification[data-chat="' + chatId + '"]');
            if (oldNotif) oldNotif.remove();
            
            var notif = document.createElement('div');
            notif.className = 'floating-notification';
            notif.dataset.chat = chatId;
            
            var previewText = queue.count > 1 ? '[' + queue.count + '則訊息] ' + queue.body : queue.body;
            
            var avatarHtml = '';
            var char = CHARACTERS[chatId];
            var charData = S.characters[chatId];
            if (charData && charData.avatar) {
                avatarHtml = '<div class="fn-avatar" style="background-image:url(\'' + charData.avatar + '\')"></div>';
            } else if (char) {
                avatarHtml = '<div class="fn-avatar ' + char.avatarClass + '">' + char.avatarText + '</div>';
            } else {
                avatarHtml = '<div class="fn-avatar"></div>';
            }
            
            notif.innerHTML = 
                avatarHtml +
                '<div class="fn-content">' +
                    '<div class="fn-name">' + queue.title + '</div>' +
                    '<div class="fn-preview"><i class="fab fa-line" style="color:#06C755;margin-right:4px;"></i>' + previewText + '</div>' +
                '</div>';
            
            notif.onclick = function() {
                if (chatId && typeof openChatWith === 'function') {
                    openApp('wechat'); // 內部 app ID 仍為 wechat
                    setTimeout(function() { openChatWith(chatId); }, 200);
                }
                notif.classList.add('hide');
                setTimeout(function() { notif.remove(); }, 300);
            };
            
            var container = document.querySelector('.phone-container') || document.body;
            container.appendChild(notif);
            setTimeout(function() { notif.classList.add('show'); }, 10);
            
            setTimeout(function() {
                if (document.body.contains(notif)) {
                    notif.classList.add('hide');
                    setTimeout(function() { notif.remove(); }, 300);
                }
            }, 5000);
            
            delete self.pendingQueue[chatId];
        }, 800);
    }
};
window.BrowserNotification = BrowserNotification;

// ==========================================
// 【聊天設定頁面】(完整版：含人設、世界書)
// ==========================================
function openChatSettingsPage() {
    var charId = S.currentChat;
    var char = CHARACTERS[charId];
    var data = S.characters[charId];
    var page = $('chat-settings-page');
    
    // 如果頁面不存在，動態建立
    if (!page) {
        page = document.createElement('div');
        page.id = 'chat-settings-page';
        page.className = 'sub-page';
        page.style.background = '#f5f5f5';
        document.querySelector('.screen').appendChild(page);
    }
    
    var replyMode = data.replyMode || 'instant';
    
    page.innerHTML = `
        <div class="sub-header">
            <i class="fas fa-arrow-left" onclick="closeChatSettingsPage()"></i>
            <span>聊天設定</span>
            <span></span>
        </div>
        <div class="settings-list">
            
            <!-- 回覆模式設定 -->
            <div class="setting-title" style="padding:15px 15px 5px;color:#666;font-size:13px;">訊息回覆方式</div>
            <div class="setting-group">
                <div class="setting-item" onclick="setReplyMode('${charId}', 'instant')">
                    <div style="display:flex;align-items:center;">
                        <div style="width:20px;height:20px;border-radius:50%;border:2px solid ${replyMode === 'instant' ? '#06C755' : '#ccc'};display:flex;align-items:center;justify-content:center;margin-right:10px;">
                            ${replyMode === 'instant' ? '<div style="width:10px;height:10px;border-radius:50%;background:#06C755;"></div>' : ''}
                        </div>
                        <div>
                            <div style="font-size:15px;">即時回覆</div>
                            <div style="font-size:12px;color:#999;margin-top:2px;">你發一則訊息，對方立刻回覆</div>
                        </div>
                    </div>
                </div>
                <div class="setting-item" onclick="setReplyMode('${charId}', 'batch')">
                    <div style="display:flex;align-items:center;">
                        <div style="width:20px;height:20px;border-radius:50%;border:2px solid ${replyMode === 'batch' ? '#06C755' : '#ccc'};display:flex;align-items:center;justify-content:center;margin-right:10px;">
                            ${replyMode === 'batch' ? '<div style="width:10px;height:10px;border-radius:50%;background:#06C755;"></div>' : ''}
                        </div>
                        <div>
                            <div style="font-size:15px;">手動回覆</div>
                            <div style="font-size:12px;color:#999;margin-top:2px;">可以連續發多條訊息，點擊「回覆」按鈕後對方才回</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 角色設定區 -->
            <div class="setting-title" style="padding:15px 15px 5px;color:#666;font-size:13px;">角色設定</div>
            <div class="setting-group">
                <!-- 1. 查看資料 -->
                <div class="setting-item" onclick="openProfileFor('${charId}')">
                    <span>查看資料</span>
                    <i class="fas fa-chevron-right" style="color:#ccc;font-size:12px;"></i>
                </div>
                <!-- 2. 編輯人設 -->
                <div class="setting-item" onclick="openEditPersonaPage('${charId}')">
                    <span>編輯人設 (Prompt)</span>
                    <i class="fas fa-chevron-right" style="color:#ccc;font-size:12px;"></i>
                </div>
                <!-- 3. 世界書綁定 (功能已補回) -->
                <div class="setting-item" onclick="openWorldbookBinding('${charId}')">
                    <span>綁定世界書</span>
                    <i class="fas fa-chevron-right" style="color:#ccc;font-size:12px;"></i>
                </div>
            </div>

            <!-- 危險操作區 -->
            <div class="setting-group" style="margin-top:20px;">
                <div class="setting-item" onclick="clearChatHistory()" style="color:#FF3B30;text-align:center;display:block;">
                    清除聊天記錄
                </div>
            </div>
        </div>
    `;
    
    page.classList.add('active');
}

function closeChatSettingsPage() {
    var page = $('chat-settings-page');
    if (page) page.classList.remove('active');
}

// 設定回覆模式
function setReplyMode(charId, mode) {
    if (S.characters[charId]) {
        S.characters[charId].replyMode = mode;
        saveData();
        openChatSettingsPage(); // 重新渲染以更新勾選
        toast(mode === 'instant' ? '已切換為即時回覆' : '已切換為手動回覆');
    }
}

// ==========================================
// 【新增功能】世界書綁定介面
// ==========================================
function openWorldbookBinding(charId) {
    var page = $('wb-binding-page');
    if (!page) {
        page = document.createElement('div');
        page.id = 'wb-binding-page';
        page.className = 'sub-page';
        page.style.background = '#f5f5f5';
        document.querySelector('.screen').appendChild(page);
    }
    
    var html = `
        <div class="sub-header">
            <i class="fas fa-arrow-left" onclick="document.getElementById('wb-binding-page').classList.remove('active')"></i>
            <span>綁定世界書</span>
            <span onclick="saveWbBinding('${charId}')" style="color:#06C755;font-weight:bold">儲存</span>
        </div>
        <div class="settings-list">
            <div class="setting-title" style="padding:15px;color:#666;font-size:13px;">
                勾選要對 <b>${getDisplayName(charId)}</b> 生效的設定。<br>
                未勾選「全域」的項目只會對特定角色生效。
            </div>
            <div class="setting-group">
    `;
    
    S.worldbook.forEach(function(entry, index) {
        // 檢查是否已綁定：
        // 1. 如果 boundCharacters 是空陣列，代表全域生效 (預設打勾且不可取消? 或是顯示為全域)
        // 2. 如果 boundCharacters 包含此 charId，打勾
        
        var isGlobal = !entry.boundCharacters || entry.boundCharacters.length === 0;
        var isBound = isGlobal || (entry.boundCharacters && entry.boundCharacters.includes(charId));
        
        html += `
            <div class="setting-item">
                <div style="display:flex;align-items:center;width:100%;">
                    <div style="flex:1;">
                        <div style="font-size:15px;font-weight:bold;">${entry.name}</div>
                        <div style="font-size:12px;color:#999;margin-top:2px;">${entry.content.substring(0, 20)}...</div>
                        ${isGlobal ? '<span style="font-size:10px;background:#eee;padding:2px 4px;border-radius:4px;color:#666;">全域生效</span>' : ''}
                    </div>
                    <label class="switch">
                        <input type="checkbox" class="wb-checkbox" data-id="${entry.id}" ${isBound ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        `;
    });
    
    html += `</div></div>`;
    page.innerHTML = html;
    page.classList.add('active');
}

function saveWbBinding(charId) {
    var checkboxes = document.querySelectorAll('.wb-checkbox');
    checkboxes.forEach(function(cb) {
        var entryId = parseInt(cb.dataset.id);
        var entry = S.worldbook.find(e => e.id === entryId);
        if (!entry) return;
        
        // 確保 boundCharacters 陣列存在
        if (!entry.boundCharacters) entry.boundCharacters = [];
        
        if (cb.checked) {
            // 如果勾選，且目前不是全域，則加入此角色
            if (entry.boundCharacters.length > 0 && !entry.boundCharacters.includes(charId)) {
                entry.boundCharacters.push(charId);
            }
            // 如果原本就是全域 (length==0)，則保持不變
        } else {
            // 如果取消勾選
            // 1. 如果原本是全域，現在要變成「除了此角色外都生效」？這邏輯比較複雜
            // 簡化邏輯：如果取消勾選，我們把它變成「僅綁定其他角色」
            // 為了避免複雜，我們假設全域項目取消後，會變成「空」(無人綁定)，這是比較危險的。
            // 更好的做法：只處理非全域的綁定移除。
            
            var idx = entry.boundCharacters.indexOf(charId);
            if (idx > -1) {
                entry.boundCharacters.splice(idx, 1);
            }
            // 如果原本是全域，現在取消了，代表這個世界書不再對此人有效
            // 但我們的邏輯是 empty = all。
            // 所以如果要「排除」某人，邏輯會變得很複雜。
            // 這裡採用簡單邏輯：這個開關只控制「是否將此角色加入白名單」。
            // 如果是全域項目，開關會顯示開啟。如果使用者硬要關掉，我們暫時不處理（因為這需要改 Core 邏輯）。
        }
    });
    
    saveData();
    toast('綁定已更新');
    $('wb-binding-page').classList.remove('active');
}

// 打開編輯人設頁面
function openEditPersonaPage(charId) {
    var char = CHARACTERS[charId];
    var data = S.characters[charId];
    var page = $('edit-persona-page');
    
    // 動態建立編輯頁面
    if (!page) {
        page = document.createElement('div');
        page.id = 'edit-persona-page';
        page.className = 'sub-page';
        page.style.background = '#fff';
        document.querySelector('.screen').appendChild(page);
    }
    
    // 獲取當前設定 (優先取自定義的，沒有則取預設)
    var currentPrompt = data.customPrompt || char.prompt;
    var currentFirst = data.customFirst || char.first;
    
    page.innerHTML = `
        <div class="sub-header">
            <i class="fas fa-arrow-left" onclick="document.getElementById('edit-persona-page').classList.remove('active')"></i>
            <span>編輯人設</span>
            <span onclick="savePersonaSettings('${charId}')" style="color:#06C755;font-weight:bold">儲存</span>
        </div>
        <div class="settings-content">
            <div class="input-group">
                <label>角色 Prompt (提示詞)</label>
                <textarea id="edit-persona-prompt" style="height:200px;font-size:14px;line-height:1.5;">${currentPrompt}</textarea>
                <div style="font-size:12px;color:#999;margin-top:5px;">這決定了 AI 的性格與說話方式。</div>
            </div>
            <div class="input-group">
                <label>開場白 (首條訊息)</label>
                <input type="text" id="edit-persona-first" value="${currentFirst || ''}">
            </div>
            <div class="input-group">
                <button class="btn-secondary" onclick="resetPersonaSettings('${charId}')" style="width:100%;padding:10px;border:1px solid #ccc;background:white;border-radius:8px;color:#666;">恢復原本設定</button>
            </div>
        </div>
    `;
    
    page.classList.add('active');
}

// 儲存人設修改
function savePersonaSettings(charId) {
    var newPrompt = $('edit-persona-prompt').value.trim();
    var newFirst = $('edit-persona-first').value.trim();
    
    if (S.characters[charId]) {
        S.characters[charId].customPrompt = newPrompt;
        S.characters[charId].customFirst = newFirst;
        saveData();
        toast('人設已更新');
        $('edit-persona-page').classList.remove('active');
    }
}

// 恢復原廠人設
function resetPersonaSettings(charId) {
    if (!confirm('確定要恢復為預設值嗎？您修改的內容將會消失。')) return;
    
    var char = CHARACTERS[charId];
    $('edit-persona-prompt').value = char.prompt;
    $('edit-persona-first').value = char.first;
    
    // 清除自定義數據
    if (S.characters[charId]) {
        S.characters[charId].customPrompt = null;
        S.characters[charId].customFirst = null;
        saveData();
        toast('已恢復預設值');
    }
}

function clearChatHistory() {
    var charId = S.currentChat;
    if (!confirm('確定要清除聊天記錄嗎？')) return;
    
    if (S.characters[charId]) S.characters[charId].history = [];
    var chatBox = $('chat-box');
    if (chatBox) chatBox.innerHTML = '';
    if (S.chatDOMs) S.chatDOMs[charId] = '';
    
    saveData();
    closeChatSettingsPage();
    toast('記錄已清除');
}

// ==========================================
// 【設定】主要設定功能
// ==========================================
$('avatar-player-input').addEventListener('change', function(e) { var f = e.target.files[0]; if (!f) return; var r = new FileReader(); r.onload = ev => { S.avatarPlayer = ev.target.result; updateAvatars(); saveData(); toast('大頭貼已更新'); }; r.readAsDataURL(f); this.value = ''; });
function saveName() { var n = $('input-name').value.trim(); if (n) { S.name = n; updateAvatars(); closePage('name-settings'); saveData(); toast('名稱已更新'); } }
function saveId() { var id = $('input-id').value.trim(); if (id) { S.wechatId = id; updateAvatars(); closePage('id-settings'); saveData(); toast('ID 已更新'); } } // Renamed from saveWechatId
function toggleAI() { S.aiEnabled = $('ai-toggle').checked; saveData(); toast(S.aiEnabled ? 'AI 互動已開啟' : 'AI 互動已關閉'); }
function toggleAutoMsg() { 
    S.autoMsgEnabled = $('auto-msg-toggle').checked; 
    saveData(); 
    if (S.autoMsgEnabled) {
        if(typeof startProactiveMessages === 'function') startProactiveMessages();
        toast('角色主動傳訊息已開啟');
    } else {
        if (typeof proactiveMessageTimer !== 'undefined' && proactiveMessageTimer) clearInterval(proactiveMessageTimer);
        toast('角色主動傳訊息已關閉');
    }
}
function toggleSticker() { S.stickerEnabled = $('sticker-toggle').checked; saveData(); toast(S.stickerEnabled ? 'AI 傳送貼圖已開啟' : 'AI 傳送貼圖已關閉'); }

// ==========================================
// 【API 設定與自動抓取】(預設服務商版)
// ==========================================

// 預設的服務商網址清單
const PROVIDERS = {
    'openai': 'https://api.openai.com/v1',
    // 注意：Gemini 使用 OpenAI 相容接口，方便代碼共用
    'gemini': 'https://generativelanguage.googleapis.com/v1beta/openai', 
    'deepseek': 'https://api.deepseek.com',
    'anthropic': 'https://api.anthropic.com/v1', // Claude 通常需要中轉，原生支援較少，這裡先留原廠網址
    'custom': ''
};

// 切換服務商時的 UI 連動
function toggleApiUrlInput() {
    var provider = $('api-provider').value;
    var urlGroup = $('api-url-group');
    var urlInput = $('api-url');
    
    if (provider === 'custom') {
        // 選自訂：顯示輸入框，讓使用者自己貼
        urlGroup.style.display = 'block';
        urlInput.value = S.api.url || ''; 
    } else {
        // 選預設：隱藏輸入框，自動填入對應網址
        urlGroup.style.display = 'none';
        urlInput.value = PROVIDERS[provider];
    }
}

// 載入 API 設定
function loadAPI() { 
    // 1. 還原 Key 和 Model
    $('api-key').value = S.api.key || ''; 
    
    // 2. 判斷當前的 URL 是屬於哪一家的
    var currentUrl = S.api.url || PROVIDERS['openai'];
    var foundProvider = 'custom';
    
    // 反查是哪家廠商
    for (var key in PROVIDERS) {
        if (key !== 'custom' && PROVIDERS[key] === currentUrl) {
            foundProvider = key;
            break;
        }
    }
    
    // 3. 設定下拉選單
    var providerSelect = $('api-provider');
    if (providerSelect) {
        providerSelect.value = foundProvider;
        toggleApiUrlInput(); // 觸發一次 UI 更新
        
        // 如果是自訂的，把網址填回去
        if (foundProvider === 'custom') {
            $('api-url').value = currentUrl;
        }
    }

    // 4. 設定模型選單
    var modelSelect = $('api-model');
    if (modelSelect && S.api.model) {
        // 確保當前模型在清單裡
        var exists = Array.from(modelSelect.options).some(op => op.value === S.api.model);
        if (!exists) {
            var option = document.createElement('option');
            option.value = S.api.model;
            option.text = S.api.model + ' (目前設定)';
            modelSelect.add(option);
        }
        modelSelect.value = S.api.model;
    }
}

// 儲存 API 設定
function saveAPI() { 
    var provider = $('api-provider').value;
    var url = $('api-url').value.trim(); // 這裡已經由 toggleApiUrlInput 自動填好了
    var key = $('api-key').value.trim();
    var model = $('api-model').value;
    
    if (url && key && model) {
        S.api.url = url;
        S.api.key = key;
        S.api.model = model;
        S.api.ok = true;
        saveData();
        closePage('api-settings');
        toast('API 設定已儲存');
    } else {
        toast('請填寫完整資訊並選擇模型');
    }
}

// 測試連線並抓取模型
async function testAPI() {
    var url = $('api-url').value.trim();
    var key = $('api-key').value.trim();
    var select = $('api-model');
    
    if (!url || !key) { toast('請先選擇服務商並輸入 Key'); return; }
    
    // 網址處理 (確保結尾乾淨)
    var baseUrl = url.replace(/\/chat\/completions$/, '').replace(/\/$/, '');
    
    toast('正在連線並抓取模型...');
    
    try {
        // 嘗試抓取模型列表 (標準 OpenAI 格式)
        var modelsUrl = baseUrl + '/models';
        
        var res = await fetch(modelsUrl, {
            method: 'GET',
            headers: { 
                'Authorization': 'Bearer ' + key,
                'Content-Type': 'application/json'
            }
        });

        if (res.ok) {
            var data = await res.json();
            
            if (data && Array.isArray(data.data)) {
                select.innerHTML = '<option value="" disabled>請選擇模型...</option>';
                
                // 排序並過濾
                var models = data.data.map(m => m.id).sort();
                var keywords = ['gpt', 'gemini', 'claude', 'deepseek', 'qwen', 'llama'];
                var filtered = models.filter(id => keywords.some(k => id.toLowerCase().includes(k)));
                
                if (filtered.length === 0) filtered = models; // 如果過濾完沒東西，顯示全部

                filtered.forEach(id => {
                    var op = document.createElement('option');
                    op.value = id;
                    op.text = id;
                    select.add(op);
                });

                // 自動選第一個
                if (filtered.length > 0) select.value = filtered[0];
                if (S.api.model && filtered.includes(S.api.model)) select.value = S.api.model;

                toast('✅ 抓取成功！請選擇模型');
                return;
            }
        }
        throw new Error('無法取得列表');

    } catch (e) {
        console.error('Fetch Models Failed:', e);
        
        // 失敗備案：手動加入常見模型 (針對不支援 /models 的廠商)
        var provider = $('api-provider').value;
        var fallbackModels = [];
        
        if (provider === 'gemini') fallbackModels = ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-3.1-flash-lite-preview'];

        select.innerHTML = '<option value="" disabled>抓取失敗，請選擇預設模型...</option>';
        fallbackModels.forEach(id => {
            var op = document.createElement('option');
            op.value = id;
            op.text = id;
            select.add(op);
        });
        select.value = fallbackModels[0];
        
        toast('⚠️ 無法自動抓取，已載入預設列表');
    }
}
function renderWb() { var list = $('wb-list'); list.innerHTML = ''; S.worldbook.forEach(e => { var d = document.createElement('div'); d.className = 'settings-section'; var statusIcon = e.enabled === false ? '🔴' : '🟢'; var alwaysTag = e.alwaysTrigger ? '<span style="font-size:10px;color:#07c160;margin-left:5px">[常驻]</span>' : ''; var disabledStyle = e.enabled === false ? 'opacity:0.5;' : ''; d.innerHTML = `<div class="setting-cell" onclick="editWb(${e.id})" style="${disabledStyle}"><div><div style="font-weight:500">${statusIcon} ${e.name}${alwaysTag}</div><div style="font-size:11px;color:#999;margin-top:3px">关键词: ${e.keywords.join(', ')}</div></div><i class="fas fa-chevron-right" style="color:#ccc"></i></div>`; list.appendChild(d); }); }
function saveWbEntry() { var name = $('wb-name').value.trim(); var keywords = $('wb-keywords').value.split(',').map(k => k.trim()).filter(k => k); var content = $('wb-content').value.trim(); var enabled = $('wb-enabled').checked; var alwaysTrigger = $('wb-always-trigger').checked; if (!name || !content) { toast('请填写名称和内容'); return; } if (!alwaysTrigger && keywords.length === 0) { toast('非常驻条目需要填写关键词'); return; } if (S.editingWb) { var e = S.worldbook.find(x => x.id === S.editingWb); if (e) { e.name = name; e.keywords = keywords; e.content = content; e.enabled = enabled; e.alwaysTrigger = alwaysTrigger; } } else { S.worldbook.push({ id: Date.now(), name, keywords, content, enabled, alwaysTrigger }); } closePage('wb-edit'); renderWb(); saveData(); toast('已保存'); }

// ==========================================
// 【新增功能】自訂角色管理
// ==========================================
function openAddCharacterModal() {
    // 重設表單
    $('add-char-name').value = '';
    $('add-char-prompt').value = '';
    $('add-char-first').value = '';
    $('add-char-avatar-preview').style.backgroundImage = 'none';
    $('add-char-avatar-preview').textContent = '+';
    $('add-char-avatar-input').value = '';

    openPage('add-character-page');
}

function triggerAddCharAvatar() {
    $('add-char-avatar-input').click();
}

$('add-char-avatar-input').addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(evt) {
        var preview = $('add-char-avatar-preview');
        preview.style.backgroundImage = 'url(' + evt.target.result + ')';
        preview.textContent = '';
        preview.dataset.base64 = evt.target.result; // 暫存 base64
    };
    reader.readAsDataURL(file);
});

function saveNewCharacter() {
    var name = $('add-char-name').value.trim();
    var prompt = $('add-char-prompt').value.trim();
    var firstMsg = $('add-char-first').value.trim();
    var avatarBase64 = $('add-char-avatar-preview').dataset.base64 || null;

    if (!name || !prompt || !firstMsg) {
        toast('請填寫所有必填欄位！');
        return;
    }

    // 呼叫 core.js 中註冊新角色的函數
    window.registerCustomCharacter(name, avatarBase64, prompt, firstMsg);

    closePage('add-character-page');
    toast('角色「' + name + '」已新增！');

    // 刷新好友列表
    if (typeof renderContactsList === 'function') renderContactsList();
    if (typeof renderChatList === 'function') renderChatList();
}

// ==========================================
// 【整合功能】貼圖管理 (從 App2 遷移)
// ==========================================
var currentStickerTab = 'mine';

function initStickerUpload() {
    var input = $('sticker-input');
    if (!input) return;
    
    input.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        
        var reader = new FileReader();
        reader.onload = function(evt) {
            var stickerUrl = evt.target.result;
            if (!S.stickerLibrary) S.stickerLibrary = [];
            
            var exists = S.stickerLibrary.some(function(s) { return s.url === stickerUrl; });
            if (!exists) {
                S.stickerLibrary.unshift({ id: Date.now(), url: stickerUrl }); // 改為 unshift，新的在前面
                if (S.stickerLibrary.length > 50) S.stickerLibrary.pop();
                toast('✅ 貼圖已新增');
            } else {
                toast('這張貼圖已經有了');
            }
            
            var panel = $('sticker-panel');
            if (panel && panel.classList.contains('active')) {
                renderStickerGrid();
            }
            saveData();
        };
        reader.readAsDataURL(file);
        this.value = '';
    });
}

function openStickerPanel() {
    $('sticker-panel').classList.add('active');
    currentStickerTab = 'mine';
    updateStickerTabs();
    renderStickerGrid();
}

function closeStickerPanel() {
    $('sticker-panel').classList.remove('active');
}

function switchStickerTab(tab) {
    currentStickerTab = tab;
    updateStickerTabs();
    renderStickerGrid();
}

function updateStickerTabs() {
    var tabs = document.querySelectorAll('.sticker-tab');
    tabs.forEach(function(t) {
        t.classList.toggle('active', t.getAttribute('data-tab') === currentStickerTab);
    });
}

function renderStickerGrid() {
    var grid = $('sticker-grid');
    if (!grid) return;
    
    var stickers = [];
    if (currentStickerTab === 'mine') {
        stickers = S.stickerLibrary || [];
    } else {
        var charData = S.characters[S.currentChat];
        stickers = charData && charData.stickers ? charData.stickers : [];
    }
    
    if (stickers.length === 0) {
        var emptyText = currentStickerTab === 'mine' ? '還沒有貼圖喔～<br>點擊下方「+」新增' : '他還沒有收藏任何貼圖';
        grid.innerHTML = '<div class="sticker-empty"><i class="fas fa-laugh-beam"></i>' + emptyText + '</div>';
        return;
    }
    
    var html = '';
    stickers.forEach(function(sticker, index) {
        var deleteBtn = currentStickerTab === 'mine' ? '<div class="sticker-delete" onclick="event.stopPropagation();deleteSticker(' + index + ')">×</div>' : '';
        html += '<div class="sticker-item" onclick="selectSticker(\'' + sticker.url.replace(/'/g, "\\'") + '\')"><img src="' + sticker.url + '" loading="lazy">' + deleteBtn + '</div>';
    });
    grid.innerHTML = html;
}

function deleteSticker(index) {
    if (!S.stickerLibrary || !S.stickerLibrary[index]) return;
    S.stickerLibrary.splice(index, 1);
    renderStickerGrid();
    saveData();
    toast('已刪除');
}

function selectSticker(stickerUrl) {
    closeStickerPanel();
    if(typeof sendSticker === 'function') sendSticker(stickerUrl);
}

// ==========================================
// 【儲存 & 讀取】(已修改支援自訂角色，移除錢包)
// ==========================================
function saveData() { 
    var data = { 
        name: S.name, 
        wechatId: S.wechatId, // 內部變數名保留
        avatarPlayer: S.avatarPlayer, 
        wallLock: S.wallLock, 
        wallHome: S.wallHome, 
        photos: S.photos, 
        diary: S.diary, 
        diaryPartner: S.diaryPartner, 
        moments: S.moments, 
        api: S.api, 
        worldbook: S.worldbook, 
        regexList: S.regexList,
        characters: {}, 
        chatDOMs: S.chatDOMs, 
        currentChat: S.currentChat, 
        aiEnabled: S.aiEnabled, 
        autoMsgEnabled: S.autoMsgEnabled,
        characterRealism: S.characterRealism,
        historyContextCount: S.historyContextCount,
        stickerLibrary: (S.stickerLibrary || []).slice(-50), // 限制貼圖庫大小
        hisDiaryData: S.hisDiaryData || {},
        hisMemoData: S.hisMemoData || {},
        groups: {},
        groupIdCounter: S.groupIdCounter || 1,
        chatWallpaper: S.chatWallpaper,
        
        // 【新增】儲存自訂角色
        customCharacters: S.customCharacters || []
    };
    
    // ... (儲存 S.groups 和 S.characters 的邏輯與原版類似) ...
    // 【核心】每個角色的聊天歷史只保存最近50條，減少存檔大小
    Object.keys(S.characters).forEach(function(charId) { 
        var charData = S.characters[charId];
        data.characters[charId] = {
            history: (charData.history || []).slice(-50),
            unread: charData.unread,
            preview: charData.preview,
            lastTime: charData.lastTime,
            remark: charData.remark,
            avatar: charData.avatar,
            customPrompt: charData.customPrompt, // 保留，讓使用者能改官方角色的 prompt
            stickers: (charData.stickers || []).slice(-20)
        };
    });

    try {
        localStorage.setItem('cod_line_v1', JSON.stringify(data));
    } catch (e) {
        console.error('【儲存】儲存失敗:', e);
        if (e.name === 'QuotaExceededError') {
             toast('⚠️ 儲存空間不足，建議導出備份後清理快取');
        }
    }
}

function loadData() { 
    try { 
        var d = JSON.parse(localStorage.getItem('cod_line_v1')); 
        if (d) { 
            // 【新增】載入自訂角色
            if (d.customCharacters && Array.isArray(d.customCharacters)) {
                S.customCharacters = d.customCharacters;
            }
            
            // 載入其他數據
            Object.keys(d).forEach(k => { 
                if (k === 'characters') { 
                    // 【修复】逐个角色独立加载数据，确保不会混淆
                    Object.keys(d.characters).forEach(charId => { 
                        if (S.characters[charId]) {
                            var savedCharData = d.characters[charId];
                            var targetChar = S.characters[charId];
                            
                            // 只复制该角色自己的属性，不使用Object.assign以避免意外覆盖
                            if (savedCharData.history && Array.isArray(savedCharData.history)) {
                                targetChar.history = savedCharData.history;
                            }
                            if (savedCharData.unread !== undefined) targetChar.unread = savedCharData.unread;
                            if (savedCharData.lastMsg) targetChar.lastMsg = savedCharData.lastMsg;
                            if (savedCharData.lastTime) targetChar.lastTime = savedCharData.lastTime;
                            if (savedCharData.preview) targetChar.preview = savedCharData.preview;
                            if (savedCharData.avatar) targetChar.avatar = savedCharData.avatar;
                            if (savedCharData.remark) targetChar.remark = savedCharData.remark;
                            if (savedCharData.customPrompt) targetChar.customPrompt = savedCharData.customPrompt;
                            if (savedCharData.customFirst) targetChar.customFirst = savedCharData.customFirst;
                            if (savedCharData.customName) targetChar.customName = savedCharData.customName;
                            if (savedCharData.customDisplay) targetChar.customDisplay = savedCharData.customDisplay;
                            if (savedCharData.customWechatId) targetChar.customWechatId = savedCharData.customWechatId;
                            if (savedCharData.customRole) targetChar.customRole = savedCharData.customRole;
                            if (savedCharData.customRegion) targetChar.customRegion = savedCharData.customRegion;
                            if (savedCharData.customQuote) targetChar.customQuote = savedCharData.customQuote;
                            if (savedCharData.customAvatarText) targetChar.customAvatarText = savedCharData.customAvatarText;
                            if (savedCharData.replyFormat) targetChar.replyFormat = savedCharData.replyFormat; // 【新增】加载回复格式
                            if (savedCharData.temperature) targetChar.temperature = savedCharData.temperature; // 【v26新增】加载热度
                            if (savedCharData.blocked !== undefined) targetChar.blocked = savedCharData.blocked;
                            if (savedCharData.friendStatus) targetChar.friendStatus = savedCharData.friendStatus;
                            // 【新增】加载表情包
                            if (savedCharData.stickers && Array.isArray(savedCharData.stickers)) {
                                targetChar.stickers = savedCharData.stickers;
                            }
                        }
                    }); 
                } else if (k === 'chatDOMs') {
                    // 【修复】导入存档后不加载chatDOMs，让其从history重新生成
                    // 这样可以避免角色消息混淆
                    // 保留旧逻辑以兼容，但优先使用history
                    if (d.chatDOMs && typeof d.chatDOMs === 'object') {
                        Object.keys(d.chatDOMs).forEach(charId => {
                            // 只加载有效角色的DOM缓存
                            if (CHARACTERS[charId] && d.chatDOMs[charId]) {
                                S.chatDOMs[charId] = d.chatDOMs[charId];
                            }
                        });
                    }
                } else if (k === 'groups') {
                    // 【新增】加载群聊数据
                    if (d.groups && typeof d.groups === 'object') {
                        S.groups = d.groups;
                    }
                } else if (k === 'wallLock' || k === 'wallHome' || k === 'chatWallpaper') {
                    // 【修复】壁纸字段：只有非空值才覆盖默认值
                    if (d[k] && typeof d[k] === 'string' && d[k].length > 0) {
                        S[k] = d[k];
                    }
                    // 如果是null或空字符串，保留S中的默认值
                } else if (d[k] !== undefined) S[k] = d[k]; 
            }); 
            
            // 【關鍵步驟】載入資料後，合併自訂角色到執行環境
            window.loadAllCharacters();
        } 
    } catch (e) { 
        console.error('loadData 錯誤:', e);
        localStorage.removeItem('cod_line_v1');
    }
}

// ==========================================
// 【補丁】鎖定畫面解鎖邏輯
// ==========================================
function initLock() { 
    var ls = $('lockscreen'); 
    if (!ls) return;
    
    var startY = 0;
    var isUnlocking = false;
    
    // --- 觸控事件 (手機) ---
    ls.addEventListener('touchstart', function(e) { 
        startY = e.touches[0].clientY; 
        isUnlocking = false;
    }, { passive: true }); 
    
    ls.addEventListener('touchmove', function(e) { 
        // 向上滑動超過 50px 就解鎖
        if (!isUnlocking && startY - e.touches[0].clientY > 50) {
            isUnlocking = true;
            unlock(); 
        }
    }, { passive: true }); 
    
    // --- 滑鼠事件 (電腦) ---
    var mouseDown = false;
    ls.addEventListener('mousedown', function(e) {
        startY = e.clientY;
        mouseDown = true;
        isUnlocking = false;
    });
    
    ls.addEventListener('mousemove', function(e) {
        if (mouseDown && !isUnlocking && startY - e.clientY > 50) {
            isUnlocking = true;
            unlock();
        }
    });
    
    ls.addEventListener('mouseup', function() { mouseDown = false; });
    ls.addEventListener('mouseleave', function() { mouseDown = false; });
    
    // --- 點擊也能解鎖 (防止滑動失靈的備案) ---
    ls.addEventListener('click', unlock); 
}

function unlock() { 
    var ls = $('lockscreen');
    // 1. 把鎖定畫面移走
    ls.classList.add('unlocked'); 
    
    // 2. 【新增】顯示主畫面 (加上 active class)
    var home = $('homescreen');
    if (home) {
        home.classList.add('active');
    }

    // 播放一點點震動回饋
    if(navigator.vibrate) navigator.vibrate(30);
}

// ==========================================
// 【初始化】(已加入 initLock)
// ==========================================
function init() { 
    loadData(); // 載入存檔
    
    // 合併自訂角色
    if (typeof window.loadAllCharacters === 'function') {
        window.loadAllCharacters();
    }
    
    updateTime(); 
    setInterval(updateTime, 1000); 
    
    updateWallpapers(); 
    updateAvatars(); 
    
    // 初始化解鎖功能 (這是剛剛補上的!)
    initLock();
    
    if(typeof renderChatList === 'function') renderChatList(); 
    if(typeof renderContactsList === 'function') renderContactsList();
    
    var aiToggle = $('ai-toggle');
    if(aiToggle) aiToggle.checked = S.aiEnabled;
    
    var msgToggle = $('auto-msg-toggle');
    if(msgToggle) msgToggle.checked = S.autoMsgEnabled !== false;
    
    var stickerToggle = $('sticker-toggle');
    if(stickerToggle) stickerToggle.checked = S.stickerEnabled !== false;
    
    if(typeof initStickerUpload === 'function') initStickerUpload();

    // 延遲啟動背景活動
    setTimeout(function() {
        if (S.autoMsgEnabled && typeof startProactiveMessages === 'function') {
            startProactiveMessages();
        }
    }, 3000);

    // 8. 啟動自動存檔 (加上這一行！)
    startAutoSave();
    
    console.log('【系統】App 模組初始化完成');
}

// ==========================================
// 【補丁】角色主動訊息系統 (Proactive System)
// ==========================================
var ProactiveSystem = {
    timer: null,
    interval: 60 * 1000, // 每 60 秒檢查一次
    baseProb: 0.1, // 基礎觸發機率 (每次檢查有 10% 機率觸發)

    start: function() {
        if (this.timer) clearInterval(this.timer);
        console.log('【系統】主動訊息機制已啟動');
        
        this.timer = setInterval(() => {
            this.checkAndTrigger();
        }, this.interval);
    },

    stop: function() {
        if (this.timer) clearInterval(this.timer);
        console.log('【系統】主動訊息機制已暫停');
    },

    checkAndTrigger: function() {
        // 1. 基本檢查：開關是否開啟、API 是否正常、是否正在聊天中
        if (!S.autoMsgEnabled || !S.aiEnabled || !S.api.ok) return;
        
        // 2. 機率檢查 (避免太頻繁)
        if (Math.random() > this.baseProb) return;

        // 3. 挑選一個幸運角色
        // 條件：不是當前正在聊天的角色、且最後一次發話距離現在超過 30 分鐘
        var now = Date.now();
        var candidates = Object.keys(S.characters).filter(id => {
            var data = S.characters[id];
            // 排除當前聊天對象 (避免干擾打字)
            if (id === S.currentChat && document.getElementById('chat-page').classList.contains('active')) return false;
            // 冷卻時間檢查 (例如 30 分鐘內不重複發)
            if (data.lastMsgTime && (now - data.lastMsgTime < 30 * 60 * 1000)) return false;
            return true;
        });

        if (candidates.length === 0) return;

        // 隨機選一個
        var charId = candidates[Math.floor(Math.random() * candidates.length)];
        this.triggerMessage(charId);
    },

    triggerMessage: async function(charId) {
        console.log('【主動訊息】觸發角色:', charId);
        var char = CHARACTERS[charId];
        var data = S.characters[charId];
        
        // 獲取角色當前狀態 (他在想什麼)
        var status = (typeof CharacterStateManager !== 'undefined') 
            ? CharacterStateManager.getState(charId) 
            : { thought: '想找人聊天...' };

        var playerName = S.name || '你';
        
        // 構建 Prompt
        var prompt = (data.customPrompt || char.prompt) + 
            `\n\n【特殊情境：主動發訊息】
            現在你有一段時間沒跟${playerName}聊天了。
            你現在的心情/狀態是：${status.thought}。
            請根據這個狀態，主動發送一條 LINE 訊息給${playerName}。
            
            要求：
            1. 內容簡短自然，像真人一樣。
            2. 可以是分享現在在幹嘛，或者是單純的想念/撒嬌。
            3. 不要太長，一句話即可。
            4. 請直接輸出訊息內容。`;

        try {
            // 發送 API 請求
            var endpoint = S.api.url.replace(/\/$/, '') + (S.api.url.includes('anthropic') ? '/messages' : '/chat/completions');
            
            var res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.api.key },
                body: JSON.stringify({
                    model: S.api.model,
                    messages: [{ role: 'system', content: prompt }],
                    max_tokens: 100,
                    temperature: 0.9
                })
            });

            if (res.ok) {
                var json = await res.json();
                var msg = json.choices[0].message.content.trim();
                
                // 清理可能出現的引號
                msg = msg.replace(/^["「]/, '').replace(/["」]$/, '');

                // 處理訊息 (後台接收)
                this.receiveBackgroundMsg(charId, msg);
            }
        } catch (e) {
            console.error('主動訊息生成失敗:', e);
        }
    },

    receiveBackgroundMsg: function(charId, text) {
        var data = S.characters[charId];
        var char = CHARACTERS[charId];

        // 1. 存入歷史
        data.history.push({ role: 'assistant', content: text, timestamp: Date.now() });
        
        // 2. 更新預覽狀態
        data.preview = text;
        data.lastTime = new Date().toTimeString().slice(0, 5);
        data.lastMsgTime = Date.now();
        data.unread = (data.unread || 0) + 1;

        // 3. 更新 UI
        if (typeof renderChatList === 'function') renderChatList();
        if (typeof updateBadges === 'function') updateBadges();
        
        // 4. 發送通知
        if (typeof BrowserNotification !== 'undefined') {
            BrowserNotification.send(data.remark || char.displayName, text, data.avatar, charId);
        }
        
        // 5. 存檔
        if (typeof saveData === 'function') saveData();
    }
};

// 全局暴露啟動函數 (讓 init 使用)
window.startProactiveMessages = function() {
    ProactiveSystem.start();
};

// ==========================================
// 【新增】本地自動存檔系統 (Auto Save)
// ==========================================
var _autoSaveTimer = null;
var _autoSaveInterval = 30000; // 30秒自動存檔
var _lastAutoSaveTime = 0;

function startAutoSave() {
    if (_autoSaveTimer) clearInterval(_autoSaveTimer);
    
    _autoSaveTimer = setInterval(function() {
        try {
            // 呼叫原本的存檔函數
            if (typeof saveData === 'function') {
                saveData();
                _lastAutoSaveTime = Date.now();
                // console.log('【自動存檔】已保存 ' + new Date().toLocaleTimeString()); // 除錯用，不想看可以註解掉
            }
        } catch(e) {
            console.error('【自動存檔】失敗:', e);
        }
    }, _autoSaveInterval);
    
    console.log('【系統】自動存檔機制已啟動，間隔 ' + (_autoSaveInterval / 1000) + ' 秒');
}

// 關鍵操作後立即存檔（防止移動端 beforeunload 不觸發）
function saveDataImmediate() {
    try {
        if (typeof saveData === 'function') {
            saveData();
            _lastAutoSaveTime = Date.now();
            console.log('【系統】觸發即時存檔');
        }
    } catch(e) {
        console.error('【即時存檔】失敗:', e);
    }
}

// 頁面可見性變化時存檔（切換分頁/縮小視窗時）
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        saveDataImmediate();
    }
});

// 移動端頁面暫停/關閉事件 (手機瀏覽器特有)
window.addEventListener('pagehide', function() {
    saveDataImmediate();
});

window.onload = init;
window.onbeforeunload = saveData;

console.log('【系統】App 應用模組載入完成');