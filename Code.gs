// ==========================================
// PM Chatbot - Full Version
// Platform : Google Apps Script
// AI Model : Gemini 2.5 Flash
// Data     : Google Drive (Docs + Sheets)
// Line     : Messaging API (Webhook)
// ==========================================

// ---- CONFIG ----
const LINE_CHANNEL_ACCESS_TOKEN = "YOUR_LINE_CHANNEL_ACCESS_TOKEN";
const GEMINI_API_KEY            = "YOUR_GEMINI_API_KEY";
const ROOT_FOLDER_ID            = "YOUR_ROOT_FOLDER_ID";
const ENGINEER_SHEET_NAME       = "Engineer Tasks";
const LEAVE_SHEET_NAME          = "Leave Record";
const GEMINI_MODEL              = "gemini-2.5-flash";
const GEMINI_API_URL            = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const BOT_NAME                  = "@PMBot";
const LINE_GROUP_ID             = "YOUR_LINE_GROUP_ID";
const REMINDER_DAYS             = [3, 1];
const DONE_STATUSES             = ["done", "complete", "completed", "finish", "finished"];

// ---- PM User IDs (เฉพาะคนเหล่านี้เพิ่ม Task ได้) ----
const PM_USER_IDS = [
  "YOUR_PM_USER_ID_1",  // ← ใส่ User ID ของ PM (หาได้จาก @PMBot myid)
  // "YOUR_PM_USER_ID_2", // เพิ่มได้หลายคน
];

// ---- Column Names (ต้องตรงกับ Sheet) ----
const COL_TYPE         = "TYPE";
const COL_TASK         = "TASK";
const COL_DESC         = "Description";
const COL_REQUESTER    = "Requester";
const COL_REQUEST_DATE = "Request Date";
const COL_DUE_DATE     = "Due Date";
const COL_STATUS       = "STATUS";
const COL_NOTE         = "NOTE";
const COL_LINE_USER_ID = "Line User ID";
const COL_CUSTOMER     = "CUSTOMER";

// ---- Dashboard URL ----
const DASHBOARD_URL = "https://gemini.google.com/share/e209e6dae5ec";

// ---- Sheets to exclude from Task Summary ----
const EXCLUDE_SHEETS = [LEAVE_SHEET_NAME, "UID_GID"];

// ==========================================
// 1. รับ Webhook จาก Line
// ==========================================
function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const events = body.events;

    events.forEach(event => {
      if (event.type === "message" && event.message.type === "text") {
        const replyToken = event.replyToken;
        const sourceType = event.source.type;
        const userId     = event.source.userId  || "";
        const groupId    = event.source.groupId || "";
        let   userMessage = event.message.text.trim();

        Logger.log(`sourceType : ${sourceType}`);
        Logger.log(`groupId    : ${groupId || "-"}`);
        Logger.log(`userId     : ${userId  || "-"}`);

        if (sourceType === "group" || sourceType === "room") {
          if (!userMessage.includes(BOT_NAME)) return;
          userMessage = userMessage.replace(BOT_NAME, "").trim();
          if (!userMessage) {
            replyToLine(replyToken, getHelpMessage());
            return;
          }
        }

        const replyText = processMessage(userMessage, userId, groupId, sourceType);
        replyToLine(replyToken, replyText);
      }
    });

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log("doPost Error: " + error.message);
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// 2. ประมวลผลข้อความ
// ==========================================
function processMessage(userMessage, userId = "", groupId = "", sourceType = "") {
  try {
    const msg    = userMessage.trim();
    const msgLow = msg.toLowerCase();

    // ── help ──
    if (msgLow === "help") return getHelpMessage();

    // ── list (projects) ──
    if (msgLow === "list") return getProjectList();

    // ── myid ──
    if (msgLow === "myid") {
      if (sourceType === "group" || sourceType === "room")
        return `⚠️ คำสั่ง myid ใช้ได้เฉพาะใน 1:1 Chat กับ Bot เท่านั้นนะครับ`;
      return userId
        ? `🪪 Line User ID ของคุณ:\n\n${userId}\n\nนำไปแจ้ง PM ครับ 🙏`
        : "❌ ไม่พบ User ID กรุณาลองใหม่ครับ";
    }

    // ── groupid ──
    if (msgLow === "groupid") {
      if (sourceType !== "group" && sourceType !== "room")
        return `⚠️ คำสั่ง groupid ใช้ได้เฉพาะใน Group Chat เท่านั้นนะครับ`;
      return groupId
        ? `🏷️ Line Group ID:\n\n${groupId}\n\nนำไปใส่ใน Config ตรง LINE_GROUP_ID ครับ 🙏`
        : "❌ ไม่พบ Group ID กรุณาลองใหม่ครับ";
    }

    // ── add task (PM Only) ──
    if (msgLow.startsWith("add task")) {
      if (!PM_USER_IDS.includes(userId))
        return `⛔ ขออภัยครับ คุณไม่มีสิทธิ์เพิ่ม Task\nเฉพาะ PM เท่านั้นที่สามารถใช้คำสั่งนี้ได้ครับ`;
      return addTaskToSheet(msg, userId);
    }

    // ── add leave (anyone) ──
    if (msgLow.startsWith("add leave")) {
      return addLeaveToSheet(msg);
    }

    // ── summary ──
    if (msgLow === "summary") {
      const tasks = getEngineerTaskData();
      if (!tasks || tasks.length === 0) return "❌ ไม่พบข้อมูล Task ในระบบครับ";
      const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
      sendSummaryPerEngineer(tasks, dateStr);
      return "✅ ส่ง Summary เรียบร้อยแล้วครับ!";
    }

    // ── task [ชื่อ] ──
    const taskPersonMatch = msgLow.match(/^task\s+(\S+)$/);
    if (taskPersonMatch) {
      const name    = taskPersonMatch[1];
      const content = getEngineerTaskContent();
      if (!content) return "❌ ไม่พบไฟล์ Engineer Tasks ครับ";
      return callGemini(
        `แสดง Task ทั้งหมดของ Engineer ชื่อ "${name}" พร้อม CUSTOMER, TYPE, STATUS, Due Date และ Requester`,
        content, "Engineer Tasks"
      );
    }

    // ── task ──
    if (msgLow === "task") {
      const content = getEngineerTaskContent();
      if (!content) return "❌ ไม่พบไฟล์ Engineer Tasks ครับ";
      return callGemini(
        "สรุป Task ทั้งหมดของ Engineer แต่ละคน พร้อม TYPE, STATUS และ Due Date",
        content, "Engineer Tasks"
      );
    }

    // ── list task all engineer ──
    if (msgLow === "list task all engineer" || msgLow === "list task all") {
      const content = getEngineerTaskContent();
      if (!content) return "❌ ไม่พบไฟล์ Engineer Tasks ครับ";
      return callGemini(
        "แสดง Task ทั้งหมดของทุก Engineer จัดกลุ่มตามชื่อ Engineer พร้อม CUSTOMER, TYPE, STATUS, Due Date และ Requester",
        content, "Engineer Tasks"
      );
    }

    // ── list engineer name ──
    if (msgLow === "list engineer name" || msgLow === "list engineer") {
      const content = getEngineerTaskContent();
      if (!content) return "❌ ไม่พบไฟล์ Engineer Tasks ครับ";
      return callGemini("แสดงรายชื่อ Engineer ทั้งหมดที่มีในระบบ", content, "Engineer Tasks");
    }

    // ── list engineer task inprogress ──
    if (msgLow === "list engineer task inprogress" || msgLow === "list task inprogress") {
      const content = getEngineerTaskContent();
      if (!content) return "❌ ไม่พบไฟล์ Engineer Tasks ครับ";
      return callGemini(
        "แสดง Task ที่มี STATUS เป็น IN-PROGRESS ทั้งหมด จัดกลุ่มตาม Engineer พร้อม Due Date และ Requester",
        content, "Engineer Tasks"
      );
    }

    // ── list engineer task completed ──
    if (msgLow === "list engineer task completed" || msgLow === "list task completed") {
      const content = getEngineerTaskContent();
      if (!content) return "❌ ไม่พบไฟล์ Engineer Tasks ครับ";
      return callGemini(
        "แสดง Task ที่มี STATUS เป็น DONE หรือ COMPLETED ทั้งหมด จัดกลุ่มตาม Engineer พร้อม Due Date และ Requester",
        content, "Engineer Tasks"
      );
    }

    // ── list task due date = N day(s) ──
    const dueDayMatch = msgLow.match(/list task due\s*(?:date)?\s*[=:]?\s*(\d+)\s*days?/);
    if (dueDayMatch) {
      const days       = parseInt(dueDayMatch[1]);
      const content    = getEngineerTaskContent();
      if (!content) return "❌ ไม่พบไฟล์ Engineer Tasks ครับ";
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + days);
      const targetStr  = Utilities.formatDate(targetDate, Session.getScriptTimeZone(), "dd/MM/yyyy");
      return callGemini(
        `แสดง Task ที่ Due Date อยู่ในช่วง ${days} วันข้างหน้า (ภายใน ${targetStr}) ที่ยังไม่เสร็จ พร้อมชื่อ Engineer, TYPE, STATUS และ Due Date`,
        content, "Engineer Tasks"
      );
    }

    // ── list leave / list leave [ชื่อ] ──
    if (msgLow === "list leave" || msgLow === "list leave all") return getLeaveList(null);

    const leavePersonMatch = msgLow.match(/^list leave\s+(\S+)$/);
    if (leavePersonMatch) return getLeaveList(leavePersonMatch[1]);

    // ── [Project] คำถาม ──
    const projectMatch = msg.match(/^\[(.+?)\]\s*(.*)/);
    if (projectMatch) {
      const projectName = projectMatch[1].trim();
      const question    = projectMatch[2].trim();
      if (!question)
        return `กรุณาระบุคำถามหลังชื่อ Project ครับ\nเช่น: ${BOT_NAME} [${projectName}] ขอบเขตงานคืออะไร?`;
      const content = getProjectContent(projectName);
      if (!content)
        return `❌ ไม่พบ Project "${projectName}" ครับ\nพิมพ์ "${BOT_NAME} list" เพื่อดูรายชื่อ Project`;
      return callGemini(question, content, projectName);
    }

    // ── คำถามทั่วไป ──
    return searchAll(msg);

  } catch (error) {
    Logger.log("processMessage Error: " + error.message);
    return "❌ เกิดข้อผิดพลาด กรุณาลองใหม่ครับ";
  }
}

