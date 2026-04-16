const TelegramBot = require('node-telegram-bot-api');
const { PassThrough } = require('stream');
const axios = require('axios');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const { createCanvas, loadImage, registerFont } = require('canvas');
const QRCode = require('qrcode');
const cors = require('cors');
const sharp = require('sharp');
const { triggerRestart } = require('./restart.js');
const os = require('os');
const canvas = require('canvas');

// --- BOT CONFIGURATION ---
const TOKEN = '8271498252:AAHdkZYo2OFIMkZogA1uVyRnlyJegB2QQ8o';
const ADMIN_ID = 7660176067;
const LOGSid = -1003670853715;
const DB_FILE = './users.json';
const CHid = '-1003250925248';
const ASUPANid = '-1003239729391';
const CHANNEL_USER = '@execuidornew';
const OWNER_URL = "https://t.me/onedikaa";
const fs = require('fs-extra');
const CHAT_ID = '-1003705000715';
const DELAY_BETWEEN_POSTS = 60000;
const styles = ["primary", "danger", "success", "warning", "info"];
const adminIds = [7660176067, 1815233335, 1070806986];
const telegramLinkRegex = /(t\.me|telegram\.me)\/([a-zA-Z0-9_]{5,}|joinchat\/[a-zA-Z0-9_-]+)/i;

// --- GITHUB CONFIGURATION ---
const GITHUB_TOKEN = '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';
const GITHUB_USER = 'obitoGlory';
const GITHUB_REPO = 'BackupBkpVideo';
const GITHUB_DB_PATH = 'db/users.json';
const GITHUB_DB_FOLDER = 'db'; // folder di GitHub untuk semua .json backup

// --- ASSETS ---
const IMAGE_URL = "https://files.catbox.moe/wy41yn.jpg";
const FALLBACK_PROFILE_PIC = 'https://files.catbox.moe/6yxrir.jpg';

// --- INITIALIZATION ---
const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();
const PORT = process.env.PORT || 1500;
const userLocks = new Set();
const AUTOPOST_HISTORY_FILE = './autopost_history.json';
let autoPostHistory = [];
try {
    if (fs.existsSync(AUTOPOST_HISTORY_FILE)) {
        autoPostHistory = JSON.parse(fs.readFileSync(AUTOPOST_HISTORY_FILE, 'utf8'));
    }
} catch (e) { autoPostHistory = []; }
const NOTIFIED_VIDEOS_FILE = './notified_videos.json';
let notifiedVideos = [];
try {
    if (fs.existsSync(NOTIFIED_VIDEOS_FILE)) {
        notifiedVideos = JSON.parse(fs.readFileSync(NOTIFIED_VIDEOS_FILE, 'utf8'));
    }
} catch (e) { notifiedVideos = []; }
const SESSION_TOKEN = Buffer.from(`admin:andikawewe`).toString('base64');

// --- UTILITIES ---

function escapeHtml(text) {
    if (!text) return '';
    return text.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'ALLOW-FROM https://t.me/');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
});

// --- AUTHENTICATION UTILS ---

async function getAuthUser(req) {
    const token = req.cookies && req.cookies.auth_token;
    if (!token) return null;

    let users = await getRemoteUsers();
    
    // Special check for default admin
    if (token === SESSION_TOKEN) {
         let admin = users.find(u => (u.id || u) === ADMIN_ID);
         if (admin) {
             admin.role = 'admin';
             return admin;
         }
         return { id: ADMIN_ID, role: 'admin', first_name: 'Admin' };
    }

    const user = users.find(u => u.currentSession === token);
    if (user) {
        if (!user.role) user.role = 'user';
        return user;
    }
    return null;
}

async function isAuthenticated(req) {
    const user = await getAuthUser(req);
    return user !== null;
}

function fixUrl(url) {
    if (!url) return url;
    return url.replace(/&#039;/g, "'");
}

// --- ERROR REPORTING ---

async function reportError(error, context = 'Global', msg = null) {
    console.error(`[ERROR REPORT] ${context}:`, error);

    let userInfo = 'Unknown';
    if (msg && msg.from) {
        const firstName = msg.from.first_name || 'ᴜsᴇʀ';
        const lastName = msg.from.last_name || '';
        const name = (firstName + ' ' + lastName).trim();
        const username = msg.from.username ? `@${msg.from.username}` : 'N/A';
        userInfo = `${name} (<code>${msg.from.id}</code>) ${username}`;
    }

    const logText = `🚨 <b>Error Report</b>\n\n` +
        `👤 <b>User:</b> ${userInfo}\n` +
        `💬 <b>Command:</b> ${context}\n\n` +
        `🧩 <b>Error:</b> <code>${error.message || error}</code>\n` +
        `🪲 <b>Stack Trace:</b>\n<pre>${error.stack ? error.stack.slice(0, 1000) : 'No stack trace'}</pre>`;

    const buttons = {
        inline_keyboard: [
            [
                { text: "👥 Join Grup", url: "https://t.me/execuidornew" },
                { text: "📢 Community", url: "https://t.me/execuidornew" }
            ],
            [{ text: "👑 Owner", url: OWNER_URL }]
        ]
    };

    try {
        await bot.sendMessage(ADMIN_ID, logText, { parse_mode: 'HTML', reply_markup: buttons }).catch(() => {});
        if (LOGSid && LOGSid !== ADMIN_ID) {
            await bot.sendMessage(LOGSid, logText, { parse_mode: 'HTML', reply_markup: buttons }).catch(() => {});
        }
    } catch (e) {
        console.error("Gagal mengirim error log:", e);
    }
}

// --- CANVAS GENERATORS ---

async function generateIDCard(userData) {
    const width = 800;
    const height = 500;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Gradient Background
    const mainBg = ctx.createLinearGradient(0, 0, width, height);
    mainBg.addColorStop(0, '#050a30');
    mainBg.addColorStop(0.5, '#000c66');
    mainBg.addColorStop(1, '#000000');
    ctx.fillStyle = mainBg;
    ctx.fillRect(0, 0, width, height);

    // Decorative Elements
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.beginPath();
    ctx.arc(width * 0.8, height * 0.2, 180, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
    }
    for (let i = 0; i < height; i += 40) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
        ctx.stroke();
    }

    // Modern Border
    const borderGradient = ctx.createLinearGradient(0, 0, width, height);
    borderGradient.addColorStop(0, '#00f2fe');
    borderGradient.addColorStop(1, '#4facfe');
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, width - 12, height - 12);

    // --- Profile Image ---
    try {
        let profileImg;
        try {
            profileImg = await loadImage(userData.profilePicUrl || FALLBACK_PROFILE_PIC);
        } catch (e) {
            profileImg = await loadImage(FALLBACK_PROFILE_PIC);
        }

        const px = 70, py = 100, ps = 240;

        ctx.shadowBlur = 30;
        ctx.shadowColor = '#4facfe';

        ctx.save();
        ctx.beginPath();
        ctx.arc(px + ps / 2, py + ps / 2, ps / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(profileImg, px, py, ps, ps);
        ctx.restore();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(px + ps / 2, py + ps / 2, ps / 2 + 5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#4facfe';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px + ps / 2, py + ps / 2, ps / 2 + 12, 0, Math.PI * 2);
        ctx.stroke();

    } catch (err) {
        console.error("Canvas image error:", err);
    }

    // --- User Info Text ---
    const tx = 360;
    ctx.textBaseline = 'top';

    ctx.font = 'bold 45px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('INFORMATION', tx, 80);

    ctx.fillStyle = '#4facfe';
    ctx.fillRect(tx, 135, 380, 5);

    const data = [
        { label: 'NAME', value: (userData.firstName + (userData.lastName ? ' ' + userData.lastName : '')).trim() || '-' },
        { label: 'USER ID', value: userData.userId.toString() },
        { label: 'USERNAME', value: userData.username ? `@${userData.username}` : '-' }
    ];

    data.forEach((item, i) => {
        const y = 180 + (i * 55);
        ctx.font = 'bold 20px sans-serif';
        ctx.fillStyle = '#4facfe';
        ctx.fillText(`${item.label}:`, tx, y);

        const labelWidth = ctx.measureText(`${item.label}: `).width;
        ctx.font = 'bold 26px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(item.value, tx + labelWidth + 10, y - 4);
    });

    // --- QR Code ---
    try {
        const qrUrl = userData.username ? `https://t.me/${userData.username}` : `tg://user?id=${userData.userId}`;
        const qrSize = 130;
        const qrx = 648, qry = 348;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.strokeStyle = '#4facfe';
        ctx.lineWidth = 2;
        const r = 15;
        ctx.beginPath();
        ctx.moveTo(qrx - 10 + r, qry - 10);
        ctx.lineTo(qrx + qrSize + 10 - r, qry - 10);
        ctx.quadraticCurveTo(qrx + qrSize + 10, qry - 10, qrx + qrSize + 10, qry - 10 + r);
        ctx.lineTo(qrx + qrSize + 10, qry + qrSize + 10 - r);
        ctx.quadraticCurveTo(qrx + qrSize + 10, qry + qrSize + 10, qrx + qrSize + 10 - r, qry + qrSize + 10);
        ctx.lineTo(qrx - 10 + r, qry + qrSize + 10);
        ctx.quadraticCurveTo(qrx - 10, qry + qrSize + 10, qrx - 10, qry + qrSize + 10 - r);
        ctx.lineTo(qrx - 10, qry - 10 + r);
        ctx.quadraticCurveTo(qrx - 10, qry - 10, qrx - 10 + r, qry - 10);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();

        const qrDataUrl = await QRCode.toDataURL(qrUrl, {
            color: { dark: '#ffffff', light: '#00000000' },
            width: qrSize,
            margin: 1
        });
        const qrImg = await loadImage(qrDataUrl);
        ctx.drawImage(qrImg, qrx, qry, qrSize, qrSize);
    } catch (err) { }

    ctx.font = 'italic bold 24px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.textAlign = 'left';
    ctx.fillText('by @onedikaa', 70, 440);

    return canvas.toBuffer('image/png');
}

// --- DATABASE SYNC ---

// ═══════════════════════════════════════════════════════
// MERGE HELPERS — gabungkan data lokal + GitHub, tidak ada yang hilang
// ═══════════════════════════════════════════════════════

// Merge dua array users by ID
// Lokal = prioritas update (data terbaru), GitHub = sumber data lama yang belum ada di lokal
function mergeUsers(localArr, remoteArr) {
    if (!Array.isArray(localArr)) localArr = [];
    if (!Array.isArray(remoteArr)) remoteArr = [];

    const map = new Map();

    const normalize = (u) => {
        if (typeof u === 'object' && u !== null) return u;
        return { id: u, role: 'user', is_vip: false };
    };

    for (const u of remoteArr) {
        const item = normalize(u);
        const id = String(item.id);
        map.set(id, item);
    }

    for (const u of localArr) {
        const item = normalize(u);
        const id = String(item.id);
        
        if (map.has(id)) {
            const remoteUser = map.get(id);
            const mergedUser = Object.assign({}, remoteUser, item);
            
            // Deep merge untuk array history/referral agar tidak ada yang terhapus
            if (Array.isArray(remoteUser.video_history) && Array.isArray(item.video_history)) {
                mergedUser.video_history = [...new Set([...remoteUser.video_history, ...item.video_history])];
            }
            if (Array.isArray(remoteUser.referrals) && Array.isArray(item.referrals)) {
                mergedUser.referrals = [...new Set([...remoteUser.referrals, ...item.referrals])];
            }
            
            map.set(id, mergedUser);
        } else {
            map.set(id, item);
        }
    }
    return Array.from(map.values());
}

// Merge dua array sederhana (string/number) — gabungkan + deduplicate
function mergeSimpleArray(localArr, remoteArr) {
    if (!Array.isArray(localArr)) localArr = [];
    if (!Array.isArray(remoteArr)) remoteArr = [];
    return [...new Set([...remoteArr, ...localArr])];
}

// Baca file JSON dari GitHub (raw, tanpa merge) - Pakai anti-cache agar SHA tidak basi
async function fetchJsonFromGithub(githubPath) {
    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${githubPath}?t=${Date.now()}`;
    try {
        const res = await axios.get(url, { 
            headers: { 
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            } 
        });
        const content = Buffer.from(res.data.content, 'base64').toString('utf-8');
        return { data: JSON.parse(content), sha: res.data.sha };
    } catch (e) {
        return { data: null, sha: null };
    }
}

// ───────────────────────────────────────────────────────
// Per-file upload queue — cegah concurrent upload file yang sama
// ───────────────────────────────────────────────────────
const _uploadQueue = {}; 
const _lastFileHash = {}; // Untuk mencegah loop tak berujung (watch -> backup -> write -> watch)

function getHash(content) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(typeof content === 'string' ? content : JSON.stringify(content)).digest('hex');
}

function queueUpload(filename, fn) {
    // Chain promise agar upload file yang sama berjalan satu per satu
    const prev = _uploadQueue[filename] || Promise.resolve();
    const next = prev.then(() => fn()).catch(() => {}); // error sudah di-handle dalam fn
    _uploadQueue[filename] = next;
    return next;
}

// Upload JSON ke GitHub (PUT) — pure helper, tidak ada retry di sini
async function pushJsonToGithub(githubPath, data, sha = null, commitMsg = null) {
    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${githubPath}`;
    const body = {
        message: commitMsg || `auto-backup: ${path.basename(githubPath)}`,
        content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
    };
    if (sha) body.sha = sha;
    // axios akan throw jika status bukan 2xx
    await axios.put(url, body, { headers: { Authorization: `token ${GITHUB_TOKEN}` } });
}

// ───────────────────────────────────────────────────────
// backupFileToGithub — MERGE lokal + GitHub lalu upload
// Retry hingga MAX_RETRIES kali jika dapat 409 (SHA basi)
// Setiap retry: fetch SHA terbaru, merge ulang, upload
// ───────────────────────────────────────────────────────
async function backupFileToGithub(filename, localContent) {
    // Masukkan ke queue agar upload file yang sama tidak concurrent
    return queueUpload(filename, () => _doBackup(filename, localContent));
}

async function _doBackup(filename, localContent) {
    const githubPath = `${GITHUB_DB_FOLDER}/${filename}`;
    const MAX_RETRIES = 5;

    // Parse konten lokal
    let localData;
    try {
        localData = typeof localContent === 'string' ? JSON.parse(localContent)
            : (Buffer.isBuffer(localContent) ? JSON.parse(localContent.toString('utf8')) : localContent);
    } catch (e) {
        console.error(`[BACKUP] ❌ ${filename}: konten lokal bukan JSON valid, skip.`);
        return;
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Selalu fetch SHA terbaru setiap attempt
            const { data: remoteData, sha } = await fetchJsonFromGithub(githubPath);

            // Merge berdasarkan tipe data
            let merged;
            if (remoteData === null) {
                merged = localData;
            } else if (Array.isArray(localData) && Array.isArray(remoteData)) {
                const isUserArray = (localData.length > 0 && typeof localData[0] === 'object' && localData[0].id)
                    || (remoteData.length > 0 && typeof remoteData[0] === 'object' && remoteData[0].id);
                merged = isUserArray ? mergeUsers(localData, remoteData) : mergeSimpleArray(localData, remoteData);
            } else if (typeof localData === 'object' && !Array.isArray(localData)
                    && typeof remoteData === 'object' && !Array.isArray(remoteData)) {
                merged = Object.assign({}, remoteData, localData);
            } else {
                merged = localData;
            }

            const currentHash = getHash(merged);
            const remoteHash = remoteData ? getHash(remoteData) : null;
            const localHash = getHash(localData);

            // Jika merged sama dengan remote, tidak perlu upload ke GitHub
            const needsUpload = currentHash !== remoteHash;
            // Jika merged sama dengan local, tidak perlu tulis ke disk
            const needsLocalWrite = currentHash !== localHash;

            if (!needsUpload && !needsLocalWrite) {
                _lastFileHash[filename] = currentHash;
                return; // Tidak ada yang berubah di kedua sisi
            }

            if (needsUpload) {
                await pushJsonToGithub(githubPath, merged, sha);
            }

            if (needsLocalWrite) {
                // Update hash sebelum menulis agar watcher bisa mengidentifikasi bahwa ini perubahan internal
                _lastFileHash[filename] = currentHash;
                fs.writeFileSync(`./${filename}`, JSON.stringify(merged, null, 2), 'utf8');
            } else {
                _lastFileHash[filename] = currentHash;
            }

            if (needsUpload) {
                const rec = Array.isArray(merged) ? `${merged.length} records` : 'merged';
                console.log(`[BACKUP] ✅ [${attempt}/${MAX_RETRIES}] ${filename} → GitHub /db/${filename} (${rec})`);
            }
            return; 

        } catch (err) {
            const status = err.response ? err.response.status : null;
            const errorMsg = err.response && err.response.data ? JSON.stringify(err.response.data) : err.message;
            const is409 = status === 409 || errorMsg.includes('409') || errorMsg.includes('does not match');

            if (is409 && attempt < MAX_RETRIES) {
                // SHA conflict — tunggu sebentar lalu retry dengan SHA terbaru
                const wait = attempt * 1000; // 1s, 2s, 3s...
                console.warn(`[BACKUP] ⚠️ SHA conflict ${filename} (attempt ${attempt}/${MAX_RETRIES}), retry in ${wait}ms...`);
                await new Promise(r => setTimeout(r, wait));
                continue;
            }

            // Error lain atau sudah max retry
            console.error(`[BACKUP] ❌ Gagal backup ${filename} setelah ${attempt} percobaan:`, err.message);
            return;
        }
    }
}

