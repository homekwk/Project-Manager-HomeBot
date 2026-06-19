# PM Chatbot 🤖

Line Messaging API Chatbot สำหรับ Project Manager  
ตอบคำถามเกี่ยวกับสัญญา, ขอบเขตงาน, วัตถุประสงค์โครงการ และ Engineer Tasks

---

## Tech Stack

| Component | Technology |
|---|---|
| Platform | Google Apps Script (Web App / Webhook) |
| AI Model | Gemini 2.5 Flash |
| Messaging | Line Messaging API |
| Data Source | Google Drive (Docs + Sheets) |

---

## Drive Structure

```
📁 Root Folder (ROOT_FOLDER_ID)
├── 📁 SCX A/              ← Project Folder
│   ├── 📄 สัญญา.gdoc
│   └── 📄 ขอบเขตงาน.gdoc
├── 📁 SCX B/              ← Project Folder
│   └── 📄 ...
└── 📊 Engineer Tasks      ← Google Sheets (Root Level)
    ├── Sheet: Ton         ← แต่ละ Sheet = Engineer
    ├── Sheet: Aon
    ├── Sheet: New
    ├── Sheet: Leave Record
    └── Sheet: UID_GID
```

---

## Engineer Tasks Sheet Columns

| Column | Description |
|---|---|
| NO | ลำดับ |
| CUSTOMER | ชื่อลูกค้า |
| TYPE | ประเภทงาน (Implementation, Report, etc.) |
| TASK | ชื่องาน |
| Description | รายละเอียด |
| Requester | ผู้มอบหมาย |
| Request Date | วันที่รับงาน |
| Due Date | กำหนดส่ง |
| STATUS | สถานะ (PENDING, IN-PROGRESS, DONE) |
| NOTE | หมายเหตุ |
| Line User ID | สำหรับ Push Notification |

## Leave Record Sheet Columns

| Column | Description |
|---|---|
| NO | ลำดับ |
| Name | ชื่อ Engineer |
| Leave Start Date | วันที่เริ่มลา |
| Leave End Date | วันที่สิ้นสุดลา |

---

## Setup Guide (Step by Step)