// ==========================================
// 3. Project Folders
// ==========================================
function getProjectFolders() {
  const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const folders    = rootFolder.getFolders();
  const result     = {};
  while (folders.hasNext()) {
    const folder = folders.next();
    result[folder.getName()] = folder;
  }
  return result;
}

function getProjectList() {
  const folders = getProjectFolders();
  const names   = Object.keys(folders).sort();
  if (names.length === 0) return "❌ ยังไม่มีข้อมูล Project ในระบบครับ";
  let msg = "📋 รายชื่อ Project ทั้งหมด:\n\n";
  names.forEach((name, i) => { msg += `${i + 1}. ${name}\n`; });
  msg += `\n💬 พิมพ์ ${BOT_NAME} [ชื่อ Project] คำถาม`;
  return msg;
}

function getProjectContent(projectName) {
  const folders    = getProjectFolders();
  const matchedKey = Object.keys(folders).find(
    name => name.toLowerCase() === projectName.toLowerCase()
  );
  if (!matchedKey) return null;
  return readFilesFromFolder(folders[matchedKey]);
}

// ==========================================
// 4. อ่านไฟล์ใน Folder
// ==========================================
function readFilesFromFolder(folder) {
  let allContent = "";
  const files    = folder.getFiles();
  while (files.hasNext()) {
    const file     = files.next();
    const mimeType = file.getMimeType();
    let content    = "";
    try {
      if      (mimeType === MimeType.GOOGLE_DOCS)   content = DocumentApp.openById(file.getId()).getBody().getText();
      else if (mimeType === MimeType.GOOGLE_SHEETS)  content = readGoogleSheet(file.getId());
      else if (mimeType === MimeType.PLAIN_TEXT)     content = file.getBlob().getDataAsString();
      if (content) allContent += `\n\n=== ${file.getName()} ===\n${content}`;
    } catch (err) {
      Logger.log("readFile Error: " + file.getName() + " — " + err.message);
    }
  }
  return allContent.trim();
}