// Kompatibel dengan kode lama — backup users.json dengan merge
async function backupToGithub(data) {
    await backupFileToGithub('users.json', data);
}

// Backup SEMUA .json lokal ke GitHub /db/ (dengan merge masing-masing)
async function backupAllJsonToGithub() {
    try {
        const files = fs.readdirSync('./').filter(f => f.endsWith('.json'));
        const summary = [];
        for (const file of files) {
            try {
                const raw = fs.readFileSync(`./${file}`, 'utf8');
                JSON.parse(raw); // validasi JSON dulu
                await backupFileToGithub(file, raw);
                summary.push(`✅ ${file}`);
            } catch (e) {
                summary.push(`❌ ${file}: ${e.message}`);
                console.error(`[BACKUP] Skip ${file}:`, e.message);
            }
        }
        console.log(`[BACKUP] ✅ Semua .json selesai diproses ke GitHub /db/`);
        return summary;
    } catch (err) {
        console.error('[BACKUP] Error saat backup all json:', err.message);
        return [];
    }
}

// Restore: ambil semua .json dari GitHub /db/, MERGE dengan lokal, simpan lokal
async function restoreAllJsonFromGithub() {
    const folderUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_DB_FOLDER}`;
    const results = [];
    try {
        const res = await axios.get(folderUrl, { headers: { Authorization: `token ${GITHUB_TOKEN}` } });
        const jsonFiles = res.data.filter(f => f.type === 'file' && f.name.endsWith('.json'));

        for (const file of jsonFiles) {
            try {
                const { data: remoteData } = await fetchJsonFromGithub(`${GITHUB_DB_FOLDER}/${file.name}`);
                if (remoteData === null) { results.push({ file: file.name, status: 'skip', msg: 'tidak bisa dibaca' }); continue; }

                // Baca data lokal jika ada
                let localData = null;
                if (fs.existsSync(`./${file.name}`)) {
                    try { localData = JSON.parse(fs.readFileSync(`./${file.name}`, 'utf8')); } catch (_) { }
                }

                let merged;
                if (localData === null) {
                    merged = remoteData;
                } else if (Array.isArray(remoteData) && Array.isArray(localData)) {
                    const isUserArr = remoteData.length > 0 && typeof remoteData[0] === 'object' && remoteData[0].id;
                    merged = isUserArr ? mergeUsers(localData, remoteData) : mergeSimpleArray(localData, remoteData);
                } else if (typeof remoteData === 'object' && !Array.isArray(remoteData)) {
                    merged = Object.assign({}, remoteData, localData);
                } else {
                    merged = remoteData;
                }

                fs.writeFileSync(`./${file.name}`, JSON.stringify(merged, null, 2), 'utf8');
                results.push({ file: file.name, status: 'ok', count: Array.isArray(merged) ? merged.length : '-' });
                console.log(`[RESTORE] ✅ ${file.name} dipulihkan & di-merge dari GitHub (${Array.isArray(merged) ? merged.length + ' records' : 'ok'})`);
            } catch (e) {
                results.push({ file: file.name, status: 'error', msg: e.message });
                console.error(`[RESTORE] ❌ Gagal restore ${file.name}:`, e.message);
            }
        }
    } catch (err) {
        console.error('[RESTORE] Gagal akses folder /db di GitHub:', err.message);
    }
    return results;
}

// Load satu file .json dari GitHub (dipakai internal jika perlu)
async function loadJsonFromGithub(filename) {
    const { data } = await fetchJsonFromGithub(`${GITHUB_DB_FOLDER}/${filename}`);
    return data;
}

// ───────────────────────────────────────────────────────
// watchJsonFiles — pantau perubahan lokal, auto merge+backup ke GitHub
// ───────────────────────────────────────────────────────
const _jsonWatchDebounce = {};
function watchJsonFiles() {
    // Cari semua file .json di folder saat ini (kecuali package.json dan lock)
    const getJsonFiles = () => fs.readdirSync('./').filter(f => f.endsWith('.json') && !f.includes('package'));
    
    const setupWatch = (filename) => {
        const filepath = `./${filename}`;
        fs.watch(filepath, (eventType) => {
            if (eventType !== 'change') return;
            
            clearTimeout(_jsonWatchDebounce[filename]);
            _jsonWatchDebounce[filename] = setTimeout(async () => {
                try {
                    if (!fs.existsSync(filepath)) return;
                    const raw = fs.readFileSync(filepath, 'utf8');
                    if (!raw || raw.trim() === '') return;
                    
                    const currentHash = getHash(raw);
                    // Jika hash sama dengan proses backup terakhir, jangan backup lagi (loop prevention)
                    if (_lastFileHash[filename] === currentHash) return;
                    
                    JSON.parse(raw); 
                    await backupFileToGithub(filename, raw);
                } catch (e) {
                    console.error(`[WATCH] Gagal auto-backup ${filename}:`, e.message);
                }
            }, 3000); // Debounce 3 detik untuk keamanan
        });
        console.log(`[WATCH] 👁️ Memantau: ${filename}`);
    };

    // Jalankan awal
    const files = getJsonFiles();
    files.forEach(setupWatch);

    // Scan file baru setiap 1 menit (jika ada file baru ditambahkan)
    setInterval(() => {
        const currentFiles = getJsonFiles();
        currentFiles.forEach(f => {
            if (!_jsonWatchDebounce[f]) {
                setupWatch(f);
                _jsonWatchDebounce[f] = true; // penanda sudah di-watch
            }
        });
    }, 60000);
}

// ───────────────────────────────────────────────────────
// getRemoteUsers — ambil users dari GitHub, MERGE dengan lokal, return hasil merge
// ───────────────────────────────────────────────────────
async function getRemoteUsers() {
    try {
        const { data: remoteUsers } = await fetchJsonFromGithub(GITHUB_DB_PATH);

        // Baca data lokal
        let localUsers = [];
        if (fs.existsSync(DB_FILE)) {
            try { localUsers = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (_) { }
        }

        if (remoteUsers === null) {
            // GitHub tidak bisa diakses — pakai lokal saja
            return localUsers;
        }

        // Merge keduanya — semua user dari kedua sumber tercatat
        const merged = mergeUsers(localUsers, remoteUsers);

        // Simpan hasil merge ke lokal
        fs.writeFileSync(DB_FILE, JSON.stringify(merged, null, 2), 'utf8');
        return merged;
    } catch (err) {
        console.error('[DB] getRemoteUsers error:', err.message);
        if (fs.existsSync(DB_FILE)) {
            try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (_) { return []; }
        }
        return [];
    }
}

async function removeUser(userId) {
    let users = await getRemoteUsers();
    const originalCount = users.length;
    const filtered = users.filter(u => (u.id || u) !== userId);

    if (originalCount !== filtered.length) {
        fs.writeFileSync(DB_FILE, JSON.stringify(filtered, null, 2));
        await backupToGithub(filtered);

        const text = `<b>[ᴅᴀᴛᴀʙᴀsᴇ ᴜᴘᴅᴀᴛᴇ]</b>\n\n` +
            `ᴜsᴇʀ <code>${userId}</code> ᴛᴇʟᴀʜ ᴅɪʜᴀᴘᴜs ᴅᴀʀɪ ᴅᴀᴛᴀʙᴀsᴇ.\n` +
            `ᴀʟᴀsᴀɴ: ᴍᴇᴍʙʟᴏᴋɪʀ ʙᴏᴛ (ᴘᴏʟʟɪɴɢ ᴇʀʀᴏʀ 𝟺𝟶𝟹)`;

        const buttons = {
            inline_keyboard: [
                [
                    { text: "👑 ᴏᴡɴᴇʀ", url: "https://t.me/onedikaa", style: "danger" },
                    { text: "🤖 ᴀsᴜᴘᴀɴ", url: "https://t.me/obitosupportuserbot?start=help", style: "primary" }
                ]
            ]
        };

        try {
            await bot.sendMessage(CHid, text, { parse_mode: "HTML", reply_markup: buttons });
        } catch (e) { }
    }
}

async function checkSub(userId) {
    try {
        const member = await bot.getChatMember(CHid, userId);
        return ['member', 'administrator', 'creator'].includes(member.status);
    } catch (e) {
        if (e.response && e.response.body.error_code === 403) {
            await removeUser(userId);
        }
        return false;
    }
}

async function getRandomVideo(history = [], allowedFolders = null) {
    const defaultFolders = ['videoINDONESIA', 'videos', 'videoHIJAB', 'videoJAV', 'asupan'];
    const targetFolders = allowedFolders || defaultFolders;
    const shuffledFolders = [...targetFolders].sort(() => Math.random() - 0.5);

    for (const folder of shuffledFolders) {
        const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${folder}`;
        try {
            const res = await axios.get(url, {
                headers: {
                    Authorization: `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            let videos = res.data.filter(file =>
                file.type === 'file' && file.name.match(/\.(mp4|mov|avi|mkv)$/i)
            );

            if (history && history.length > 0) {
                videos = videos.filter(v => !history.includes(v.name));
            }

            if (videos.length > 0) {
                const selected = videos[Math.floor(Math.random() * videos.length)];
                const encodedName = encodeURIComponent(selected.name);
                const rawUrl = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/main/${folder}/${encodedName}`;
                return {
                    url: rawUrl,
                    filename: selected.name,
                    folder: folder
                };
            }
        } catch (err) {
            continue;
        }
    }
    return null;
}

// --- USER MANAGEMENT ---

async function saveUser(msg) {
    let users = await getRemoteUsers();
    const userId = msg.from.id;

    const referrerIdMatch = msg.text ? msg.text.match(/\/start ref_(\d+)/) : null;
    const referrerId = referrerIdMatch ? parseInt(referrerIdMatch[1]) : null;

    const newUser = {
        id: userId,
        first_name: msg.from.first_name || 'ᴜsᴇʀ',
        username: msg.from.username || 'ɴ/ᴀ',
        is_vip: false,
        vip_type: null,
        role: 'user',
        password: null,
        currentSession: null,
        last_request_time: 0,
        video_history: [],
        referrals: [],
        referred_by: referrerId,
        managed_by: null,
        date: new Date().toLocaleString('id-ID')
    };

    const getFullButtons = (idx) => ({
        inline_keyboard: [
            [
                { text: "🤖 ʙᴏᴛ ᴀsᴜᴘᴀɴ", url: "https://t.me/obitosupportuserbot?start=help", style: styles[idx] },
                { text: "👑 ᴏᴡɴᴇʀ", url: "https://t.me/onedikaa", style: styles[(idx + 1) % styles.length] }
            ],
            [
                { text: "📢 ᴄʜᴀɴɴᴇʟ", url: "https://t.me/execuidornew", style: styles[(idx + 2) % styles.length] },
                { text: "📂 ᴀʀᴄʜɪᴠᴇ", url: "https://t.me/porqueen", style: styles[idx] }
            ],
            [{ text: "🌐 ᴡᴇʙsɪᴛᴇ", url: "https://dikaa.cyvera.me", style: styles[(idx + 1) % styles.length] }]
        ]
    });

    if (!users.some(u => (u.id || u) === userId)) {
        if (referrerId && referrerId !== userId) {
            const referrerIdx = users.findIndex(u => (u.id || u) === referrerId);
            if (referrerIdx !== -1) {
                if (!users[referrerIdx].referrals) users[referrerIdx].referrals = [];
                if (!users[referrerIdx].referrals.includes(userId)) {
                    users[referrerIdx].referrals.push(userId);
                    await bot.sendMessage(CHid, `<b>[ ʀᴇғᴇʀʀᴀʟ ᴜᴘᴅᴀᴛᴇ ]</b>\n\nᴜsᴇʀ <code>${userId}</code> ʙᴇʀʜᴀsɪʟ ᴅɪʀᴇғᴇʀᴇɴsɪᴋᴀɴ ᴏʟᴇʜ <code>${referrerId}</code>`, {
                        parse_mode: "HTML",
                        reply_markup: getFullButtons(0)
                    });
                }
            }
        }
        users.push(newUser);
        fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
        await backupToGithub(users);

        const videoUrl = 'https://cdn.jsdelivr.net/gh/IkyyExecutive-v2/IkyySukaNgewe@main/uploads/1774504596943_20270_1774504594642_file_3851.mp4';
        const caption = `<b>[ ᴅᴀᴛᴀʙᴀsᴇ ] ɴᴇᴡ ᴜsᴇʀ sɪɢɴ-ᴜᴘ</b>\n\n` +
            `👤 <b>ɴᴀᴍᴇ:</b> ${newUser.first_name}\n` +
            `🆔 <b>ɪᴅ:</b> <code>${newUser.id}</code>\n` +
            `🔗 <b>ᴜsᴇʀ:</b> @${newUser.username}\n` +
            (referrerId ? `🤝 <b>ʀᴇғ ʙʏ:</b> <code>${referrerId}</code>\n` : '') +
            `📅 <b>ᴊᴏɪɴᴇᴅ:</b> <code>${newUser.date}</code>`;

        try {
            await bot.sendVideo(CHid, videoUrl, {
                caption: caption,
                parse_mode: 'HTML',
                reply_markup: getFullButtons(0)
            });
        } catch (e) {
            console.error("Gagal mengirim video pendaftaran:", e);
        }
    }
}

