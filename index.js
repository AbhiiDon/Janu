const login = require("fca-smart-shankar");
const fs = require("fs");
const express = require("express");

const PREFIX = "/";

const axios = require("axios"); // 👈 ADD THIS

const lockedDPs = {};
// structure:
// lockedDPs[threadID] = "path/to/saved_dp.jpg"

const OWNER_UIDS = fs.existsSync("owners.txt")
  ? fs.readFileSync("owners.txt", "utf8")
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean)
  : [];

let rkbInterval = null;
let stopRequested = false;

const lockedGroupNames = {};

const lockedNicknames = {}; 
// Structure:
// lockedNicknames[threadID] = {
//    userID1: "Nick",
//    userID2: "Nick"
// }

// ===== MULTI TARGET SYSTEM =====
const activeTargets = new Set(); // multiple targets store honge

const humanDelay = (min = 1500, max = 3500) =>
new Promise(r =>
setTimeout(r, Math.floor(Math.random() * (max - min)) + min)
);

const lastCommandTime = {};

const targetUIDs = fs.existsSync("Target.txt")
? fs.readFileSync("Target.txt", "utf8").split("\n").map(x => x.trim()).filter(Boolean)
: [];

const messageQueues = {};
const queueRunning = {};
let globalTargetIndex = 0;

const app = express();
app.get("/", (_, res) => res.send("<h2>Messenger Bot Running</h2>"));
app.listen(12373, () => console.log("🌐 Log server running"));

process.on("uncaughtException", err =>
console.error("❗ Uncaught:", err.message)
);
process.on("unhandledRejection", r =>
console.error("❗ Rejection:", r)
);

