// ★★★ すするanki0.02.42 - ソーシャル機能（ランキング・フレンド・チャット・成績比較） ★★★
// このファイル：フレンド管理、デイリーランキング、チャット、成績共有設定

// ★ グローバル変数の安全な初期化（追加）
window.shareStats = localStorage.getItem('shareStats') === 'true';

// ★ 本日のデイリーランキング表示
async function loadDailyRanking() {
  const listDiv = document.getElementById('rankingList');
  if (!currentUser) { listDiv.innerHTML = 'ログインしてください'; return; }
  const d = getTodayStr();
  try {
    listDiv.innerHTML = '(読み込み中...)';
    const snap = await firestore.collection('susuru_anki_daily_scores').where('date', '==', d).get();
    
    if(snap.empty) { listDiv.innerHTML = 'まだ今日のスコアがありません。あなたが1番乗りです！'; return; }
    
    let scores = [];
    snap.forEach(doc => scores.push(doc.data()));
    scores.sort((a, b) => (b.score || 0) - (a.score || 0));
    scores = scores.slice(0, 10);
    
    listDiv.innerHTML = '';
    let rank = 1;
    scores.forEach(data => {
      listDiv.innerHTML += `<div><span style="display:inline-block; width:24px; color:var(--warn); font-weight:bold;">${rank}</span>: ${escapeHtml(data.name)} <span style="color:var(--success); font-weight:bold;">(${data.score}問)</span></div>`;
      rank++;
    });
  } catch(e) {
    console.error(e);
    listDiv.innerHTML = '<span style="color:var(--danger)">ランキング取得エラー (通信状況等をご確認ください)</span>';
  }
}

// ★ 自分のUIDをクリップボードにコピー
function copyMyUid() {
  const uid = document.getElementById('txtMyUid').value; 
  if (!uid) return alert("ログインが必要です。");
  navigator.clipboard.writeText(uid).then(() => alert("✅ UIDをコピーしました！"));
}

// ★ フレンド追加（双方向登録）
async function addAppFriend() {
  const fUid = document.getElementById('txtAddFriendUid').value.trim();
  if (!fUid) return alert("UIDを入力してください。"); 
  if (!currentUser) return alert("ログインが必要です。"); 
  if (fUid === currentUser.uid) return alert("自分自身は登録できません。");
  try {
    await firestore.collection('susuru_anki_profiles').doc(currentUser.uid).set({ friends: firebase.firestore.FieldValue.arrayUnion(fUid) }, { merge: true });
    await firestore.collection('susuru_anki_profiles').doc(fUid).set({ friends: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) }, { merge: true });
    document.getElementById('txtAddFriendUid').value = ''; 
    alert("✅ フレンドを追加しました！"); 
    loadAppFriends();
  } catch (e) { alert("⚠️ フレンド追加に失敗しました。ルールの確認を。"); }
}

// ★ フレンド一覧を読み込んで表示
async function loadAppFriends() {
  const listDiv = document.getElementById('appFriendsList'); 
  listDiv.innerHTML = '<p style="color:var(--text3); font-size:0.8rem; text-align:center;">読み込み中...</p>';
  if (!currentUser) { listDiv.innerHTML = '<p style="color:var(--danger); font-size:0.85rem; text-align:center;">ログインしてください</p>'; return; }
  try {
    const myProfileSnap = await firestore.collection('susuru_anki_profiles').doc(currentUser.uid).get();
    const friends = myProfileSnap.exists ? (myProfileSnap.data().friends || []) : [];
    if (friends.length === 0) { listDiv.innerHTML = '<p style="color:var(--text3); font-size:0.85rem; text-align:center;">フレンドはいません。</p>'; return; }
    listDiv.innerHTML = '';
    for (const fUid of friends) {
      const fProfSnap = await firestore.collection('susuru_anki_profiles').doc(fUid).get();
      const fName = fProfSnap.exists ? fProfSnap.data().displayName : '未登録ユーザー';
      const div = document.createElement('div'); div.className = 'achieve-row';
      div.innerHTML = `<div class="achieve-label">👤 ${escapeHtml(fName)}</div><button class="btn" style="width:auto; padding:6px 12px; font-size:0.8rem;" onclick="openChat('${fUid}', '${escapeHtml(fName)}')">💬</button>`;
      listDiv.appendChild(div);
    }
  } catch (e) { listDiv.innerHTML = '<p style="color:var(--danger); font-size:0.8rem; text-align:center;">エラーが発生しました。</p>'; }
}