// --- VIDEO DELIVERY ---

const getRichCaption = () => {
    return `🌟 <b>𝖢𝖮𝖭𝖳𝖤𝖭𝖳 𝖴𝖯DA𝖳𝖤</b> 🌟\n\n` +
        `<blockquote>🎬 <b>ᴀsᴜᴘᴀɴ ᴛᴇʀʙᴀʀᴜ ʜᴀʀɪ ɪɴɪ 💦</b>\n` +
        `ᴊᴀɴɢᴀɴ sᴀᴍᴘᴀɪ ᴋᴇᴛɪɴɢɢᴀʟᴀɴ ᴠɪᴅᴇᴏ ᴘᴀʟɪɴɢ ᴘᴀɴᴀs ʜᴀʀɪ ɪɴɪ sᴏʙᴀᴛ ᴇxᴇᴄᴜᴛɪᴠᴇ.</blockquote>\n\n` +
        `<blockquote>💎 <b>ᴇxᴄʟᴜsɪᴠᴇ ᴠɪᴘ ʙᴇɴᴇꜰɪᴛs:</b>\n` +
        `┌ ✅ <b>ᴀᴋsᴇs ᴛᴀɴᴘᴀ ʙᴀᴛᴀs</b>\n` +
        `├ ✅ <b>ᴋᴜᴀʟɪᴛᴀs ʜᴅ ᴛᴀɴᴘᴀ sᴇɴsᴏʀ</b>\n` +
        `├ ✅ <b>ᴊᴇᴅᴀ ʟᴇʙɪʜ sɪɴɢᴋᴀᴛ</b>\n` +
        `└ ✅ <b>ᴜᴘᴅᴀᴛᴇ ᴠɪᴅᴇᴏ ʜᴀʀɪᴀɴ</b>\n</blockquote>` +
        `💰 <b>ᴘʀɪᴄᴇ:</b> 𝟻𝟶ᴋ / ʟɪꜰᴇᴛɪᴍᴇ\n` +
        `📩 <b>ᴏʀᴅᴇʀ ᴠɪᴘ & ᴛᴇsᴛɪ:</b> @onedikaa\n\n` +
        `✨ <b>ᴜᴘᴅᴀᴛᴇᴅ:</b> <code>${new Date().toLocaleTimeString('id-ID')}</code>\n` +
        `🚀 <b>ᴋʟɪᴋ ᴛᴏᴍʙᴏʟ ᴅɪ ʙᴀᴡᴀʜ ᴜɴᴛᴜᴋ ᴍᴇɴᴏɴᴛᴏɴ:</b>`;
};

const getRichButtons = (idx, startLink = null) => {
    const mainButton = startLink ? 
        { text: "🎬 ᴛᴏɴᴛᴏɴ ᴠɪᴅᴇᴏ ᴛᴇʀʙᴀʀᴜ", url: startLink, style: styles[idx] } :
        { text: "ɴᴇxᴛ ᴠɪᴅᴇᴏ ➡️", callback_data: "next_video", style: styles[idx] };

    return {
        inline_keyboard: [
            [mainButton],
            [
                { text: "🤖 ʙᴏᴛ ᴀsᴜᴘᴀɴ", url: "https://t.me/obitosupportuserbot?start=help", style: styles[(idx + 1) % styles.length] },
                { text: "👑 ᴏᴡɴᴇʀ", url: "https://t.me/onedikaa", style: styles[(idx + 2) % styles.length] }
            ],
            [
                { text: "📢 ᴄʜᴀɴɴᴇʟ", url: "https://t.me/execuidornew", style: styles[idx] },
                { text: "📂 ᴀʀᴄʜɪᴠᴇ", url: "https://t.me/porqueen", style: styles[(idx + 1) % styles.length] }
            ],
            [{ text: "🌐 ᴡᴇʙsɪᴛᴇ", url: "https://dikaa.cyvera.me", style: styles[(idx + 2) % styles.length] }]
        ]
    };
};

async function downloadToBuffer(url, authToken = null) {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' };
    if (authToken) headers['Authorization'] = `token ${authToken}`;

    try {
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: headers,
            timeout: 120000,
            maxContentLength: 200 * 1024 * 1024
        });
        return Buffer.from(res.data);
    } catch (e) {
        throw new Error(`Download failed: ${e.message}`);
    }
}

async function sendRichVideo(chatId, videoUrl, filename, queryId = null, folder = 'videoINDONESIA') {
    const encodedName = encodeURIComponent(filename);

    // Prioritaskan raw.githubusercontent.com — paling reliable untuk binary files
    const urlCandidates = [
        videoUrl,
        `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/main/${folder}/${encodedName}`
    ];

    // Hapus duplikat URL
    const uniqueUrls = [...new Set(urlCandidates)];

    let videoBuffer = null;

    for (const url of uniqueUrls) {
        try {
            const buf = await downloadToBuffer(url, url.includes('raw.githubusercontent.com') ? GITHUB_TOKEN : null);
            if (buf && buf.length > 1024) { // minimal 1KB, bukan file kosong/error HTML
                videoBuffer = buf;
                break;
            }
        } catch (e) {
            console.error(`Gagal download dari ${url}:`, e.message);
        }
    }

    if (!videoBuffer) {
        return null;
    }

    // Force .mp4 — mencegah video blank hitam akibat ekstensi salah
    const safeFilename = filename.replace(/\.[^/.]+$/, '') + '.mp4';

    // Stream harus dibuat baru tiap percobaan — stream single-use
    const makeStream = () => {
        const s = new PassThrough();
        s.end(videoBuffer);
        return s;
    };

    try {
        return await bot.sendVideo(chatId, makeStream(), {
            filename: safeFilename,
            contentType: 'video/mp4',
            caption: getRichCaption(),
            parse_mode: 'HTML',
            supports_streaming: true,   // wajib agar Telegram render sebagai video player, bukan blank
            protect_content: false,
            reply_markup: getRichButtons(0)
        });
    } catch (e) {
        console.error("Gagal mengirim video:", e.message);
        return null; // Tidak fallback ke sendDocument — itu yang menyebabkan video blank hitam
    }
}

async function sendVipNotification(user, newStatus, vipType) {
    const userId = user.id || user;
    const name = user.first_name || 'ᴜsᴇʀ';
    const username = user.username || 'ɴ/ᴀ';
    const dateStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';

    let photo = IMAGE_URL;
    try {
        const userPhotos = await bot.getUserProfilePhotos(userId, { limit: 1 });
        if (userPhotos && userPhotos.total_count > 0) {
            photo = userPhotos.photos[0][0].file_id;
        }
    } catch (e) { }

    const statusText = newStatus ? `✅ <b>ᴀᴋᴛɪғ (ᴠɪᴘ)</b>` : `❌ <b>ɴᴏɴ-ᴀᴋᴛɪғ (ʙɪᴀsᴀ)</b>`;
    const typeMapping = {
        'paid': '💰 ᴘᴀɪᴅ ᴘʀᴇᴍɪᴜᴍ',
        'referral': '🤝 ʀᴇғᴇʀʀᴀʟ ᴘʀᴏᴍᴏ',
        'reseller_promo': '🏪 ʀᴇsᴇʟʟᴇʀ ᴘʀᴏᴍᴏ'
    };
    const typeLabel = typeMapping[vipType] || '-';

    const caption = `👑 <b>ᴜᴘᴅᴀᴛᴇ sᴛᴀᴛᴜs ᴘᴇɴɢɢᴜɴᴀ</b> 👑\n\n` +
        `<blockquote>👤 <b>ᴜsᴇʀ ɪɴғᴏ:</b>\n` +
        `┌ ɴᴀᴍᴇ: <b>${name}</b>\n` +
        `├ ɪᴅ: <code>${userId}</code>\n` +
        `└ ᴜsᴇʀ: @${username}</blockquote>\n\n` +
        `<blockquote>💎 <b>sᴛᴀᴛᴜs ʙᴀʀᴜ:</b>\n` +
        `┌ sᴛᴀᴛᴜs: ${statusText}\n` +
        `└ ᴛɪᴘᴇ: <b>${typeLabel}</b></blockquote>\n\n` +
        `<blockquote>📅 <b>ᴡɪʙ ᴛɪᴍᴇsᴛᴀᴍᴘ:</b>\n` +
        `<code>${dateStr}</code></blockquote>`;

    const channels = [CHid, LOGSid, ASUPANid];
    for (const cid of channels) {
        try {
            await bot.sendPhoto(cid, photo, {
                caption: caption,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: "👑 ᴏᴡɴᴇʀ", url: "https://t.me/onedikaa" }]]
                }
            });
        } catch (e) { }
    }
}

async function sendAsupan(chatId, queryId = null) {
    if (userLocks.has(chatId)) {
        if (queryId) {
            await bot.answerCallbackQuery(queryId, {
                text: '⚠️ sᴀʙᴀʀ sᴀʏᴀɴɢ, ᴊᴀɴɢᴀɴ sᴘᴀᴍ... ᴛᴜɴɢɢᴜ ᴠɪᴅᴇᴏ sᴇʙᴇʟᴜᴍɴʏᴀ sᴇʟᴇsᴀɪ.',
                show_alert: true
            });
        }
        return;
    }

    try {
        userLocks.add(chatId);
        let users = await getRemoteUsers();
        let userIdx = users.findIndex(u => (u.id || u) === chatId);
        let userArrIdx = userIdx;
        let user = users[userIdx];

        // Cek ulang status join channel — block user yang sudah keluar channel
        if (chatId !== ADMIN_ID) {
            const isSub = await checkSub(chatId);
            if (!isSub) {
                if (queryId) {
                    await bot.answerCallbackQuery(queryId, {
                        text: '⚠️ ᴋᴀᴍᴜ ᴛᴇʟᴀʜ ᴋᴇʟᴜᴀʀ ᴅᴀʀɪ ᴄʜᴀɴɴᴇʟ!',
                        show_alert: true
                    });
                }
                await bot.sendPhoto(chatId, "https://files.catbox.moe/wy41yn.jpg", {
                    caption: `⛔ <b>ᴀᴋsᴇs ᴅɪʙʟᴏᴋɪʀ</b>\n\nᴋᴀᴍᴜ ᴛᴇʟᴀʜ ᴋᴇʟᴜᴀʀ ᴅᴀʀɪ ᴄʜᴀɴɴᴇʟ.\nᴊᴏɪɴ ᴋᴇᴍʙᴀʟɪ ᴜɴᴛᴜᴋ ᴅᴀᴘᴀᴛ ᴍᴇɴɢɢᴜɴᴀᴋᴀɴ ʙᴏᴛ.`,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "📢 ᴊᴏɪɴ ᴄʜᴀɴɴᴇʟ", url: `https://t.me/${CHANNEL_USER.replace('@', '')}` }],
                            [{ text: "✅ sᴀʏᴀ sᴜᴅᴀʜ ᴊᴏɪɴ", callback_data: "check_join" }]
                        ]
                    }
                }).catch(() => {});
                return;
            }
        }

        if (chatId !== ADMIN_ID && user) {
            let cdTime = 60;
            if (user.is_vip) {
                cdTime = user.vip_type === 'referral' ? 30 : 0;
            }

            const now = Date.now();
            const lastTime = user.last_request_time || 0;
            const diff = (now - lastTime) / 1000;

            if (diff < cdTime) {
                const wait = Math.ceil(cdTime - diff);
                await bot.sendMessage(chatId, `⏳ <b>ᴄᴏᴏʟᴅᴏᴡɴ...</b>\n\nᴍᴀᴀғ sᴀʏᴀɴɢ, ᴋᴀᴍᴜ ʜᴀʀᴜs ᴍᴇɴɢɢᴜɴᴀᴋᴀɴ ᴊᴇᴅᴀ ${cdTime} ᴅᴇᴛɪᴋ ᴜɴᴛᴜᴋ ᴍᴇɴɢɢᴜɴᴀᴋᴀɴ ʙᴏᴛ ɪɴɪ ᴋᴇᴍʙᴀʟɪ.\n\nᴛᴜɴɢɢᴜ <b>${wait} sᴇᴄ</b> ʟᴀɢɪ.`, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[{ text: 'ʙᴜʏ ᴠɪᴘ 👑', style: "danger", url: 'https://t.me/onedikaa?text=bang%20mau%20buy%20vip'.replace(/ /g, '%20') }]]
                    }
                });
                return;
            }
        }

        if (queryId) {
            await bot.answerCallbackQuery(queryId, { text: '⌛ ᴍᴇᴍᴘʀᴏsᴇs ᴠɪᴅᴇᴏ ᴜɴᴛᴜᴋ ᴀɴᴅᴀ...', show_alert: false });
        }

        const allowedFolders = ['videoINDONESIA'];
        
        const result = await getRandomVideo(user ? user.video_history : [], allowedFolders);

        if (result) {
            const sentVideo = await sendRichVideo(chatId, result.url, result.filename, queryId, result.folder);

            if (sentVideo && userArrIdx !== -1 && chatId !== ADMIN_ID) {
                users[userArrIdx].last_request_time = Date.now();
                if (!users[userArrIdx].video_history) users[userArrIdx].video_history = [];
                users[userArrIdx].video_history.push(result.filename);

                if (users[userArrIdx].video_history.length > 100) {
                    users[userArrIdx].video_history.shift();
                }

                fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
            }
        } else {
            await bot.sendMessage(chatId, '❌ <b>ɢᴀɢᴀʟ ᴍᴇɴᴅᴀᴘᴀᴛᴋᴀɴ ᴠɪᴅᴇᴏ</b>\n\nsɪʟᴀʜᴋᴀɴ ᴄᴏʙᴀ ʙᴇʙᴇʀᴀᴘᴀ sᴀᴀᴛ ʟᴀɢɪ.', { parse_mode: 'HTML' });
        }

    } catch (err) {
        await reportError(err, 'sendAsupan');
    } finally {
        userLocks.delete(chatId);
    }
}

// --- COMMAND HANDLERS ---

bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const userId = msg.from.id;
    const isSub = await checkSub(userId);

    if (!isSub) {
        const photoUrl = "https://files.catbox.moe/wy41yn.jpg";
        const caption = "⚠️ <b>ᴀᴋsᴇs ᴅɪᴛᴏʟᴀᴋ</b>\n\nᴋᴀᴍᴜ ᴛᴇʟᴀʜ ʙᴇʀʜᴀsɪʟ ᴍᴀsᴜᴋ ᴋᴇ ᴅᴀʟᴀᴍ ʙᴏᴛ.\nɴᴀᴍᴜɴ ᴋᴀᴍᴜ ʜᴀʀᴜs ᴊᴏɪɴ ᴄʜᴀɴɴᴇʟ ᴅᴜʟᴜ ʙᴀɴɢ sᴇʙᴇʟᴜᴍ ᴍᴇɴɢɢᴜɴᴀᴋᴀɴ ʙᴏᴛ ɪɴɪ.";

        const joinButtons = {
            inline_keyboard: [
                [{ text: "ᴊᴏɪɴ ᴄʜᴀɴɴᴇʟ", url: `https://t.me/${CHANNEL_USER.replace('@', '')}` }],
                [{ text: "sᴀʏᴀ sᴜᴅᴀʜ ᴊᴏɪɴ", callback_data: "check_join" }],
                [{ text: "👑 ᴏᴡɴᴇʀ", url: OWNER_URL }]
            ]
        };

        return bot.sendPhoto(userId, photoUrl, {
            caption: caption,
            parse_mode: 'HTML',
            reply_markup: joinButtons
        }).catch(() => { });
    }

    let users = await getRemoteUsers();
    if (!users.some(u => (u.id || u) === userId)) {
        await saveUser(msg);
    }

    if (match[1]) {
        const payload = match[1];
        if (payload.startsWith('v_')) {
            try {
                const encoded = payload.replace('v_', '');
                const filename = Buffer.from(encoded, 'base64').toString('utf-8');
                const videoUrl = `https://cdn.jsdelivr.net/gh/${GITHUB_USER}/${GITHUB_REPO}@main/videoINDONESIA/${encodeURIComponent(filename)}`;
                return await sendRichVideo(userId, videoUrl, filename, null, 'videoINDONESIA');
            } catch (e) {
                return await sendAsupan(userId);
            }
        } else if (payload.startsWith('ref_')) {
            // Referrer logic handled in saveUser
        }
    }

    try {
        let photoUrl = FALLBACK_PROFILE_PIC;
        const userPhotos = await bot.getUserProfilePhotos(userId, { limit: 1 });
        if (userPhotos && userPhotos.total_count > 0) {
            const file = await bot.getFile(userPhotos.photos[0][0].file_id);
            photoUrl = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
        }

        const idCardBuffer = await generateIDCard({
            userId: userId,
            firstName: msg.from.first_name || 'ᴜsᴇʀ',
            lastName: msg.from.last_name || '',
            username: msg.from.username || null,
            profilePicUrl: photoUrl
        });

        const welcomeCaption = `✨ <b>sᴇʟᴀᴍᴀᴛ ᴅᴀᴛᴀɴɢ!</b>\n\n` +
            `<blockquote>ᴀᴋsᴇs ᴛᴇʟᴀʜ ᴅɪʙᴇʀɪᴋᴀɴ. ᴋᴀᴍᴜ sᴇᴋᴀʀᴀɴɢ ᴅᴀᴘᴀᴛ ᴍᴇɴɪᴋᴍᴀᴛɪ ʀɪʙᴜᴀɴ ᴀsᴜᴘᴀɴ ᴛᴇʀʙᴀɪᴋ.\n` +
            `ɢᴜɴᴀᴋᴀɴ ᴛᴏᴍʙᴏʟ ᴅɪ ʙᴀᴡᴀʜ ᴜɴᴛᴜᴋ ᴍᴇɴᴏɴᴛᴏɴ.</blockquote>`;

        const welcomeButtons = {
            inline_keyboard: [
                [{ text: "▶️ ᴍᴜʟᴀɪ ᴀsᴜᴘᴀɴ", callback_data: "next_video" }],
                [
                    { text: "🤝 ʀᴇғᴇʀʀᴀʟ", callback_data: "show_refeal" },
                    { text: "👤 ᴏᴡɴᴇʀ", url: OWNER_URL }
                ],
                [
                    { text: "📢 ᴄʜᴀɴɴᴇʟ", url: "https://t.me/execuidornew" },
                    { text: "📂 ᴀʀᴄʜɪᴠᴇ", url: "https://t.me/porqueen" }
                ],
                [{ text: "🌐 ᴡᴇʙsɪᴛᴇ", url: "https://dikaa.cyvera.me" }]
            ]
        };

        await bot.sendPhoto(userId, idCardBuffer, {
            caption: welcomeCaption,
            parse_mode: 'HTML',
            reply_markup: welcomeButtons
        });

    } catch (err) {
        console.error("Welcome process error:", err);
        await sendAsupan(userId);
    }
});
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;

    if (query.data === 'check_join') {
        const isSub = await checkSub(userId);
        if (isSub) {
            try {
                await bot.answerCallbackQuery(query.id, { text: 'ᴛᴇʀɪᴍᴀ ᴋᴀsɪʜ sᴜᴅᴀʜ ᴊᴏɪɴ!' });
                await bot.deleteMessage(chatId, query.message.message_id).catch(() => { });
                await sendAsupan(chatId);
            } catch (e) { }
        } else {
            await bot.answerCallbackQuery(query.id, {
                text: '⚠️ ᴋᴀᴍᴜ ʙᴇʟᴜᴍ ᴊᴏɪɴ ᴄʜᴀɴɴᴇʟ!',
                show_alert: true
            });
        }
    } else if (query.data === 'next_video') {
        await sendAsupan(chatId, query.id);
    } else if (query.data === 'show_refeal') {
        try {
            await bot.answerCallbackQuery(query.id);
            let users = await getRemoteUsers();
            let user = users.find(u => (u.id || u) === userId);
            const refCount = (user && user.referrals) ? user.referrals.length : 0;
            const botInfo = await bot.getMe();
            const refLink = `https://t.me/${botInfo.username}?start=ref_${userId}`;

            const text = `🤝 <b>ᴘʀᴏɢʀᴀᴍ ʀᴇғᴇʀʀᴀʟ</b>\n\n` +
                `ᴀᴊᴀᴋ ᴛᴇᴍᴀɴ-ᴛᴇᴍᴀɴᴍᴜ ᴜɴᴛᴜᴋ ᴍᴇɴɢɢᴜɴᴀᴋᴀɴ ʙᴏᴛ ɪɴɪ ᴅᴀɴ ᴅᴀᴘᴀᴛᴋᴀɴ <b>ᴠɪᴘ ɢʀᴀᴛɪs!</b>\n\n` +
                `📊 <b>sᴛᴀᴛɪsᴛɪᴋ ᴋᴀᴍᴜ:</b>\n` +
                `↳ ᴛᴏᴛᴀʟ ʀᴇғᴇʀʀᴀʟ: <b>${refCount} ᴜsᴇʀ</b>\n` +
                `↳ sᴛᴀᴛᴜs ᴠɪᴘ: <b>${user && user.is_vip ? '✅ ᴀᴋᴛɪғ' : '❌ ɴᴏɴ-ᴀᴋᴛɪғ'}</b>\n\n` +
                `🎁 <b>ʜᴀᴅɪᴀʜ:</b>\n` +
                `ᴅᴀᴘᴀᴛᴋᴀɴ <b>𝟷𝟶 ʀᴇғᴇʀʀᴀʟ</b> ᴜɴᴛᴜᴋ ᴋʟᴀɪᴍ <b>ᴠɪᴘ sᴇʟᴀᴍᴀɴʏᴀ</b>!\n\n` +
                `🔗 <b>ʟɪɴᴋ ʀᴇғᴇʀʀᴀʟ ᴋᴀᴍᴜ:</b>\n<code>${refLink}</code>`;

            const buttons = {
                inline_keyboard: [
                    [{ text: "🎁 ᴋʟᴀɪᴍ ᴠɪᴘ ɢʀᴀᴛɪs", callback_data: "claim_vip" }],
                    [{ text: "📤 sʜᴀʀᴇ ʟɪɴᴋ", url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent('asupan video free bosqu 🔞')}` }]
                ]
            };
            await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: buttons });
        } catch (e) { }
    } else if (query.data === 'claim_vip') {
        let users = await getRemoteUsers();
        let idx = users.findIndex(u => (u.id || u) === userId);
        if (idx !== -1) {
            const user = users[idx];
            if (user.is_vip) {
                return bot.answerCallbackQuery(query.id, { text: '✨ ᴋᴀᴍᴜ sᴜᴅᴀʜ ᴍᴇɴᴊᴀᴅɪ ᴠɪᴘ!', show_alert: true });
            }
            if (user.referrals && user.referrals.length >= 10) {
                users[idx].is_vip = true;
                users[idx].vip_type = 'referral';
                users[idx].role = 'vip';
                fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
                await backupToGithub(users);
                await bot.answerCallbackQuery(query.id, { text: '🎉 sᴇʟᴀᴍᴀᴛ! VIP AKTIF!', show_alert: true });
                await sendVipNotification(users[idx], true, 'referral');
            } else {
                const count = user.referrals ? user.referrals.length : 0;
                await bot.answerCallbackQuery(query.id, { text: `⚠️ ʀᴇғᴇʀʀᴀʟ ᴋᴀᴍᴜ ʙᴇʟᴜᴍ ᴄᴜᴋᴜᴘ! (${count}/10)`, show_alert: true });
            }
        }
    }
});

bot.on('channel_post', async (msg) => {
    if (msg.chat.id.toString() !== CHid) return;

    const text = msg.text || msg.caption || "";
    // Note: msg.from di channel_post seringkali undefined kecuali diposting oleh admin secara personal (pribadi/signature)
    const userId = msg.from ? msg.from.id : null; 
    
    if (telegramLinkRegex.test(text)) {
        // Jika pengirim adalah salah satu admin yang terdaftar, abaikan
        if (userId && adminIds.includes(userId)) {
            return;
        }

        try {
            await bot.deleteMessage(msg.chat.id, msg.message_id);
            console.log(`[ANTI-LINK] Pesan dihapus di channel (ID: ${msg.message_id}) karena mengandung link.`);
        } catch (error) {
            console.error("Gagal menghapus pesan berisi link di channel:", error.message);
        }
    }
});

bot.onText(/\/help/, async (msg) => {
    const userId = msg.from.id;
    const isAdmin = userId === ADMIN_ID;

    let helpText = `🛠️ <b>𝖤𝖷𝖤𝖢𝖴𝖳𝖨𝖵𝖤 𝖡𝖮𝖳 | 𝖢𝖮𝖬𝖬𝖠𝖭𝖣 𝖢𝖤𝖭𝖳𝖤𝖱</b>\n\n` +
        `ʜᴀʟᴏ <b>${msg.from.first_name}</b>, sɪʟᴀʜᴋᴀɴ ɢᴜɴᴀᴋᴀɴ ᴅᴀғᴛᴀʀ ᴘᴇʀɪɴᴛᴀʜ ᴅɪ ʙᴀᴡᴀʜ ɪɴɪ ᴜɴᴛᴜᴋ ᴍᴇɴɢɢᴜɴᴀᴋᴀɴ ғɪᴛᴜʀ ʙᴏᴛ.\n\n` +
        `<blockquote>🤖 <b>𝖴𝖲𝖤𝖱 𝖢𝖮𝖬𝖬𝖠𝖭𝖣𝖲:</b>\n` +
        `• <b>/start</b> - ᴍᴇɴᴀᴍᴘɪʟᴋᴀɴ ɪᴅ ᴄᴀʀᴅ & ᴀᴋsᴇs ᴠɪᴅᴇᴏ\n` +
        `• <b>/refeal</b> - ᴄᴇᴋ ʟɪɴᴋ ʀᴇғᴇʀʀᴀʟ & sᴛᴀᴛɪsᴛɪᴋ ᴘʀɪʙᴀᴅɪ\n` +
        `• <b>/req [ᴘᴇsᴀɴ]</b> - ʀᴇǫᴜᴇsᴛ ᴠɪᴅᴇᴏ/ғɪᴛᴜʀ ᴋᴇ ᴏᴡɴᴇʀ\n` +
        `• <b>/brat [ᴛᴇᴋs]</b> - ʙᴜᴀᴛ sᴛɪᴄᴋᴇʀ ᴛᴇᴋs ᴄᴜsᴛᴏᴍ\n` +
        `• <b>/help</b> - ᴍᴇɴᴜ ʙᴀɴᴛᴜᴀɴ ɪɴɪ</blockquote>\n\n` +
        `<blockquote>🎁 <b>𝖱𝖤𝖥𝖤𝖱𝖱𝖠𝖫 𝖯𝖱𝖮𝖦𝖱𝖠𝖬:</b>\n` +
        `ᴅᴀᴘᴀᴛᴋᴀɴ <b>ᴠɪᴘ ɢʀᴀᴛɪs sᴇʟᴀᴍᴀɴʏᴀ</b> ᴅᴇɴɢᴀɴ ᴍᴇɴɢᴀᴊᴀᴋ <b>𝟷𝟶 ᴛᴇᴍᴀɴ</b> ᴍᴇɴɢɢᴜɴᴀᴋᴀɴ ʟɪɴᴋ ʀᴇғᴇʀʀᴀʟ ᴋᴀᴍᴜ. ᴄᴇᴋ sᴛᴀᴛᴜs ᴅᴇɴɢᴀɴ <code>/refeal</code> ᴅᴀɴ ᴋʟɪᴋ <b>ᴋʟᴀɪᴍ VIP</b> sᴀᴀᴛ sᴜᴅᴀʜ ᴄᴜᴋᴜᴘ.</blockquote>\n\n` +
        `<blockquote>👑 <b>𝖵𝖨𝖯 𝖤𝖷𝖢𝖫𝖴𝖲𝖨𝖵𝖤 𝖡𝖤𝖭𝖤𝖥𝖨𝖳𝖲:</b>\n` +
        `┌ ✅ <b>ᴀᴋsᴇs ᴛᴀɴᴘᴀ ʙᴀᴛᴀs (ɴᴏ ʟɪᴍɪᴛ)</b>\n` +
        `├ ✅ <b>ᴋᴜᴀʟɪᴛᴀs ʜᴅ ᴛᴀɴᴘᴀ sᴇɴsᴏʀ</b>\n` +
        `├ ✅ <b>ᴊᴇᴅᴀ ᴠɪᴅᴇᴏ 𝟶 ᴅᴇᴛɪᴋ</b>\n` +
        `└ ✅ <b>ᴜᴘᴅᴀᴛᴇ ᴠɪᴅᴇᴏ ʜᴀʀɪᴀɴ</b></blockquote>\n\n`;

    if (isAdmin) {
        helpText += `<blockquote>⚡ <b>𝖠𝖣𝖬𝖨𝖭 𝖢𝖮𝖭𝖳𝖱𝖮𝖫:</b>\n` +
            `• <b>/bcuser [ᴛᴇᴋs]</b> - ʙʀᴏᴀᴅᴄᴀsᴛ ᴋᴇ sᴇʟᴜʀᴜʜ ᴜsᴇʀ\n` +
            `• <b>/api/login</b> - ᴀᴋsᴇs ᴅᴀsʜʙᴏᴀʀᴅ D3X\n` +
            `• <b>/report</b> - ᴄᴇᴋ ʟᴏɢ sʏsᴛᴇᴍ ᴛᴇʀʙᴀʀᴜ</blockquote>\n\n`;
    }

    helpText += `📩 <b>𝖮𝖱𝖣𝖤𝖱 𝖵𝖨𝖯 / 𝖲𝖴𝖯𝖯𝖮𝖱𝖳:</b> @onedikaa\n\n` +
        `✨ <b>𝖴𝖯𝖣𝖠𝖳𝖤𝖣:</b> <code>${new Date().toLocaleDateString('id-ID')}</code>\n` +
        `🚀 <b>𝖲𝖸𝖲𝖳𝖤𝖬 𝖡𝖸:</b> @onedikaa`;

    const buttons = {
        inline_keyboard: [
            [{ text: "👑 ʙᴜʏ ᴠɪᴘ ɴᴏᴡ", url: OWNER_URL }],
            [
                { text: "🤝 ʀᴇғᴇʀʀᴀʟ", callback_data: "show_refeal" },
                { text: "🔞 ᴀʀᴄʜɪᴠᴇ", url: "https://t.me/porqueen" }
            ]
        ]
    };

    await bot.sendMessage(userId, helpText, { parse_mode: 'HTML', reply_markup: buttons });
});

bot.onText(/\/refeal/, async (msg) => {
    const userId = msg.from.id;
    let users = await getRemoteUsers();
    let user = users.find(u => (u.id || u) === userId);
    const count = (user && user.referrals) ? user.referrals.length : 0;
    const botInfo = await bot.getMe();
    const link = `https://t.me/${botInfo.username}?start=ref_${userId}`;

    const text = `🤝 <b>ʀᴇғᴇʀʀᴀʟ sᴛᴀᴛᴜs</b>\n\n` +
        `ᴜsᴇʀ: <b>${msg.from.first_name}</b>\n` +
        `ɪᴅ: <code>${userId}</code>\n\n` +
        `ᴛᴏᴛᴀʟ ʀᴇғᴇʀʀᴀʟ: <b>${count}</b>\n` +
        `ᴠɪᴘ sᴛᴀᴛᴜs: <b>${user && user.is_vip ? '✅ ᴀᴋᴛɪғ' : '❌ ɴᴏɴ-ᴀᴋᴛɪғ'}</b>\n\n` +
        `ʟɪɴᴋ ᴋᴀᴍᴜ:\n<code>${link}</code>`;

    await bot.sendMessage(userId, text, { parse_mode: 'HTML' });
});

bot.onText(/\/req(?:\s+(.+))?/, async (msg, match) => {
    const userId = msg.from.id;
    const requestText = match[1];

    if (!requestText) {
        return bot.sendMessage(userId, "⚠️ <b>ᴄᴀʀᴀ ᴘᴇɴɢɢᴜɴᴀᴀɴ:</b>\n\nɢᴜɴᴀᴋᴀɴ <code>/req [ᴘᴇsᴀɴ]</code> ᴜɴᴛᴜᴋ ʀᴇǫᴜᴇsᴛ ᴠɪᴅᴇᴏ ᴋᴇ ᴏᴡɴᴇʀ.", { parse_mode: 'HTML' });
    }

    const logText = `📩 <b>ɴᴇᴡ ʀᴇǫᴜᴇsᴛ</b>\n\n` +
        `👤 <b>ғʀᴏᴍ:</b> ${msg.from.first_name} (<code>${userId}</code>)\n` +
        `💬 <b>ᴍᴇssᴀɢᴇ:</b> ${requestText}`;

    await bot.sendMessage(ADMIN_ID, logText, { parse_mode: 'HTML' });
    await bot.sendMessage(userId, "✅ <b>ʀᴇǫᴜᴇsᴛ ᴛᴇʟᴀʜ ᴅɪᴋɪʀɪᴍ!</b>\n\nsɪʟᴀʜᴋᴀɴ ᴛᴜɴɢɢᴜ ᴜᴘᴅᴀᴛᴇ sᴇʟᴀɴᴊᴜᴛɴʏᴀ.", { parse_mode: 'HTML' });
});

bot.onText(/\/bcuser(?:\s+(.+))?/, async (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    const broadcastText = match[1];

    if (!broadcastText) {
        return bot.sendMessage(ADMIN_ID, "⚠️ <b>ᴜsᴀɢᴇ:</b> <code>/bcuser [ᴛᴇxᴛ]</code>", { parse_mode: 'HTML' });
    }

    let users = await getRemoteUsers();
    let success = 0;
    let failed = 0;

    const statusMsg = await bot.sendMessage(ADMIN_ID, "⏳ <b>sᴛᴀʀᴛɪɴɢ ʙʀᴏᴀᴅᴄᴀsᴛ...</b>", { parse_mode: 'HTML' });

    for (const u of users) {
        const uid = u.id || u;
        try {
            await bot.sendMessage(uid, broadcastText, { parse_mode: 'HTML' });
            success++;
        } catch (e) {
            failed++;
        }
    }

    await bot.editMessageText(`✅ <b>ʙʀᴏᴀᴅᴄᴀsᴛ sᴇʟᴇsᴀɪ!</b>\n\n🎉 sᴜᴄᴄᴇss: <b>${success}</b>\n❌ ғᴀɪʟᴇᴅ: <b>${failed}</b>`, {
        chat_id: ADMIN_ID,
        message_id: statusMsg.message_id,
        parse_mode: 'HTML'
    });
});

bot.onText(/\/vip/, async (msg) => {
    const userId = msg.from.id;
    const fallbackPhoto = "https://telegra.ph/file/0c9a930129c546e16698a.jpg"; // Premium Dark Modern Fallback

    const caption = `✨ <b>𝖮𝖯𝖤𝖭 𝖱𝖤𝖲𝖤𝖫𝖫𝖤𝖱 𝖵𝖨𝖯 𝖡𝖮𝖳 𝖠𝖲𝖴𝖯𝖠𝖭</b> ✨\n\n` +
        `<blockquote>🚀 ᴊᴀᴅɪʟᴀʜ ᴘᴇʙɪsɴɪs ᴅɪɢɪᴛᴀʟ sᴇᴋᴀʀᴀɴɢ ᴊᴜɢᴀ!</blockquote>\n\n` +
        `💎 <b>ᴋᴇᴜɴᴛᴜɴɢᴀɴ ʀᴇsᴇʟʟᴇʀ:</b>\n` +
        `├ 🔓 ʙɪsᴀ ᴊᴜᴀʟ ᴠɪᴘ ᴅɪ ʙᴏᴛ ᴀsᴜᴘᴀɴ\n` +
        `├ 🎬 ɴᴏɴᴛᴏɴ ᴠɪᴅᴇᴏ ᴛᴀɴᴘᴀ ᴄᴏᴏʟᴅᴏᴡɴ\n` +
        `├ ♾️ ᴍᴀsᴀ ᴀᴋᴛɪғ ʀᴇsᴇʟʟᴇʀ sᴇᴜᴍᴜʀ ʜɪᴅᴜᴘ\n` +
        `├ ⚙️ ᴠɪᴅᴇᴏ ᴅɪ-ᴜʀᴜs ᴀᴅᴍɪɴ (ᴛᴇʀɪᴍᴀ ʙᴇʀᴇs)\n` +
        `└ 🌐 ᴋᴇʟᴏʟᴀ ᴠɪᴀ ᴡᴇʙsɪᴛᴇ (ᴇᴀsʏ ᴍᴀɴᴀɢᴇ)\n\n` +
        `💰 <b>ᴘʀɪᴄᴇ ʀᴇsᴇʟʟᴇʀ:</b> <code>50k</code>\n\n` +
        `──────────────────────\n\n` +
        `⚡ <b>𝐒𝐄𝐋𝐋 𝐒𝐂𝐑𝐈𝐏𝐓 𝐁𝐎𝐓 𝐀𝐒𝐔𝐏𝐀𝐍</b> ⚡\n` +
        `💳 ᴘʀɪᴄᴇ: <b>100k (ɴᴏ ᴇɴᴄ/ᴏᴘᴇɴ sᴏᴜʀᴄᴇ)</b>\n\n` +
        `📦 <b>ɪɴᴄʟᴜᴅᴇ ᴘᴀᴄᴋᴀɢᴇ:</b>\n` +
        `📝 ꜰᴜʟʟ sᴇᴛᴜᴘ & ᴛᴜᴛᴏʀɪᴀʟ ʀᴜɴ\n` +
        `👨🏫 ʙɪᴍʙɪɴɢᴀɴ sᴀᴍᴘᴀɪ ʙɪsᴀ ᴘᴀᴋᴀɪ\n` +
        `📈 ꜰɪᴛᴜʀ ᴘᴜsʜ ᴍᴇᴍʙᴇʀ ᴀᴜᴛᴏᴍᴀᴛɪᴄ\n` +
        `💸 ʙɪsᴀ ᴊᴜᴀʟ ʟᴀɢɪ ᴠɪᴘ & ʀᴇsᴇʟʟᴇʀ\n\n` +
        `📢 <b>ɪɴᴛᴇʀᴇsᴛᴇᴅ? ᴄᴏɴᴛᴀᴄᴛ ɴᴏᴡ:</b>\n` +
        `👉 @onedikaa (ᴄʟɪᴄᴋ ᴛᴏ ʙᴜʏ)`;

    const botInfo = await bot.getMe();
    const buttons = getRichButtons(0, `https://t.me/${botInfo.username}?start=help`);

    try {
        const profile = await bot.getUserProfilePhotos(userId, { limit: 1 });
        if (profile.total_count > 0) {
            const photoId = profile.photos[0][0].file_id;
            await bot.sendPhoto(userId, photoId, { caption, parse_mode: 'HTML', reply_markup: buttons });
        } else {
            await bot.sendPhoto(userId, fallbackPhoto, { caption, parse_mode: 'HTML', reply_markup: buttons });
        }
    } catch (e) {
        await bot.sendPhoto(userId, fallbackPhoto, { caption, parse_mode: 'HTML', reply_markup: buttons });
    }
});

// --- ADMIN: BACKUP & RESTORE COMMANDS ---



const TOKEN_TIKTOK_BOT = '8669336983:AAElJXGcLBHFjK0CqhcKueYIHX6twTYpqjA';
const tiktokBot = new TelegramBot(TOKEN_TIKTOK_BOT, { polling: false });

const QUERIES = [
  // === SUPER BRUTAL HOT TIKTOK 2026 — FULL CEWEK TOBRUT BIKIN NGACENG & MAU COLI 🥵💦 ===
  'cewek tobrut besar viral enak', 
  'cewek tobrut hyper', 
  'cewek geol geol', 
  'cewek geol geol tobrut', 
  'cewek mode crot',
  'cewek bikin crot', 
  'cewek tobrut crot', 
  'cewek tobrut pulen', 
  'cewek tobrut goyang', 
  'cewek tobrut besar pulen',
  'cewek tobrut hyper geol geol', 
  'cewek geol geol crot', 
  'cewek tobrut no armor', 
  'cewek tobrut bikin panas',
  'cewek tobrut dance', 
  'cewek hyper geol geol', 
  'cewek tobrut viral', 
  'cewek goyang tobrut',
  'cewek tobrut pargoy', 
  'cewek bacrot tobrut', 
  'cewek tobrut xx l', 
  'cewek fakebody tobrut', 
  'cewek tobrut style',
  'cewek tobrut brutal', 
  'cewek tobrut padet', 
  'cewek tobrut besar hyper', 
  'cewek geol geol bikin crot',
  'cewek tobrut goyang lemes', 
  'cewek tobrut melon', 
  'cewek hyper tobrut', 
  'tante tobrut hyper',
  'cewek tobrut lc crop top', 
  'cewek tobrut xxl', 
  'cewek tobrut besar bulat padat', 
  'cewek pulen tobrut sange',
  'cewek tobrut bikin icibos crot', 
  'cewek geol geol tante', 
  'cewek tobrut fakebody', 
  'cewek tobrut goyang hyper',
  'cewek tobrut menggoda', 
  'cewek tobrut dance crot', 
  'cewek hyper no armor tobrut', 
  'cewek tobrut pulen geol',
  'cewek bahan crot tobrut', 
  'cewek tobrut besar goyang', 
  'cewek cantik tobrut hyper', 
  'cewek tobrut pargoy hot',
  'cewek geol geol viral 2026', 
  'cewek tobrut bikin ngaceng', 
  'cewek tobrut crot banyak', 
  'cewek tobrut hyper crot',
  'cewek goyang geol tobrut pulen', 
  'cewek tobrut besar xx', 
  'cewek tobrut style hot', 
  'cewek tobrut goyang lembut',
  'cewek tobrut brutal geol', 
  'cewek tobrut hyper pulen', 
  'cewek dance tobrut bikin sange', 
  'cewek tobrut lc hyper',
  'cewek geol geol bikin tegang',

  // Tambahan SUPER BRUTAL & VIRAL TERBARU 2026 — FULL CEWEK 🥵💦
  'cewek tobrut besar hyper geol geol bikin crt',
  'cewek tobrut pulen kenyal bikin basah',
  'cewek geol geol tobrut hyper xxl',
  'cewek tobrut fakebody no bra goyang',
  'cewek bikin crot tobrut besar pulen',
  'cewek tobrut hyper lc crop top crot',
  'cewek tobrut goyang lemes bikin ngaceng',
  'cewek tobrut brutal geol geol viral',
  'cewek tobrut melon padet bikin coli',
  'cewek hyper geol geol tobrut bikin tegang',
  'cewek tobrut besar bulat kenyal crot',
  'cewek dance geol geol tobrut pulen sange',
  'cewek tobrut x hyper colmex geol',
  'cewek tobrut goal geol hyper',
  'cewek geol2 x tobrut x haiper',
  'cewek tobrut besar hyper bikin crt 🥵',
  'cewek besar tobrut pulen geal geol bikin crt',
  'cewek tobrut nihh🔞 geal geol',
  'cewek tobrut hyper ms brew geol',
  'cewek tobrut style😋 fakebody⚠️',
  'cewek tobrut besar hyper geol geol bikin basah icibos',
  'cewek cantik tobrut goyang hyper crot',
  'cewek tobrut pulen geol mantap',
  'cewek tobrut xxl goyang lembut bikin sange',
  'tante tobrut hyper dance crot',
  'cewek tobrut brutal no armor viral',
  'cewek geol geol bikin crot banyak',
  'cewek tobrut hyper pulen kenyal',
  'cewek tobrut menggoda pargoy hot',
  'cewek tobrut lc hyper crop top goyang',
  'cewek fakebody tobrut besar bikin ngaceng',
  'cewek tobrut goyang hyper bikin coli',
  'cewek tobrut besar padet bulat crot',
  'cewek hyper no armor tobrut pulen',
  'cewek dance tobrut bikin mau coli',
  'cewek tobrut viral 2026 geol geol',
  'cewek tobrut bikin icibos basah',
  'cewek geol geol tante tobrut hyper',
  'cewek tobrut style hot crot',
  'cewek tobrut besar xx l goyang',
  'cewek bacrot tobrut hyper geol',
  'cewek tobrut melon bikin tegang',
  'cewek hyper tobrut brutal',
  'cewek tobrut padet geol geol sange',
  'cewek tobrut goyang lemes viral',
  'cewek tobrut fakebody hyper crot',
  'cewek goyang geol tobrut bikin crt 🥵💦',
  'cewek tobrut hyper x lc heal geol',
  'cewek tobrut besar pulen bikin coli',
  'cewek tobrut dance hyper sange',
  'cewek tobrut brutal geol bikin basah',
  'cewek cantik hyper tobrut goyang',
  'cewek tobrut besar pulen geol geol crot',
  'cewek tobrut hyper no bra dance'
];

let queryIndex = 0;
const processedVideos = new Set();
const tempFolder = './temp_videos';

fs.ensureDirSync(tempFolder);

async function fetchTikTokData(query) {
    try {
        const searchUrl = `https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(query)}&count=12&cursor=0`;
        const searchRes = await axios.get(searchUrl);
        
        if (!searchRes.data?.data?.videos) return null;

        const videos = searchRes.data.data.videos;
        const newVideo = videos.find(v => !processedVideos.has(v.video_id));
        if (!newVideo) return null;

        const targetUrl = `https://www.tiktok.com/@user/video/${newVideo.video_id}`;
        
        // Coba pakai Fallback API dulu
        try {
            const fallbackRes = await axios.get(`http://ikyyzyyrestapi.my.id/download/tiktokv2?url=${encodeURIComponent(targetUrl)}`);
            if (fallbackRes.data?.result) {
                const res = fallbackRes.data.result;
                // Normalisasi data agar konsisten
                return {
                    id: res.id || newVideo.video_id,
                    title: res.title || newVideo.title,
                    video: res.video || res.nowm || newVideo.play,
                    nickname: res.author?.nickname || newVideo.author.nickname,
                    username: res.author?.username || newVideo.author.unique_id,
                    views: res.stats?.playCount || newVideo.play_count,
                    likes: res.stats?.diggCount || newVideo.digg_count,
                    comments: res.stats?.commentCount || newVideo.comment_count,
                    date: res.created_at || new Date(newVideo.create_time * 1000).toLocaleString('id-ID')
                };
            }
        } catch (e) {
            
        }

        // Jika fallback gagal, gunakan data TikWM langsung
        return {
            id: newVideo.video_id,
            title: newVideo.title,
            video: newVideo.play,
            nickname: newVideo.author.nickname,
            username: newVideo.author.unique_id,
            views: newVideo.play_count,
            likes: newVideo.digg_count,
            comments: newVideo.comment_count,
            date: new Date(newVideo.create_time * 1000).toLocaleString('id-ID')
        };

    } catch (error) {
        console.error(`❌ Search Error: ${error.message}`);
        return null;
    }
}

async function downloadAndSend() {
    const currentQuery = QUERIES[queryIndex];
    const data = await fetchTikTokData(currentQuery);

    if (data) {
        const filePath = path.join(tempFolder, `${data.id}.mp4`);
        
        try {
            const response = await axios({
                url: data.video,
                method: 'GET',
                responseType: 'stream',
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            const caption = `📝 **Caption:** ${data.title || 'No Caption'}\n\n` +
                            `👤 **Account:** ${data.nickname} (@${data.username})\n` +
                            `🔍 **Notes:** random asupan tiktok penyemangat harimu😙`;

            const idx = queryIndex % styles.length;
            const buttons = {
                inline_keyboard: [
                    [
                        { text: "🤖 ʙᴏᴛ ᴀsᴜᴘᴀɴ", url: "https://t.me/obitosupportuserbot?start=help", style: styles[idx] },
                        { text: "👑 ᴏᴡɴᴇʀ", url: "https://t.me/onedikaa", style: styles[(idx + 1) % styles.length] }
                    ],
                    [
                        { text: "📢 ᴄʜᴀɴɴᴇʟ", url: "https://t.me/execuidornew", style: styles[(idx + 2) % styles.length] },
                        { text: "📂 ᴀʀᴄʜɪᴠᴇ", url: "https://t.me/porqueen", style: styles[idx] }
                    ],
                    [{ text: "🌐 ᴡᴇʙsɪᴛᴇ", url: "https://dikaa.cyvera.me", style: styles[(idx + 1) % styles.length] }]
                ]
            };

            try {
                await tiktokBot.sendVideo(CHAT_ID, filePath, { 
                    caption, 
                    parse_mode: 'Markdown',
                    reply_markup: buttons
                });
            } catch (err) {
                const msg = err.message || "";
                if (msg.includes('button style') || msg.includes('parse entities')) {
                    // Fallback: Remove styles and use safe HTML
                    const fallbackButtons = {
                        inline_keyboard: buttons.inline_keyboard.map(row => 
                            row.map(({ style, ...btn }) => btn)
                        )
                    };
                    const fallbackCaption = `📝 <b>Caption:</b> ${escapeHtml(data.title || 'No Caption')}\n\n` +
                                        `👤 <b>Account:</b> ${escapeHtml(data.nickname)} (@${escapeHtml(data.username)})\n` +
                                        `🔍 <b>Notes:</b> random asupan tiktok penyemangat harimu😙`;
                    
                    await tiktokBot.sendVideo(CHAT_ID, filePath, { 
                        caption: fallbackCaption, 
                        parse_mode: 'HTML',
                        reply_markup: fallbackButtons
                    }).catch(e => console.error("❌ Final Fallback Error:", e.message));
                } else {
                    console.error("❌ Process Error:", err.message);
                }
            }
            processedVideos.add(data.id);
            
        } catch (err) {
            console.error("❌ Process Error:", err.message);
        } finally {
            if (fs.existsSync(filePath)) await fs.remove(filePath);
        }
    }

    queryIndex = (queryIndex + 1) % QUERIES.length;
    setTimeout(downloadAndSend, DELAY_BETWEEN_POSTS);
}

downloadAndSend();



bot.onText(/\/backup/, async (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    await bot.sendMessage(ADMIN_ID, '⏳ <b>Memulai backup semua .json ke GitHub...</b>', { parse_mode: 'HTML' });
    try {
        await backupAllJsonToGithub();
        await bot.sendMessage(ADMIN_ID,
            `✅ <b>Backup Selesai!</b>\n\nSemua file .json berhasil diupload ke GitHub path:\n<code>${GITHUB_DB_FOLDER}/</code>\n\n📅 <code>${new Date().toLocaleString('id-ID')}</code>`,
            { parse_mode: 'HTML' }
        );
    } catch (e) {
        await bot.sendMessage(ADMIN_ID, `❌ <b>Backup gagal:</b> <code>${e.message}</code>`, { parse_mode: 'HTML' });
    }
});

bot.onText(/\/restore/, async (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    await bot.sendMessage(ADMIN_ID, '⏳ <b>Memulai restore semua .json dari GitHub...</b>', { parse_mode: 'HTML' });
    try {
        const results = await restoreAllJsonFromGithub();
        const lines = results.map(r => `${r.status === 'ok' ? '✅' : '❌'} <code>${r.file}</code>${r.msg ? ` — ${r.msg}` : ''}`).join('\n');
        await bot.sendMessage(ADMIN_ID,
            `📥 <b>Restore Selesai!</b>\n\n${lines || '(tidak ada file di /db/)'}\n\n📅 <code>${new Date().toLocaleString('id-ID')}</code>`,
            { parse_mode: 'HTML' }
        );
    } catch (e) {
        await bot.sendMessage(ADMIN_ID, `❌ <b>Restore gagal:</b> <code>${e.message}</code>`, { parse_mode: 'HTML' });
    }
});
 
bot.onText(/\/brat(?:\s+(.+))?/, async (msg, match) => {
    const userId = msg.from.id;
    const text = match[1];

    if (!text) {
        return bot.sendMessage(userId, "⚠️ <b>ᴜsᴀɢᴇ:</b> <code>/brat [ᴛᴇxᴛ]</code>", { parse_mode: 'HTML' });
    }

    try {
        const apiUrl = `https://brat.caliphdev.com/api/brat?text=${encodeURIComponent(text)}`;
        await bot.sendSticker(userId, apiUrl);
    } catch (e) {
        await reportError(e, '/brat', msg);
    }
});

async function monitorNewVideos() {
    setInterval(async () => {
        try {
            const folders = ['videoINDONESIA', 'videos', 'videoHIJAB', 'videoJAV', 'asupan'];
            let totalStock = 0;
            let detailStock = "";
            let newVideosCount = 0;

            for (const folder of folders) {
                try {
                    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${folder}?t=${Date.now()}`;
                    const res = await axios.get(url, { 
                        headers: { 
                            Authorization: `token ${GITHUB_TOKEN}`,
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache'
                        } 
                    });
                    
                    const files = res.data.filter(f => f.type === 'file' && f.name.match(/\.(mp4|mov|avi|mkv)$/i));
                    totalStock += files.length;
                    detailStock += `• ${folder}: <b>${files.length}</b>\n`;

                    // Khusus videoINDONESIA, cek apakah ada yang baru
                    if (folder === 'videoINDONESIA') {
                        for (const file of files) {
                            if (!notifiedVideos.includes(file.name)) {
                                // Kirim notifikasi video baru ke CHid
                                const encoded = Buffer.from(file.name).toString('base64');
                                const botInfo = await bot.getMe();
                                const startLink = `https://t.me/${botInfo.username}?start=v_${encoded}`;
                                
                                const notifyText = `🆕 <b>[ ɴᴇᴡ ᴜᴘᴅᴀᴛᴇ ] ᴀsᴜᴘᴀɴ ᴛᴇʀʙᴀʀᴜ!</b>\n\n` +
                                    `<blockquote>🎬 <b>${file.name}</b>\n` +
                                    `ᴠɪᴅᴇᴏ ʙᴀʀᴜ ᴛᴇʟᴀʜ ᴅɪᴛᴀᴍʙᴀʜᴋᴀɴ ᴋᴇ ᴅᴀᴛᴀʙᴀsᴇ!\n` +
                                    `sɪʟᴀʜᴋᴀɴ ᴋʟɪᴋ ᴛᴏᴍʙᴏʟ ᴅɪ ʙᴀᴡᴀʜ ᴜɴᴛᴜᴋ ᴍᴇɴᴏɴᴛᴏɴ.</blockquote>\n\n` +
                                    `✨ <b>sᴛᴀᴛᴜs:</b> 🔞 sᴀғᴇ & ʜᴅ\n` +
                                    `🚀 <b>ʙʏ:</b> @${botInfo.username}`;

                                const notifyButtons = {
                                    inline_keyboard: [
                                        [{ text: "👑 ᴏᴡɴᴇʀ", url: OWNER_URL }, { text: "📢 ᴄʜᴀɴɴᴇʟ", url: "https://t.me/execuidornew" }]
                                    ]
                                };

                                await bot.sendMessage(LOGSid, notifyText, { parse_mode: 'HTML', reply_markup: notifyButtons });
                                notifiedVideos.push(file.name);
                                newVideosCount++;
                            }
                        }
                    }
                } catch (folderErr) {
                    detailStock += `• ${folder}: <b>OFFLINE/EMPTY</b>\n`;
                }
            }

            // Simpan daftar video yang sudah dinotifikasi
            if (newVideosCount > 0) {
                if (notifiedVideos.length > 500) notifiedVideos = notifiedVideos.slice(-500);
                fs.writeFileSync(NOTIFIED_VIDEOS_FILE, JSON.stringify(notifiedVideos, null, 2));
                // Juga backup ke github folder /db/
                await backupFileToGithub('notified_videos.json', notifiedVideos);
            }

            const text = `📊 <b>sʏsᴛᴇᴍ sᴛᴏᴄᴋ ᴍᴏɴɪᴛᴏʀ</b>\n\n` +
                `<blockquote>📂 <b>ᴅᴇᴛᴀɪʟ sᴛᴏᴄᴋ:</b>\n${detailStock}</blockquote>\n` +
                `📈 ᴛᴏᴛᴀʟ ᴀsᴜᴘᴀɴ: <b>${totalStock} ᴠɪᴅᴇᴏs</b>\n` +
                `📅 ᴜᴘᴅᴀᴛᴇᴅ: <code>${new Date().toLocaleString('id-ID')}</code>`;

            await bot.sendMessage(LOGSid, text, { parse_mode: 'HTML' });
        } catch (e) {
            console.error("Monitor error:", e.message);
        }
    }, 600000); // Check every 10 minutes
}

async function autoPostVideo() {
    setInterval(async () => {
        try {
            const result = await getRandomVideo(autoPostHistory, ['videoINDONESIA']);
            if (result) {
                const encoded = Buffer.from(result.filename).toString('base64');
                const startLink = `https://t.me/obitosupportuserbot?start=v_${encoded}`;

                const caption = getRichCaption();
                const buttons = {
                    inline_keyboard: [
                        [{ text: "🎬 ᴛᴏɴᴛᴏɴ ᴠɪᴅᴇᴏ ᴛᴇʀʙᴀʀᴜ", url: startLink }],
                        [
                            { text: "🤖 ʙᴏᴛ ᴀsᴜᴘᴀɴ", url: "https://t.me/obitosupportuserbot?start=help" },
                            { text: "👑 ᴏᴡɴᴇʀ", url: "https://t.me/onedikaa" }
                        ],
                        [
                            { text: "📢 ᴄʜᴀɴɴᴇʟ", url: "https://t.me/execuidornew" },
                            { text: "📂 ᴀʀᴄʜɪᴠᴇ", url: "https://t.me/porqueen" }
                        ],
                        [{ text: "🌐 ᴡᴇʙsɪᴛᴇ", url: "https://dikaa.cyvera.me" }]
                    ]
                };

                // Kirim hanya ke ASUPANid sebagai post teks + tombol link unik ke bot
                // Video TIDAK dikirim ke channel — user klik tombol → video dikirim ke mereka via bot
                await bot.sendMessage(ASUPANid, caption, {
                    parse_mode: 'HTML',
                    reply_markup: buttons
                });

                autoPostHistory.push(result.filename);
                if (autoPostHistory.length > 200) autoPostHistory.shift();
                // Simpan ke file supaya tidak duplikat meski bot restart
                try { fs.writeFileSync(AUTOPOST_HISTORY_FILE, JSON.stringify(autoPostHistory)); } catch (_) {}
            }
        } catch (e) {
            console.error("AutoPost error:", e.message);
        }
    }, 600000); // Post every 10 minutes
}

function checkServerHealth() {
    setInterval(() => {
        const freeMem = os.freemem();
        const totalMem = os.totalmem();
        const usedMemPercent = ((totalMem - freeMem) / totalMem) * 100;

        if (usedMemPercent > 92) {
            const report = `⚠️ <b>ʜɪɢʜ ᴍᴇᴍᴏʀʏ ᴜsᴀɢᴇ</b>\n\nᴜsᴀɢᴇ: <b>${usedMemPercent.toFixed(2)}%</b>\nᴀᴄᴛɪᴏɴ: <b>ᴀᴜᴛᴏ-ʀᴇsᴛᴀʀᴛɪɴɢ...</b>`;
            bot.sendMessage(ADMIN_ID, report, { parse_mode: 'HTML' }).then(() => {
                triggerRestart();
            });
        }
    }, 60000); // Check every minute
}

// --- DASHBOARD API & ROUTES ---

app.post('/api/login', async (req, res) => {
    const { userId, password } = req.body;
    let users = await getRemoteUsers();
    
    // Admin Root
    if (userId === ADMIN_ID.toString() && password === 'andikawewe') {
        res.cookie('auth_token', SESSION_TOKEN, { maxAge: 900000, httpOnly: true });
        return res.json({ success: true });
    }

    const idx = users.findIndex(u => (u.id || u).toString() === userId && u.password === password);
    if (idx !== -1) {
        const newToken = Buffer.from(`${userId}:${Date.now()}`).toString('base64');
        users[idx].currentSession = newToken;
        await backupToGithub(users);
        res.cookie('auth_token', newToken, { maxAge: 900000, httpOnly: true });
        return res.json({ success: true });
    }

    res.status(401).json({ success: false, message: 'Invalid Credentials' });
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('auth_token');
    res.json({ success: true });
});

app.post('/api/vip', async (req, res) => {
    const authUser = await getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false });

    const { userId, status } = req.body;
    let users = await getRemoteUsers();
    const idx = users.findIndex(u => String(u.id || u) === String(userId));

    if (idx !== -1) {
        if (authUser.role === 'reseller' && users[idx].role === 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        // --- FIX: OBJECT NORMALIZATION & AGGRESSIVE SYNC ---
        const isVip = status === true || status === 'true';
        
        // 1. Force convert to Object if it's still a primitive
        if (typeof users[idx] !== 'object' || users[idx] === null) {
            users[idx] = { id: users[idx] };
        }

        // 2. Synchronize both flags
        users[idx].is_vip = isVip;
        users[idx].managed_by = authUser.id;

        // 3. Clear legacy role flags to ensure UI consistency
        if (!isVip) {
            if (users[idx].role === 'vip') users[idx].role = 'user';
        } else {
            // Optional: set role to vip if it was user
            if (users[idx].role === 'user') users[idx].role = 'vip';
        }
        
        // 4. Force synchronous disk write to prevent race conditions or merge regressions
        fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2), 'utf8');
        
        // 5. Trigger backup cloud
        await backupToGithub(users);
        
        await sendVipNotification(users[idx], isVip, 'paid');
        res.json({ success: true, isVip: isVip });
    } else {
        res.status(404).json({ success: false, message: 'User not found' });
    }
});

