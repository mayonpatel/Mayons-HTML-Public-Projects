// 1) Auto-update footer year
document.getElementById('year').textContent = new Date().getFullYear();

// 2) Firebase initialization
const firebaseConfig = {
    apiKey: "AIzaSyBkB5T8zqkTHQp0BJm375egmf9B4EpWWJg",
    authDomain: "mayons-chatbot.firebaseapp.com",
    projectId: "mayons-chatbot",
    storageBucket: "mayons-chatbot.appspot.com",
    messagingSenderId: "83348059342",
    appId: "1:83348059342:web:d47d7153330aa64a840c9f"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 3) UI references
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const apiKeyModal = document.getElementById('apiKeyModal');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
const apiKeyError = document.getElementById('apiKeyError');
const changeKeyBtn = document.getElementById('changeKeyBtn');
const chatApp = document.getElementById('chatApp');
const chatContainer = document.getElementById('chatContainer');
const spinner = document.getElementById('spinner');
const inputText = document.getElementById('inputText');
const sendBtn = document.getElementById('sendBtn');

let userDocRef, apiKey = '',
    memory = [],
    chatHistory = [];

// 4) Render messages + code blocks
function render(text, role) {
    if (role === 'bot') {
        const pattern = /```([\w-]+)\n([\s\S]*?)```/g;
        let lastIndex = 0,
            match;
        while ((match = pattern.exec(text)) !== null) {
            _renderMsg(text.slice(lastIndex, match.index), 'bot');
            _renderCode(match[2], match[1]);
            lastIndex = pattern.lastIndex;
        }
        _renderMsg(text.slice(lastIndex), 'bot');
    } else {
        _renderMsg(text, role);
    }

    function _renderMsg(msg, cls) {
        if (!msg.trim()) return;
        const d = document.createElement('div');
        d.className = 'message ' + cls;
        d.textContent = msg;
        chatContainer.appendChild(d);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function _renderCode(code, lang) {
        const wrap = document.createElement('div');
        wrap.className = 'code-block';
        const header = document.createElement('div');
        header.className = 'code-block-header';
        const lbl = document.createElement('span');
        lbl.className = 'code-block-lang';
        lbl.textContent = lang;
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = 'Copy';
        btn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(code);
            } catch {
                const ta = document.createElement('textarea');
                ta.value = code;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            btn.textContent = 'Copied!';
            setTimeout(() => btn.textContent = 'Copy', 2000);
        });

        const pre = document.createElement('pre');
        pre.textContent = code;

        header.append(lbl, btn);
        wrap.append(header, pre);
        chatContainer.appendChild(wrap);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// 5) Spinner toggle
function toggleSpinner(on) {
    spinner.style.display = on ? 'block' : 'none';
}

// 6) Validate Gemini API key
async function validateKey(key) {
    try {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/` +
            `gemini-2.0-flash:generateContent?key=${key}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: 'Hello'
                        }]
                    }]
                })
            }
        );
        const j = await res.json();
        return !!j?.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch {
        return false;
    }
}