// ==========================================
// 5. อ่าน Google Sheets → Text (สำหรับ Gemini)
// ==========================================
function readGoogleSheet(fileId) {
  const ss     = SpreadsheetApp.openById(fileId);
  const sheets = ss.getSheets();
  let allContent = "";

  sheets.forEach(sheet => {
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;

    const headers = data[0].map(h => h.toString().trim());
    let sheetContent = `\n[Engineer: ${sheet.getName()}]\n`;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row.every(cell => cell === "" || cell === null)) continue;
      let rowText = "";
      headers.forEach((header, j) => {
        if (header && row[j] !== "" && row[j] !== null && header !== COL_LINE_USER_ID) {
          let value = row[j];
          if (value instanceof Date) {
            if (header === "Leave Start Date" || header === "Leave End Date") {
              // Leave dates — dd/MM/yyyy
              value = Utilities.formatDate(value, Session.getScriptTimeZone(), "dd/MM/yyyy");
            } else {
              // ✅ Due Date, Request Date — dd-MM-yyyy เต็ม ให้ Gemini อ่านถูกต้อง
              value = Utilities.formatDate(value, Session.getScriptTimeZone(), "dd-MM-yyyy");
            }
          }
          rowText += `${header}: ${value} | `;
        }
      });
      if (rowText) sheetContent += `- ${rowText.replace(/\s\|\s$/, "")}\n`;
    }
    allContent += sheetContent;
  });
  return allContent.trim();
}

// ==========================================
// 6. ดึง Engineer Task แบบ Structured Array
//    (ยกเว้น Leave Record และ UID_GID Sheet)
// ==========================================
function getEngineerTaskData() {
  const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const files      = rootFolder.getFiles();
  const tasks      = [];

  while (files.hasNext()) {
    const file = files.next();
    if (file.getName() !== ENGINEER_SHEET_NAME || file.getMimeType() !== MimeType.GOOGLE_SHEETS) continue;

    const ss     = SpreadsheetApp.openById(file.getId());
    const sheets = ss.getSheets();

    sheets.forEach(sheet => {
      // ข้าม Leave Record และ UID_GID
      if (EXCLUDE_SHEETS.includes(sheet.getName())) return;

      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) return;

      const headers = data[0].map(h => h.toString().trim());
      const idx = {
        type        : headers.indexOf(COL_TYPE),
        task        : headers.indexOf(COL_TASK),
        desc        : headers.indexOf(COL_DESC),
        requester   : headers.indexOf(COL_REQUESTER),
        requestDate : headers.indexOf(COL_REQUEST_DATE),
        dueDate     : headers.indexOf(COL_DUE_DATE),
        status      : headers.indexOf(COL_STATUS),
        note        : headers.indexOf(COL_NOTE),
        lineUserId  : headers.indexOf(COL_LINE_USER_ID),
        customer    : headers.indexOf(COL_CUSTOMER)
      };

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row.every(cell => cell === "" || cell === null)) continue;

        let dueDate = null;
        if (idx.dueDate >= 0 && row[idx.dueDate]) {
          const raw = row[idx.dueDate];
          if (raw instanceof Date) {
            dueDate = raw;
          } else {
            const parsed = new Date(raw);
            if (!isNaN(parsed)) {
              dueDate = parsed;
            } else {
              const parts = raw.toString().split(" ");
              if (parts.length === 2) {
                const monthMap = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
                const m = monthMap[parts[0]];
                const y = parseInt(parts[1]);
                if (m !== undefined && !isNaN(y)) dueDate = new Date(y, m + 1, 0);
              }
            }
          }
        }

        tasks.push({
          engineer    : sheet.getName(),
          customer    : idx.customer    >= 0 ? row[idx.customer]    : "",
          type        : idx.type        >= 0 ? row[idx.type]        : "",
          task        : idx.task        >= 0 ? row[idx.task]        : "",
          desc        : idx.desc        >= 0 ? row[idx.desc]        : "",
          requester   : idx.requester   >= 0 ? row[idx.requester]   : "",
          requestDate : idx.requestDate >= 0 ? row[idx.requestDate] : "",
          dueDate     : dueDate,
          status      : idx.status      >= 0 ? row[idx.status]      : "",
          note        : idx.note        >= 0 ? row[idx.note]        : "",
          lineUserId  : idx.lineUserId  >= 0 ? row[idx.lineUserId]  : ""
        });
      }
    });
    break;
  }
  return tasks;
}

// ==========================================
// 7. ดึง Engineer Task Content (สำหรับ Gemini)
// ==========================================
function getEngineerTaskContent() {
  const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const files      = rootFolder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (file.getName() === ENGINEER_SHEET_NAME && file.getMimeType() === MimeType.GOOGLE_SHEETS) {
      return readGoogleSheet(file.getId());
    }
  }
  return null;
}

// ==========================================
// 8. ค้นหาทุก Project + Engineer Tasks
// ==========================================
function searchAll(userMessage) {
  const folders = getProjectFolders();
  let combined  = "";
  Object.keys(folders).forEach(name => {
    const content = readFilesFromFolder(folders[name]);
    if (content) combined += `\n\n====== PROJECT: ${name} ======\n${content}`;
  });
  const taskContent = getEngineerTaskContent();
  if (taskContent) combined += `\n\n====== ENGINEER TASKS ======\n${taskContent}`;
  if (!combined) return "❌ ไม่พบข้อมูลในระบบครับ";
  return callGemini(userMessage, combined, "ทุก Project");
}