let currentChatUnsubscribe = null, currentChatFriendUid = null;
function getChatId(uid1, uid2) { return [uid1, uid2].sort().join('_'); }

function openChat(friendUid, friendName) {
  document.getElementById('friendsListArea').style.display = 'none'; 
  document.getElementById('chatArea').style.display = 'flex'; 
  document.getElementById('chatWithTitle').innerText = friendName + " とのチャット";
  currentChatFriendUid = friendUid; 
  const chatId = getChatId(currentUser.uid, friendUid); 
  const msgBox = document.getElementById('chatMessages'); 
  msgBox.innerHTML = '履歴を取得中...';
  
  if (currentChatUnsubscribe) currentChatUnsubscribe();
  currentChatUnsubscribe = firestore.collection('susuru_anki_chats').doc(chatId).collection('messages').orderBy('timestamp', 'asc').onSnapshot(snap => {
    msgBox.innerHTML = ''; 
    if (snap.empty) { msgBox.innerHTML = '<div style="color:var(--text3); text-align:center; font-size:0.8rem;">まだメッセージがありません。</div>'; }
    snap.forEach(doc => {
      const data = doc.data(); const isMe = data.senderId === currentUser.uid;
      const wrap = document.createElement('div'); wrap.style.cssText = `display:flex; flex-direction:column; max-width:80%; ${isMe ? 'align-self:flex-end;' : 'align-self:flex-start;'}`;
      const bubble = document.createElement('div'); bubble.style.cssText = `padding:10px 14px; border-radius:14px; font-size:0.9rem; word-break:break-all; ${isMe ? 'background:var(--primary); color:#fff; border-bottom-right-radius:2px;' : 'background:var(--bg3); border:1px solid var(--border); color:var(--text); border-bottom-left-radius:2px;'}`;
      bubble.innerText = data.text; wrap.appendChild(bubble); msgBox.appendChild(wrap);
    });
    msgBox.scrollTop = msgBox.scrollHeight;
  });
}

function closeChat() { 
  if (currentChatUnsubscribe) { currentChatUnsubscribe(); currentChatUnsubscribe = null; } 
  document.getElementById('chatArea').style.display = 'none'; 
  document.getElementById('friendsListArea').style.display = 'flex'; 
  currentChatFriendUid = null; 
}

async function sendChatMessage() {
  const input = document.getElementById('txtChatInput'); 
  const text = input.value.trim(); 
  if (!text || !currentChatFriendUid) return;
  const chatId = getChatId(currentUser.uid, currentChatFriendUid);
  try { 
    await firestore.collection('susuru_anki_chats').doc(chatId).collection('messages').add({ text: text, senderId: currentUser.uid, timestamp: firebase.firestore.FieldValue.serverTimestamp() }); 
    input.value = ''; 
  } catch (e) { alert("⚠️ エラーが発生しました。"); }
}

// ★ カテゴリー別ランキング
async function loadCategoryRanking(catName) {
  const listDiv = document.getElementById('categoryRankingList');
  if (!currentUser) { listDiv.innerHTML = 'ログインしてください'; return; }
  const d = getTodayStr();
  try {
    listDiv.innerHTML = '(読み込み中...)';
    const snap = await firestore.collection('susuru_anki_category_scores').where('date', '==', d).where('category', '==', catName).get();
    
    if(snap.empty) { listDiv.innerHTML = `このカテゴリーはまだスコアがありません。`; return; }
    
    let scores = [];
    snap.forEach(doc => scores.push(doc.data()));
    scores.sort((a, b) => (b.score || 0) - (a.score || 0));
    scores = scores.slice(0, 10);
    
    listDiv.innerHTML = '';
    let rank = 1;
    scores.forEach(data => {
      listDiv.innerHTML += `<div class="card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding:10px;"><span style="color:var(--warn); font-weight:bold; font-size:1.1rem;">#${rank}</span><span>${escapeHtml(data.name || 'Unknown')}</span><span style="color:var(--success); font-weight:bold;">${data.score || 0}問</span></div>`;
      rank++;
    });
  } catch(e) {
    console.error(e);
    listDiv.innerHTML = '<span style="color:var(--danger)">ランキング取得エラー</span>';
  }
}

