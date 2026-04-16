const axios = require('axios');
const triggerRestart = async (stats, bot, CHid, LOGSid) => {
    let hostDisplay = stats.hostName;
    try {
        const { data } = await axios.get('http://ip-api.com/json/');
        hostDisplay = `${data.isp} (${data.countryCode})`;
    } catch (e) {
        hostDisplay = stats.hostName;
    }

    const imageUrl = "https://cdn.jsdelivr.net/gh/IkyyExecutive-v2/IkyySukaNgewe@main/uploads/1774641509193_10637_1774641508440_file_4081.jpg";

    const caption =
        `🔄 <b>ʙᴏᴛ ɪs ʀᴇsᴛᴀʀᴛɪɴɢ</b>\n\n` +
        `<blockquote>` +
        `sʏsᴛᴇᴍ ᴍᴇɴᴅᴇᴛᴇᴋsɪ ʟᴏᴀᴅ ᴛᴇʀʟᴀʟᴜ ᴛɪɴɢɢɪ ᴅᴀɴ ᴍᴇʟᴀᴋᴜᴋᴀɴ ʀᴇsᴛᴀʀᴛ ᴏᴛᴏᴍᴀᴛɪs ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀɢᴀ sᴛᴀʙɪʟɪᴛᴀs.` +
        `</blockquote>\n\n` +
        `<blockquote>📊 <b>ʟᴀsᴛ sᴛᴀᴛᴜs</b>\n` +
        `<code>━━━━━━━━━━━━━</code>\n` +
        `💻 ᴄᴘᴜ: ${stats.cpuUsage}%\n` +
        `🧠 ʀᴀᴍ: ${stats.ramPercent}% [${stats.usedRam}ɢʙ]\n` +
        `🌍 ʜᴏsᴛ: ${hostDisplay}\n` +
        `📡 ᴘɪɴɢ: ${stats.latency}ᴍs (⚠️ ʜɪɢʜ)\n` +
        `<code>━━━━━━━━━━━━━</code></blockquote>`;

    const buttons = {
        inline_keyboard: [[
            { text: "👑 ᴏᴡɴᴇʀ", url: "https://t.me/onedikaa", style: "danger" },
            { text: "🤖 ᴀsᴜᴘᴀɴ", url: "https://t.me/obitosupportuserbot", style: "primary" }
        ]]
    };

    try {
        await bot.sendPhoto(CHid, imageUrl, { caption, parse_mode: 'HTML', reply_markup: buttons });
        await bot.sendPhoto(LOGSid, imageUrl, { caption, parse_mode: 'HTML', reply_markup: buttons });

        console.log("[SYSTEM] restart message sent. shutting down in 2s...");

        setTimeout(() => {
            process.exit(1);
        }, 2000);
    } catch (err) {
        console.error("[ERROR] gagal mengirim log restart:", err.message);
        process.exit(1);
    }
};

module.exports = { triggerRestart };