// ==========================================
// 9. ADD TASK — เขียนลง Google Sheets (PM Only)
// Format: add task [Engineer] | [Customer] | [TYPE] | [TASK] | [Description] | [Requester] | [Due Date]
// ==========================================
function addTaskToSheet(msg, userId) {
  try {
    const raw   = msg.replace(/^add task\s*/i, "").trim();
    const parts = raw.split("|").map(p => p.trim());

    if (parts.length < 4) {
      return `⚠️ รูปแบบไม่ถูกต้องครับ กรุณาใช้:\n\n` +
        `${BOT_NAME} add task [Engineer] | [Customer] | [TYPE] | [TASK] | [Description] | [Requester] | [Due Date]\n\n` +
        `ตัวอย่าง:\n` +
        `${BOT_NAME} add task Ton | PM Home | Implementation | ติดตั้ง Server | Setup Ubuntu 24 | Khun J | 15-May-2026`;
    }

    const engineerName = parts[0] || "";
    const customer     = parts[1] || "";
    const type         = parts[2] || "";
    const task         = parts[3] || "";
    const description  = parts[4] || "";
    const requester    = parts[5] || "";
    const dueDate      = parts[6] || "";
    const requestDate  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MMM-yyyy");

    const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
    const files      = rootFolder.getFiles();
    let   targetFile = null;

    while (files.hasNext()) {
      const file = files.next();
      if (file.getName() === ENGINEER_SHEET_NAME && file.getMimeType() === MimeType.GOOGLE_SHEETS) {
        targetFile = file;
        break;
      }
    }

    if (!targetFile) return "❌ ไม่พบไฟล์ Engineer Tasks ครับ";

    const ss     = SpreadsheetApp.openById(targetFile.getId());
    const sheets = ss.getSheets();

    const targetSheet = sheets.find(
      s => !EXCLUDE_SHEETS.includes(s.getName()) &&
           s.getName().toLowerCase() === engineerName.toLowerCase()
    );

    if (!targetSheet) {
      const sheetNames = sheets
        .filter(s => !EXCLUDE_SHEETS.includes(s.getName()))
        .map(s => s.getName())
        .join(", ");
      return `❌ ไม่พบ Engineer ชื่อ "${engineerName}" ครับ\n\nEngineer ที่มีในระบบ:\n${sheetNames}`;
    }

    const lastRow  = targetSheet.getLastRow();
    const newRowNo = lastRow;
    const headers  = targetSheet.getRange(1, 1, 1, targetSheet.getLastColumn()).getValues()[0];
    const newRow   = new Array(headers.length).fill("");

    headers.forEach((header, i) => {
      const h = header.toString().trim();
      if      (h === "NO")           newRow[i] = newRowNo;
      else if (h === COL_CUSTOMER)   newRow[i] = customer;
      else if (h === COL_TYPE)       newRow[i] = type;
      else if (h === COL_TASK)       newRow[i] = task;
      else if (h === COL_DESC)       newRow[i] = description;
      else if (h === COL_REQUESTER)  newRow[i] = requester;
      else if (h === COL_REQUEST_DATE) newRow[i] = requestDate;
      else if (h === COL_DUE_DATE)   newRow[i] = dueDate;
      else if (h === COL_STATUS)     newRow[i] = "PENDING";
      else if (h === COL_NOTE)       newRow[i] = "";
    });

    targetSheet.appendRow(newRow);

    return `✅ เพิ่ม Task สำเร็จแล้วครับ!\n\n` +
      `👤 Engineer  : ${targetSheet.getName()}\n` +
      `🏢 Customer  : ${customer}\n` +
      `📋 TYPE      : ${type}\n` +
      `📝 TASK      : ${task}\n` +
      `📄 Desc      : ${description}\n` +
      `👤 Requester : ${requester}\n` +
      `📅 Due Date  : ${dueDate}\n` +
      `📌 STATUS    : PENDING`;

  } catch (error) {
    Logger.log("addTaskToSheet Error: " + error.message);
    return "❌ เกิดข้อผิดพลาดในการเพิ่ม Task กรุณาลองใหม่ครับ";
  }
}

// ==========================================
// 10. Gemini API
// ==========================================
function callGemini(userMessage, docContent, projectName) {
  const fullPrompt = `คุณคือพนักงานตำแหน่ง Project Manager บริษัท มีหน้าที่ตอบคำถามเกี่ยวกับ ข้อตกลงในสัญญา, ขอบเขตการทำงาน, วัตถุประสงค์ของโครงการ และ Task ของ Engineer แต่ละคน
- ใช้ข้อมูลที่ให้มาเพื่อตอบคำถามเท่านั้น
- สรุปคำตอบให้กระชับ เข้าใจง่าย เป็นภาษาพูดที่เป็นธรรมชาติ
- ห้ามใช้ Markdown เช่น **bold**, *italic*, # header เด็ดขาด เพราะ Line ไม่รองรับ
- เมื่อแสดง Due Date ให้ใช้ข้อมูลจาก Sheet ตรงๆ ห้ามคำนวณหรือเดาเอง
- เมื่อถามเรื่อง Task ของ Engineer ให้แสดงในรูปแบบนี้ทุกครั้ง:

👤 [ชื่อ Engineer] (แสดงครั้งเดียวด้านบน)
─────────────────
1. [TASK]
   🏢 [CUSTOMER]
   📋 [TYPE]
   📝 [Description]
   👤 Requester: [Requester]
   📌 STATUS: [STATUS]
   📅 Due Date: [Due Date ตามข้อมูลที่ให้มา ห้ามคำนวณเอง]

2. [TASK]
   🏢 ...

- ห้ามแสดงชื่อ Engineer ซ้ำในแต่ละ Task
- Due Date ให้ใช้ข้อมูลจาก Sheet ตรงๆ ห้ามคำนวณหรือเดาเอง
- ระบุด้วยว่าข้อมูลมาจาก Engineer หรือ Project ไหน
- หากไม่พบข้อมูล ให้ตอบว่า "Information Not Found!!"
- ห้ามคิดคำตอบขึ้นมาเองโดยไม่อ้างอิงข้อมูลที่ให้มา

Project ที่ค้นหา: ${projectName}
ข้อมูล:
---
${docContent}
---
คำถาม: ${userMessage}`;

  const payload = {
    contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024, topP: 0.8 }
  };
  const options = {
    method: "POST", contentType: "application/json",
    payload: JSON.stringify(payload), muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(GEMINI_API_URL, options);
  if (response.getResponseCode() !== 200) {
    Logger.log("Gemini Error: " + response.getContentText());
    return "❌ ไม่สามารถสร้างคำตอบได้ กรุณาลองใหม่ครับ";
  }
  const json = JSON.parse(response.getContentText());
  return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Information Not Found!!";
}

// ==========================================
// 11. LEAVE RECORD
// ==========================================
function getLeaveRecords() {
  const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const files      = rootFolder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    if (file.getName() !== ENGINEER_SHEET_NAME || file.getMimeType() !== MimeType.GOOGLE_SHEETS) continue;

    const ss         = SpreadsheetApp.openById(file.getId());
    const leaveSheet = ss.getSheetByName(LEAVE_SHEET_NAME);
    if (!leaveSheet) return [];

    const data    = leaveSheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    const headers  = data[0].map(h => h.toString().trim());
    const idxName  = headers.indexOf("Name");
    const idxStart = headers.indexOf("Leave Start Date");
    const idxEnd   = headers.indexOf("Leave End Date");
    const records  = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[idxName]) continue;

      let startDate = null;
      let endDate   = null;
      if (row[idxStart]) startDate = row[idxStart] instanceof Date ? row[idxStart] : new Date(row[idxStart]);
      if (row[idxEnd])   endDate   = row[idxEnd]   instanceof Date ? row[idxEnd]   : new Date(row[idxEnd]);

      const lineUserId = getLineUserIdByName(ss, row[idxName]);
      records.push({
        name      : row[idxName].toString().trim(),
        startDate : startDate,
        endDate   : endDate,
        lineUserId: lineUserId
      });
    }
    return records;
  }
  return [];
}

