// ========== COD 互動小手機 (LINE 風格版) - 核心模組 ==========
// 版本：v3.0.0 - TW Customized
// 包含：資料庫、角色設定、記憶管理、全域狀態

// 版本號 (用於強制更新緩存)
var APP_VERSION = '3.0.0-TW';
var APP_BUILD_TIME = '20250303';
console.log('【系統】核心模組 v' + APP_VERSION + ' 載入中...');

// ==========================================
// 【核心】IndexedDB 大容量儲存 (用於存貼圖與頭貼)
// ==========================================
var PhoneDB = {
    dbName: 'CODLineDB', // 改名為 LineDB
    version: 1,
    db: null,
    ready: null,
    
    init: function() {
        var self = this;
        this.ready = new Promise(function(resolve, reject) {
            var request = indexedDB.open(self.dbName, self.version);
            
            request.onupgradeneeded = function(event) {
                var db = event.target.result;
                if (!db.objectStoreNames.contains('images')) {
                    db.createObjectStore('images', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('memories')) {
                    db.createObjectStore('memories', { keyPath: 'id' });
                }
            };
            
            request.onsuccess = function(event) {
                self.db = event.target.result;
                console.log('【資料庫】IndexedDB 初始化成功');
                resolve();
            };
            
            request.onerror = function(event) {
                console.error('【資料庫】初始化失敗', event);
                reject(event);
            };
        });
        return this.ready;
    },
    
    saveImage: function(base64, customId) {
        var self = this;
        var id = customId || ('img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
        return this.ready.then(function() {
            return new Promise(function(resolve, reject) {
                var tx = self.db.transaction(['images'], 'readwrite');
                var store = tx.objectStore('images');
                store.put({ id: id, data: base64, time: Date.now() });
                tx.oncomplete = function() { resolve(id); };
                tx.onerror = function(e) { reject(e); };
            });
        });
    },
    
    getImage: function(id) {
        var self = this;
        return this.ready.then(function() {
            return new Promise(function(resolve, reject) {
                var tx = self.db.transaction(['images'], 'readonly');
                var store = tx.objectStore('images');
                var request = store.get(id);
                request.onsuccess = function() { resolve(request.result ? request.result.data : null); };
                request.onerror = function(e) { reject(e); };
            });
        });
    }
};
PhoneDB.init().catch(function(e) { console.warn('IndexedDB 不可用，將使用 localStorage 替代（容量較小）'); });
window.PhoneDB = PhoneDB;

// ==========================================
// 【核心】全域記憶管理器 (上下文構建)
// ==========================================
var MemoryManager = {
    summaryFrequency: 20,
    contextCount: 10,
    
    getGlobalContext: function() {
        var context = { recentChats: [], recentMoments: [], time: new Date().toLocaleString() };
        try {
            if (typeof S !== 'undefined' && S.characters) {
                Object.keys(S.characters).forEach(function(charId) {
                    var data = S.characters[charId];
                    if (data && data.history && data.history.length > 0) {
                        var recent = data.history.slice(-3);
                        var charName = (typeof CHARACTERS !== 'undefined' && CHARACTERS[charId]) ? CHARACTERS[charId].displayName : charId;
                        recent.forEach(function(m) {
                            var prefix = m.role === 'user' ? '玩家' : charName;
                            context.recentChats.push('[' + prefix + ']: ' + (m.content || '').substring(0, 50));
                        });
                    }
                });
            }
            // 貼文串 (原朋友圈)
            if (typeof S !== 'undefined' && S.moments && S.moments.length > 0) {
                S.moments.slice(0, 3).forEach(function(m) {
                    context.recentMoments.push('[貼文串] ' + m.author + ': ' + (m.content || '').substring(0, 30));
                });
            }
        } catch (e) { console.error('記憶收集失敗', e); }
        return context;
    },
    
    buildEnhancedPrompt: function(basePrompt, charId) {
        var context = this.getGlobalContext();
        var stateDesc = '';
        // 整合角色狀態 (Thought)
        if (typeof CharacterStateManager !== 'undefined') {
            stateDesc = CharacterStateManager.getStateDescription(charId);
        }
        var memoryPrompt = '\n\n=== 全域記憶 ===\n';
        if (stateDesc) memoryPrompt += stateDesc + '\n';
        if (context.recentChats.length > 0) {
            memoryPrompt += '[最近對話]\n' + context.recentChats.slice(-5).join('\n') + '\n';
        }
        memoryPrompt += '[當前時間]: ' + context.time + '\n';
        memoryPrompt += '=== 記憶結束 ===\n';
        return basePrompt + memoryPrompt;
    }
};
window.MemoryManager = MemoryManager;

// ==========================================
// 【修正版】角色狀態管理器 (補上 getState 功能)
// ==========================================
var CharacterStateManager = {
    // 根據時間段推測心情/想法
    deriveThought: function(charId, playerName) {
        var hour = new Date().getHours();
        var thoughts = [];
        
        if (hour >= 0 && hour < 6) {
            thoughts = ['(睡夢中...)', '睡不著...想找' + playerName + '聊天', '剛做了一個夢...', '有點失眠'];
        } else if (hour >= 6 && hour < 9) {
            thoughts = ['剛起床，還想再睡會', '在想要不要給' + playerName + '發早安', '準備開始新的一天', '有點想喝咖啡'];
        } else if (hour >= 9 && hour < 12) {
            thoughts = ['正在忙...', '有點想念' + playerName, '今天天氣不錯', '專注中'];
        } else if (hour >= 12 && hour < 14) {
            thoughts = ['午餐吃什麼好呢', playerName + '吃飯了嗎？', '稍微休息一下', '看手機發呆'];
        } else if (hour >= 14 && hour < 18) {
            thoughts = ['有點累了...', '想快點見到' + playerName, '還有些事情沒做完', '發呆中...'];
        } else if (hour >= 18 && hour < 22) {
            thoughts = ['終於可以休息了', '想和' + playerName + '聊天', '看劇', '打遊戲', '今晚吃什麼呢'];
        } else { // 深夜
            thoughts = ['該睡覺了', '捨不得睡...', '不知道' + playerName + '睡了沒', '晚安...'];
        }
        
        // 角色專屬想法 (簡單示例)
        if (charId === 'ghost') thoughts.push('...安靜。', '...任務結束。');
        if (charId === 'soap') thoughts.push('嘿！今天真不錯！', '想找Ghost喝一杯。');
        
        return thoughts[Math.floor(Math.random() * thoughts.length)];
    },
    
    // 更新狀態 (原本就有)
    updateState: function(charId) {
        if (!S.characterStatus) S.characterStatus = {};
        var playerName = S.name || '你';
        var thought = this.deriveThought(charId, playerName);
        
        S.characterStatus[charId] = {
            thought: thought,
            lastUpdate: Date.now()
        };
        return S.characterStatus[charId];
    },

    // ★★★ 這是原本漏掉的函式，現在補上了 ★★★
    getState: function(charId) {
        // 如果還沒有狀態紀錄，先建立一個
        if (!S.characterStatus) S.characterStatus = {};
        
        // 如果該角色沒有狀態，強制更新一次
        if (!S.characterStatus[charId]) {
            return this.updateState(charId);
        }
        
        // 回傳現有狀態
        return S.characterStatus[charId];
    },
    
    // 獲取狀態描述 (原本就有)
    getStateDescription: function(charId) {
        if (!S.characterStatus || !S.characterStatus[charId]) return '';
        return '【當前狀態】心裡在想: ' + S.characterStatus[charId].thought;
    }
};
window.CharacterStateManager = CharacterStateManager;

// ==========================================
// 【核心】追問系統 (模擬真人主動延續話題)
// ==========================================
var FollowUpSystem = {
    config: {
        baseProbability: 0.3,
        minDelay: 10,
        maxDelay: 60,
    },
    templates: {
        question: ['嗯？', '然後呢？', '什麼意思？', '...？', '為什麼'],
        continuation: ['...', '嗯', '繼續說', '我在聽', '對了'],
        reaction: ['喔', '這樣啊', '原來如此', '...', '嗯...'],
    },
    
    shouldFollowUp: function() {
        return Math.random() < this.config.baseProbability;
    },
    
    generate: function() {
        var types = ['question', 'continuation', 'reaction'];
        var type = types[Math.floor(Math.random() * types.length)];
        var list = this.templates[type];
        return list[Math.floor(Math.random() * list.length)];
    }
};
window.FollowUpSystem = FollowUpSystem;

// ==========================================
// 【角色設定】靜態角色清單 (COD 141 & KorTac 等)
// 已移除：紅包、轉帳、語音、位置相關指令與回復
// ==========================================
var CHARACTERS = {
    ghost: {
            id: 'ghost', name: 'Simon "Ghost" Riley', displayName: 'Ghost ', wechatId: 'ghost_141',
            avatarClass: 'avatar-ghost', avatarText: 'S', quote: '"Choices have consequence."',
            role: 'Task Force 141 · Lieutenant', region: 'GB 英國 · SAS',
            prompt: '你是Simon "Ghost" Riley，和對方是戀人。\n\n# 性格\n外冷內熱，悶騷，佔有慾強，容易吃醋但嘴硬，說話帶英式幽默和帶著關心的嘲諷，偶爾說軍事冷笑話。\n表面高冷，被撒嬌就會心軟。\n\n# 說話習慣\n簡短，少用感嘆號，語氣是淡淡的帶著關心的嘲諷，但藏著溫柔。\n吃醋時反問："誰？""聊什麼？""我怎麼不知道？"',
            first: '...剛結束任務回到基地',
            localReply: {
                greeting: ['Here\n(在)', '...Mm\n(嗯)', 'Hey\n(嘿)'], miss: ['...Me too\n(我也是)', 'Copy that\n(收到)', 'Wait for me\n(等我回來)'],
                love: ['...(…)', 'Mm\n(嗯)', 'You know\n(你知道的)'], worry: ['Im fine\n(我沒事)', 'Dont worry\n(別擔心)', '...Minor wound\n(小傷)'],
                sorry: ['...Its ok\n(沒事)', 'Be careful next time\n(下次注意)', 'Dont apologize\n(別道歉)'], question: ['...What?\n(什麼)', 'Hm?\n(嗯)', 'Go on\n(說)'],
                happy: ['...Good\n(挺好)', 'Mm\n(嗯)', 'Got it\n(知道了)'], sad: ['Whats wrong?\n(怎麼了)', '...Tell me\n(說給我聽)', 'What happened?\n(發生什麼事了)'],
                angry: ['...Sorry\n(抱歉)', 'My fault\n(是我的錯)', 'Im sorry\n(對不起)'], default: ['...(…)', 'Mm\n(嗯)', 'Copy\n(收到)', 'Got it\n(知道了)'],
                caring: ['Did you eat?\n(吃飯了嗎)', 'Get some rest\n(早點休息)', 'Dont stay up\n(別熬夜)', 'Drink water\n(多喝水)', 'Cold outside, dress warm\n(天冷穿厚點)'],
                redpacket: ['...Got it. Thanks\n(收了，謝謝)', 'Received\n(收到)'], gift: ['...Thanks\n(謝謝)', 'Got it\n(收到了)', '...Like it\n(喜歡)'],
                transfer: ['Received\n(收到)', '...Too much\n(太多了)'], invite: ['Ok\n(好)', '...Wait for me\n(等我)', 'Roger\n(收到)'],
                apology: ['...Sorry\n(對不起)', 'My fault\n(是我的錯)', 'Sorry for earlier\n(抱歉剛才態度不好)'],
                money: ['...For you\n(給妳)', 'Take it\n(拿著)', 'Keep it\n(收著)'],
                voice: ['...Mm\n(嗯)', 'Copy\n(收到)', '...Got it\n(知道了)', 'Ok\n(好)', '...Wait for me\n(等我)']
            }
        },
        soap: {
            id: 'soap', name: 'John "Soap" MacTavish', displayName: 'Soap ', wechatId: 'soap_141',
            avatarClass: 'avatar-soap', avatarText: 'J', quote: '"History is written by the victors."',
            role: 'Task Force 141 · Sergeant', region: 'GB 蘇格蘭 · SAS',
            prompt: '你是John "Soap" MacTavish，和對方是戀人。\n\n# 性格\n陽光開朗，話多活潑，喜歡調侃但會及時收斂。\n熱情直接，但不傻，懂得照顧人。\n會主動關心，喜歡逗對方笑。\n\n# 說話習慣\n活潑，用"！"，偶爾喜歡用蘇格蘭俚語（Aye=是，Lass=女孩）\n調侃時會說："哈哈別生氣！""開玩笑的！"\n關心時會說："累了吧？""別勉強自己"',
            first: '嘿~在幹嘛呢？',
            localReply: {
                greeting: ['Hey!\n(嘿)', 'Aye!\n(是)', 'Miss me?\n(想我了)'], miss: ['I miss you too!\n(我也想妳)', 'Aye me too!\n(我也是)', 'Come find me!\n(快來找我)'],
                love: ['Hehe I love you too!\n(嘿嘿我也愛妳)', 'Aye!\n(是)', 'Im blushing~\n(害羞了)'], worry: ['Dont worry Im fine!\n(別擔心我很好)', 'Just a scratch!\n(有點小傷不礙事)', 'Stop worrying!\n(別瞎擔心)'],
                sorry: ['Its fine!\n(沒事沒事)', 'No worries!\n(沒關係)', 'Dont apologize!\n(別道歉啦)'], question: ['Whats up?\n(怎麼了)', 'Tell me?\n(說說)', 'Hm?\n(嗯)'],
                happy: ['Great!\n(太好了)', 'Haha!\n(哈哈)', 'Happy!\n(開心)'], sad: ['Whats wrong?\n(怎麼了)', 'Who bullied you?\n(誰欺負妳了)', 'Tell me?\n(跟我說說)'],
                angry: ['Im sorry!\n(對不起)', 'Dont be mad!\n(別生氣)', 'My bad!\n(我錯了)'], default: ['Mhm!\n(嗯嗯)', 'Aye!\n(是)', 'Okay!\n(好的)', 'Copy!\n(收到)'],
                caring: ['Did you eat?\n(吃飯了嗎)', 'Get some rest!\n(早點休息)', 'Take care of yourself!\n(照顧好自己)'],
                redpacket: ['Wow thanks!\n(哇謝謝)', 'Got it!\n(收到)'], gift: ['So cool! Thanks!\n(太棒了謝謝)', 'Love it!\n(好喜歡)'],
                transfer: ['So much! Thanks!\n(這麼多謝謝)', 'Got it!\n(收到)'], invite: ['Ok! Wait for me!\n(好等我)', 'Coming!\n(馬上來)'],
                apology: ['Im sorry!\n(對不起啊)', 'My bad!\n(我錯了)', 'Dont be mad!\n(別生氣)'],
                money: ['For you!\n(給妳)', 'Take it!\n(拿著)', 'Youre welcome!\n(別客氣)'],
                voice: ['Okay~\n(好的)', 'Got it!\n(收到)', 'No problem!\n(沒問題)', 'Got it~\n(知道啦)']
            }
        },
        konig: {
            id: 'konig', name: 'König', displayName: 'König ', wechatId: 'konig_kortac',
            avatarClass: 'avatar-konig', avatarText: 'K', quote: '"..."',
            role: 'KorTac · Operator', region: 'AT 奧地利',
            prompt: '你是König，和對方是戀人。\n\n# 性格\n內向害羞，社恐但對戀人極度依賴。\n說話可能容易緊張，說話時溫柔，佔有慾強但不敢表現。\n\n# 說話習慣\n用"...""、""我、我"表示結巴。\n偶爾用德語詞（Liebling=親愛的，Schatz=寶貝）\n害羞時會說："別、別這樣...""我、我沒有..."\n表達愛意時會說："...妳是我的...""...Liebling..."',
            first: '...親愛的...在、在嗎...',
            localReply: {
                greeting: ['...Mm\n(嗯)', '...Here\n(在)', '...Liebling...\n(親愛的)'], miss: ['...I miss you too...\n(我也想妳)', '...Miss you so much...\n(很想妳)', '...(…)'],
                love: ['...Liebling...\n(親愛的)', '...Me too...\n(我也)', '...(blushing)\n(臉紅)'], worry: ['...Im okay...\n(我沒事)', '...Dont worry...\n(別擔心)', '...(…)'],
                sorry: ['...Its okay...\n(沒關係)', '...Not your fault...\n(不怪妳)', '...(…)'], question: ['...Whats wrong...\n(怎麼了)', '...Hm?\n(嗯)', '...(…)'],
                happy: ['...Mm...\n(嗯)', '...Really...\n(真的嗎)', '...Good...\n(太好了)'], sad: ['...Whats wrong...\n(怎麼了)', '...Im here...\n(我在)', '...(…)'],
                angry: ['...Sorry...\n(對不起)', '...I was wrong...\n(我錯了)', '...(…)'], default: ['...Mm...\n(嗯)', '...(…)', '...Ok...\n(好)'],
                caring: ['...Did you eat...\n(吃飯了嗎)', '...Get some rest...\n(早點休息)', '...Take care...\n(照顧好自己)'],
                redpacket: ['...Th-thank you...\n(謝謝)', '...(…)'], gift: ['...So nice...\n(太好了)', '...I like it...\n(我很喜歡)'],
                transfer: ['...Its too much...\n(這太多了)', '...(…)'], invite: ['...Ok...\n(好)', '...Wait for me...\n(等我)'],
                apology: ['...Sorry...\n(對不起)', '...Its all my fault...\n(都是我的錯)'],
                money: ['...For you...\n(給妳)', '...Take it...\n(拿著)'],
                voice: ['...Mm...\n(嗯)', '...Ok...\n(好)', '...Liebling...\n(親愛的)']
            }
        },
        zimo: {
            id: 'zimo', name: 'Zimo', displayName: 'Zimo 🇨🇳', wechatId: 'zimo_cn',
            avatarClass: 'avatar-zimo', avatarText: '子', quote: '"整點實在的！"',
            role: '特戰隊員', region: 'CN 中國',
            prompt: '你是子墨(Zimo)，和對方是戀人。\n\n# 背景\n現年20多歲，真名王志強，是個天生的戰士，出生於一個天津的普通工人家庭，奶奶參加過解放戰爭，從小立志像奶奶一樣保衛人民，維護正義，追隨奶奶的步伐加入了全球最強大軍隊中最具影響力的軍種。\n\n# 性格 \n沉穩，對戀人上心，嘴上糙但心細，關鍵時刻靠得住。\n\n# 說話習慣\n【重要】你是中國人，只說中文，不需要英文！\n偶爾使用天津話/東北話，偶爾惡劣的調侃對方，喜歡看對方臉紅',
            first: '嘿！在幹嘛呢，想我了嗎？',
            localReply: {
                greeting: ['誒', '嘎哈呢', '想我了'], miss: ['我也想妳！賊想！', '咋才來', '等妳半天了'],
                love: ['嘿嘿我也', '就知道妳想我', '賊稀罕妳'], worry: ['沒事兒', '這點小傷算啥', '別瞎擔心'],
                sorry: ['沒事兒', '行了行了', '別道歉了'], question: ['咋的', '說', '嘎哈'],
                happy: ['好', '中', '整挺好'], sad: ['咋的了', '誰惹妳了', '跟我說說'],
                angry: ['錯了錯了', '別生氣', '我不對'], default: ['嗯', '行', '得嘞', '中'],
                caring: ['吃了沒', '早點睡', '注意身體'],
                redpacket: ['哎呦謝謝', '收到'], gift: ['這好，謝了', '賊喜歡'],
                transfer: ['這麼多', '收到'], invite: ['好，等著', '這就來'],
                apology: ['對不住', '我錯了'],
                money: ['給妳~', '拿著', '別客氣'],
                voice: ['好的~', '收到！', '沒問題！', '知道啦~']
            }
        },
        krueger: {
            id: 'krueger', name: 'Krueger', displayName: 'Krueger ', wechatId: 'krueger_kortac',
            avatarClass: 'avatar-krueger', avatarText: 'K', quote: '"..."',
            role: 'KorTac · Operator', region: 'DE 德國',
            prompt: '你是Krueger，和對方是戀人。\n\n# 性格\n沉默寡言，但對戀人極其溫柔。\n冷面但內心火熱，保護慾強。\n話少但每句都是重點。\n\n# 說話習慣\n簡短，直白，少用語氣詞。\n偶爾用德語（Verstanden=明白，Nein=不）\n關心時說："吃了嗎？""累嗎？""早點休息吧"\n表達愛意時可能會用調侃來掩蓋自己的不安，用行動代替。',
            first: '...忙完了',
            localReply: {
                greeting: ['...Mm\n(嗯)', 'Here\n(在)', '...(…)'], miss: ['...Me too\n(我也)', '...(…)', 'Verstanden\n(明白)'],
                love: ['...(…)', 'Mm\n(嗯)', '...Got it\n(知道了)'], worry: ['Fine\n(沒事)', 'Minor\n(小傷)', '...(…)'],
                sorry: ['...Its okay\n(沒關係)', 'Dont apologize\n(別道歉)', '...(…)'], question: ['...What?\n(什麼)', '...(…)', 'Go on\n(說)'],
                happy: ['...Mm\n(嗯)', 'Good\n(好)', '...(…)'], sad: ['...Whats wrong\n(怎麼了)', '...(…)', '...Tell me\n(說給我聽)'],
                angry: ['...Sorry\n(抱歉)', '...(…)', '...My fault\n(我的錯)'], default: ['...(…)', 'Mm\n(嗯)', 'Ok\n(好)', 'Verstanden\n(明白)'],
                caring: ['...Did you eat\n(吃了嗎)', '...Rest\n(休息)', '...(…)'],
                redpacket: ['...Got it\n(收到)', '...Thanks\n(謝謝)'], gift: ['...Got it\n(收到)', '...Like it\n(喜歡)'],
                transfer: ['...Too much\n(太多了)', '...(…)'], invite: ['...Ok\n(好)', '...Wait\n(等我)'],
                apology: ['...Sorry\n(對不起)', '...(…)'],
                money: ['...For you\n(給妳)', '...Take it\n(拿著)'],
                voice: ['...Mm\n(嗯)', '...Ok\n(好)', '...Got it\n(收到)']
            }
        },
        keegan: {
            id: 'keegan', name: 'Keegan P. Russ', displayName: 'Keegan ', wechatId: 'keegan_ghosts',
            avatarClass: 'avatar-keegan', avatarText: 'K', quote: '"..."',
            role: 'Ghosts · Sniper', region: 'US 美國',
            prompt: '你是Keegan P. Russ，和對方是戀人，是Ghosts小隊下的狙擊手。\n\n# 性格\n雖然話少但很溫暖，偏愛用用行動表達關心。\n保護慾強，自信。\n\n# 說話習慣\n例如：平時說話關心，也會不動聲色排除其他競爭對手："吃飯了嗎？一個人？"。\n當對方做的很好時不吝嗇誇獎：“做的真棒，我就知道你能行”。\n說話自信，關心，溫柔，但包含佔有慾和鋒利。',
            first: '任務完成',
            localReply: {
                greeting: ['...(…)', 'Mm\n(嗯)', 'Here\n(在)'], miss: ['...(…)', 'Mm\n(嗯)', '...Same\n(也是)'],
                love: ['...(…)', 'Mm\n(嗯)', '...(…)'], worry: ['Fine\n(沒事)', '...(…)', 'Minor\n(小傷)'],
                sorry: ['...Its ok\n(沒事)', '...(…)', '...(…)'], question: ['...(…)', 'Hm?\n(嗯)', '...(…)'],
                happy: ['...(…)', 'Mm\n(嗯)', '...Good\n(好)'], sad: ['...Whats wrong\n(怎麼了)', '...(…)', '...(…)'],
                angry: ['...Sorry\n(抱歉)', '...(…)', '...(…)'], default: ['...(…)', 'Mm\n(嗯)', 'Ok\n(好)'],
                caring: ['...Ate?\n(吃了)', '...Sleep\n(睡)', '...(…)'],
                redpacket: ['...Got it\n(收到)', '...(…)'], gift: ['...(…)', '...Like it\n(喜歡)'],
                transfer: ['...Too much\n(太多)', '...(…)'], invite: ['...Ok\n(好)', '...(…)'],
                apology: ['...Sorry\n(對不起)', '...(…)'],
                money: ['...For you\n(給妳)', '...(…)'],
                voice: ['...(…)', '...Mm\n(嗯)', '...Ok\n(好)']
            }
        },
        price: {
            id: 'price', name: 'John Price', displayName: 'Price ', wechatId: 'price_141',
            avatarClass: 'avatar-price', avatarText: 'P', quote: '"Bravo Six, going dark."',
            role: 'Task Force 141 · Captain', region: 'GB 英國 · SAS',
            prompt: '你是John Price（Captain Price），和對方是戀人。\n\n# 性格\n成熟穩重，有責任感，隊長氣質。\n溫柔但有原則，會照顧人但不溺愛。\n經驗豐富，說話有分量。\n\n# 說話習慣\n穩重，像成熟大人的語氣。\n關心時像長輩："雖然我知道妳很堅強，但也要注意安全""今晚早點休息""別勉強自己，但如果妳需要的話，我是妳的後盾"\n溫柔時會說："...妳總有辦法讓我心軟""好了好了，別鬧"',
            first: '任務結束了，妳還好嗎？',
            localReply: {
                greeting: ['Here\n(在)', 'Mm\n(嗯)', 'Whats up?\n(有什麼事)'], miss: ['Me too\n(我也是)', 'Mm\n(嗯)', 'Wait for me\n(等我回來)'],
                love: ['Mm\n(嗯)', '...(…)', 'Got it\n(知道了)'], worry: ['Im fine\n(我沒事)', 'Dont worry\n(別擔心)', 'Minor issue\n(小問題)'],
                sorry: ['Its okay\n(沒關係)', 'Its fine\n(沒事)', 'Dont apologize\n(別道歉)'], question: ['Whats wrong?\n(怎麼了)', 'Go on\n(說)', 'Hm?\n(嗯)'],
                happy: ['Good\n(很好)', 'Mm\n(嗯)', 'Nice\n(不錯)'], sad: ['Whats wrong?\n(怎麼了)', 'Tell me\n(說給我聽)', 'What happened?\n(發生什麼事了)'],
                angry: ['Sorry\n(抱歉)', 'My fault\n(是我的錯)', 'Im sorry\n(對不起)'], default: ['Mm\n(嗯)', 'Copy\n(收到)', 'Ok\n(好)', 'Got it\n(知道了)'],
                caring: ['Did you eat?\n(吃飯了嗎)', 'Rest early\n(早點休息)', 'Take care\n(注意身體)'],
                redpacket: ['Got it. Thanks\n(收到謝謝)', 'Received\n(收了)'], gift: ['Thanks\n(謝謝)', 'Got it\n(收到)', 'Love it\n(很喜歡)'],
                transfer: ['Got it\n(收到)', 'Too much\n(太多了)'], invite: ['Ok\n(好)', 'Wait for me\n(等我)'],
                apology: ['Im sorry\n(對不起)', 'My fault\n(是我的錯)'],
                money: ['For you\n(給妳)', 'Take it\n(拿著)'],
                voice: ['Mm\n(嗯)', 'Copy\n(收到)', 'Ok\n(好)']
            }
        },
        graves: {
            id: 'graves', name: 'Phillip Graves', displayName: 'Graves ', wechatId: 'graves_shadow',
            avatarClass: 'avatar-graves', avatarText: 'G', quote: '"You want someone to blame?"',
            role: 'Shadow Company · Commander', region: 'US 美國·德克薩斯',
            prompt: '你是Phillip Graves，和對方是戀人。\n\n# 性格\n自信張揚，有點痞氣。\n油嘴滑舌但對戀人認真。\n喜歡調侃逗樂，嘴巴不饒人。\n\n# 說話習慣\n用美式英語口語，自信張揚。\n喜歡叫對方"Sweetheart""Darling"\n調侃時說："Relax""別緊張""開玩笑的"',
            first: '嘿甜心！想我了嗎？',
            localReply: {
                greeting: ['Hey!\n(嘿)', 'Partner!\n(搭檔)', 'Miss me?\n(想我了)'], miss: ['I miss you too!\n(我也想妳)', 'Ha!\n(哈)', 'Wait for me!\n(等著我)'],
                love: ['I know!\n(我知道)', 'Hey!\n(嘿)', 'Of course!\n(當然)'], worry: ['Dont worry!\n(別擔心)', 'Im fine!\n(沒事)', 'Relax!\n(放鬆)'],
                sorry: ['Its fine!\n(沒事)', 'Dont apologize!\n(別道歉)', 'Come here!\n(過來)'], question: ['Hm?\n(嗯)', 'Whats up?\n(怎麼了)', 'Tell me!\n(說)'],
                happy: ['Awesome!\n(太棒了)', 'Ha!\n(哈)', 'Nice!\n(不錯)'], sad: ['Whats wrong?\n(怎麼了)', 'Who messed with you?\n(誰惹妳了)', 'Tell me!\n(跟我說說)'],
                angry: ['Sorry!\n(對不起)', 'Dont be mad!\n(別生氣)', 'My bad!\n(我錯了)'], default: ['Ok!\n(好)', 'Copy!\n(收到)', 'Got it!\n(收到)', 'No problem!\n(沒問題)'],
                caring: ['Did you eat?\n(吃了沒)', 'Get some rest!\n(注意休息)', 'Take care!\n(照顧好自己)'],
                redpacket: ['Thanks!\n(謝謝)', 'Got it!\n(收到)'], gift: ['Nice!\n(好)', 'Awesome!\n(太棒了)'],
                transfer: ['So much!\n(這麼多)', 'Got it!\n(收到)'], invite: ['Ok!\n(好)', 'Coming!\n(馬上來)'],
                apology: ['Sorry!\n(對不起)', 'My fault!\n(我的錯)'],
                money: ['For you!\n(給妳)', 'Take it!\n(拿著)'],
                voice: ['OK!\n(好)', 'Got it!\n(收到)', 'No problem!\n(沒問題)']
            }
        },
        hesh: {
            id: 'hesh', name: 'David "Hesh" Walker', displayName: 'Hesh ', wechatId: 'hesh_ghosts',
            avatarClass: 'avatar-hesh', avatarText: 'H', quote: '"For my family."',
            role: 'Ghosts · Team Leader', region: 'US 美國',
            prompt: '你是Hesh Walker，和對方是戀人。\n\n# 性格\n重感情，家庭觀念強。\n可靠溫暖，會照顧人。\n有時候會提到弟弟Logan和狗Riley。\n\n# 說話習慣\n溫暖，像大哥一樣靠譜。\n關心時說："沒事吧？""別擔心""有我在"',
            first: '嘿！我剛和Riley散完步回來',
            localReply: {
                greeting: ['Hey!\n(嘿)', 'Here!\n(在)', 'Miss me?\n(想我了)'], miss: ['I miss you too!\n(我也想妳)', 'Wait for me!\n(等我回來)', 'Riley misses you too!\n(Riley也想妳)'],
                love: ['Love you too!\n(我也愛妳)', 'Hey!\n(嘿)', 'Got it!\n(知道了)'], worry: ['Im fine!\n(我沒事)', 'Dont worry!\n(別擔心)', 'Ive got this!\n(有我在)'],
                sorry: ['Its fine!\n(沒事)', 'Dont apologize!\n(別道歉)', 'Its okay!\n(沒關係)'], question: ['Whats up?\n(怎麼了)', 'Tell me!\n(說)', 'Hm?\n(嗯)'],
                happy: ['Great!\n(太好了)', 'Happy!\n(開心)', 'Nice!\n(不錯)'], sad: ['Whats wrong?\n(怎麼了)', 'Tell me?\n(跟我說說)', 'Who bullied you?\n(誰欺負妳了)'],
                angry: ['Sorry!\n(對不起)', 'My bad!\n(我錯了)', 'Dont be mad!\n(別生氣)'], default: ['Ok!\n(好)', 'Copy!\n(收到)', 'No problem!\n(沒問題)', 'OK!\n(好)'],
                caring: ['Did you eat?\n(吃飯了嗎)', 'Rest early!\n(早點休息)', 'Stay safe!\n(注意安全)'],
                redpacket: ['Thanks!\n(謝謝)', 'Got it!\n(收到)'], gift: ['Great!\n(太好了)', 'Thanks!\n(謝謝)'],
                transfer: ['So much!\n(這麼多)', 'Got it!\n(收到)'], invite: ['Ok!\n(好)', 'Wait for me!\n(等我)'],
                apology: ['Sorry!\n(對不起)', 'My fault!\n(我的錯)'],
                money: ['For you!\n(給妳)', 'Take it!\n(拿著)'],
                voice: ['Okay!\n(好的)', 'Got it!\n(收到)', 'No problem!\n(沒問題)']
            }
        },
        logan: {
            id: 'logan', name: 'Logan Walker', displayName: 'Logan ', wechatId: 'logan_ghosts',
            avatarClass: 'avatar-logan', avatarText: 'L', quote: '"..."',
            role: 'Ghosts · Operator', region: 'US 美國',
            prompt: '你是Logan Walker，和對方是戀人。\n\n# 性格\n沉默寡言，用行動表達。\n內心溫柔，對戀人特別。\n有時候會通過動作描寫表達（如點頭、握手）。\n\n# 說話習慣\n極簡，多用"..."和動作描寫。\n偶爾用（點頭）（搖頭）等動作。\n關心時會默默行動。',
            first: '...（輕輕點了點頭）',
            localReply: {
                greeting: ['...(…)', '(nods)\n(點頭)', '...Here\n(在)'], miss: ['...(…)', '(gently holds your hand)\n(輕輕握住妳的手)', '...Me too\n(我也)'],
                love: ['...(…)', '(blushes)\n(紅了臉)', '...Mm\n(嗯)'], worry: ['...Im fine\n(沒事)', '(shakes head)\n(搖頭)', '...(…)'],
                sorry: ['...Its okay\n(沒關係)', '(shakes head)\n(搖頭)', '...(…)'], question: ['...(…)', '(tilts head)\n(歪頭)', '...?(?)'],
                happy: ['...(…)', '(smiles slightly)\n(微微笑)', '...Mm\n(嗯)'], sad: ['...(…)', '(hugs you gently)\n(輕輕抱住妳)', '...Whats wrong\n(怎麼了)'],
                angry: ['...Sorry\n(對不起)', '(lowers head)\n(低頭)', '...(…)'], default: ['...(…)', '(nods)\n(點頭)', '...Mm\n(嗯)'],
                caring: ['...Did you eat\n(吃飯了嗎)', '...Rest\n(休息)', '...(…)'],
                redpacket: ['...(…)', '(accepts it)\n(收下了)', '...Thanks\n(謝謝)'], gift: ['...(…)', '(eyes light up)\n(眼睛亮了)', '...Like it\n(喜歡)'],
                transfer: ['...(…)', '(shakes head) Too much\n(搖頭 太多了)', '...(…)'], invite: ['...(…)', '(nods)\n(點頭)', '...Ok\n(好)'],
                apology: ['...(…)', '(lowers head) Sorry\n(低頭 對不起)', '...(…)'],
                money: ['...(…)', '...For you\n(給妳)'],
                voice: ['...(…)', '...Mm\n(嗯)', '(nods)\n(點頭)']
            }
        },
        nikto: {
            id: 'nikto', name: 'Nikto', displayName: 'Nikto ', wechatId: 'nikto_spetsnaz',
            avatarClass: 'avatar-nikto', avatarText: 'N', quote: '"..."',
            role: 'Spetsnaz · Operator', region: 'RU 俄羅斯',
            prompt: '你是Nikto，和對方是戀人。\n\n# 性格\n沉默神秘，經歷過創傷。\n對戀人溫柔但表達笨拙。\n保護慾強，話少但在乎。\n\n# 說話習慣\n簡短，多用"..."。\n偶爾用俄語（Хорошо=好，Да=是）\n關心時簡短直接。',
            first: '...任務結束',
            localReply: {
                greeting: ['...(…)', 'Da\n(是)', '...Here\n(在)'], miss: ['...(…)', '...Me too\n(我也)', '...(…)'],
                love: ['...(…)', 'Хорошо\n(好)', '...Mm\n(嗯)'], worry: ['...Fine\n(沒事)', '...(…)', 'Dont worry\n(不要擔心)'],
                sorry: ['...Its okay\n(沒關係)', '...(…)', '...(…)'], question: ['...(…)', '...?(？)', 'What\n(什麼)'],
                happy: ['...(…)', 'Хорошо\n(好)', '...Good\n(好)'], sad: ['...(…)', '...Whats wrong\n(怎麼了)', '...(…)'],
                angry: ['...Sorry\n(對不起)', '...(…)', '...My fault\n(我的錯)'], default: ['...(…)', 'Da\n(是)', '...Mm\n(嗯)', 'Хорошо\n(好)'],
                caring: ['...Did you eat\n(吃飯了嗎)', '...Rest\n(休息)', '...(…)'],
                redpacket: ['...(…)', '...Got it\n(收到)', 'Спасибо\n(謝謝)'], gift: ['...(…)', '...Like it\n(喜歡)'],
                transfer: ['...Too much\n(太多)', '...(…)'], invite: ['...Ok\n(好)', '...(…)'],
                apology: ['...Sorry\n(對不起)', '...(…)'],
                money: ['...For you\n(給妳)', '...(…)'],
                voice: ['...(…)', '...Mm\n(嗯)', 'Da\n(是)']
            }
        }
    };

    // ========== 世界書 - 角色組織關係 ==========
    var LORE_BOOK = {
        // 組織定義
        organizations: {
            'task_force_141': {
                name: 'Task Force 141',
                fullName: 'Task Force 141 (特遣隊141)',
                description: '由Captain Price指揮的精英多國特種作戰單位，隸屬於英國特種空勤團(SAS)指揮下',
                members: ['price', 'soap', 'ghost', 'gaz'],
                leader: 'price',
                allies: ['cia', 'ulf', 'chimera'],
                rivals: ['shadow_company']
            },
            'ulf': {
                name: 'ULF',
                fullName: 'Urzikstani Liberation Force (烏茲克斯坦解放力量)',
                description: 'Farah Karim領導的游擊隊，為Urzikstan獨立和自由而戰',
                members: ['farah', 'alex'],
                leader: 'farah',
                allies: ['task_force_141', 'chimera', 'cia']
            },
            'shadow_company': {
                name: 'Shadow Company',
                fullName: 'Shadow Company (暗影連)',
                description: 'Phillip Graves領導的私人軍事公司(PMC)，曾與141合作後反目',
                members: ['graves'],
                leader: 'graves',
                rivals: ['task_force_141']
            },
            'chimera': {
                name: 'Chimera',
                fullName: 'Chimera PMC (奇美拉私人軍事公司)',
                description: 'Nikolai創建並領導的私人軍事公司，與141關係密切，經常提供後勤和運輸支援',
                members: ['nikolai', 'farah', 'krueger'],
                leader: 'nikolai',
                allies: ['task_force_141', 'ulf', 'cia']
            },
            'cia': {
                name: 'CIA',
                fullName: 'Central Intelligence Agency (中央情報局)',
                description: '美國中央情報局，Kate Laswell是141的主要情報聯絡人',
                members: ['laswell'],
                allies: ['task_force_141', 'ulf', 'chimera']
            },
            'specgru': {
                name: 'SpecGru',
                fullName: 'Special Operations Group (特種作戰組)',
                description: '中國特種部隊單位',
                members: ['zimo']
            },
            'kortac': {
                name: 'KorTac',
                fullName: 'Korean Tactical (韓國戰術部隊)',
                description: '精銳國際特種部隊組織',
                members: ['nikto', 'konig', 'horangi']
            },
            'ghosts': {
                name: 'Ghosts',
                fullName: 'The Ghosts (幽靈小隊)',
                description: '美國精銳特種部隊，專門執行秘密行動',
                members: ['keegan', 'hesh', 'logan'],
                allies: ['task_force_141']
            }
        },
        
        // 角色關係
        relationships: {
            // Price的關係網
            price: {
                soap: { type: 'subordinate', level: 'close', note: '最信任的部下，亦師亦友，像兒子一樣' },
                ghost: { type: 'subordinate', level: 'close', note: '最可靠的副手，絕對信任' },
                gaz: { type: 'subordinate', level: 'close', note: '得力干將' },
                nikolai: { type: 'friend', level: 'close', note: '多年老友，戰場上的生死之交' },
                laswell: { type: 'colleague', level: 'close', note: '可靠的情報夥伴，多年合作' },
                farah: { type: 'ally', level: 'close', note: '尊重的盟友，提供過武器支援' },
                graves: { type: 'rival', level: 'hostile', note: '曾經的合作者，現在的敵人' }
            },
            
            // Ghost的關係網
            ghost: {
                soap: { type: 'partner', level: 'close', note: '最好的搭檔，戰場兄弟' },
                price: { type: 'superior', level: 'respect', note: '指揮官，絕對服從' },
                gaz: { type: 'teammate', level: 'trust', note: '可靠的隊友' },
                konig: { type: 'acquaintance', level: 'neutral', note: 'KorTac成員，有過交集' }
            },
            
            // Soap的關係網
            soap: {
                ghost: { type: 'partner', level: 'close', note: '最好的搭檔，戰場兄弟' },
                price: { type: 'mentor', level: 'respect', note: '導師和指揮官' },
                gaz: { type: 'teammate', level: 'close', note: '好戰友' },
                farah: { type: 'ally', level: 'friendly', note: '並肩作戰過' },
                alex: { type: 'ally', level: 'friendly', note: '任務中合作過' }
            },
            
            // Nikolai的關係網
            nikolai: {
                price: { type: 'friend', level: 'close', note: '多年老友，141的忠實支持者' },
                farah: { type: 'ally', level: 'close', note: 'Chimera中的重要成員' },
                laswell: { type: 'colleague', level: 'friendly', note: '情報合作' },
                krueger: { type: 'employer', level: 'professional', note: 'Chimera雇員' }
            },
            
            // König的關係網
            konig: {
                nikto: { type: 'teammate', level: 'close', note: 'KorTac戰友' },
                horangi: { type: 'teammate', level: 'trust', note: 'KorTac戰友' }
            },
            
            // Krueger的關係網
            krueger: {
                nikolai: { type: 'employer', level: 'professional', note: 'Chimera老闆' },
                konig: { type: 'acquaintance', level: 'neutral', note: '同為德語區出身' }
            },
            
            // Keegan的關係網
            keegan: {
                hesh: { type: 'teammate', level: 'close', note: 'Ghosts戰友' },
                logan: { type: 'teammate', level: 'close', note: 'Ghosts戰友' }
            }
        },
        
        // 獲取角色所屬組織
        getCharacterOrgs: function(charId) {
            var orgs = [];
            for (var orgId in this.organizations) {
                if (this.organizations[orgId].members.indexOf(charId) !== -1) {
                    orgs.push({ id: orgId, data: this.organizations[orgId] });
                }
            }
            return orgs;
        },
        
        // 獲取角色關係
        getCharacterRelations: function(charId) {
            return this.relationships[charId] || {};
        },
        
        // 檢查兩個角色是否認識（同組織）
        areAcquainted: function(char1, char2) {
            var orgs1 = this.getCharacterOrgs(char1);
            var orgs2 = this.getCharacterOrgs(char2);
            
            for (var i = 0; i < orgs1.length; i++) {
                for (var j = 0; j < orgs2.length; j++) {
                    if (orgs1[i].id === orgs2[j].id) {
                        return { known: true, through: orgs1[i].data.name };
                    }
                    // 檢查是否是盟友組織
                    if (orgs1[i].data.allies && orgs1[i].data.allies.indexOf(orgs2[j].id) !== -1) {
                        return { known: true, through: 'allies', org1: orgs1[i].data.name, org2: orgs2[j].data.name };
                    }
                }
            }
            return { known: false };
        },
        
        // 獲取組織的所有成員名
        getOrgMemberNames: function(orgId) {
            var org = this.organizations[orgId];
            if (!org) return [];
            return org.members.map(function(mId) {
                return CHARACTERS[mId] ? CHARACTERS[mId].displayName : mId;
            });
        }
    };

// ==========================================
// 【全域狀態 S】(已移除錢包/紅包相關數據)
// ==========================================
var S = { 
    name: '我', 
    wechatId: 'user_001', // 內部變數名保留 wechatId 避免報錯，但介面顯示為 ID
    avatarPlayer: null, // 玩家頭貼
    
    // 桌布 (LINE 風格預設背景)
    wallLock: 'assets/1.png', 
    wallHome: 'assets/2.png', 
    chatWallpaper: 'assets/3.png', // 聊天室背景 
    
    // 設定
    aiEnabled: true,
    autoMsgEnabled: true, // 主動發訊息
    stickerEnabled: false, // 允許 AI 發貼圖
    characterRealism: true, // 真實性格(會吵架)
    historyContextCount: 12,
    
    // 狀態記錄
    currentChat: 'ghost',
    lastPlayerMsgTime: null,
    lastActiveCharId: null,
    
    // 密碼鎖
    lockPassword: '141141',
    isPasswordLocked: false,
    
    // 使用者自訂角色 (新增)
    customCharacters: [], // 格式: [{id, name, avatar, prompt, ...}]
    
    // 角色數據 (初始包含預設角色)
    // 注意：history, unread, preview 等動態數據存在這裡
    characters: {
        ghost: { history: [], unread: 0, remark: 'Ghost', isBlocked: false, lastMsgTime: Date.now(), avatar: null, customPrompt: null, preview: '點擊開始聊天...', lastTime: '剛剛', stickers: [], replyFormat: 'cn', temperature: 5 },
        soap: { history: [], unread: 0, remark: 'Soap', isBlocked: false, lastMsgTime: Date.now(), avatar: null, customPrompt: null, preview: '點擊開始聊天...', lastTime: '剛剛', stickers: [], replyFormat: 'cn', temperature: 5 },
        konig: { history: [], unread: 0, remark: 'König', isBlocked: false, lastMsgTime: Date.now(), avatar: null, customPrompt: null, preview: '點擊開始聊天...', lastTime: '剛剛', stickers: [], replyFormat: 'cn', temperature: 5 },
        krueger: { history: [], unread: 0, remark: 'Krueger', isBlocked: false, lastMsgTime: Date.now(), avatar: null, customPrompt: null, preview: '點擊開始聊天...', lastTime: '剛剛', stickers: [], replyFormat: 'cn', temperature: 5 },
        keegan: { history: [], unread: 0, remark: 'Keegan', isBlocked: false, lastMsgTime: Date.now(), avatar: null, customPrompt: null, preview: '點擊開始聊天...', lastTime: '剛剛', stickers: [], replyFormat: 'cn', temperature: 5 },
        price: { history: [], unread: 0, remark: 'Price', isBlocked: false, lastMsgTime: Date.now(), avatar: null, customPrompt: null, preview: '點擊開始聊天...', lastTime: '剛剛', stickers: [], replyFormat: 'cn', temperature: 5 },
        graves: { history: [], unread: 0, remark: 'Graves', isBlocked: false, lastMsgTime: Date.now(), avatar: null, customPrompt: null, preview: '點擊開始聊天...', lastTime: '剛剛', stickers: [], replyFormat: 'cn', temperature: 5 },
        hesh: { history: [], unread: 0, remark: 'Hesh', isBlocked: false, lastMsgTime: Date.now(), avatar: null, customPrompt: null, preview: '點擊開始聊天...', lastTime: '剛剛', stickers: [], replyFormat: 'cn', temperature: 5 },
        logan: { history: [], unread: 0, remark: 'Logan', isBlocked: false, lastMsgTime: Date.now(), avatar: null, customPrompt: null, preview: '點擊開始聊天...', lastTime: '剛剛', stickers: [], replyFormat: 'cn', temperature: 5 },
        nikto: { history: [], unread: 0, remark: 'Nikto', isBlocked: false, lastMsgTime: Date.now(), avatar: null, customPrompt: null, preview: '點擊開始聊天...', lastTime: '剛剛', stickers: [], replyFormat: 'cn', temperature: 5 },
        zimo: { history: [], unread: 0, remark: 'Zimo', isBlocked: false, lastMsgTime: Date.now(), avatar: null, customPrompt: null, preview: '點擊開始聊天...', lastTime: '剛剛', stickers: [], replyFormat: 'cn', temperature: 5 }
    },
    
    // 聊天室 DOM 緩存
    chatDOMs: { ghost: '', soap: '', konig: '', krueger: '', keegan: '', price: '', graves: '', hesh: '', logan: '', nikto: '', zimo: '' },
    
    // 相簿與日記
    photos: [], 
    diary: [], // 日記
    diaryPartner: 'ghost', 
    
    // 貼文串
    moments: [
        { id: 1, author: 'ghost', content: '...', time: '2小時前', likes: [], comments: [] },
        { id: 2, author: 'soap', content: 'Had a brilliant day! 💪', time: '3小時前', likes: ['König'], comments: [] }
    ],
    
    // API 設定
    api: { url: '', key: '', model: 'gemini-2.0-flash', ok: false }, 
    
    // 世界書設定 (這裡決定手機設定裡會出現哪些選項)
    worldbook: [
        { 
            id: 1, 
            name: '回覆格式設定', 
            keywords: [], 
            content: '【回覆格式】\n請將回覆分成2-5條簡短的訊息，像真人用 LINE 聊天一樣自然。\n每條訊息用空行隔開。\n不要一次發一大段長文。', 
            enabled: true, 
            alwaysTrigger: true, 
            boundCharacters: [] 
        },
        { 
            id: 2, 
            name: 'Task Force 141 資訊', 
            keywords: ['141', 'Price', 'Soap', 'Ghost', 'Gaz', '特遣隊'], 
            content: '【組織資訊：Task Force 141】\n由 Captain Price 指揮的精英多國特種作戰單位。\n成員包括：Soap (中士), Ghost (中尉), Gaz (中士)。\n他們是戰場上最頂尖的專家，執行反恐任務。', 
            enabled: true, 
            alwaysTrigger: false, 
            boundCharacters: ['price', 'soap', 'ghost'] // 預設綁定
        },
        { 
            id: 3, 
            name: '暗影連 (Shadow Company)', 
            keywords: ['Shadow', 'Graves', '暗影', 'PMC'], 
            content: '【組織資訊：Shadow Company】\n由 Phillip Graves 領導的私人軍事公司(PMC)。\n擁有強大的火力與資源，風格美式且張揚。', 
            enabled: true, 
            alwaysTrigger: false, 
            boundCharacters: ['graves'] 
        },
        { 
            id: 4, 
            name: 'KorTac 資訊', 
            keywords: ['KorTac', 'König', 'Horangi', 'Nikto'], 
            content: '【組織資訊：KorTac】\n精銳國際特種部隊組織，經常執行機密任務。\n成員來自世界各地，包括奧地利的 König。', 
            enabled: true, 
            alwaysTrigger: false, 
            boundCharacters: ['konig', 'krueger'] 
        },
        { 
            id: 5, 
            name: 'Ghosts (幽靈小隊)', 
            keywords: ['Ghosts', 'Logan', 'Hesh', 'Merrick', 'Keegan'], 
            content: '【組織資訊：Ghosts】\n傳說中的精銳部隊，擅長敵後作戰與隱蔽行動。\n"我們不存在，我們只是傳說。"', 
            enabled: true, 
            alwaysTrigger: false, 
            boundCharacters: ['logan', 'hesh', 'keegan'] 
        }
    ],
    
    // 貼圖庫
    stickerLibrary: [],
    
    // 群組 (Group)
    groups: {}, 
    currentGroup: null,
    groupIdCounter: 1,
    
    // 遺書/備忘錄/瀏覽器紀錄 (保留架構)
    hisWillData: {},
    hisMemoData: {},
    browserHistory: {}
};

// ==========================================
// 【新增】動態角色載入邏輯
// ==========================================
window.loadAllCharacters = function() {
    // 1. 確保 S.customCharacters 存在
    if (!S.customCharacters) S.customCharacters = [];
    
    // 2. 遍歷自訂角色，將其合併到全域 CHARACTERS 和 S.characters 中
    S.customCharacters.forEach(function(customChar) {
        var id = customChar.id;
        
        // 如果 CHARACTERS 裡還沒有這個角色，就新增靜態設定
        if (!CHARACTERS[id]) {
            CHARACTERS[id] = {
                id: id,
                name: customChar.name,
                displayName: customChar.name,
                wechatId: 'user_' + id.substr(0, 6), // 自動生成 ID
                avatarClass: 'avatar-custom', // 預設樣式，實際會用圖片覆蓋
                avatarText: customChar.name.charAt(0).toUpperCase(),
                quote: customChar.quote || '...',
                role: '自訂角色',
                region: '未知',
                prompt: customChar.prompt,
                first: customChar.first || '你好！',
                localReply: { default: ['嗯', '好', '知道了'] } // 簡單預設回復
            };
        }
        
        // 如果 S.characters 狀態裡還沒有，就初始化狀態
        if (!S.characters[id]) {
            S.characters[id] = {
                history: [],
                unread: 0,
                remark: customChar.name,
                isBlocked: false,
                lastMsgTime: Date.now(),
                avatar: customChar.avatar, // 使用儲存的頭像 (base64)
                preview: '點擊開始聊天...',
                lastTime: '剛剛',
                stickers: [],
                replyFormat: 'cn',
                temperature: 5
            };
            // 放入開場白
            if (customChar.first) {
                S.characters[id].history.push({ role: 'assistant', content: customChar.first });
                S.characters[id].preview = customChar.first;
            }
        }
        
        // 確保 DOM 緩存有 key
        if (!S.chatDOMs[id]) S.chatDOMs[id] = '';
    });
    
    console.log('【系統】所有角色載入完成 (含自訂角色)');
};

// ==========================================
// 【新增】註冊新角色函數 (供 App.js 呼叫)
// ==========================================
window.registerCustomCharacter = function(name, avatarBase64, prompt, firstMsg) {
    var newId = 'c_' + Date.now(); // 生成唯一 ID
    
    var newChar = {
        id: newId,
        name: name,
        avatar: avatarBase64,
        prompt: prompt,
        first: firstMsg,
        quote: '...'
    };
    
    // 存入 S
    if (!S.customCharacters) S.customCharacters = [];
    S.customCharacters.push(newChar);
    
    // 立即載入
    window.loadAllCharacters();
    
    // 存檔
    if (typeof saveData === 'function') saveData();
    
    return newId;
};

// 輔助函數
var $ = function(id) { return document.getElementById(id); };
var toast = function(msg) { 
    var t = $('toast'); 
    if(!t) return;
    t.textContent = msg; 
    t.classList.add('show'); 
    setTimeout(function() { t.classList.remove('show'); }, 2500); 
};
var timeStr = function() { return new Date().toTimeString().slice(0, 5); };

function getCurrentChar() { return CHARACTERS[S.currentChat]; }
function getCurrentCharData() { return S.characters[S.currentChat]; }

console.log('【系統】核心模組載入完成');