// ★ 修正ポイント：shareStats が未定義でもクラッシュしないように安全に判定
async function recordCategoryScore(catName, isCorrect) {
  const isShared = typeof window.shareStats !== 'undefined' ? window.shareStats : (localStorage.getItem('shareStats') === 'true');
  if(!currentUser || !isShared) return;

  const d = getTodayStr();
  const ref = firestore.collection('susuru_anki_category_scores').doc(`${d}_${currentUser.uid}_${catName}`);
  try {
    await ref.set({
      date: d,
      category: catName,
      uid: currentUser.uid,
      name: currentUser.displayName || 'Anonymous',
      score: firebase.firestore.FieldValue.increment(isCorrect ? 1 : 0),
      total: firebase.firestore.FieldValue.increment(1)
    }, { merge: true });
  } catch(e) {}
}

// ★ 成績共有設定のトグル
// ★ 修正ポイント：window.shareStats を明示的に使ってエラーを回避
function toggleShareStats() {
  const chk = document.getElementById('chkShareStats');
  window.shareStats = chk.checked;
  localStorage.setItem('shareStats', window.shareStats);
  alert(window.shareStats ? '✅ 成績共有を有効にしました' : '✅ 成績共有を無効にしました');
}

// ★ フレンド成績比較ページ用：フレンド一覧＆カテゴリー選択肢を読み込む
async function loadFriendsForComparison() {
  if (!currentUser) return;
  try {
    const myProfileSnap = await firestore.collection('susuru_anki_profiles').doc(currentUser.uid).get();
    const friends = myProfileSnap.exists ? (myProfileSnap.data().friends || []) : [];
    
    const select = document.getElementById('selCompareFriend');
    select.innerHTML = '<option value="">フレンドを選択...</option>';
    
    for (const friendUid of friends) {
      try {
        const friendSnap = await firestore.collection('susuru_anki_profiles').doc(friendUid).get();
        const friendName = friendSnap.exists ? (friendSnap.data().displayName || friendUid) : friendUid;
        const opt = document.createElement('option');
        opt.value = friendUid;
        opt.innerText = friendName;
        select.appendChild(opt);
      } catch(e) {}
    }
    
    const catSelect = document.getElementById('selCompareCategory');
    catSelect.innerHTML = '<option value="">🌐 全カテゴリー</option>';
    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.innerText = c;
      catSelect.appendChild(opt);
    });
  } catch(e) {}
}

// ★ フレンドとの成績を比較グラフで表示
async function renderCompareStats() {
  const friendUid = document.getElementById('selCompareFriend').value;
  const category = document.getElementById('selCompareCategory').value;
  const area = document.getElementById('compareStatsArea');
  
  if (!friendUid) {
    area.innerHTML = '<div style="text-align:center; color:var(--text3); padding:40px;">フレンドを選択してください</div>';
    return;
  }
  
  area.innerHTML = '<div style="text-align:center; color:var(--text2);">読み込み中...</div>';
  
  try {
    const d = getTodayStr();
    
    const [mySnap, friendSnap] = await Promise.all([
      firestore.collection('susuru_anki_category_scores').where('uid', '==', currentUser.uid).get(),
      firestore.collection('susuru_anki_category_scores').where('uid', '==', friendUid).get()
    ]);
    
    const data = {};
    
    const processDoc = (doc) => {
      const dObj = doc.data();
      if (dObj.date === d) {
        if (category && dObj.category !== category) return;
        const key = `${dObj.category}_${dObj.uid}`;
        data[key] = dObj;
      }
    };
    
    mySnap.forEach(processDoc);
    friendSnap.forEach(processDoc);
    
    area.innerHTML = '';
    
    if (Object.keys(data).length === 0) {
      area.innerHTML = '<div style="text-align:center; color:var(--text3); padding:40px;">本日の成績データがありません</div>';
      return;
    }
    
    const grouped = {};
    Object.values(data).forEach(item => {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    });
    
    Object.entries(grouped).forEach(([catName, scores]) => {
      const card = document.createElement('div');
      card.className = 'card';
      
      const myScore = scores.find(s => s.uid === currentUser.uid);
      const friendScore = scores.find(s => s.uid === friendUid);
      
      const myRate = myScore && myScore.total > 0 ? (myScore.score / myScore.total * 100).toFixed(1) : 0;
      const friendRate = friendScore && friendScore.total > 0 ? (friendScore.score / friendScore.total * 100).toFixed(1) : 0;
      const friendName = friendScore ? friendScore.name : '不明';
      
      card.innerHTML = `
        <div style="font-weight:700; margin-bottom:15px; color:var(--text);">${escapeHtml(catName)}</div>
        <div style="display:flex; gap:15px; margin-bottom:10px;">
          <div style="flex:1;">
            <div style="font-size:0.8rem; color:var(--text2); margin-bottom:4px;">あなた</div>
            <div style="height:20px; background:var(--bg3); border-radius:4px; overflow:hidden; border:1px solid var(--border);">
              <div style="width:${myRate}%; height:100%; background:var(--primary); transition:width 0.3s;"></div>
            </div>
            <div style="font-size:0.75rem; color:var(--text2); margin-top:4px;">${myScore ? myScore.score : 0}/${myScore ? myScore.total : 0} (${myRate}%)</div>
          </div>
          <div style="flex:1;">
            <div style="font-size:0.8rem; color:var(--text2); margin-bottom:4px;">${escapeHtml(friendName)}</div>
            <div style="height:20px; background:var(--bg3); border-radius:4px; overflow:hidden; border:1px solid var(--border);">
              <div style="width:${friendRate}%; height:100%; background:var(--accent); transition:width 0.3s;"></div>
            </div>
            <div style="font-size:0.75rem; color:var(--text2); margin-top:4px;">${friendScore ? friendScore.score : 0}/${friendScore ? friendScore.total : 0} (${friendRate}%)</div>
          </div>
        </div>
      `;
      area.appendChild(card);
    });
  } catch(e) {
    console.error(e);
    area.innerHTML = '<div style="color:var(--danger);">成績データの読み込みに失敗しました</div>';
  }
}