function getLineUserIdByName(ss, name) {
  try {
    const uidSheet = ss.getSheetByName("UID_GID");
    if (uidSheet) {
      const data    = uidSheet.getDataRange().getValues();
      const headers = data[0].map(h => h.toString().trim());
      const idxName = headers.indexOf("Name");
      const idxUid  = headers.indexOf("Line User ID");
      for (let i = 1; i < data.length; i++) {
        if (data[i][idxName]?.toString().trim().toLowerCase() === name.toLowerCase()) {
          return data[i][idxUid]?.toString().trim() || "";
        }
      }
    }
    const engSheet = ss.getSheetByName(name);
    if (engSheet) {
      const data    = engSheet.getDataRange().getValues();
      const headers = data[0].map(h => h.toString().trim());
      const idxUid  = headers.indexOf(COL_LINE_USER_ID);
      if (idxUid >= 0 && data.length > 1) return data[1][idxUid]?.toString().trim() || "";
    }
  } catch (err) {
    Logger.log("getLineUserIdByName Error: " + err.message);
  }
  return "";
}

function getLeaveList(filterName) {
  try {
    const records = getLeaveRecords();
    if (records.length === 0) return "❌ ไม่พบข้อมูลการลาในระบบครับ";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let filtered = records;
    if (filterName) {
      filtered = records.filter(r => r.name.toLowerCase().includes(filterName.toLowerCase()));
      if (filtered.length === 0) return `❌ ไม่พบข้อมูลการลาของ "${filterName}" ครับ`;
    }

    const upcoming = [];
    const ongoing  = [];
    const past     = [];

    filtered.forEach(r => {
      if (!r.startDate || !r.endDate) return;
      const start = new Date(r.startDate); start.setHours(0,0,0,0);
      const end   = new Date(r.endDate);   end.setHours(0,0,0,0);
      if      (start > today) upcoming.push(r);
      else if (end >= today)  ongoing.push(r);
      else                    past.push(r);
    });

    let msg = filterName
      ? `🗓️ ข้อมูลการลาของ ${filtered[0].name}\n${"─".repeat(26)}\n`
      : `🗓️ ข้อมูลการลาทั้งหมด\n${"─".repeat(26)}\n`;

    if (ongoing.length > 0) {
      msg += `\n🟠 กำลังลาอยู่ (${ongoing.length} คน)\n`;
      ongoing.forEach(r => {
        const start    = Utilities.formatDate(new Date(r.startDate), Session.getScriptTimeZone(), "dd/MM/yyyy");
        const end      = Utilities.formatDate(new Date(r.endDate),   Session.getScriptTimeZone(), "dd/MM/yyyy");
        const daysLeft = Math.round((new Date(r.endDate).setHours(0,0,0,0) - today) / 86400000);
        msg += `  • ${r.name}: ${start} → ${end} (กลับใน ${daysLeft} วัน)\n`;
      });
    }

    if (upcoming.length > 0) {
      msg += `\n🔵 กำลังจะลา (${upcoming.length} รายการ)\n`;
      upcoming.forEach(r => {
        const start  = Utilities.formatDate(new Date(r.startDate), Session.getScriptTimeZone(), "dd/MM/yyyy");
        const end    = Utilities.formatDate(new Date(r.endDate),   Session.getScriptTimeZone(), "dd/MM/yyyy");
        const daysTo = Math.round((new Date(r.startDate).setHours(0,0,0,0) - today) / 86400000);
        msg += `  • ${r.name}: ${start} → ${end} (อีก ${daysTo} วัน)\n`;
      });
    }

    if (past.length > 0) {
      msg += `\n⚫ ผ่านมาแล้ว (${past.length} รายการ)\n`;
      past.forEach(r => {
        const start = Utilities.formatDate(new Date(r.startDate), Session.getScriptTimeZone(), "dd/MM/yyyy");
        const end   = Utilities.formatDate(new Date(r.endDate),   Session.getScriptTimeZone(), "dd/MM/yyyy");
        msg += `  • ${r.name}: ${start} → ${end}\n`;
      });
    }

    if (ongoing.length === 0 && upcoming.length === 0 && past.length === 0)
      msg += "\n❌ ไม่พบข้อมูลการลาครับ";

    return msg.trim();
  } catch (error) {
    Logger.log("getLeaveList Error: " + error.message);
    return "❌ เกิดข้อผิดพลาด กรุณาลองใหม่ครับ";
  }
}

// ==========================================
// 12. Daily Summary (Trigger 8:00 AM)
// ==========================================
function dailySummary() {
  try {
    const today   = new Date();
    const dateStr = Utilities.formatDate(today, Session.getScriptTimeZone(), "dd/MM/yyyy");
    const tasks   = getEngineerTaskData();
    if (!tasks || tasks.length === 0) {
      pushMessageToGroup(LINE_GROUP_ID, `🌅 Daily Task Summary\n📅 ${dateStr}\n\n❌ ไม่พบข้อมูล Task ในระบบครับ`);
      return;
    }
    sendSummaryPerEngineer(tasks, dateStr);
    Logger.log("Daily Summary sent: " + dateStr);
  } catch (error) {
    Logger.log("dailySummary Error: " + error.message);
  }
}