// 7) Auto-extract memory facts
async function extractMemory(prompt, reply) {
    try {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/` +
            `gemini-2.0-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Conversation:\nUser: ${prompt}\nBot: ${reply}\n\n` +
                                `Extract any new user facts/preferences as bullet points:`
                        }]
                    }]
                })
            }
        );
        const j = await res.json();
        return (j?.candidates?.[0]?.content?.parts?.[0]?.text || '')
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.startsWith('- '))
            .map(l => l.slice(2));
    } catch {
        return [];
    }
}

// 8) Auth state listener
auth.onAuthStateChanged(async user => {
    if (!user) {
        loginBtn.style.display = 'block';
        logoutBtn.style.display = 'none';
        apiKeyModal.classList.add('hidden');
        chatApp.style.display = 'none';
        return;
    }
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'block';
    chatApp.style.display = 'none';

    userDocRef = db.collection('users').doc(user.uid);
    const snap = await userDocRef.get();
    if (!snap.exists) {
        await userDocRef.set({
            apiKey: null,
            memory: [],
            chatHistory: []
        });
    }
    const data = (await userDocRef.get()).data();
    apiKey = data.apiKey;
    memory = data.memory || [];
    chatHistory = data.chatHistory || [];

    // render past conversation
    chatContainer.innerHTML = '';
    chatHistory.forEach(m => render(m.text, m.role));

    if (apiKey) {
        apiKeyModal.classList.add('hidden');
        chatApp.style.display = 'flex';
    } else {
        apiKeyModal.classList.remove('hidden');
    }
});

// 9) Sign in/out
loginBtn.onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
logoutBtn.onclick = () => auth.signOut();

// 10) Change API key flow
changeKeyBtn.onclick = () => {
    apiKeyInput.value = '';
    apiKeyError.style.display = 'none';
    apiKeyModal.classList.remove('hidden');
};
saveApiKeyBtn.onclick = async () => {
    const key = apiKeyInput.value.trim();
    if (!key) return;
    apiKeyError.style.display = 'none';
    saveApiKeyBtn.disabled = true;
    saveApiKeyBtn.textContent = 'Validating…';

    if (!(await validateKey(key))) {
        apiKeyError.style.display = 'block';
        saveApiKeyBtn.disabled = false;
        saveApiKeyBtn.textContent = 'Validate & Save';
        return;
    }

    apiKey = key;
    await userDocRef.update({
        apiKey
    });
    apiKeyModal.classList.add('hidden');
    chatApp.style.display = 'flex';
    saveApiKeyBtn.disabled = false;
    saveApiKeyBtn.textContent = 'Validate & Save';
};

// 11) Send + persist every message
sendBtn.onclick = async () => {
    const prompt = inputText.value.trim();
    if (!prompt) return;
    inputText.value = '';

    // render & store user
    render(prompt, 'user');
    chatHistory.push({
        role: 'user',
        text: prompt
    });
    await userDocRef.update({
        chatHistory
    });

    // build full context
    let context = '';
    if (memory.length) {
        context += 'Memory:\n- ' + memory.join('\n- ') + '\n\n';
    }
    chatHistory.forEach(m => {
        context += (m.role === 'user' ? 'User: ' : 'Bot: ') + m.text + '\n';
    });
    context += '\nUser: ' + prompt + '\nBot:';

    // detect code modifications
    let finalPrompt = context;
    if (/^(add|modify|update|insert|improve|comment)/i.test(prompt)) {
        const last = [...chatHistory].reverse()
            .find(m => m.role === 'bot' && /```[\w-]+\n[\s\S]*?```/.test(m.text));
        if (last) {
            finalPrompt =
                'Memory:\n- ' + memory.join('\n- ') + '\n\n' +
                'Modify this code per request: "' + prompt + '"\n\n' +
                last.text;
        }
    }

    // call Gemini
    toggleSpinner(true);
    let reply = 'No response.';
    try {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/` +
            `gemini-2.0-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: finalPrompt
                        }]
                    }]
                })
            }
        );
        const j = await res.json();
        reply = j?.candidates?.[0]?.content?.parts?.[0]?.text || reply;
    } catch (e) {
        console.error(e);
        reply = 'Error fetching response.';
    } finally {
        toggleSpinner(false);
    }

    // render & store bot
    render(reply, 'bot');
    chatHistory.push({
        role: 'bot',
        text: reply
    });
    await userDocRef.update({
        chatHistory
    });

    // auto-extract memory
    const facts = await extractMemory(finalPrompt, reply);
    const unique = facts.filter(f => !memory.includes(f));
    if (unique.length) {
        memory.push(...unique);
        await userDocRef.update({
            memory
        });
    }
};

// 12) Enter key sends
inputText.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendBtn.click();
});
