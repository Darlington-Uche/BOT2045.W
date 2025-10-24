const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const P = require("pino");
const qrcode = require("qrcode-terminal");
const fs = require("fs");

// ========== MUTE SYSTEM ==========
let mutedUsers = fs.existsSync("./muted.json")
  ? JSON.parse(fs.readFileSync("./muted.json"))
  : {};

function saveMuted() {
  fs.writeFileSync("./muted.json", JSON.stringify(mutedUsers, null, 2));
}

// ========== BOT START ==========
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./session");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: state
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.clear();
      qrcode.generate(qr, { small: true });
      console.log("\n📱 Scan QR via WhatsApp → Linked Devices → Link a device\n");
    }
    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log("❌ Disconnected:", reason);
      if (reason !== DisconnectReason.loggedOut) startBot().catch(console.error);
      else console.log("🔒 Logged out. Delete ./session and restart.");
    }
    if (connection === "open") console.log("✅ WhatsApp connected successfully!");
  });

  // ========== MESSAGE HANDLER ==========
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0];
    if (!m.message || !m.key.remoteJid.endsWith("@g.us")) return;

    const from = m.key.remoteJid;
    const sender = m.key.participant;
    const text =
      m.message.conversation ||
      m.message.extendedTextMessage?.text ||
      "";

    // Check if sender is admin
    const metadata = await sock.groupMetadata(from);
    const isAdmin = metadata.participants.find(p => p.id === sender)?.admin;

    // Auto delete muted messages
    if (mutedUsers[from]?.includes(sender)) {
      await sock.sendMessage(from, { delete: m.key });
      return;
    }

    // Commands handler
    if (text.startsWith("/")) {
      const [cmd, ...messageParts] = text.trim().split(" ");
      const customMessage = messageParts.join(" ");

      switch (cmd.toLowerCase()) {
        // ========== SECRET TAGALL ==========
        case "/tagall": {
          if (!isAdmin) {
            return sock.sendMessage(from, { text: "❌ Only admins can use this command." });
          }

          const participants = metadata.participants.map((p) => p.id);
          const tagMessage = customMessage || "📢 Attention everyone!";
          
          await sock.sendMessage(from, {
            text: tagMessage,
            mentions: participants
          });
          break;
        }

        // ========== MUTE COMMAND ==========
        case "/mute": {
          if (!isAdmin) {
            return sock.sendMessage(from, { text: "❌ Only admins can use this command." });
          }

          let targetUser;

          // Check if user is mentioned
          const mention = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
          if (mention) {
            targetUser = mention;
          } 
          // Check if replying to a message
          else if (m.message.extendedTextMessage?.contextInfo?.participant) {
            targetUser = m.message.extendedTextMessage.contextInfo.participant;
          } 
          else {
            return sock.sendMessage(from, { text: "❌ Please mention a user or reply to their message to mute." });
          }

          if (!mutedUsers[from]) mutedUsers[from] = [];
          if (!mutedUsers[from].includes(targetUser)) {
            mutedUsers[from].push(targetUser);
            saveMuted();
          }

          const username = targetUser.split("@")[0];
          await sock.sendMessage(from, {
            text: `@${username} has been muted 🔇`,
            mentions: [targetUser]
          });
          break;
        }

        // ========== UNMUTE COMMAND ==========
        case "/unmute": {
          if (!isAdmin) {
            return sock.sendMessage(from, { text: "❌ Only admins can use this command." });
          }

          let targetUser;

          // Check if user is mentioned
          const mention = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
          if (mention) {
            targetUser = mention;
          } 
          // Check if replying to a message
          else if (m.message.extendedTextMessage?.contextInfo?.participant) {
            targetUser = m.message.extendedTextMessage.contextInfo.participant;
          } 
          else {
            return sock.sendMessage(from, { text: "❌ Please mention a user or reply to their message to unmute." });
          }

          if (mutedUsers[from] && mutedUsers[from].includes(targetUser)) {
            mutedUsers[from] = mutedUsers[from].filter(user => user !== targetUser);
            saveMuted();
            
            const username = targetUser.split("@")[0];
            await sock.sendMessage(from, {
              text: `@${username} has been unmuted 🔊`,
              mentions: [targetUser]
            });
          } else {
            const username = targetUser.split("@")[0];
            await sock.sendMessage(from, {
              text: `@${username} is not muted ❌`,
              mentions: [targetUser]
            });
          }
          break;
        }

        // ========== KICK COMMAND ==========
        case "/kick": {
          if (!isAdmin) {
            return sock.sendMessage(from, { text: "❌ Only admins can use this command." });
          }

          let targetUser;

          // Check if user is mentioned
          const mention = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
          if (mention) {
            targetUser = mention;
          } 
          // Check if replying to a message
          else if (m.message.extendedTextMessage?.contextInfo?.participant) {
            targetUser = m.message.extendedTextMessage.contextInfo.participant;
          } 
          else {
            return sock.sendMessage(from, { text: "❌ Please mention a user or reply to their message to kick." });
          }

          try {
            await sock.groupParticipantsUpdate(from, [targetUser], "remove");
            const username = targetUser.split("@")[0];
            await sock.sendMessage(from, {
              text: `@${username} has been kicked from the group ✅`,
              mentions: [targetUser]
            });
          } catch (error) {
            await sock.sendMessage(from, { text: "❌ Failed to kick user. Make sure I have admin permissions." });
          }
          break;
        }
      }
    }
  });
}

module.exports = { startBot };