// ==========================================
// ส่ง Summary แยกทีละ Engineer เข้า Group
// ==========================================
function sendSummaryPerEngineer(tasks, dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // จัดกลุ่มตาม Engineer
  const byEngineer = {};
  tasks.forEach(t => {
    if (!byEngineer[t.engineer]) byEngineer[t.engineer] = [];
    byEngineer[t.engineer].push(t);
  });

  // ✅ รวมทุก Engineer ใน 1 Message
  let msg = `🌅 Daily Task Summary — ${dateStr}\n${"─".repeat(26)}\n`;

  Object.keys(byEngineer).sort().forEach(name => {
    const list    = byEngineer[name];
    const pending = list.filter(t => !DONE_STATUSES.includes(t.status?.toLowerCase()));

    msg += `\n👤 ${name}`;

    // ว่างงาน — Done ทุก Task
    if (pending.length === 0) {
      msg += ` — ว่างงาน ✅\n`;
      return;
    }

    msg += ` — ${pending.length} tasks remaining\n`;

    pending.forEach((t, i) => {
      const due  = t.dueDate ? new Date(t.dueDate) : null;
      if (due) due.setHours(0, 0, 0, 0);
      const diff = due ? Math.round((due - today) / 86400000) : null;

      let dayTxt = "";
      if (diff === null)     dayTxt = "";
      else if (diff < 0)     dayTxt = ` | 🔴 เลยกำหนด ${Math.abs(diff)} วัน`;
      else if (diff === 0)   dayTxt = ` | 🟠 ครบกำหนดวันนี้`;
      else                   dayTxt = ` | เหลือ ${diff} วัน`;

      msg += `${i + 1}. ${t.customer || "-"} | ${t.task}${dayTxt}\n`;
    });
  });

  msg += `\n${"─".repeat(26)}\n🔗 Dashboard: ${DASHBOARD_URL}`;

  pushMessageToGroup(LINE_GROUP_ID, msg);
}

function buildDailySummary(tasks, dateStr) {
  // ✅ ใช้ format เดียวกับ sendSummaryPerEngineer
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const byEngineer = {};
  tasks.forEach(t => {
    if (!byEngineer[t.engineer]) byEngineer[t.engineer] = [];
    byEngineer[t.engineer].push(t);
  });

  let msg = `🌅 Daily Task Summary — ${dateStr}\n${"─".repeat(26)}\n`;

  Object.keys(byEngineer).sort().forEach(name => {
    const list    = byEngineer[name];
    const pending = list.filter(t => !DONE_STATUSES.includes(t.status?.toLowerCase()));

    msg += `\n👤 ${name}`;

    if (pending.length === 0) {
      msg += ` — ว่างงาน ✅\n`;
      return;
    }

    msg += ` — ${pending.length} tasks remaining\n`;

    pending.forEach((t, i) => {
      const due  = t.dueDate ? new Date(t.dueDate) : null;
      if (due) due.setHours(0, 0, 0, 0);
      const diff = due ? Math.round((due - today) / 86400000) : null;

      let dayTxt = "";
      if (diff === null)   dayTxt = "";
      else if (diff < 0)   dayTxt = ` | 🔴 เลยกำหนด ${Math.abs(diff)} วัน`;
      else if (diff === 0) dayTxt = ` | 🟠 ครบกำหนดวันนี้`;
      else                 dayTxt = ` | เหลือ ${diff} วัน`;

      msg += `${i + 1}. ${t.customer || "-"} | ${t.task}${dayTxt}\n`;
    });
  });

  msg += `\n${"─".repeat(26)}\n🔗 Dashboard: ${DASHBOARD_URL}`;
  return msg;
}

// ==========================================
// 13. Due Date Reminder (Trigger 8:00 AM)
// ==========================================
function dueDateReminder() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tasks = getEngineerTaskData();

    tasks.forEach(t => {
      if (DONE_STATUSES.includes(t.status?.toLowerCase())) return;
      if (!t.dueDate || !t.lineUserId) return;

      const due  = new Date(t.dueDate);
      due.setHours(0, 0, 0, 0);
      const diff = Math.round((due - today) / 86400000);

      if (REMINDER_DAYS.includes(diff)) {
        pushMessageToUser(t.lineUserId, buildReminderMessage(t, diff));
        Logger.log(`Reminder → ${t.engineer} | ${t.task} | ${diff} days left`);
      } else if (diff < 0) {
        pushMessageToUser(t.lineUserId, buildOverdueMessage(t, Math.abs(diff)));
        Logger.log(`Overdue  → ${t.engineer} | ${t.task} | ${Math.abs(diff)} days over`);
      }
    });
  } catch (error) {
    Logger.log("dueDateReminder Error: " + error.message);
  }
}

function buildReminderMessage(t, daysLeft) {
  const dueTxt = Utilities.formatDate(new Date(t.dueDate), Session.getScriptTimeZone(), "MMM yyyy");
  return `${daysLeft === 1 ? "🚨" : "⚠️"} แจ้งเตือน Due Date\n\n` +
    `สวัสดีครับ คุณ ${t.engineer}\n` +
    `งาน "${t.task}" ใกล้ครบกำหนดแล้วครับ!\n\n` +
    `🏢 Customer  : ${t.customer}\n` +
    `📋 TYPE      : ${t.type}\n` +
    `📝 Description: ${t.desc}\n` +
    `👤 Requester : ${t.requester}\n` +
    `📌 STATUS    : ${t.status}\n` +
    `📅 Due Date  : ${dueTxt}\n` +
    `⏰ เหลือเวลาอีก ${daysLeft} วัน\n\n` +
    `กรุณาอัปเดต STATUS ด้วยนะครับ 🙏`;
}

function buildOverdueMessage(t, daysOver) {
  const dueTxt = Utilities.formatDate(new Date(t.dueDate), Session.getScriptTimeZone(), "MMM yyyy");
  return `🔴 งานเลยกำหนด!\n\n` +
    `สวัสดีครับ คุณ ${t.engineer}\n` +
    `งาน "${t.task}" เลยกำหนดแล้ว ${daysOver} วันครับ\n\n` +
    `🏢 Customer  : ${t.customer}\n` +
    `📋 TYPE      : ${t.type}\n` +
    `📝 Description: ${t.desc}\n` +
    `👤 Requester : ${t.requester}\n` +
    `📌 STATUS    : ${t.status}\n` +
    `📅 Due Date  : ${dueTxt}\n\n` +
    `กรุณาอัปเดต STATUS หรือแจ้ง PM ด้วยนะครับ 🙏`;
}