// ====== オンライン対戦ページの初期化 ======
function initOnlineMatchPage() {
  const scopeContainer = document.getElementById('onlineMatchScopeSelectors');
  if (!scopeContainer) return;
  scopeContainer.innerHTML = '';
  createOnlineMatchScopeSelect(0, getTopLevelCategories());
}

function createOnlineMatchScopeSelect(depth, categoriesToShow) {
  if (categoriesToShow.length === 0) return;
  const container = document.getElementById('onlineMatchScopeSelectors');
  if (!container) return;
  
  const select = document.createElement('select');
  select.className = 'form-control';
  
  if (depth === 0) {
    const optAll = document.createElement('option');
    optAll.value = "all";
    optAll.innerText = "🌐 全てから出題";
    select.appendChild(optAll);
  }
  
  const optDefault = document.createElement('option');
  optDefault.value = "";
  optDefault.innerText = depth === 0 ? "📁 トップカテゴリー..." : "📂 サブカテゴリー...";
  optDefault.disabled = true;
  optDefault.selected = true;
  select.appendChild(optDefault);
  
  categoriesToShow.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.innerText = depth === 0 ? `📁 ${cat}` : `📂 ${cat}`;
    select.appendChild(opt);
  });
  
  select.onchange = (e) => {
    const val = e.target.value;
    const selects = Array.from(container.querySelectorAll('select'));
    selects.forEach((sel, idx) => { if (idx > depth) sel.remove(); });
    
    if (val === "all") {
      selectedScopePath = ["all"];
      return;
    }
    
    selectedScopePath[depth] = val;
    selectedScopePath = selectedScopePath.slice(0, depth + 1);
    const children = categoryTree[val] || [];
    if (children.length > 0) {
      createOnlineMatchScopeSelect(depth + 1, children);
    }
  };
  
  container.appendChild(select);
}

function startOnlineMatching() {
  if (!currentUser) return alert("オンライン対戦にはログインが必要です。");
  
  const qCount = parseInt(document.getElementById('onlineMatchQuestionCount').value) || 10;
  const timeLimit = parseInt(document.getElementById('onlineMatchTimeLimit').value) || 15;
  
  startOnlineMatch(selectedScopePath.length > 0 && selectedScopePath[0] !== "all" ? selectedScopePath[selectedScopePath.length - 1] : "all", qCount, timeLimit);
}

function createQuickMatch() {
  if (!currentUser) return alert("招待リンク作成にはログインが必要です。");
  
  const qCount = parseInt(document.getElementById('onlineMatchQuestionCount').value) || 10;
  const timeLimit = parseInt(document.getElementById('onlineMatchTimeLimit').value) || 15;
  
  createQuickMatchRoom(selectedScopePath.length > 0 && selectedScopePath[0] !== "all" ? selectedScopePath[selectedScopePath.length - 1] : "all", qCount, timeLimit);
}
