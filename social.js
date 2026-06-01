// ★★★ すするanki0.02.49-g - ソーシャル機能（ランキング・フレンド・チャット・成績比較・オンライン対戦） ★★★

// ★ グローバル変数の安全な初期化
window.shareStats = localStorage.getItem('shareStats') === 'true';

// ★ 画面遷移の多重実行を防ぐためのロックフラグ（iPad/Android間の接続安定化用）
let onlinePageTransited = false;

// ★ 本日のデイリーランキング表示
async function loadDailyRanking() {
  const listDiv = document.getElementById('rankingList');
  if (!currentUser) { listDiv.innerHTML = 'ログインしてください'; return; }\n  const d = getTodayStr();
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
      listDiv.innerHTML += `<div><span style=\"display:inline-block; width:24px; color:var(--warn); font-weight:bold;\">${rank}</span>: ${escapeHtml(data.name)} <span style=\"color:var(--success); font-weight:bold;\">(${data.score}問)</span></div>`;
      rank++;
    });
  } catch(e) { console.error(e); listDiv.innerHTML = '読み込み失敗'; }
}

// ★ ランキングへのスコア自動登録
async function reportScoreToRanking(score) {
  if (!currentUser || !window.shareStats) return;
  const d = getTodayStr();
  try {
    await firestore.collection('susuru_anki_daily_scores').doc(`${d}_${currentUser.uid}`).set({
      date: d, uid: currentUser.uid, name: currentUser.displayName || '名無し', score: score, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch(e) { console.error(e); }
}

// ★ フレンド機能全般
async function sendFriendRequest() {
  const targetUid = document.getElementById('txtFriendUid').value.trim();
  if (!targetUid) return alert('UIDを入力してください');
  if (!currentUser) return alert('ログインが必要です');
  if (targetUid === currentUser.uid) return alert('自分自身にフレンド申請は送れません');
  try {
    const userDoc = await firestore.collection('susuru_anki_users').doc(targetUid).get();
    if (!userDoc.exists) return alert('指定されたUIDのユーザーは見つかりません');
    await firestore.collection('susuru_anki_friend_requests').doc(`${currentUser.uid}_${targetUid}`).set({
      fromUid: currentUser.uid, fromName: currentUser.displayName || '名無し', toUid: targetUid, status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert('フレンド申請を送信しました！'); document.getElementById('txtFriendUid').value = '';
  } catch(e) { console.error(e); alert('申請に失敗しました'); }
}

async function loadFriendRequests() {
  const div = document.getElementById('friendRequestsList'); if (!currentUser) return;
  try {
    const snap = await firestore.collection('susuru_anki_friend_requests').where('toUid', '==', currentUser.uid).where('status', '==', 'pending').get();
    if (snap.empty) { div.innerHTML = '<div style="color:#aaa; font-size:0.9rem;">届いている申請はありません</div>'; return; }
    div.innerHTML = '';
    snap.forEach(doc => {
      const data = doc.data();
      div.innerHTML += `<div style="display:flex; justify-content:between; align-items:center; margin-bottom:8px; background:var(--bg3); padding:8px; border-radius:6px;">
        <span>${escapeHtml(data.fromName)}</span>
        <div>
          <button class="btn btn-success" style="padding:4px 8px; font-size:0.8rem; margin-right:4px;" onclick="respondFriendRequest('${doc.id}', 'accepted')">承認</button>
          <button class="btn btn-danger" style="padding:4px 8px; font-size:0.8rem;" onclick="respondFriendRequest('${doc.id}', 'rejected')">拒否</button>
        </div>
      </div>`;
    });
  } catch(e) { console.error(e); }
}

async function respondFriendRequest(reqId, status) {
  try {
    const reqRef = firestore.collection('susuru_anki_friend_requests').doc(reqId);
    const snap = await reqRef.get(); if (!snap.exists) return;
    const data = snap.data();
    if (status === 'accepted') {
      await firestore.collection('susuru_anki_users').doc(currentUser.uid).update({ friends: firebase.firestore.FieldValue.arrayUnion(data.fromUid) });
      await firestore.collection('susuru_anki_users').doc(data.fromUid).update({ friends: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
    }
    await reqRef.delete(); alert(status === 'accepted' ? 'フレンドになりました！' : '申請を拒否しました');
    loadFriendRequests(); loadFriendsList();
  } catch(e) { console.error(e); }
}

async function loadFriendsList() {
  const div = document.getElementById('friendsList'); if (!currentUser) return;
  try {
    const userDoc = await firestore.collection('susuru_anki_users').doc(currentUser.uid).get();
    if (!userDoc.exists || !userDoc.data().friends || userDoc.data().friends.length === 0) {
      div.innerHTML = '<div style="color:#aaa; font-size:0.9rem;">フレンドがまだいません</div>'; return;
    }
    const fUids = userDoc.data().friends; div.innerHTML = '';
    for (let fUid of fUids) {
      const fDoc = await firestore.collection('susuru_anki_users').doc(fUid).get();
      if (fDoc.exists) {
        const fData = fDoc.data();
        div.innerHTML += `<div style="display:flex; justify-content:between; align-items:center; margin-bottom:8px; background:var(--bg3); padding:8px; border-radius:6px;">
          <span style="font-weight:500;">👤 ${escapeHtml(fData.displayName || '名無し')}</span>
          <div>
            <button class="btn" style="padding:4px 8px; font-size:0.8rem; margin-right:4px;" onclick="openFriendChat('${fUid}', '${escapeHtml(fData.displayName || '名無し')}')">💬 チャット</button>
            <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.8rem;" onclick="compareStatsWithFriend('${fUid}', '${escapeHtml(fData.displayName || '名無し')}')">📊 比較</button>
          </div>
        </div>`;
      }
    }
  } catch(e) { console.error(e); }
}

// ★ フレンドチャット機能
let currentChatFriendUid = null;
let unsubscribeChat = null;

function openFriendChat(fUid, fName) {
  currentChatFriendUid = fUid;
  document.getElementById('chatTitle').innerText = `💬 ${fName} とのチャット`;
  openPage('pgChat'); setupChatListener();
}

function setupChatListener() {
  if (unsubscribeChat) unsubscribeChat();
  if (!currentUser || !currentChatFriendUid) return;
  const chatId = currentUser.uid < currentChatFriendUid ? `${currentUser.uid}_${currentChatFriendUid}` : `${currentChatFriendUid}_${currentUser.uid}`;
  const div = document.getElementById('chatMessages'); div.innerHTML = '読み込み中...';
  
  unsubscribeChat = firestore.collection('susuru_anki_chats').doc(chatId).collection('messages').orderBy('createdAt', 'asc').limit(50)
    .onSnapshot(snap => {
      div.innerHTML = '';
      if(snap.empty) { div.innerHTML = '<div style="color:#aaa; text-align:center; padding:20px;">メッセージがありません。会話を始めましょう！</div>'; return; }
      snap.forEach(doc => {
        const data = doc.data();
        const isMe = data.senderId === currentUser.uid;
        div.innerHTML += `<div style="text-align: ${isMe ? 'right' : 'left'}; margin-bottom:10px;">
          <div style="display:inline-block; background: ${isMe ? 'var(--accent)' : 'var(--bg4)'}; color: #fff; padding:8px 12px; border-radius:12px; max-width:80%; text-align:left; word-break:break-all; white-space:pre-wrap;">${escapeHtml(data.text)}</div>
        </div>`;
      });
      div.scrollTop = div.scrollHeight;
    });
}

async function sendChatMessage() {
  const input = document.getElementById('txtChatInput'); const text = input.value.trim(); if (!text || !currentChatFriendUid || !currentUser) return;
  const chatId = currentUser.uid < currentChatFriendUid ? `${currentUser.uid}_${currentChatFriendUid}` : `${currentChatFriendUid}_${currentUser.uid}`;
  try {
    input.value = '';
    await firestore.collection('susuru_anki_chats').doc(chatId).collection('messages').add({
      senderId: currentUser.uid, text: text, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch(e) { console.error(e); alert('送信失敗'); }
}

// ★ 成績比較機能
async function compareStatsWithFriend(fUid, fName) {
  if (!currentUser) return;
  try {
    const fDoc = await firestore.collection('susuru_anki_users').doc(fUid).get();
    if (!fDoc.exists) return alert('フレンドのデータが見つかりません');
    const fData = fDoc.data();
    const myCount = db.length; const fCount = fData.cardCount || 0;
    const myLevelSum = db.reduce((acc, q) => acc + (q.level || 0), 0);
    const myAvgLevel = myCount > 0 ? (myLevelSum / myCount).toFixed(1) : 0;
    const fAvgLevel = fData.avgLevel || 0;
    
    let html = `<h3 style="margin-bottom:15px; text-align:center; color:var(--accent);">📊 成績を比べる</h3>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px; text-align:center;">
        <div style="background:var(--bg4); padding:10px; border-radius:8px; border:1px solid var(--border);">
          <div style="font-size:0.85rem; color:#aaa;">あなた</div>
          <div style="font-size:1.1rem; font-weight:bold; margin:5px 0;">カード数: ${myCount}枚</div>
          <div style="font-size:1.1rem; font-weight:bold; color:var(--success);">平均熟練度: Lvl ${myAvgLevel}</div>
        </div>
        <div style="background:var(--bg4); padding:10px; border-radius:8px; border:1px solid var(--border);">
          <div style="font-size:0.85rem; color:#aaa;">${escapeHtml(fName)}</div>
          <div style="font-size:1.1rem; font-weight:bold; margin:5px 0;">カード数: ${fCount}枚</div>
          <div style="font-size:1.1rem; font-weight:bold; color:var(--warn);">平均熟練度: Lvl ${fAvgLevel}</div>
        </div>
      </div>
      <button class="btn" style="width:100%;" onclick="closeFriendCompareModal()">閉じる</button>`;
    
    const container = document.createElement('div'); container.id = 'friendCompareModal';
    container.style = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index:2000; padding:20px;';
    container.innerHTML = `<div style="background:var(--bg2); border:1px solid var(--border); padding:20px; border-radius:12px; width:100%; max-width:400px; box-shadow:0 10px 25px rgba(0,0,0,0.5);">${html}</div>`;
    document.body.appendChild(container);
  } catch(e) { console.error(e); alert('比較データの取得に失敗しました'); }
}
function closeFriendCompareModal() { const m = document.getElementById('friendCompareModal'); if(m) m.remove(); }

// ==================== ⚔️ リアルタイムオンライン対戦機能 ====================
let currentMatchId = null;
let unsubscribeMatch = null;

// 🟢 マッチングオーバレイの制御
function showOnlineMatchOverlay(text) {
  let overlay = document.getElementById('onlineMatchOverlay');
  if (!overlay) {
    overlay = document.createElement('div'); overlay.id = 'onlineMatchOverlay';
    overlay.style = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(8,12,20,0.95); display:flex; flex-direction:column; justify-content:center; align-items:center; z-index:3000; padding:20px; text-align:center;';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="spinner" style="width:40px; height:40px; border:4px solid var(--border); border-top-color:var(--accent); border-radius:50%; animation:spin 1s linear infinite; margin-bottom:20px;"></div>
    <div style="font-size:1.2rem; font-weight:bold; margin-bottom:15px; color:#fff;">${escapeHtml(text)}</div>
    <button class="btn btn-secondary" style="padding:8px 20px;" onclick="cancelOnlineMatch()">マッチングをキャンセル</button>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
  `;
}
function removeOnlineMatchOverlay() { const o = document.getElementById('onlineMatchOverlay'); if (o) o.remove(); }

// 🟢 オンライン対戦の開始・マッチング待機
async function startOnlineMatch() {
  if (!currentUser) return alert("対戦するにはログインが必要です。");
  
  const cat = document.getElementById('selectOnlineCategory').value;
  const qType = document.getElementById('selectOnlineQType').value;
  
  let matchCards = db.filter(q => q.question && q.answer);
  if (cat !== 'all') { matchCards = matchCards.filter(q => q.category === cat); }
  
  if (matchCards.length === 0) {
    alert("選択されたカテゴリーに有効な問題がありません。カードを追加してください。");
    return;
  }
  
  // マッチング用の全形式共通のランダム問題抽出 (最大10問)
  matchCards.sort(() => 0.5 - Math.random());
  const selectedQuestions = matchCards.slice(0, 10).map(q => {
    let choices = [];
    if (q.choices && q.choices.length > 0) {
      choices = [...q.choices];
    } else if (typeof getRandomChoices === 'function') {
      choices = getRandomChoices(q);
    }
    return { id: q.id, question: q.question, answer: q.answer, choices: choices };
  });

  showOnlineMatchOverlay("⚡ 対戦相手を探しています...");
  onlinePageTransited = false; // 画面ロックフラグを初期化

  try {
    // 🔍 待機中のルームを検索（Android親時の遅延対策として.orderByを完全に削除）
    const queue = await firestore.collection('susuru_anki_matches')
      .where('status', '==', 'waiting')
      .limit(1).get();

    if (!queue.empty) {
      // 既存ルームに参加 (自分が Player2 になる)
      const matchDoc = queue.docs[0];
      currentMatchId = matchDoc.id;
      
      await firestore.collection('susuru_anki_matches').doc(currentMatchId).update({
        player2: currentUser.uid,
        player2Name: currentUser.displayName || '名無し',
        status: 'playing'
      });
      listenToMatch();
    } else {
      // ルームを新規作成 (自分が Player1 になる)
      const newMatch = {
        player1: currentUser.uid,
        player1Name: currentUser.displayName || '名無し',
        player2: null,
        player2Name: null,
        status: 'waiting',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        questions: selectedQuestions,
        qType: qType,
        currentQuestionIndex: 0,
        p1Score: 0,
        p2Score: 0,
        p1Answered: false,
        p2Answered: false,
        p1Answer: null,
        p2Answer: null,
        p1Correct: false,
        p2Correct: false,
        buzzerWinner: null,
        buzzerAnswered: false,
        buzzerAnswer: null,
        buzzerCorrect: false
      };
      const docRef = await firestore.collection('susuru_anki_matches').add(newMatch);
      currentMatchId = docRef.id;
      listenToMatch();
    }
  } catch (e) {
    console.error(e);
    removeOnlineMatchOverlay();
    alert("⚠️ 対戦接続に失敗しました。");
  }
}

// 🟢 友達を対戦に誘う（招待リンク生成）
async function generateInviteLink() {
  if (!currentUser) return alert("ログインが必要です。");
  const cat = document.getElementById('selectOnlineCategory').value;
  const qType = document.getElementById('selectOnlineQType').value;
  
  let matchCards = db.filter(q => q.question && q.answer);
  if (cat !== 'all') { matchCards = matchCards.filter(q => q.category === cat); }
  if (matchCards.length === 0) return alert("選択したカテゴリーに問題がありません。");
  
  matchCards.sort(() => 0.5 - Math.random());
  const selectedQuestions = matchCards.slice(0, 10).map(q => {
    let choices = (q.choices && q.choices.length > 0) ? [...q.choices] : (typeof getRandomChoices === 'function' ? getRandomChoices(q) : []);
    return { id: q.id, question: q.question, answer: q.answer, choices: choices };
  });

  try {
    showOnlineMatchOverlay("🔗 招待リンクを生成中...");
    onlinePageTransited = false;
    
    const newMatch = {
      player1: currentUser.uid,
      player1Name: currentUser.displayName || '名無し',
      player2: null, player2Name: null, status: 'waiting',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      questions: selectedQuestions, qType: qType, currentQuestionIndex: 0,
      p1Score: 0, p2Score: 0, p1Answered: false, p2Answered: false,
      p1Answer: null, p2Answer: null, p1Correct: false, p2Correct: false,
      buzzerWinner: null, buzzerAnswered: false, buzzerAnswer: null, buzzerCorrect: false
    };
    
    const docRef = await firestore.collection('susuru_anki_matches').add(newMatch);
    currentMatchId = docRef.id;
    
    const inviteUrl = `${window.location.origin}${window.location.pathname}?match_id=${currentMatchId}`;
    removeOnlineMatchOverlay();
    
    // 招待モーダルを画面に表示
    let modal = document.createElement('div'); modal.id = 'inviteModal';
    modal.style = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); display:flex; justify-content:center; align-items:center; z-index:4000; padding:20px;';
    modal.innerHTML = `
      <div style="background:var(--bg2); border:1px solid var(--border); padding:20px; border-radius:12px; width:100%; max-width:450px; text-align:center; box-shadow:0 10px 25px rgba(0,0,0,0.5);">
        <h3 style="color:var(--accent); margin-bottom:15px;">🔗 対戦用URLが完成！</h3>
        <p style="font-size:0.85rem; color:#aaa; margin-bottom:15px;">このURLをSNSやLINEで友達に共有してください。相手が参加すると自動で対戦がスタートします。</p>
        <input type="text" value="${inviteUrl}" readonly style="width:100%; padding:10px; background:var(--bg); border:1px solid var(--border); color:#fff; border-radius:6px; margin-bottom:15px; font-size:0.9rem; text-align:center;">
        <button class="btn" style="width:100%; margin-bottom:10px;" onclick="copyInviteLinkText('${inviteUrl}')">📋 リンクをコピー</button>
        <button class="btn btn-secondary" style="width:100%;" onclick="closeInviteModal()">対戦を待たずに閉じる</button>
      </div>
    `;
    document.body.appendChild(modal);
    listenToMatch();
  } catch(e) { console.error(e); removeOnlineMatchOverlay(); alert("リンク生成に失敗しました。"); }
}
function copyInviteLinkText(text) { navigator.clipboard.writeText(text); alert("リンクをクリップボードにコピーしました！"); }
function closeInviteModal() { const m = document.getElementById('inviteModal'); if (m) m.remove(); cancelOnlineMatch(); }

// 🟢 マッチングリアルタイムリスナー（ゲームの進行監視コア）
function listenToMatch() {
  if (!currentMatchId) return;
  if (unsubscribeMatch) unsubscribeMatch();

  unsubscribeMatch = firestore.collection('susuru_anki_matches').doc(currentMatchId)
    .onSnapshot(doc => {
      if (!doc.exists) return;
      const data = doc.data();

      // 待機中はまだ何もしない
      if (data.status === 'waiting') return;

      // 🏆 終了結果の表示
      if (data.status === 'finished') {
        removeOnlineMatchOverlay();
        const invM = document.getElementById('inviteModal'); if (invM) invM.remove();
        renderOnlineResult(data);
        if (unsubscribeMatch) { unsubscribeMatch(); unsubscribeMatch = null; }
        return;
      }

      // ⚔️ 対戦実行中のフェーズ
      if (data.status === 'playing') {
        removeOnlineMatchOverlay();
        const invM = document.getElementById('inviteModal'); if (invM) invM.remove();

        // 🌟 iPad/Android間の画面重複リロード・初期化フリーズを防ぐロック機構
        if (!onlinePageTransited) {
          onlinePageTransited = true;
          openPage('pgOnlineGame');
        }

        // スコア表示・名前のリアルタイム反映
        document.getElementById('lblOnlineP1Name').innerText = data.player1Name || 'P1';
        document.getElementById('lblOnlineP1Score').innerText = (data.p1Score || 0) + ' 点';
        document.getElementById('lblOnlineP2Name').innerText = data.player2Name || 'P2';
        document.getElementById('lblOnlineP2Score').innerText = (data.p2Score || 0) + ' 点';

        const currentIdx = data.currentQuestionIndex || 0;
        const questions = data.questions || [];
        
        // 全問題の消化確認
        if (currentIdx >= questions.length) {
          if (currentUser.uid === data.player1) {
            firestore.collection('susuru_anki_matches').doc(currentMatchId).update({ status: 'finished' });
          }
          return;
        }

        const q = questions[currentIdx];
        const qType = data.qType || '4択';

        // 画面に現在のクイズを描画
        renderOnlineQuestion(q, currentIdx, questions.length, data);

        // 次の問題への判定分岐
        if (qType === 'みんはや') {
          if (data.buzzerAnswered) {
            renderOnlineBuzzerResult(data, q);
          }
        } else {
          if (data.p1Answered && data.p2Answered) {
            renderOnlineNormalResult(data, q);
          }
        }
      }
    }, err => { console.error("Match listener error:", err); });
}

// 🟢 クイズ画面の描画処理（4択問題の完全復旧 ＆ みんはや形式の選択肢ボタン徹底改修）
function renderOnlineQuestion(q, currentIdx, total, data) {
  const box = document.getElementById('onlineQuestionBox');
  if (!box) return;

  const qType = data ? (data.qType || '4択') : '4択';

  // 1️⃣ 4択問題：v0.02.45の仕様へ完全に戻す（引数に選択肢の文字列をエスケープして直接渡す）
  if (qType === '4択') {
    const choices = q.choices || [];
    let html = `<div style="margin-bottom:12px; font-weight:bold; color:var(--accent);">【4択問題】 ${currentIdx+1} / ${total}</div>`;
    html += `<div style="font-size:1.2rem; margin-bottom:20px; white-space:pre-wrap;">${escapeHtml(q.question)}</div>`;
    html += `<div style="display:grid; grid-template-columns:1fr; gap:10px;">`;
    choices.forEach((c, idx) => {
      const escapedChoice = escapeHtml(c).replace(/'/g, "\\'");
      html += `<button class="btn btn-secondary" style="text-align:left; padding:12px;" onclick="submitOnlineAnswer('${escapedChoice}')">${idx+1}. ${escapeHtml(c)}</button>`;
    });
    html += `</div>`;
    box.innerHTML = html;
    return;
  }

  // 2️⃣ みんはや形式：4択・記述どちらの場合でも選択肢ボタンが完璧に反応するよう見直し改修
  if (qType === 'みんはや') {
    let html = `<div style="margin-bottom:12px; font-weight:bold; color:var(--accent);">【みんはや形式】 ${currentIdx+1} / ${total}</div>`;
    
    if (!data.buzzerWinner) {
      // まだ誰もボタンを押していない
      html += `<div style="font-size:1.2rem; margin-bottom:20px; text-align:center; color:#ccc;">問題が読まれています...</div>`;
      html += `<div style="text-align:center; margin-top:40px;">`;
      html += `<button class="btn" style="width:140px; height:140px; border-radius:50%; font-size:1.5rem; background:var(--danger); box-shadow:0 0 20px rgba(255,75,75,0.5);" onclick="pressBuzzer()">押す！</button>`;
      html += `</div>`;
    } else {
      // 誰かがボタンを押した
      const isMeWinner = (data.buzzerWinner === currentUser.uid);
      const winnerName = (data.buzzerWinner === data.player1) ? data.player1Name : data.player2Name;
      
      html += `<div style="font-size:1.1rem; margin-bottom:15px; text-align:center; color:var(--warn); font-weight:bold;">🎉 ${escapeHtml(winnerName)} がボタンを押しました！</div>`;
      
      if (isMeWinner) {
        // 自分が早押しに勝った（回答権あり）
        html += `<div style="font-size:1.2rem; margin-bottom:20px; white-space:pre-wrap;">${escapeHtml(q.question)}</div>`;
        
        // 選択肢がある場合は選択肢ボタン、ない場合は記述入力フォームを表示
        if (q.choices && q.choices.length > 0) {
          html += `<div style="display:grid; grid-template-columns:1fr; gap:10px;">`;
          q.choices.forEach((c, idx) => {
            // ★ 通常回答用ではなく、みんはや専用回答関数(submitBuzzerAnswer)に文字列を乗せて送信するように修正
            const escapedChoice = escapeHtml(c).replace(/'/g, "\\'");
            html += `<button class="btn btn-secondary" style="text-align:left; padding:12px;" onclick="submitBuzzerAnswer('${escapedChoice}')">${idx+1}. ${escapeHtml(c)}</button>`;
          });
          html += `</div>`;
        } else {
          // 記述みんはや
          html += `<div style="margin-bottom:15px;">`;
          html += `<input type="text" id="txtOnlineBuzzerAns" class="form-control" placeholder="答えを入力" style="width:100%; text-align:center; font-size:1.2rem;">`;
          html += `</div>`;
          html += `<button class="btn" style="width:100%;" onclick="submitBuzzerAnswer()">回答を送信</button>`;
        }
      } else {
        // 相手が早押しに勝った（回答を待つ状態）
        html += `<div style="text-align:center; margin-top:30px; color:#aaa; font-style:italic;">相手の回答を待っています...</div>`;
      }
    }
    box.innerHTML = html;
    return;
  }

  // 3️⃣ 記述問題（48仕様維持）
  if (qType === '記述') {
    let html = `<div style="margin-bottom:12px; font-weight:bold; color:var(--accent);">【記述問題】 ${currentIdx+1} / ${total}</div>`;
    html += `<div style="font-size:1.2rem; margin-bottom:20px; white-space:pre-wrap;">${escapeHtml(q.question)}</div>`;
    html += `<div style="margin-bottom:15px;"><input type="text" id="txtOnlineGameAns" class="form-control" placeholder="答えを入力" style="width:100%; text-align:center; font-size:1.2rem;"></div>`;
    html += `<button class="btn" style="width:100%;" onclick="submitOnlineTextAnswer()">回答を送信</button>`;
    box.innerHTML = html;
    return;
  }

  // 4️⃣ タップ問題（48仕様維持）
  if (qType === 'タップ') {
    let html = `<div style="margin-bottom:12px; font-weight:bold; color:var(--accent);">【タップ問題】 ${currentIdx+1} / ${total}</div>`;
    html += `<div style="font-size:1.2rem; margin-bottom:20px; white-space:pre-wrap;">${escapeHtml(q.question)}</div>`;
    html += `<button class="btn btn-secondary" style="width:100%; padding:20px; font-size:1.2rem;" onclick="submitOnlineAnswer('タップした')">👆 答えを表示（タップ）</button>`;
    box.innerHTML = html;
    return;
  }

  // 5️⃣ 自己申告問題（48仕様維持）
  if (qType === '自己申告') {
    let html = `<div style="margin-bottom:12px; font-weight:bold; color:var(--accent);">【自己申告】 ${currentIdx+1} / ${total}</div>`;
    html += `<div style="font-size:1.2rem; margin-bottom:20px; white-space:pre-wrap;">${escapeHtml(q.question)}</div>`;
    html += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">`;
    html += `<button class="btn btn-danger" onclick="submitOnlineAnswer('❌ 覚えていない')">❌ 覚えてない</button>`;
    html += `<button class="btn btn-success" onclick="submitOnlineAnswer('✅ 覚えている')">✅ 覚えている</button>`;
    html += `</div>`;
    box.innerHTML = html;
    return;
  }
}

// 🟢 通常形式用の回答送信・正誤判定（文字列ベースへの差し戻し対応）
async function submitOnlineAnswer(ans) {
  if (!currentMatchId) return;
  try {
    const snap = await firestore.collection('susuru_anki_matches').doc(currentMatchId).get();
    if (!snap.exists) return;
    const data = snap.data();
    const currentIdx = data.currentQuestionIndex || 0;
    const questions = data.questions || [];
    const q = questions[currentIdx];
    if (!q) return;

    const isP1 = (currentUser.uid === data.player1);
    if (isP1 && data.p1Answered) return;
    if (!isP1 && data.p2Answered) return;

    // 文字列として厳密にトリム・小文字化して正誤判定を行う（45のロジック）
    const isCorrect = (String(ans).trim().toLowerCase() === String(q.answer).trim().toLowerCase());
    
    let updates = {};
    if (isP1) {
      updates.p1Answered = true;
      updates.p1Answer = ans;
      updates.p1Correct = isCorrect;
    } else {
      updates.p2Answered = true;
      updates.p2Answer = ans;
      updates.p2Correct = isCorrect;
    }

    await firestore.collection('susuru_anki_matches').doc(currentMatchId).update(updates);
  } catch (e) { console.error(e); }
}

async function submitOnlineTextAnswer() {
  const input = document.getElementById('txtOnlineGameAns');
  if (!input) return;
  await submitOnlineAnswer(input.value.trim());
}

// 🟢 みんはや形式：早押しボタンのタップ
async function pressBuzzer() {
  if (!currentMatchId) return;
  try {
    // 競合防止のため、トランザクションかサーバー側でのチェックを想定し、安全に既存状態を確認してから更新
    const snap = await firestore.collection('susuru_anki_matches').doc(currentMatchId).get();
    if (!snap.exists || snap.data().buzzerWinner) return;

    await firestore.collection('susuru_anki_matches').doc(currentMatchId).update({
      buzzerWinner: currentUser.uid
    });
  } catch (e) { console.error(e); }
}

// 🟢 みんはや形式：回答送信処理の共通化（選択肢のテキストを受け取れるよう見直し）
async function submitBuzzerAnswer(explicitAns = null) {
  if (!currentMatchId) return;
  try {
    const snap = await firestore.collection('susuru_anki_matches').doc(currentMatchId).get();
    if (!snap.exists) return;
    const data = snap.data();
    const currentIdx = data.currentQuestionIndex || 0;
    const questions = data.questions || [];
    const q = questions[currentIdx];
    if (!q) return;

    let ans = "";
    if (explicitAns !== null && explicitAns !== undefined) {
      ans = String(explicitAns).trim();
    } else {
      const input = document.getElementById('txtOnlineBuzzerAns');
      if (input) ans = input.value.trim();
    }

    const isCorrect = (ans.toLowerCase() === String(q.answer).trim().toLowerCase());
    
    let updates = {
      buzzerAnswer: ans,
      buzzerAnswered: true,
      buzzerCorrect: isCorrect
    };
    
    await firestore.collection('susuru_anki_matches').doc(currentMatchId).update(updates);
  } catch (e) { console.error(e); }
}

// 🟢 結果判定中の中間表示（通常クイズ用）
function renderOnlineNormalResult(data, q) {
  const box = document.getElementById('onlineQuestionBox');
  if (!box) return;

  const isP1 = (currentUser.uid === data.player1);
  const myCorrect = isP1 ? data.p1Correct : data.p2Correct;
  const opCorrect = isP1 ? data.p2Correct : data.p1Correct;
  const opName = isP1 ? (data.player2Name || 'P2') : (data.player1Name || 'P1');

  let html = `<div style="text-align:center; padding:10px;">`;
  html += `<div style="font-size:1.8rem; font-weight:bold; margin-bottom:15px; color:${myCorrect ? 'var(--success)' : 'var(--danger)'};">${myCorrect ? '🎉 正解！' : '❌ 不正解...'}</div>`;
  html += `<div style="background:var(--bg4); border:1px solid var(--border); padding:15px; border-radius:8px; margin-bottom:20px; text-align:left;">`;
  html += `<div style="font-size:0.9rem; color:#aaa; margin-bottom:5px;">問題:</div><div style="font-weight:bold; margin-bottom:10px;">${escapeHtml(q.question)}</div>`;
  html += `<div style="font-size:0.9rem; color:#aaa; margin-bottom:5px;">正解:</div><div style="font-weight:bold; color:var(--accent); font-size:1.2rem;">${escapeHtml(q.answer)}</div>`;
  html += `</div>`;
  
  html += `<div style="font-size:1rem; margin-bottom:25px; color:#ccc;">${escapeHtml(opName)} の結果: <span style="font-weight:bold; color:${opCorrect ? 'var(--success)' : 'var(--danger)'};">${opCorrect ? '正解' : '不正解'}</span></div>`;

  if (isP1) {
    html += `<button class="btn" style="width:100%;" onclick="nextOnlineQuestion()">次の問題へ ➡️</button>`;
  } else {
    html += `<div style="color:#aaa; font-style:italic; font-size:0.9rem;">作成者が次の問題に進めるのを待っています...</div>`;
  }
  html += `</div>`;
  box.innerHTML = html;
}

// 🟢 結果判定中の中間表示（みんはや用）
function renderOnlineBuzzerResult(data, q) {
  const box = document.getElementById('onlineQuestionBox');
  if (!box) return;

  const isP1 = (currentUser.uid === data.player1);
  const winnerName = (data.buzzerWinner === data.player1) ? data.player1Name : data.player2Name;
  const isCorrect = data.buzzerCorrect;

  let html = `<div style="text-align:center; padding:10px;">`;
  html += `<div style="font-size:1.1rem; color:var(--warn); font-weight:bold; margin-bottom:10px;">🎉 早押し者: ${escapeHtml(winnerName)}</div>`;
  html += `<div style="font-size:1.6rem; font-weight:bold; margin-bottom:15px; color:${isCorrect ? 'var(--success)' : 'var(--danger)'};">${isCorrect ? '⭕ 正解！' : '❌ 不正解...'}</div>`;
  
  html += `<div style="background:var(--bg4); border:1px solid var(--border); padding:15px; border-radius:8px; margin-bottom:20px; text-align:left;">`;
  html += `<div style="font-size:0.9rem; color:#aaa; margin-bottom:5px;">提出された回答:</div><div style="font-weight:bold; margin-bottom:10px; color:var(--warn);">${escapeHtml(data.buzzerAnswer || '(無回答)')}</div>`;
  html += `<div style="font-size:0.9rem; color:#aaa; margin-bottom:5px;">本当の正解:</div><div style="font-weight:bold; color:var(--accent); font-size:1.2rem;">${escapeHtml(q.answer)}</div>`;
  html += `</div>`;

  if (isP1) {
    html += `<button class="btn" style="width:100%;" onclick="nextOnlineQuestion()">次の問題へ ➡️</button>`;
  } else {
    html += `<div style="color:#aaa; font-style:italic; font-size:0.9rem;">作成者が次の問題に進めるのを待っています...</div>`;
  }
  html += `</div>`;
  box.innerHTML = html;
}

// 🟢 次の問題への送り出し（スコア更新処理を含む）
async function nextOnlineQuestion() {
  if (!currentMatchId) return;
  try {
    const snap = await firestore.collection('susuru_anki_matches').doc(currentMatchId).get();
    if (!snap.exists) return;
    const data = snap.data();

    const currentIdx = data.currentQuestionIndex || 0;
    const qType = data.qType || '4択';
    
    let p1ScoreAdd = 0;
    let p2ScoreAdd = 0;

    if (qType === 'みんはや') {
      if (data.buzzerCorrect) {
        if (data.buzzerWinner === data.player1) p1ScoreAdd = 10;
        else p2ScoreAdd = 10;
      } else {
        // お手付きペナルティ（必要に応じてマイナス調整等）
        if (data.buzzerWinner === data.player1) p1ScoreAdd = 0;
        else p2ScoreAdd = 0;
      }
    } else {
      if (data.p1Correct) p1ScoreAdd = 10;
      if (data.p2Correct) p2ScoreAdd = 10;
    }

    await firestore.collection('susuru_anki_matches').doc(currentMatchId).update({
      currentQuestionIndex: currentIdx + 1,
      p1Score: (data.p1Score || 0) + p1ScoreAdd,
      p2Score: (data.p2Score || 0) + p2ScoreAdd,
      p1Answered: false, p2Answered: false,
      p1Answer: null, p2Answer: null,
      p1Correct: false, p2Correct: false,
      buzzerWinner: null, buzzerAnswered: false,
      buzzerAnswer: null, buzzerCorrect: false
    });
  } catch (e) { console.error(e); }
}

// 🟢 対戦結果の最終リザルト描画
function renderOnlineResult(data) {
  openPage('pgOnlineGame');
  const box = document.getElementById('onlineQuestionBox');
  if (!box) return;

  const p1S = data.p1Score || 0;
  const p2S = data.p2Score || 0;
  const isP1 = (currentUser.uid === data.player1);
  
  let resultText = "引き分け！🤝";
  let resultColor = "var(--text)";
  
  if (p1S > p2S) {
    resultText = isP1 ? "🏆 あなたの勝ち！" : "❌ あなたの負け...";
    resultColor = isP1 ? "var(--success)" : "var(--danger)";
  } else if (p2S > p1S) {
    resultText = isP1 ? "❌ あなたの負け..." : "🏆 あなたの勝ち！";
    resultColor = isP1 ? "var(--danger)" : "var(--success)";
  }

  let html = `<div style="text-align:center; padding:10px;">`;
  html += `<div style="font-size:2rem; font-weight:900; margin-bottom:20px; color:${resultColor};">${resultText}</div>`;
  
  html += `<div style="background:var(--bg4); border:1px solid var(--border); padding:20px; border-radius:10px; margin-bottom:25px; display:grid; grid-template-columns:1fr 1fr; gap:10px;">`;
  html += `<div><div style="font-size:0.85rem; color:#aaa;">${escapeHtml(data.player1Name || 'P1')}</div><div style="font-size:1.6rem; font-weight:bold; color:var(--accent);">${p1S} 点</div></div>`;
  html += `<div><div style="font-size:0.85rem; color:#aaa;">${escapeHtml(data.player2Name || 'P2')}</div><div style="font-size:1.6rem; font-weight:bold; color:var(--warn);">${p2S} 点</div></div>`;
  html += `</div>`;
  
  html += `<button class="btn" style="width:100%; padding:12px;" onclick="closeOnlineResult()">ロビーに戻る</button>`;
  html += `</div>`;
  
  box.innerHTML = html;
  
  // フラグの完全クリア
  onlinePageTransited = false;
  if (currentMatchId) currentMatchId = null;
}

function closeOnlineResult() {
  onlinePageTransited = false;
  openPage('pgOnlineMatch');
}

// 🟢 マッチング中の手動キャンセル
async function cancelOnlineMatch() {
  onlinePageTransited = false;
  if (unsubscribeMatch) { unsubscribeMatch(); unsubscribeMatch = null; }
  if (currentMatchId) {
    try {
      const docRef = firestore.collection('susuru_anki_matches').doc(currentMatchId);
      const doc = await docRef.get();
      if (doc.exists && doc.data().status === 'waiting') {
        await docRef.delete();
      }
    } catch(e) { console.error(e); }
    currentMatchId = null;
  }
  removeOnlineMatchOverlay();
}

// 🟢 対戦中の中断・離脱処理
async function quitOnlineMatch() {
  if (confirm("本当にこの対戦を終了してロビーに戻りますか？（点数は破棄されます）")) {
    onlinePageTransited = false;
    if (unsubscribeMatch) { unsubscribeMatch(); unsubscribeMatch = null; }
    if (currentMatchId) {
      try {
        const docRef = firestore.collection('susuru_anki_matches').doc(currentMatchId);
        const doc = await docRef.get();
        if (doc.exists && doc.data().status === 'waiting') {
          await docRef.delete();
        }
      } catch (e) { console.error(e); }
      currentMatchId = null;
    }
    openPage('pgOnlineMatch');
  }
}

// 🔗 招待リンクからの自動参加フック処理
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('match_id');
    if (matchId && currentUser) {
      if (typeof openPage === 'function') openPage('pgOnlineMatch');
      showOnlineMatchOverlay("⚡ 対戦ルームへ接続中...");
      onlinePageTransited = false; // 画面ロック初期化
      try {
        const doc = await firestore.collection('susuru_anki_matches').doc(matchId).get();
        if (doc.exists) {
          const data = doc.data();
          if (data.status === 'waiting' && data.player1 !== currentUser.uid) {
            currentMatchId = doc.id;
            await firestore.collection('susuru_anki_matches').doc(currentMatchId).update({
              status: 'playing', player2: currentUser.uid, player2Name: currentUser.displayName || '名無し'
            });
            listenToMatch();
          } else if (data.player1 === currentUser.uid || data.player2 === currentUser.uid) {
            currentMatchId = doc.id; listenToMatch();
          } else {
            removeOnlineMatchOverlay(); alert("⚠️ この対戦はすでに満員か終了しています。");
          }
        } else {
          removeOnlineMatchOverlay(); alert("⚠️ 対戦ルームが見つかりません。");
        }
      } catch (e) { console.error(e); removeOnlineMatchOverlay(); }
    }
  }, 1500);
});