app.post('/api/manage-user', async (req, res) => {
    const authUser = await getAuthUser(req);
    if (!authUser || authUser.role !== 'admin') return res.status(403).json({ success: false });

    const { userId, role, password } = req.body;
    let users = await getRemoteUsers();
    const idx = users.findIndex(u => String(u.id || u) === String(userId));

    if (idx !== -1) {
        users[idx].role = role;
        if (password) users[idx].password = password;
        
        await backupToGithub(users);

        // Notifikasi ke User via Bot
        if (password || role) {
            const notifyText = `🔐 <b>𝖠𝖢𝖢𝖮𝖴𝖭𝖳 𝖲𝖤𝖢𝖴𝖱𝖨𝖳𝖸 𝖴𝖯𝖣𝖠𝖳𝖤</b>\n\n` +
                `ʜᴀʟᴏ ᴜsᴇʀ, ᴀᴋᴜɴ ᴀɴᴅᴀ ᴛᴇʟᴀʜ ᴅɪᴘᴇʀʙᴀʀᴜɪ ᴏʟᴇʜ ᴀᴅᴍɪɴ.\n` +
                `ʙᴇʀɪᴋᴜᴛ ᴀᴅᴀʟᴀʜ ᴅᴇᴛᴀɪʟ sᴇᴛᴛɪɴɢ ᴛᴇʀʙᴀʀᴜ ᴀɴᴅᴀ:\n\n` +
                `<blockquote>🆔 <b>𝖴𝖲𝖤𝖱 𝖨𝖣:</b> <code>${userId}</code>\n` +
                `🔑 <b>𝖯𝖠𝖲𝖲𝖶𝖮𝖱𝖣:</b> <code>${password || '<i>(ᴛɪᴅᴀᴋ ʙᴇʀᴜʙᴀʜ)</i>'}</code>\n` +
                `🎭 <b>𝖱𝖮𝖫𝖤:</b> <code>${role.toUpperCase()}</code></blockquote>\n\n` +
                `🚀 sɪʟᴀʜᴋᴀɴ ɢᴜɴᴀᴋᴀɴ ᴅᴇᴛᴀɪʟ ᴅɪ ᴀᴛᴀs ᴜɴᴛᴜᴋ ʟᴏɢɪɴ ᴋᴇ ᴅᴀsʜʙᴏᴀʀᴅ\nhttp://85.17.244.168:1500/`;

            try {
                await bot.sendMessage(userId, notifyText, { parse_mode: 'HTML' });
            } catch (err) {
                console.error(`[NOTIFY] Gagal mengirim pesan ke ${userId}:`, err.message);
            }
        }

        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
});

app.post('/api/delete-user', async (req, res) => {
    const authUser = await getAuthUser(req);
    if (!authUser || authUser.role !== 'admin') return res.status(403).json({ success: false });

    let users = await getRemoteUsers();
    const filtered = users.filter(u => String(u.id || u) !== String(req.body.userId));
    await backupToGithub(filtered);
    res.json({ success: true });
});

app.post('/api/broadcast', async (req, res) => {
    const authUser = await getAuthUser(req);
    if (!authUser || authUser.role !== 'admin') return res.status(403).json({ success: false });

    const { text, mediaUrl, mode, target } = req.body;
    let users = await getRemoteUsers();
    let targets = [];

    if (target === 'users' || target === 'all') {
        targets.push(...users.map(u => u.id || u));
    }
    if (target === 'channels' || target === 'all') {
        targets.push(CHid, ASUPANid, LOGSid, CHAT_ID);
    }

    const uniqueTargets = [...new Set(targets)].filter(id => id);
    let success = 0;
    let failed = 0;

    for (const id of uniqueTargets) {
        try {
            if (mode === 'text' && text) {
                await bot.sendMessage(id, text, { parse_mode: 'HTML' });
            } else if (mode === 'media' && mediaUrl) {
                const isVideo = mediaUrl.match(/\.(mp4|mov|avi|mkv|video)/i);
                if (isVideo) {
                    await bot.sendVideo(id, mediaUrl);
                } else {
                    await bot.sendPhoto(id, mediaUrl);
                }
            } else if (mode === 'both' && text && mediaUrl) {
                const isVideo = mediaUrl.match(/\.(mp4|mov|avi|mkv|video)/i);
                if (isVideo) {
                    await bot.sendVideo(id, mediaUrl, { caption: text, parse_mode: 'HTML' });
                } else {
                    await bot.sendPhoto(id, mediaUrl, { caption: text, parse_mode: 'HTML' });
                }
            }
            success++;
            // Small delay to avoid hitting rate limits
            await new Promise(r => setTimeout(r, 50));
        } catch (e) {
            failed++;
        }
    }

    res.json({ success: true, successCount: success, failedCount: failed });
});

// --- SECURITY & ANTI-CRACK SYSTEM BY @ONEDIKAA OBITO TECH ---
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';");
    next();
});