// ==========================================
// 14. Leave Reminder (Trigger 8:00 AM)
// ==========================================
function leaveReminder() {
  try {
    const today   = new Date();
    today.setHours(0, 0, 0, 0);
    const records = getLeaveRecords();

    records.forEach(record => {
      if (!record.startDate || !record.endDate) return;

      const start = new Date(record.startDate); start.setHours(0,0,0,0);
      const end   = new Date(record.endDate);   end.setHours(0,0,0,0);
      const daysToStart = Math.round((start - today) / 86400000);
      const daysToEnd   = Math.round((end   - today) / 86400000);
      const startStr    = Utilities.formatDate(start, Session.getScriptTimeZone(), "dd/MM/yyyy");
      const endStr      = Utilities.formatDate(end,   Session.getScriptTimeZone(), "dd/MM/yyyy");

      // วันก่อนลา 1 วัน
      if (daysToStart === 1) {
        const msg = `🌴 แจ้งเตือนการลา\n\nสวัสดีครับ คุณ ${record.name}\nพรุ่งนี้คุณมีวันลาครับ!\n\n📅 ${startStr} → ${endStr}\n\nอย่าลืม Handover งานด้วยนะครับ 🙏`;
        if (record.lineUserId) pushMessageToUser(record.lineUserId, msg);
        pushMessageToGroup(LINE_GROUP_ID, `📢 คุณ ${record.name} จะลาพักพรุ่งนี้\n📅 ${startStr} → ${endStr}`);
        Logger.log(`Leave reminder (tomorrow) → ${record.name}`);
      }

      // วันที่เริ่มลา
      if (daysToStart === 0) {
        const msg = `🌴 วันนี้คุณมีวันลาครับ!\n\nสวัสดีครับ คุณ ${record.name}\nขอให้พักผ่อนให้เต็มที่นะครับ 😊\n\n📅 ลาถึง: ${endStr}`;
        if (record.lineUserId) pushMessageToUser(record.lineUserId, msg);
        pushMessageToGroup(LINE_GROUP_ID, `📢 วันนี้คุณ ${record.name} ลาพักครับ\n📅 ลาถึง: ${endStr}`);
      }

      // วันก่อนกลับจากลา
      if (daysToEnd === 0) {
        const msg = `👋 ยินดีต้อนรับกลับครับ!\n\nสวัสดีครับ คุณ ${record.name}\nพรุ่งนี้กลับมาทำงานแล้วนะครับ 💪\nอย่าลืม Check Task ที่ค้างอยู่ด้วยนะครับ!`;
        if (record.lineUserId) pushMessageToUser(record.lineUserId, msg);
      }
    });
  } catch (error) {
    Logger.log("leaveReminder Error: " + error.message);
  }
}

// ==========================================
// 15. Push Message
// ==========================================
function pushMessageToGroup(groupId, message) { _pushMessage(groupId, message); }

function pushMessageToUser(userId, message) {
  if (!userId || !userId.startsWith("U")) {
    Logger.log("Invalid userId: " + userId);
    return;
  }
  _pushMessage(userId, message);
}

function _pushMessage(to, message) {
  const url     = "https://api.line.me/v2/bot/message/push";
  const payload = { to, messages: [{ type: "text", text: message }] };
  const options = {
    method: "POST", contentType: "application/json",
    headers: { Authorization: "Bearer " + LINE_CHANNEL_ACCESS_TOKEN },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  };
  const res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() !== 200) Logger.log("pushMessage Error: " + res.getContentText());
}

// ==========================================
// 16. Reply to Line
// ==========================================
function replyToLine(replyToken, message) {
  const url     = "https://api.line.me/v2/bot/message/reply";
  const payload = { replyToken, messages: [{ type: "text", text: message }] };
  const options = {
    method: "POST", contentType: "application/json",
    headers: { Authorization: "Bearer " + LINE_CHANNEL_ACCESS_TOKEN },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  };
  const res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() !== 200) Logger.log("replyToLine Error: " + res.getContentText());
}

// ==========================================
// 17. Help Message
// ==========================================
function getHelpMessage() {
  return `👋 สวัสดีครับ! PM Chatbot ยินดีให้บริการ\n\n` +
    `📋 PROJECT\n` +
    `${BOT_NAME} list\n` +
    `${BOT_NAME} [SCX A] ขอบเขตงานคืออะไร?\n` +
    `${BOT_NAME} [SCX B] งบประมาณโครงการเท่าไหร่?\n\n` +
    `👷 ENGINEER TASKS\n` +
    `${BOT_NAME} summary — ดู Summary ทุก Engineer (ส่งแยกทีละคน)\n` +
    `${BOT_NAME} task\n` +
    `${BOT_NAME} task Bird\n` +
    `${BOT_NAME} list task all engineer\n` +
    `${BOT_NAME} list engineer name\n` +
    `${BOT_NAME} list engineer task inprogress\n` +
    `${BOT_NAME} list engineer task completed\n` +
    `${BOT_NAME} list task due date = 1 day\n` +
    `${BOT_NAME} list task due date = 3 days\n\n` +
    `➕ ADD TASK (PM Only)\n` +
    `${BOT_NAME} add task [Engineer] | [Customer] | [TYPE] | [TASK] | [Desc] | [Requester] | [Due Date]\n\n` +
    `ตัวอย่าง:\n` +
    `${BOT_NAME} add task Ton | PM Home | Implementation | ติดตั้ง Server | Setup Ubuntu | Khun J | 15-May-2026\n\n` +
    `🌴 LEAVE RECORD\n` +
    `${BOT_NAME} list leave\n` +
    `${BOT_NAME} list leave Aon\n` +
    `${BOT_NAME} add leave Aon 19-May-2026 23-May-2026\n\n` +
    `🪪 ADMIN\n` +
    `${BOT_NAME} myid — ดู User ID (1:1 Chat)\n` +
    `${BOT_NAME} groupid — ดู Group ID (Group)\n` +
    `${BOT_NAME} help — ดูคำสั่งทั้งหมด`;
}