login(
{ appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) },
(err, api) => {
if (err) return console.error("❌ Login failed:", err);

api.setOptions({ listenEvents: true });
console.log("✅ Bot logged in with / prefix");

// ===== EVENT RANDOM DELAY (2–5 sec) =====
const eventDelay = () =>
  new Promise(resolve =>
    setTimeout(resolve, Math.floor(Math.random() * 3000) + 2000)
  );

api.listenMqtt(async (err, event) => {
try {
if (err || !event) return;

const {
threadID,
senderID,
body,
messageID,
messageReply,
mentions,
} = event;

/* ================= GROUP NAME LOCK ENFORCEMENT ================= */

if (
event.type === "event" &&
event.logMessageType === "log:thread-name"
) {
const locked = lockedGroupNames[threadID];
if (locked && event.logMessageData.name !== locked) {
await api.setTitle(locked, threadID);
await api.sendMessage(
"Groupname Locked 🔒 Successfully",
threadID
);
}
return;
}

/* ================= NICKNAME LOCK ENFORCEMENT ================= */

if (
  event.type === "event" &&
  event.logMessageType === "log:user-nickname"
) {
  const { participant_id, nickname } = event.logMessageData;

  if (
    lockedNicknames[threadID] &&
    lockedNicknames[threadID][participant_id]
  ) {
    const lockedName = lockedNicknames[threadID][participant_id];

    if (nickname !== lockedName) {
      await api.changeNickname(
        lockedName,
        threadID,
        participant_id
      );

      await api.sendMessage(
        "Nickname Locked 🔒 Successfully",
        threadID
      );
    }
  }

  return;
}

/* ================= WELCOME / GOODBYE SYSTEM ================= */

if (event.type === "event") {

  /* ===== WELCOME MESSAGE ===== */
  if (event.logMessageType === "log:subscribe") {

    const addedUsers = event.logMessageData.addedParticipants || [];

    for (const user of addedUsers) {

      // Bot khud add hua ho to skip
      if (user.userFbId == api.getCurrentUserID()) continue;

      const name = user.fullName || "New Member";
      const uid = user.userFbId;

      const welcomeMsg = `
╔═══━━━  🎎🎀  ━━━═══╗

         👑  𝓦𝓔𝓛𝓒𝓞𝓜𝓔  👑

        💖 𝓗𝓮𝓵𝓵𝓸 @${name}

✨ You are now a precious part
   of our beautiful family 💞

🌟 Stay active, stay positive
   and enjoy your time here 💕

📌 Respect Everyone | No Drama

💎 Have a lovely stay 💎

╚═══━━━  ᥫ᭡‿︵━━━═══╝
`;

      const mentionIndex = welcomeMsg.indexOf(`@${name}`);

      try {
        await eventDelay(); // ✅ RANDOM DELAY

        await api.sendMessage(
          {
            body: welcomeMsg,
            mentions: [{
              tag: `@${name}`,
              id: uid,
              fromIndex: mentionIndex,
              length: name.length + 1
            }]
          },
          threadID
        );
      } catch (err) {
        console.log("Welcome send error:", err.message);
      }
    }
  }

  /* ===== REMOVE / LEFT MESSAGE ===== */
  if (event.logMessageType === "log:unsubscribe") {

    const leftUID = event.logMessageData.leftParticipantFbId;
    let name = "Member";

    try {
      const info = await api.getUserInfo(leftUID);
      name = info[leftUID]?.name || "Member";
    } catch {}

    // ===== REMOVED BY SOMEONE =====
    if (event.author && event.author !== leftUID) {

      const trollMsg = `
┏━━━━━━━━━━━━━━━┓
┃  🤭 𝑶𝒐𝒑𝒔𝒔𝒔𝒔 !! 🤭             ┃ 
┗━━━━━━━━━━━━━━━┛

🚫 @${name} ko group se nikal diya gaya 😹  
🚪 Door is that way ➜

Better luck next time 🤭

━━━━━━━━━━━━━━━━━━
`;

      const mentionIndex = trollMsg.indexOf(`@${name}`);

      try {
        await eventDelay(); // ✅ RANDOM DELAY

        await api.sendMessage(
          {
            body: trollMsg,
            mentions: [{
              tag: `@${name}`,
              id: leftUID,
              fromIndex: mentionIndex,
              length: name.length + 1
            }]
          },
          threadID
        );
      } catch (err) {
        console.log("Remove message error:", err.message);
      }

    } else {

      // ===== LEFT BY SELF =====
      const goodbyeMsg = `
~•~•~•~ 💔 𝑮𝒐𝒐𝒅𝒃𝒚𝒆 💔 ~•~•~•~

🥺 @${name} 𝓰𝓻𝓸𝓾𝓹 𝓬𝓱𝓱𝓸𝓭 𝓰𝓪𝔂𝓮... 💔 𝓖𝓸𝓸𝓭𝓫𝔂𝓮

🌙 You chose to leave this family 🥀
✨ Hope you find what you're looking for 🌍

Take care & stay safe ✨

~•~•~•~•~•~•~•~•~•~
`;

      const mentionIndex = goodbyeMsg.indexOf(`@${name}`);

      try {
        await eventDelay(); // ✅ RANDOM DELAY

        await api.sendMessage(
          {
            body: goodbyeMsg,
            mentions: [{
              tag: `@${name}`,
              id: leftUID,
              fromIndex: mentionIndex,
              length: name.length + 1
            }]
          },
          threadID
        );
      } catch (err) {
        console.log("Goodbye message error:", err.message);
      }
    }
  }
}

/* ================= TARGET AUTO REPLY (FIXED GLOBAL LINE SYSTEM) ================= */

const enqueueMessage = async (uid, threadID, messageID) => {

  if (!messageQueues[uid]) messageQueues[uid] = [];
  messageQueues[uid].push({ threadID, messageID });

  if (queueRunning[uid]) return;
  queueRunning[uid] = true;

  if (!fs.existsSync("targetnp.txt")) {
    queueRunning[uid] = false;
    return;
  }

  const lines = fs
    .readFileSync("targetnp.txt", "utf8")
    .split("\n")
    .map(x => x.trim())
    .filter(Boolean);

  if (!lines.length) {
    queueRunning[uid] = false;
    return;
  }

  let userName = "User";
  try {
    const info = await api.getUserInfo(uid);
    userName = info[uid]?.name || "User";
  } catch {}

  const run = async () => {

    if (!messageQueues[uid].length) {
      queueRunning[uid] = false;
      return;
    }

    const msg = messageQueues[uid].shift();

    // ✅ GLOBAL LINE PICK
    const line = lines[globalTargetIndex];

    // 🔁 GLOBAL INDEX UPDATE
    globalTargetIndex++;
    if (globalTargetIndex >= lines.length) {
      globalTargetIndex = 0;
    }

    // ⏳ HUMAN DELAY
    await humanDelay(10000, 15000);

    await api.sendMessage(
      {
        body: `@${userName} ${line}`,
        mentions: [{ tag: `@${userName}`, id: uid }],
      },
      msg.threadID,
      msg.messageID
    );

    setTimeout(run, Math.floor(Math.random() * 4000) + 2000);
  };

  run();
};

// ✅ MULTI TARGET CHECK
if (
  fs.existsSync("targetnp.txt") &&
  (targetUIDs.includes(senderID) || activeTargets.has(senderID))
) {
  enqueueMessage(senderID, threadID, messageID);
}

if (!body || !body.startsWith(PREFIX)) return;
if (!OWNER_UIDS.includes(senderID)) return;

const now = Date.now();
if (lastCommandTime[senderID] && now - lastCommandTime[senderID] < 8000)
  return;
lastCommandTime[senderID] = now;

const args = body.slice(PREFIX.length).trim().split(/\s+/);
const cmd = args[0].toLowerCase();
const input = args.slice(1).join(" ");

/* ================= COMMANDS ================= */

if (cmd === "uid") {
await humanDelay();

let uid = null;

if (mentions && Object.keys(mentions).length > 0) {
uid = Object.keys(mentions)[0];
}

else if (messageReply && messageReply.senderID) {
uid = messageReply.senderID;
}

else {
const searchName = input.replace("@", "").toLowerCase();
if (!searchName) {
return api.sendMessage("❌ $uid @MemberName likho", threadID, messageID);
}

const info = await api.getThreadInfo(threadID);
const users = await api.getUserInfo(info.participantIDs);

for (const id in users) {
const name = users[id]?.name;
if (name && name.toLowerCase().includes(searchName)) {
uid = id;
break;
}
}

if (!uid) {
return api.sendMessage("❌ Member nahi mila", threadID, messageID);
}
}

try {
const info = await api.getUserInfo(uid);
const name = info[uid]?.name || "Unknown";

return api.sendMessage(
`👤 🆔 Name : ${name}
User UID : ${uid}`,
threadID,
messageID
);
} catch {
return api.sendMessage(
`👤 🆔 Name : Not Found
User UID : ${uid}`,
threadID,
messageID
);
}
}

else if (cmd === "locknickname") {

  if (!messageReply || !messageReply.senderID) {
    return api.sendMessage(
      "❌ Kisi ke message pe reply karke $locknickname <name> likho",
      threadID,
      messageID
    );
  }

  const targetUser = messageReply.senderID;
  const newNick = input.trim();

  if (!newNick) {
    return api.sendMessage(
      "❌ Nickname bhi likho",
      threadID,
      messageID
    );
  }

  if (!lockedNicknames[threadID]) {
    lockedNicknames[threadID] = {};
  }

  lockedNicknames[threadID][targetUser] = newNick;

  await api.changeNickname(newNick, threadID, targetUser);

  await api.sendMessage(
    `🔒 Nickname Locked Successfully`,
    threadID,
    messageID
  );
}

else if (cmd === "unlocknickname") {

  if (!lockedNicknames[threadID]) {
    return api.sendMessage(
      "❌ Koi nickname lock nahi hai",
      threadID,
      messageID
    );
  }

  delete lockedNicknames[threadID];

  await api.sendMessage(
    "🔓 All Nicknames Unlocked Successfully",
    threadID,
    messageID
  );
}

else if (cmd === "lockdp") {

  try {
    const info = await api.getThreadInfo(threadID);
    const dpUrl = info.imageSrc;

    if (!dpUrl) {
      return api.sendMessage(
        "❌ Is group me DP lagi hi nahi hai",
        threadID,
        messageID
      );
    }

    const res = await axios.get(dpUrl, {
      responseType: "arraybuffer"
    });

    const filePath = `locked_dp_${threadID}.jpg`;
    fs.writeFileSync(filePath, Buffer.from(res.data));

    lockedDPs[threadID] = filePath;

    await api.sendMessage(
      "🖼 Group DP Locked Successfully 🔒",
      threadID,
      messageID
    );

  } catch (e) {
    console.error(e);
    api.sendMessage(
      "⚠️ DP lock karte time error aaya",
      threadID,
      messageID
    );
  }
}

else if (cmd === "unlockdp") {

  if (!lockedDPs[threadID]) {
    return api.sendMessage(
      "❌ Is group me koi DP lock nahi hai",
      threadID,
      messageID
    );
  }

  delete lockedDPs[threadID];

  await api.sendMessage(
    "🔓 Group DP Unlock Successfully",
    threadID,
    messageID
  );
}

else if (cmd === "whois") {
await humanDelay();

if (!messageReply || !messageReply.senderID) {
return api.sendMessage("❌ Reply pe $whois likho", threadID, messageID);
}

const uid = messageReply.senderID;

try {
const info = await api.getUserInfo(uid);
const name = info[uid]?.name || "Unknown";

return api.sendMessage(
`🕵️ WHOIS UID

👤 🆔 Name : ${name}
User UID : ${uid}`,
threadID,
messageID
);
} catch {
return api.sendMessage(
`🕵️ WHOIS UID

👤 🆔 Name : Not Found
User UID : ${uid}`,
threadID,
messageID
);
}
}

else if (cmd === "groupuid") {
await humanDelay();
api.sendMessage(`🆔 Group UID: ${threadID}`, threadID, messageID);
}

else if (cmd === "allnickname") {
const info = await api.getThreadInfo(threadID);
for (const uid of info.participantIDs) {
await api.changeNickname(input, threadID, uid);
await new Promise(r => setTimeout(r, 30000));
}
}

else if (cmd === "groupname") {
await humanDelay();
await api.setTitle(input, threadID);
}

else if (cmd === "lockgroupname") {
lockedGroupNames[threadID] = input;
await api.setTitle(input, threadID);
await api.sendMessage("Groupname Locked 🔒 Successfully", threadID, messageID);
}

else if (cmd === "unlockgroupname") {
delete lockedGroupNames[threadID];
await api.sendMessage("Groupname Unlocked 🔓 Successfully", threadID, messageID);
}

else if (cmd === "exit") {
await api.removeUserFromGroup(api.getCurrentUserID(), threadID);
}

else if (cmd === "loderstart") {

await api.sendMessage("Loder Started Successfully", threadID, messageID);

const lines = fs.readFileSync("np.txt", "utf8")
.split("\n")
.map(x => x.trim())
.filter(Boolean);

if (!lines.length)
return api.sendMessage("❌ np.txt empty hai", threadID);

stopRequested = false;
let i = 0;

rkbInterval = setInterval(() => {
if (stopRequested) {
clearInterval(rkbInterval);
rkbInterval = null;
return;
}

api.sendMessage(`${input} ${lines[i]}`, threadID);

i++;
if (i >= lines.length) i = 0;

}, 60000);
}

else if (cmd === "loderstop") {
stopRequested = true;
if (rkbInterval) clearInterval(rkbInterval);
await api.sendMessage("🛑 Loder Stopped Successfully", threadID, messageID);
}

else if (cmd === "target") {

  const uid = args[1];
  if (!uid) {
    return api.sendMessage(
      "❌ Usage: $target <uid>",
      threadID,
      messageID
    );
  }

  activeTargets.add(uid);

  try {
    const info = await api.getUserInfo(uid);
    const name = info[uid]?.name || "Unknown";

    await api.sendMessage(
`🎯 Target Added Successfully

👤 Name : ${name}
🆔 UID  : ${uid}

📌 Total Targets : ${activeTargets.size}`,
      threadID,
      messageID
    );
  } catch {
    await api.sendMessage(
`🎯 Target Added Successfully
🆔 UID : ${uid}

📌 Total Targets : ${activeTargets.size}`,
      threadID,
      messageID
    );
  }
}

else if (cmd === "cleartarget") {

  activeTargets.clear();

  await api.sendMessage(
`🧹 All Targets Cleared Successfully
🎯 Total Targets : 0`,
    threadID,
    messageID
  );
}

else if (cmd === "mycommands") {
  await humanDelay();

  try {
    await api.sendMessage(
`🤖 𝗕𝗢𝗧 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦

━━━━━━━━━━━━━━━━
👤 𝗨𝗦𝗘𝗥 𝗜𝗡𝗙𝗢

$uid (reply pe)
$whois (reply)
$groupuid

━━━━━━━━━━━━━━━━
👥 𝗚𝗥𝗢𝗨𝗣 𝗖𝗢𝗡𝗧𝗥𝗢𝗟

$groupname <name>
$lockgroupname <name>
$unlockgroupname
$locknickname (reply pe)
$unlocknickname
$lockdp
$unlockdp
$allnickname <name>
$exit

━━━━━━━━━━━━━━━━
⚙️ 𝗦𝗬𝗦𝗧𝗘𝗠 𝗖𝗢𝗡𝗧𝗥𝗢𝗟

$loderstart <text>
$loderstop
$target <uid>
$cleartarget

━━━━━━━━━━━━━━━━
✨ Prefix : /
👑 Owner Only Commands`,
      threadID,
      messageID
    );
  } catch (err) {
    console.log("Error sending $mycommands:", err.message);
  }
}

/* ===== MUST HAVE CATCH FOR listenMqtt ===== */
} catch (e) {
  console.error("❌ listenMqtt fatal error:", e);
}

}); // ✅ listenMqtt CLOSED PROPERLY

}); // ✅ login CLOSED PROPERLY