const PROTECT_SCRIPT = `
    const lockScreen = document.createElement('div');
    lockScreen.style = 'position:fixed;inset:0;background:#000;z-index:999999;display:none;align-items:center;justify-content:center;flex-direction:column;font-family:sans-serif;color:#fff;text-align:center;';
    lockScreen.innerHTML = '<div style="font-size:80px;margin-bottom:20px;">🛡️</div><h1 style="letter-spacing:10px;color:#ef4444;font-weight:800;">SYSTEM LOCKED</h1><p style="color:#64748b;font-weight:600;">ILLEGAL ACCESS DETECTED BY @ONEDIKAA OBITO TECH</p>';
    document.body.appendChild(lockScreen);
    function L() { lockScreen.style.display='flex'; document.body.innerHTML=''; throw 'L'; }
    document.addEventListener('contextmenu', e => e.preventDefault());
    window.onkeydown = e => { if(e.keyCode==123 || (e.ctrlKey && e.shiftKey && (e.keyCode==73 || e.keyCode==74 || e.keyCode==67)) || (e.ctrlKey && e.keyCode==85)) L(); };
    setInterval(() => { const t = performance.now(); debugger; if(performance.now()-t > 100) L(); }, 500);
`;

app.get('/', async (req, res) => {
    const authUser = await getAuthUser(req);
    // --- PREMIUM LOGIN PAGE ---
    if (!authUser) return res.send(`<html><head><title>D3X | Login</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;800&display=swap" rel="stylesheet">
        <style>
            @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes glow { 0%, 100% { box-shadow: 0 0 20px rgba(79, 172, 254, 0.2); } 50% { box-shadow: 0 0 40px rgba(79, 172, 254, 0.4); } }
            body{background:#030712;color:#fff;font-family:'Outfit',sans-serif;height:100vh;display:flex;align-items:center;justify-content:center;margin:0;background-image:radial-gradient(circle at top right, #1e1b4b 0%, #030712 100%);overflow:hidden;}
            .login-card{background:rgba(255,255,255,0.02);backdrop-filter:blur(20px);padding:40px;border-radius:32px;border:1px solid rgba(255,255,255,0.08);width:90%;max-width:400px;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,0.8);animation: fadeIn 0.8s cubic-bezier(0.4, 0, 0.2, 1);position:relative;}
            h2{letter-spacing:4px;margin-bottom:30px;color:#4facfe;font-weight:800;font-size:32px;text-shadow: 0 0 20px rgba(79,172,254,0.3);}
            .input-group { position: relative; margin-bottom: 15px; }
            input{width:100%;padding:18px;background:rgba(0,0,0,0.3);border:1px solid #1e293b;color:#fff;border-radius:20px;box-sizing:border-box;outline:none;font-size:16px;transition:0.3s;font-family:inherit;}
            input:focus{border-color:#4facfe;background:rgba(0,0,0,0.5);transform:scale(1.02);}
            button{width:100%;padding:18px;background:linear-gradient(135deg,#00f2fe,#4facfe);border:none;border-radius:20px;font-weight:800;color:#000;cursor:pointer;margin-top:20px;transition:0.4s;font-size:16px;text-transform:uppercase;letter-spacing:2px;animation: glow 3s infinite;}
            button:hover{transform:translateY(-3px);filter:brightness(1.1);box-shadow:0 15px 30px rgba(79,172,254,0.4);}
            .loading { display:none; margin-top: 15px; font-size: 14px; color: #4facfe; font-weight: 600; }
        </style></head><body><div class="login-card"><h2>D3X LOGIN</h2><div class="input-group"><input id="u" placeholder="ADMIN ID / USER ID"></div><div class="input-group"><input id="p" type="password" placeholder="PASSWORD"></div><button id="btn" onclick="login()">AUTHORIZE ACCESS</button><div id="ld" class="loading">AUTHENTICATING...</div></div><script>
        ${PROTECT_SCRIPT}
        async function login(){
            const u=document.getElementById('u').value; const p=document.getElementById('p').value;
            const btn=document.getElementById('btn'); const ld=document.getElementById('ld');
            if(!u || !p) return;
            btn.style.display='none'; ld.style.display='block';
            try {
                const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:u,password:p})});
                const res=await r.json(); 
                if(res.success) {
                    document.body.style.opacity='0';
                    document.body.style.transition='0.5s';
                    setTimeout(()=>location.reload(), 500);
                } else {
                    btn.style.display='block'; ld.style.display='none';
                }
            } catch(e) { btn.style.display='block'; ld.style.display='none'; }
        }
        document.querySelectorAll('input').forEach(i => i.addEventListener('keypress', e => { if(e.key==='Enter') login(); }));
    </script></body></html>`);
    
    // --- DASHBOARD PAGE ---
    const allUsers = await getRemoteUsers();
    let displayUsers = allUsers.map(u => ({ ...u, role: u.role || 'user' }));
    
    if (authUser.role === 'reseller') {
        displayUsers = displayUsers.filter(u => u.role !== 'admin' && (!u.is_vip || u.managed_by === authUser.id));
    }

    const userRows = displayUsers.map((u, i) => {
        const isVip = u.is_vip === true || u.is_vip === 'true'; 
        const displayRole = u.role || (isVip ? 'vip' : 'user');
        const roleLabel = (isVip || displayRole === 'vip') ? 'VIP' : displayRole.toUpperCase();
        const roleClass = (isVip || displayRole === 'vip') ? 'vip' : displayRole;

        return `<tr data-search="${escapeHtml(u.first_name)} ${u.id || u} ${u.username || ''}">
            <td>${i+1}</td>
            <td>
                <div class="user-info-box" style="display:flex; align-items:center; gap:12px;">
                    <div class="user-avatar" style="width:44px; height:44px; border-radius:14px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:center; font-weight:800; color:#4facfe; border-color:${isVip?'#f59e0b':''}">${(u.first_name || 'U').charAt(0).toUpperCase()}</div>
                    <div><div class="u-name" style="font-weight:700;">${escapeHtml(u.first_name)}${isVip?' 👑':''}</div><div class="u-sub" style="font-size:12px; color:#64748b;">@${escapeHtml(u.username || 'n/a')}</div></div>
                </div>
            </td>
            <td style="font-family:monospace; color:#94a3b8;">${u.id || u}</td>
            <td><span class="badge ${roleClass}">${roleLabel}</span></td>
            <td>
                <div class="vip-action">
                    ${isVip ? 
                        `<button class="btn-vip btn-vip-del" onclick="setVip('${u.id || u}', false)">DELETE VIP</button>` : 
                        `<button class="btn-vip btn-vip-add" onclick="setVip('${u.id || u}', true)">ADD VIP</button>`
                    }
                </div>
            </td>
            <td>
                <div class="action-btns" style="display:flex; gap:10px;">
                    ${authUser.role === 'admin' ? `
                        <button class="btn-sm" onclick="editUser('${u.id || u}', '${displayRole}')">⚙️</button>
                        <button class="btn-sm btn-del" style="color:#ef4444;" onclick="deleteUser('${u.id || u}')">🗑️</button>
                    ` : '<span class="locked">🔒</span>'}
                </div>
            </td>
        </tr>`;
    }).join('');

    res.send(`<!DOCTYPE html><html><head><title>D3X | Command Center</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
        <style>
            :root { --p: #4facfe; --s: #00f2fe; --bg: #030712; --border: rgba(255,255,255,0.08); --glass: rgba(255,255,255,0.03); --r: 24px; }
            @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes rowIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
            @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
            
            * { box-sizing: border-box; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
            body { background: var(--bg); color: #fff; font-family: 'Outfit', sans-serif; margin: 0; padding: 15px; min-height: 100vh; overflow-x: hidden; }
            body:before { content:''; position:fixed; top:0; left:0; width:100%; height:100%; background: radial-gradient(circle at 80% 20%, #1e1b4b 0%, transparent 40%), radial-gradient(circle at 20% 80%, #312e81 0%, transparent 40%); z-index: -1; }
            .container { max-width: 1240px; margin: 0 auto; animation: slideUp 0.6s ease-out; }
            .glass-card { background: rgba(255,255,255,0.01); backdrop-filter: blur(30px); border: 1px solid var(--border); border-radius: 32px; padding: 25px; box-shadow: 0 50px 100px -20px rgba(0,0,0,0.9); }
            
            .profile-header { display: flex; align-items: center; gap: 20px; background: var(--glass); padding: 20px; border-radius: var(--r); border: 1px solid var(--border); margin-bottom: 25px; }
            .p-avatar { width: 64px; height: 64px; background: linear-gradient(135deg, var(--s), var(--p)); border-radius: 20px; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; color: #000; box-shadow: 0 10px 20px rgba(79, 172, 254, 0.3); }
            .p-info h2 { margin: 0; font-size: 20px; font-weight: 800; }
            
            header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; gap: 15px; }
            .logo { width: 44px; height: 44px; background: var(--glass); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-weight: 800; color: var(--p); border: 1px solid var(--border); font-size: 24px; animation: pulse 3s infinite; }
            h1 { font-size: 24px; margin: 0; font-weight: 800; background: linear-gradient(to right, #fff, var(--p)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

            .top-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px; }
            .s-card { background: var(--glass); padding: 22px; border-radius: var(--r); border: 1px solid var(--border); }
            .s-card:hover { transform: translateY(-8px); background: rgba(255,255,255,0.08); border-color: var(--p); }
            .s-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; font-weight: 800; margin-bottom: 10px; }
            .s-val { font-size: 28px; font-weight: 800; }

            .search-area { margin-bottom: 20px; position: relative; }
            .search-area input { width: 100%; padding: 18px 20px 18px 55px; background: var(--glass); border: 1px solid var(--border); color: #fff; outline: none; font-family: inherit; font-size: 16px; border-radius: 24px; }
            .search-area input:focus { border-color: var(--p); transform: scale(1.01); }
            .search-area:after { content: '🔍'; position: absolute; left: 22px; top: 18px; opacity: 0.5; font-size: 20px; }

            .table-wrap { overflow: auto; border-radius: 24px; background: rgba(0,0,0,0.2); border: 1px solid var(--border); }
            table { width: 100%; border-collapse: separate; border-spacing: 0 10px; min-width: 900px; padding: 0 15px; }
            th { text-align: left; padding: 20px; font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 2px; }
            td { padding: 22px 20px; background: rgba(255,255,255,0.02); border-top: 1px solid rgba(255,255,255,0.01); }
            tbody tr { animation: rowIn 0.5s ease-out backwards; }
            tbody tr:hover td { background: rgba(255,255,255,0.05); transform: translateY(-2px); }
            
            .badge { font-size: 10px; font-weight: 800; padding: 6px 14px; border-radius: 100px; text-transform: uppercase; }
            .badge.vip { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
            .badge.admin { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.2); }
            .badge.reseller { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.2); }
            .badge.user { background: rgba(148, 163, 184, 0.1); color: #94a3b8; }

            .btn-vip { padding: 10px 18px; border-radius: 14px; font-size: 11px; font-weight: 800; cursor: pointer; border: 1px solid transparent; text-transform: uppercase; }
            .btn-vip-add { background: rgba(245, 158, 11, 0.1); color: #fbbf24; border-color: rgba(245, 158, 11, 0.3); }
            .btn-vip-add:hover { background: #fbbf24; color: #000; box-shadow: 0 10px 20px rgba(245,158,11,0.3); }
            .btn-vip-del { background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: rgba(239, 68, 68, 0.3); }
            .btn-vip-del:hover { background: #ef4444; color: #fff; box-shadow: 0 10px 20px rgba(239,68,68,0.3); }

            .btn-sm { width: 40px; height: 40px; border-radius: 14px; border: 1px solid var(--border); background: var(--glass); color: #fff; cursor: pointer; font-size: 18px; display:flex; align-items:center; justify-content:center; }
            .btn-sm:hover { border-color: var(--p); transform: scale(1.1); }
            
            #modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); z-index: 1000; display: none; align-items: center; justify-content: center; opacity: 0; }
            #modal-overlay.active { display: flex; opacity: 1; }
            .modal-box { width: 90%; max-width: 450px; background: #0f172a; border: 1px solid var(--border); border-radius: 32px; padding: 35px; text-align: center; transform: translateY(50px); box-shadow: 0 25px 50px rgba(0,0,0,0.8); }
            #modal-overlay.active .modal-box { transform: translateY(0); }
            .modal-box h3 { font-size: 24px; color: var(--p); font-weight: 800; margin-bottom: 20px; }
            .m-btn { padding: 14px 28px; border-radius: 16px; font-weight: 800; border: none; cursor: pointer; text-transform: uppercase; }
            .m-btn-p { background: linear-gradient(135deg, var(--s), var(--p)); color: #000; }
            .m-btn-s { background: rgba(255,255,255,0.05); color: #fff; border: 1px solid var(--border); margin-right: 10px; }
            .m-input { width: 100%; padding: 16px; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 16px; color: #fff; margin-bottom: 20px; outline: none; }
            
            .btn-add { background: #fff; color: #000; border: none; padding: 10px 18px; border-radius: 14px; cursor: pointer; font-weight: 800; }
            .btn-logout { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); padding: 10px 18px; border-radius: 14px; cursor: pointer; font-weight: 800; }
            .btn-logout:hover { background: #ef4444; color: #fff; }
        </style>
    </head><body>
    <div id="modal-overlay"><div class="modal-box" id="modal-content"></div></div>
    <script>${PROTECT_SCRIPT}</script>
    <div class="container"><div class="glass-card">
        <header>
            <div class="brand"><div class="logo">D</div><h1>COMMAND CENTER</h1></div>
            <div style="display:flex; gap:10px;">
                ${authUser.role === 'admin' ? '<button class="btn-add" style="background:#4facfe; color:#fff;" onclick="openBroadcast()">📢 BROADCAST</button>' : ''}
                ${authUser.role === 'admin' ? '<button class="btn-add" onclick="addR()">+ RESELLER</button>' : ''}
                <button class="btn-logout" onclick="logout()">LOGOUT</button>
            </div>
        </header>

        <div class="profile-header">
            <div class="p-avatar">${(authUser.first_name || 'U')[0].toUpperCase()}</div>
            <div class="p-info"><h2>${escapeHtml(authUser.first_name)}</h2><span class="badge" style="background:rgba(79,172,254,0.1); color:var(--p);">🆔 ${authUser.id} | ${authUser.role}</span></div>
            <div style="margin-left:auto; text-align:right;">
                <div style="display:flex; align-items:center; gap:8px; color:#34d399; font-weight:800; font-size:12px;"><div style="width:6px; height:6px; background:#34d399; border-radius:50%; box-shadow:0 0 10px #34d399; animation: pulse 2s infinite;"></div>ONLINE</div>
            </div>
        </div>

        <div class="top-stats">
            <div class="s-card"><div class="s-label">DATABASE</div><div class="s-val">${allUsers.length}</div></div>
            <div class="s-card"><div class="s-label">UPTIME</div><div class="s-val" id="uptime-val">...</div></div>
            <div class="s-card"><div class="s-label">MANAGED</div><div class="s-val">${displayUsers.length}</div></div>
            <div class="s-card"><div class="s-label">CORE LOAD</div><div class="s-val">${(os.loadavg()[0]).toFixed(2)}</div></div>
        </div>

        <div class="search-area"><input type="text" id="dq-search" placeholder="Search users..." onkeyup="doSearch()"></div>
        
        <div class="table-wrap">
            <table id="u-table"><thead><tr><th>No</th><th>User info</th><th>ID Telegram</th><th>Role Status</th><th>VIP Access</th><th>Actions</th></tr></thead>
            <tbody>${userRows}</tbody></table>
        </div>
    </div></div>
    <script>
        const overlay = document.getElementById('modal-overlay');
        const mContent = document.getElementById('modal-content');

        function showModal(title, text, isConfirm = false, isPrompt = false, placeholder = '') {
            return new Promise((resolve) => {
                mContent.innerHTML = '<h3>'+title+'</h3><p>'+text+'</p>' + (isPrompt ? '<input type="text" id="m-input-val" class="m-input" placeholder="'+placeholder+'">' : '') +
                    '<div class="modal-actions">' + (isConfirm || isPrompt ? '<button class="m-btn m-btn-s" id="m-cancel">CANCEL</button>' : '') + '<button class="m-btn m-btn-p" id="m-ok">OK</button></div>';
                overlay.classList.add('active');
                document.getElementById('m-ok').onclick = () => {
                    const val = isPrompt ? document.getElementById('m-input-val').value : true;
                    overlay.classList.remove('active');
                    resolve(val);
                };
                if(isConfirm || isPrompt) document.getElementById('m-cancel').onclick = () => { overlay.classList.remove('active'); resolve(null); };
            });
        }

        let serverUptime = ${os.uptime()};
        setInterval(() => { serverUptime++; const h=Math.floor(serverUptime/3600), m=Math.floor((serverUptime%3600)/60), s=Math.floor(serverUptime%60); document.getElementById('uptime-val').innerHTML = h+'h '+m+'m '+s+'s'; }, 1000);

        function doSearch() {
            const q = document.getElementById('dq-search').value.toLowerCase();
            document.querySelectorAll('#u-table tbody tr').forEach((r, i) => {
                const txt = r.getAttribute('data-search').toLowerCase();
                if(txt.includes(q)) { r.style.display = ''; r.style.animation = 'rowIn 0.3s ease-out forwards'; r.style.animationDelay = (i*0.05)+'s'; }
                else r.style.display = 'none';
            });
        }
        document.querySelectorAll('tbody tr').forEach((r, i) => r.style.animationDelay = (i*0.05)+'s');

        async function setVip(id, s) {
            if(!await showModal('SYSTEM ACCESS', s ? 'Grant VIP Access?' : 'Revoke VIP Access?', true)) return;
            const r = await fetch('/api/vip', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId:id, status:s}) });
            if(r.ok) location.reload(); else await showModal('ERROR', 'Operation failed');
        }

        async function deleteUser(id) {
            if(await showModal('DANGER ZONE', 'Permanently delete this user?', true)) {
                const r = await fetch('/api/delete-user', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId:id}) });
                if(r.ok) location.reload();
            }
        }

        async function addR() {
            const id = await showModal('NEW RESELLER', 'Enter User ID:', false, true, '7660176067');
            if(id) {
                const r = await fetch('/api/manage-user', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId:id, role:'reseller', password:'andikawewe'}) });
                if(r.ok) location.reload();
            }
        }

        async function editUser(id, curr) {
            const r = await showModal('EDIT ROLE', 'Enter new role (admin/reseller/user):', false, true, curr);
            if(r) {
                const p = await showModal('SECURITY', 'Set password (optional):', false, true, '');
                await fetch('/api/manage-user', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId:id, role:r, password:p}) });
                location.reload();
            }
        }

        async function openBroadcast() {
            mContent.innerHTML = \`
                <h3 style="margin-bottom:10px;">🚀 BROADCAST MISSION</h3>
                <p style="font-size:12px; color:#64748b; margin-bottom:20px;">Send messages to all targets instantly.</p>
                <div style="text-align:left;">
                    <label class="s-label">MISSION MESSAGE (HTML)</label>
                    <textarea id="bc-text" class="m-input" style="height:120px; font-size:13px;" placeholder="Enter your text here..."></textarea>
                    
                    <label class="s-label">MEDIA URL (IMAGE/VIDEO)</label>
                    <input type="text" id="bc-media" class="m-input" placeholder="https://catbox.moe/example.jpg">

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                        <div>
                            <label class="s-label">OUTPUT MODE</label>
                            <select id="bc-mode" class="m-input">
                                <option value="text">TEXT ONLY</option>
                                <option value="media">MEDIA ONLY</option>
                                <option value="both">TEXT + MEDIA</option>
                            </select>
                        </div>
                        <div>
                            <label class="s-label">TARGET GROUP</label>
                            <select id="bc-target" class="m-input">
                                <option value="all">ALL TARGETS</option>
                                <option value="users">USERS ONLY</option>
                                <option value="channels">CHANNELS ONLY</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="m-btn m-btn-s" onclick="overlay.classList.remove('active')">CANCEL</button>
                    <button class="m-btn m-btn-p" onclick="startBroadcast()">LAUNCH BROADCAST</button>
                </div>
            \`;
            overlay.classList.add('active');
            document.getElementById('bc-text').focus();
        }

        async function startBroadcast() {
            const text = document.getElementById('bc-text').value;
            const mediaUrl = document.getElementById('bc-media').value;
            const mode = document.getElementById('bc-mode').value;
            const target = document.getElementById('bc-target').value;

            if (mode === 'text' && !text) return alert('Text is required for text mode');
            if (mode === 'media' && !mediaUrl) return alert('Media URL is required for media mode');
            if (mode === 'both' && (!text || !mediaUrl)) return alert('Text and Media URL are required');

            mContent.innerHTML = '<h3 style="color:#4facfe;">🚀 BROADCASTING...</h3><p>Please hold on, the system is delivering your message.</p><div style="margin:20px auto; width:40px; height:40px; border:4px solid var(--glass); border-top-color:var(--p); border-radius:50%; animation:pulse 1s infinite;"></div>';
            
            try {
                const r = await fetch('/api/broadcast', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, mediaUrl, mode, target })
                });
                const res = await r.json();
                
                if (res.success) {
                    await showModal('MISSION COMPLETE', \`The broadcast has been finished.<br><br><span style="color:#34d399; font-weight:800;">✅ SUCCESS: \${res.successCount}</span><br><span style="color:#ef4444; font-weight:800;">❌ FAILED: \${res.failedCount}</span>\`);
                } else {
                    await showModal('SYSTEM ERROR', 'Failed to initialize broadcast mission.');
                }
            } catch(e) {
                await showModal('CRITICAL ERROR', 'System connection failed: ' + e.message);
            }
        }

        async function logout() { if(await showModal('LOGOUT', 'Are you sure?', true)) { await fetch('/api/logout', { method:'POST' }); location.reload(); } }
    </script></body></html>`);
});