// ==========================================
// 18. ADD LEAVE — เขียนลง Leave Record Sheet
// Format: add leave [Name] [Start Date] [End Date]
// ==========================================
function addLeaveToSheet(msg) {
  try {
    const raw   = msg.replace(/^add leave\s*/i, "").trim();
    const parts = raw.split(/\s+/);

    if (parts.length < 3) {
      return `⚠️ รูปแบบไม่ถูกต้องครับ กรุณาใช้:\n\n` +
        `${BOT_NAME} add leave [Name] [Start Date] [End Date]\n\n` +
        `ตัวอย่าง:\n` +
        `${BOT_NAME} add leave Aon 19-May-2026 23-May-2026`;
    }

    const name      = parts[0];
    const startStr  = parts[1];
    const endStr    = parts[2];

    // Parse dates
    const startDate = new Date(startStr);
    const endDate   = new Date(endStr);

    if (isNaN(startDate) || isNaN(endDate)) {
      return `❌ รูปแบบวันที่ไม่ถูกต้องครับ\nกรุณาใช้ format: 19-May-2026`;
    }

    if (endDate < startDate) {
      return `❌ วันที่สิ้นสุดต้องมากกว่าวันที่เริ่มต้นครับ`;
    }

    // หาไฟล์ Engineer Tasks
    const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
    const files      = rootFolder.getFiles();
    let   targetFile = null;

    while (files.hasNext()) {
      const file = files.next();
      if (file.getName() === ENGINEER_SHEET_NAME && file.getMimeType() === MimeType.GOOGLE_SHEETS) {
        targetFile = file;
        break;
      }
    }

    if (!targetFile) return "❌ ไม่พบไฟล์ Engineer Tasks ครับ";

    const ss         = SpreadsheetApp.openById(targetFile.getId());
    const leaveSheet = ss.getSheetByName(LEAVE_SHEET_NAME);
    if (!leaveSheet) return `❌ ไม่พบ Sheet "${LEAVE_SHEET_NAME}" ครับ`;

    // หา NO ถัดไป
    const lastRow = leaveSheet.getLastRow();
    const newNo   = lastRow; // header = row 1, so lastRow = last NO

    // Format dates for display
    const startFmt = Utilities.formatDate(startDate, Session.getScriptTimeZone(), "dd/MM/yyyy");
    const endFmt   = Utilities.formatDate(endDate,   Session.getScriptTimeZone(), "dd/MM/yyyy");

    // เขียนลง Sheet
    leaveSheet.appendRow([newNo, name, startDate, endDate]);

    return `✅ บันทึกวันลาสำเร็จแล้วครับ!\n\n` +
      `👤 Name       : ${name}\n` +
      `📅 Start Date : ${startFmt}\n` +
      `📅 End Date   : ${endFmt}`;

  } catch (error) {
    Logger.log("addLeaveToSheet Error: " + error.message);
    return "❌ เกิดข้อผิดพลาดในการบันทึกวันลา กรุณาลองใหม่ครับ";
  }
}

// ==========================================
// 19. DELIVERABLE REMINDER — อ่าน Deliverables Sheet ในแต่ละ Project
// ==========================================
function deliverableReminder() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const folders = getProjectFolders();

    Object.keys(folders).forEach(projectName => {
      const folder = folders[projectName];
      const files  = folder.getFiles();

      while (files.hasNext()) {
        const file = files.next();
        if (file.getName() !== "Deliverables" || file.getMimeType() !== MimeType.GOOGLE_SHEETS) continue;

        const ss    = SpreadsheetApp.openById(file.getId());
        const sheet = ss.getSheetByName("Sheet1");
        if (!sheet) continue;

        const data    = sheet.getDataRange().getValues();
        if (data.length <= 1) continue;

        const headers     = data[0].map(h => h.toString().trim());
        const idxNo       = headers.indexOf("NO");
        const idxItem     = headers.indexOf("ITEM");
        const idxDue      = headers.indexOf("Due Date");
        const idxStatus   = headers.indexOf("STATUS");
        const idxResponsible = headers.indexOf("Responsible");

        for (let i = 1; i < data.length; i++) {
          const row = data[i];

          // ข้ามแถวที่ไม่มี Item หรือ Due Date
          if (!row[idxItem] || !row[idxDue]) continue;

          // ข้าม STATUS = DELIVERLED
          const status = row[idxStatus]?.toString().trim();
          if (status === "DELIVERLED") continue;

          // Parse Due Date
          let dueDate = null;
          if (row[idxDue] instanceof Date) {
            dueDate = row[idxDue];
          } else {
            dueDate = new Date(row[idxDue]);
          }
          if (isNaN(dueDate)) continue;

          dueDate.setHours(0, 0, 0, 0);
          const diff = Math.round((dueDate - today) / 86400000);

          if (diff === 7) {
            const dueFmt      = Utilities.formatDate(dueDate, Session.getScriptTimeZone(), "dd/MM/yyyy");
            const no          = idxNo          >= 0 ? row[idxNo]          : "-";
            const item        = idxItem        >= 0 ? row[idxItem]        : "-";
            const responsible = idxResponsible >= 0 ? row[idxResponsible] : "-";

            const msg = `⚠️ แจ้งเตือน Deliverable ใกล้ครบกำหนด!\n\n` +
              `📁 Project    : ${projectName}\n` +
              `🔢 NO         : ${no}\n` +
              `📝 Item       : ${item}\n` +
              `👤 Responsible: ${responsible}\n` +
              `📅 Due Date   : ${dueFmt}\n` +
              `⏰ เหลืออีก 7 วัน`;

            pushMessageToGroup(LINE_GROUP_ID, msg);
            Logger.log(`Deliverable reminder → ${projectName} | ${item} | 7 days left`);
          }
        }
      }
    });
  } catch (error) {
    Logger.log("deliverableReminder Error: " + error.message);
  }
}

// ==========================================
// 20. ตั้งค่า Trigger (รันครั้งเดียว)
// ==========================================
function createDailyTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger("dailySummary")
    .timeBased().atHour(8).everyDays(1).inTimezone("Asia/Bangkok").create();

  ScriptApp.newTrigger("dueDateReminder")
    .timeBased().atHour(8).everyDays(1).inTimezone("Asia/Bangkok").create();

  ScriptApp.newTrigger("leaveReminder")
    .timeBased().atHour(8).everyDays(1).inTimezone("Asia/Bangkok").create();

  ScriptApp.newTrigger("deliverableReminder")
    .timeBased().atHour(8).everyDays(1).inTimezone("Asia/Bangkok").create();

  Logger.log("✅ Triggers: dailySummary + dueDateReminder + leaveReminder + deliverableReminder @ 8:00 AM (Asia/Bangkok)");
}

// ==========================================
// 19. Test Functions
// ==========================================
function testAll() {
  Logger.log("=== HELP ===\n"      + getHelpMessage());
  Logger.log("=== LIST ===\n"      + processMessage("list"));
  Logger.log("=== TASK ===\n"      + processMessage("task"));
  Logger.log("=== TASK BIRD ===\n" + processMessage("task Bird"));
  Logger.log("=== LEAVE ===\n"     + processMessage("list leave"));
  Logger.log("=== SUMMARY ===");   dailySummary();
  Logger.log("=== REMINDER ===");  dueDateReminder();
  Logger.log("=== LEAVE REM ==="); leaveReminder();
  Logger.log("=== DELIV REM ==="); deliverableReminder();
}

function testDailySummary()       { dailySummary(); }
function testLeaveReminder()      { leaveReminder(); }
function testDueReminder()        { dueDateReminder(); }
function testDeliverableReminder(){ deliverableReminder(); }