### STEP 1 — สร้าง Gemini API Key
- ไปที่ [aistudio.google.com](https://aistudio.google.com) → Get API Key
- สร้าง API Key ใหม่
- ⚠️ ต้องเปิด Billing ใน Google Cloud Project เพื่อใช้ `gemini-2.5-flash`
- เก็บ Key ไว้ใช้ใน Step 6

### STEP 2 — สร้าง Line Messaging API Channel
- ไปที่ [developers.line.biz](https://developers.line.biz) → Create a new channel → Messaging API
- เก็บ **Channel Access Token** ไว้ใช้ใน Step 6
- Use webhook: **ON**
- Auto-reply messages: **OFF**
- Greeting messages: **OFF**

### STEP 3 — เตรียม Google Drive
- สร้าง Root Folder ใน Google Drive
- สร้าง Project Sub-folders (เช่น SCX A, SCX B) และใส่ไฟล์ Google Docs
- สร้างไฟล์ Google Sheets ชื่อ **"Engineer Tasks"** ใน Root Folder
  - แต่ละ Sheet Tab = ชื่อ Engineer
  - Columns: `NO, CUSTOMER, TYPE, TASK, Description, Requester, Request Date, Due Date, STATUS, NOTE, Line User ID`
  - เพิ่ม Sheet ชื่อ **"Leave Record"** (Columns: `NO, Name, Leave Start Date, Leave End Date`)
  - เพิ่ม Sheet ชื่อ **"UID_GID"** (Columns: `Name, Line User ID`)
- หา **Root Folder ID** จาก URL:
  ```
  https://drive.google.com/drive/folders/THIS_IS_THE_FOLDER_ID
  ```
- หา **Google Doc ID** จาก URL:
  ```
  https://docs.google.com/document/d/THIS_IS_THE_DOC_ID/edit
  ```

### STEP 4 — สร้าง Google Apps Script
- ไปที่ [script.google.com](https://script.google.com) → New Project
- ตั้งชื่อ Project (เช่น PM-Home-Bot)
- วางโค้ดจาก `Code.gs` ทั้งหมด

### STEP 5 — ตั้งค่า Timezone ใน GAS
- Project Settings (ไอคอน ⚙️) → Script Properties
- Time zone → เลือก **(GMT+07:00) Asia/Bangkok**

### STEP 6 — ใส่ Config Values
แก้ไขค่าใน Config ด้านบนของโค้ด:
```javascript
const LINE_CHANNEL_ACCESS_TOKEN = "จาก Step 2";
const GEMINI_API_KEY            = "จาก Step 1";
const ROOT_FOLDER_ID            = "จาก Step 3";
const LINE_GROUP_ID             = "หาได้ใน Step 11";
const PM_USER_IDS               = ["หาได้ใน Step 11"];
```

### STEP 7 — Deploy เป็น Web App (ครั้งแรก)
- Deploy → **New Deployment** → Web App
- Execute as: **Me**
- Who has access: **Anyone**
- กด Deploy → **Copy Webhook URL** ไว้

### STEP 8 — ตั้งค่า Line Webhook
- ไปที่ [developers.line.biz](https://developers.line.biz) → Messaging API
- Webhook URL → วาง URL จาก Step 7
- กด **Verify** → ต้องขึ้น Success ✅
- Use webhook: **ON**

### STEP 9 — เปิดให้ Bot เข้า Group ได้
- [developers.line.biz](https://developers.line.biz) → Messaging API → Bot information
- Allow bot to join group chats → **Enable** ✅

### STEP 10 — Invite Bot เข้า Group
- เปิด Line Group ที่ต้องการ
- กดชื่อ Group ด้านบน → **Invite**
- ค้นหาชื่อ Bot หรือ Scan QR Code จาก Line Developers Console
- กด Invite ✅

### STEP 11 — หา Group ID และ User ID
- พิมพ์ใน Line Group:
  ```
  @PMBot groupid
  ```
  → Copy **Group ID** (ขึ้นต้นด้วย `C`) ใส่ใน `LINE_GROUP_ID`

- ให้ Engineer แต่ละคน Add Bot เป็นเพื่อน แล้วพิมพ์ใน **1:1 Chat**:
  ```
  @PMBot myid
  ```
  → Copy **User ID** (ขึ้นต้นด้วย `U`) ใส่ใน Sheet คอลัมน์ `Line User ID`

- ให้ PM พิมพ์ `myid` ด้วย → Copy ใส่ใน `PM_USER_IDS`

### STEP 12 — อัปเดต Config และ Deploy ใหม่
- ใส่ `LINE_GROUP_ID` และ `PM_USER_IDS` ที่ได้จาก Step 11
- Deploy → **Manage Deployments** → Edit (ไอคอนดินสอ ✏️) → Version: **New Version** → Deploy
- ⚠️ ต้อง **Deploy New Version** ทุกครั้งที่แก้โค้ด ไม่ใช่แค่กด Save

### STEP 13 — ตั้งค่า Daily Triggers
- เลือกฟังก์ชัน **`createDailyTriggers`** จาก Dropdown ใน GAS Editor
- กด **▶ Run** → Allow Permission
- ตรวจสอบที่ **⏱ Triggers** ว่ามีครบ 3 รายการ:

| Function | Event | Time |
|---|---|---|
| dailySummary | time-based | 8am |
| dueDateReminder | time-based | 8am |
| leaveReminder | time-based | 8am |
| deliverableReminder | time-based | 8am |

### STEP 14 — ทดสอบ
- รัน `testAll()` ใน GAS Editor เพื่อทดสอบ Gemini + Sheets
- ส่งข้อความใน Line Group:
  ```
  @PMBot help
  ```
- ทดสอบคำสั่งต่างๆ

---

## Commands

### 📋 Project
```
@PMBot list                          → รายชื่อ Project ทั้งหมด
@PMBot [SCX A] ขอบเขตงานคืออะไร?    → ถามเฉพาะ Project
@PMBot วัตถุประสงค์โครงการคืออะไร?   → ค้นหาทุก Project
```

### 👷 Engineer Tasks
```
@PMBot summary                         → ส่ง Summary แยกทีละ Engineer เข้า Group
@PMBot task                            → สรุป Task ทุกคน
@PMBot task Bird                       → Task ของ Bird
@PMBot list task all engineer          → Task ทุกคนแบบละเอียด
@PMBot list engineer name              → รายชื่อ Engineer ทั้งหมด
@PMBot list engineer task inprogress   → งานที่ IN-PROGRESS
@PMBot list engineer task completed    → งานที่เสร็จแล้ว
@PMBot list task due date = 1 day      → งานครบกำหนดใน 1 วัน
@PMBot list task due date = 3 days     → งานครบกำหนดใน 3 วัน
```

### ➕ Add Task (PM Only)
```
@PMBot add task [Engineer] | [Customer] | [TYPE] | [TASK] | [Desc] | [Requester] | [Due Date]

ตัวอย่าง:
@PMBot add task Ton | PM Home | Implementation | ติดตั้ง Server | Setup Ubuntu 24 | Khun J | 15-May-2026
```

### 🌴 Leave Record
```
@PMBot list leave                              → ดูการลาทั้งหมด
@PMBot list leave Aon                          → ดูการลาของ Aon
@PMBot add leave Aon 19-May-2026 23-May-2026   → เพิ่มวันลา (ใครก็ได้)
```

### 🪪 Admin
```
@PMBot myid      → ดู Line User ID (ใช้ใน 1:1 Chat เท่านั้น)
@PMBot groupid   → ดู Line Group ID (ใช้ใน Group เท่านั้น)
@PMBot help      → ดูคำสั่งทั้งหมด
```

---

## Auto Notifications (8:00 AM Daily)

| Trigger | รายละเอียด |
|---|---|
| `dailySummary` | ส่งสรุป Task ทุกคนเข้า Group |
| `dueDateReminder` | แจ้งเตือน Engineer เมื่องานใกล้ครบกำหนด (3 วัน, 1 วัน) และเลยกำหนด |
| `leaveReminder` | แจ้งเตือนวันลา (1 วันก่อนลา, วันเริ่มลา, วันก่อนกลับ) |
| `deliverableReminder` | แจ้งเตือน Deliverable ใกล้ครบกำหนด 7 วัน |

---

## Changelog

### v1.0.0 — Initial Release
- Line Messaging API Webhook บน Google Apps Script
- AI ตอบคำถามด้วย Gemini (`gemini-1.5-flash-latest`)
- อ่านข้อมูลจาก Google Docs ID เดียว
- System Prompt สำหรับ PM role
- ตอบ "Information Not Found!!" เมื่อไม่พบข้อมูล

### v1.1.0 — Multi-Project Support
- รองรับหลาย Project จาก Google Drive Folder
- คำสั่ง `list` ดูรายชื่อ Project ทั้งหมด
- คำสั่ง `[Project Name] คำถาม` ถามเฉพาะ Project
- ค้นหาทุก Project เมื่อไม่ระบุชื่อ

### v1.2.0 — Engineer Tasks (Google Sheets)
- อ่านข้อมูลจาก Google Sheets ที่อยู่ใน Root Folder
- แต่ละ Sheet Tab = Engineer แต่ละคน
- รองรับ Columns: TYPE, TASK, Description, Requester, Request Date, Due Date, STATUS, NOTE

### v1.3.0 — Line Group Support
- Bot เข้า Group Chat ได้
- ตอบเฉพาะเมื่อมี `@PMBot` mention
- แสดง Help เมื่อ mention โดยไม่มีคำถาม
- คำสั่ง `groupid` ดึง Group ID จาก Group Chat

### v1.4.0 — Daily Auto Notifications
- Daily Summary ส่งเข้า Group ทุก 8:00 AM (Asia/Bangkok)
- Due Date Reminder ส่งหา Engineer โดยตรง (1:1) เมื่อใกล้ครบกำหนด
- แจ้งเตือนล่วงหน้า 3 วัน และ 1 วัน
- แจ้งเตือนเมื่องานเลยกำหนด
- คำสั่ง `myid` ให้ Engineer ดึง User ID ตัวเอง

### v1.5.0 — Fix Gemini Model
- เปลี่ยน Model จาก `gemini-1.5-flash-latest` → `gemini-2.5-flash`
- แก้ปัญหา 404 NOT_FOUND error
- เพิ่ม `listAvailableModels()` สำหรับตรวจสอบ Model ที่ใช้ได้

### v1.6.0 — Extended Task Commands
- คำสั่ง `task [ชื่อ]` ดู Task ของ Engineer รายคน (เช่น `task Bird`)
- คำสั่ง `list task all engineer`
- คำสั่ง `list engineer name`
- คำสั่ง `list engineer task inprogress`
- คำสั่ง `list engineer task completed`
- คำสั่ง `list task due date = N day(s)`

### v1.7.0 — Add Task via Line (PM Only)
- PM เพิ่ม Task ผ่าน Line ได้โดยตรง
- ระบบ Permission ตรวจสอบ `PM_USER_IDS`
- เขียนข้อมูลลง Google Sheets อัตโนมัติ
- STATUS เริ่มต้นเป็น PENDING
- Format: `add task [Engineer] | [TYPE] | [TASK] | [Desc] | [Requester] | [Due Date]`

### v1.8.0 — Leave Record
- อ่านข้อมูลวันลาจาก "Leave Record" Sheet
- คำสั่ง `list leave` ดูการลาทั้งหมด (แบ่งเป็น ongoing / upcoming / past)
- คำสั่ง `list leave [ชื่อ]` ดูการลาของคนนั้น
- Leave Reminder Trigger ทุก 8:00 AM
  - แจ้ง 1 วันก่อนลา
  - แจ้งวันเริ่มลา
  - แจ้งวันก่อนกลับจากลา

### v1.9.0 — Bug Fixes & Improvements
- Fix: ยกเว้น "Leave Record" และ "UID_GID" Sheet จาก Daily Task Summary
- Fix: Request Date บันทึกแบบ `dd-MMM-yyyy` (เช่น 04-May-2026) แทน `MMM yyyy`
- Fix: Leave Date แสดงแบบ `dd/MM/yyyy` แทน `MMM yyyy`
- Fix: Daily Summary Trigger ไม่ทำงาน → เพิ่ม `.inTimezone("Asia/Bangkok")`
- เพิ่ม CUSTOMER field ใน Add Task command
- Format ใหม่: `add task [Engineer] | [Customer] | [TYPE] | [TASK] | [Desc] | [Requester] | [Due Date]`

### v2.1.0 — Daily Summary Format Update
- เพิ่มแสดง CUSTOMER ในแต่ละ Task ของ Daily Summary
- เพิ่มแสดง Description ในแต่ละ Task ของ Daily Summary
- Fix: Due Date format ใน Daily Summary เปลี่ยนจาก `MMM yyyy` → `dd/MM/yyyy`
- Daily Summary format ใหม่ต่อ Task:
  ```
  📌 STATUS | 📆 DD/MM/YYYY [urgency]
  🏢 CUSTOMER  • [TYPE] TASK
     📝 Description
  ```

### v2.2.0 — Fix Due Date & Task Display Format
- Fix: `readGoogleSheet()` Due Date format เปลี่ยนจาก `MMM yyyy` → `dd-MM-yyyy` เพื่อให้ Gemini อ่านวันที่ถูกต้อง
- Fix: Gemini ไม่แสดง Markdown (`**bold**`) ใน Line อีกต่อไป
- Fix: ชื่อ Engineer ไม่ซ้ำในแต่ละ Task แล้ว
- อัปเดต System Prompt ใน `callGemini()` กำหนด format Task แบบใหม่:
  ```
  👤 Engineer (แสดงครั้งเดียว)
  ─────────────────
  1. TASK
     🏢 CUSTOMER
     📋 TYPE
     📝 Description
     👤 Requester: xxx
     📌 STATUS: xxx
     📅 Due Date: DD-MM-YYYY
  ```

### v2.3.0 — Summary Command & Per-Engineer Message
- เพิ่มคำสั่ง `@PMBot summary` สำหรับเรียก Daily Summary ได้ตลอดเวลา
- Daily Summary (Trigger 8:00 AM) และ `@PMBot summary` ใช้รูปแบบเดียวกัน
- ส่งข้อความแยก 1 Message ต่อ 1 Engineer เข้า Group
- Engineer ที่ Done ทุก Task แสดง ✅ แทนรายการ Task

### v2.4.0 — Add Leave Command & Deliverable Reminder
- เพิ่มคำสั่ง `@PMBot add leave [Name] [Start Date] [End Date]` — ใครก็ได้เพิ่มวันลาได้
- เพิ่ม `deliverableReminder` Trigger ทุก 8:00 AM
  - อ่านไฟล์ `Deliverables` (Google Sheets, Sheet1) ใน Sub-folder ของแต่ละ Project
  - Columns: NO, ITEM, Due Date, STATUS, Responsible
  - แจ้งเตือนล่วงหน้า 7 วัน เฉพาะ STATUS ≠ `DELIVERLED`
  - ส่งเข้า Group พร้อมระบุ Project, NO, Item, Responsible, Due Date
- อัปเดต `createDailyTriggers()` เพิ่ม `deliverableReminder`

### v2.5.0 — Daily Summary Redesign
- เพิ่ม `DASHBOARD_URL` ใน Config section
- Daily Summary รวมทุก Engineer ใน **1 Message** (ไม่แยกทีละคนแล้ว)
- Format ใหม่ต่อ Task: `[ลำดับ]. [CUSTOMER] | [TASK] | [วันคงเหลือ]`
- วันคงเหลือ format:
  - ปกติ → `เหลือ X วัน`
  - ครบกำหนดวันนี้ → `🟠 ครบกำหนดวันนี้`
  - เลยกำหนด → `🔴 เลยกำหนด X วัน`
  - ไม่มี Due Date → ไม่แสดง
- Engineer ที่ Done ทุก Task แสดง `ว่างงาน ✅`
- แสดงเฉพาะ Task ที่ยังค้างอยู่ (ไม่แสดง DONE/COMPLETED)
- เพิ่ม Dashboard Link ด้านล่าง Summary

---

## License
MIT