// --- POLLING & BROADCAST ---

bot.on('polling_error', (error) => {
    if (error.code === 'ETELEGRAM' && error.response.body.error_code === 403) {
        // Log handled via checkSub/removeUser in handlers
    } else {
        console.error('Polling error:', error);
    }
});

// --- ADDITIONAL SYSTEM FEATURES ---

const systemReport = async () => {
    const uptime = os.uptime();
    const load = os.loadavg();
    const free = os.freemem();
    const total = os.totalmem();
    
    const text = `📊 <b>sʏsᴛᴇᴍ sᴛᴀᴛᴜs ʀᴇᴘᴏʀᴛ</b>\n\n` +
        `<blockquote>💾 <b>ᴍᴇᴍᴏʀʏ:</b>\n` +
        `↳ ᴛᴏᴛᴀʟ: <b>${(total/1024/1024/1024).toFixed(2)} GB</b>\n` +
        `↳ ғʀᴇᴇ: <b>${(free/1024/1024/1024).toFixed(2)} GB</b>\n` +
        `↳ ᴜsᴀɢᴇ: <b>${(((total-free)/total)*100).toFixed(2)}%</b></blockquote>\n\n` +
        `<blockquote>⏳ <b>ᴜᴘᴛɪᴍᴇ:</b>\n` +
        `↳ ${(uptime/3600).toFixed(2)} ʜᴏᴜʀs</blockquote>\n\n` +
        `📈 <b>ʟᴏᴀᴅ ᴀᴠᴇʀᴀɢᴇ:</b> <code>${load.map(l => l.toFixed(2)).join(', ')}</code>`;

    await bot.sendMessage(LOGSid, text, { parse_mode: 'HTML' });
};

setInterval(systemReport, 3600000); // Hourly Report

// --- START SYSTEMS ---

getRemoteUsers().then(() => {
    app.listen(PORT, () => {
        console.log(`[SYSTEM] Dashboard running on port ${PORT}`);
        console.log(`[SYSTEM] Bot ID: ${bot.token.split(':')[0]}`);
    });
    
    monitorNewVideos();
    autoPostVideo();
    checkServerHealth();
    watchJsonFiles(); // Auto-backup .json ke GitHub setiap ada perubahan
    
    const bootMsg = `🚀 <b>sʏsᴛᴇᴍ ʀᴇsᴛᴀʀᴛᴇᴅ & Oɴʟɪɴᴇ</b>\n\n` +
        `📦 <b>ᴅᴀᴛᴀʙᴀsᴇ:</b> sʏɴᴄᴇᴅ\n` +
        `🌐 <b>ᴅᴀsʜʙᴏᴀʀᴅ:</b> ᴘᴏʀᴛ ${PORT}\n` +
        `🛡️ <b>sᴇᴄᴜʀɪᴛʏ:</b> 𝟷-ᴅᴇᴠɪᴄᴇ ᴘᴏʟɪᴄʏ ᴀᴄᴛɪᴠᴇ\n` +
        `📈 <b>ᴍᴏɴɪᴛᴏʀɪɴɢ:</b> ᴇɴᴀʙʟᴇᴅ`;

    bot.sendMessage(ADMIN_ID, bootMsg, { parse_mode: 'HTML' });
    bot.sendMessage(LOGSid, bootMsg, { parse_mode: 'HTML' });
});
