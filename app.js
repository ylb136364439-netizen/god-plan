const GP = window.GodPlanStore;
const APP_VERSION = window.APP_VERSION || "1.0.0";
let store = GP.loadStore();
let reviewDate = GP.toDateKey();
let editingPlan = false;
let installPrompt = null;
let waitingWorker = null;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const todayKey = () => GP.toDateKey();
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);

function formatDate(key, options = { month: "long", day: "numeric", weekday: "long" }) {
  return new Intl.DateTimeFormat("zh-CN", options).format(GP.parseDateKey(key));
}
function showToast(message) {
  $("#toast").textContent = message; $("#toast").classList.add("show");
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => $("#toast").classList.remove("show"), 2200);
}
function showInfo(title, content, actionLabel, action) {
  $("#infoTitle").textContent = title;
  $("#infoContent").innerHTML = content;
  const button = $("#infoAction");
  button.hidden = !actionLabel;
  button.textContent = actionLabel || "";
  button.onclick = action || null;
  $("#infoDialog").showModal();
}
function setProgress(percent) {
  $("#progressPercent").textContent = `${percent}%`; $("#progressRing").style.setProperty("--progress", `${percent * 3.6}deg`);
}
function emptyState(title, copy, action) {
  return `<article class="empty-state"><span>✦</span><h2>${title}</h2><p>${copy}</p><button class="primary-button" type="button">${action}</button></article>`;
}
function openPage(pageId) {
  $$(".page, .nav-item").forEach(item => item.classList.remove("active"));
  $(`#${pageId}`).classList.add("active"); $(`.nav-item[data-page="${pageId}"]`).classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (pageId === "profilePage") renderProfile();
  if (pageId === "knowledgePage") renderKnowledge();
}
function renderHeader() {
  $("#todayLabel").textContent = formatDate(todayKey());
  if (!store.activePlan) { $("#heroTitle").textContent = "造神计划"; $("#heroSubtitle").textContent = "先创建你的六周成长计划。"; setProgress(0); return; }
  const p = GP.getPlanDay(todayKey(), store.activePlan);
  $("#heroTitle").textContent = store.activePlan.name;
  $("#heroSubtitle").textContent = p.state === "upcoming" ? `计划将在 ${formatDate(store.activePlan.startDate, { month: "long", day: "numeric" })} 开始` : p.state === "ended" ? "六周计划已经结束，看看你走了多远。" : `第 ${p.week} 周 · 第 ${p.day} 天`;
}
function renderToday() {
  const root = $("#todayContent"); renderHeader();
  if (!store.activePlan) {
    root.innerHTML = emptyState("开启你的第一段六周旅程", "使用成长模板，把目标变成每天能完成的小事。", "创建计划");
    root.querySelector("button").onclick = () => openPlanDialog(false); return;
  }
  const p = GP.getPlanDay(todayKey(), store.activePlan);
  if (p.state !== "active") {
    const upcoming = p.state === "upcoming";
    root.innerHTML = emptyState(upcoming ? "计划还没开始" : "六周计划完成", upcoming ? `开始日期是 ${store.activePlan.startDate}。` : "去“我的”查看执行记录，或重新开始。", upcoming ? "查看计划" : "查看成长");
    root.querySelector("button").onclick = () => openPage(upcoming ? "planPage" : "profilePage"); setProgress(0); return;
  }
  const tasks = GP.getTasksForDate(todayKey(), store.activePlan);
  const done = tasks.filter(task => store.checkins[todayKey()]?.[task.id]).length;
  const percent = Math.round(done / tasks.length * 100); setProgress(percent);
  root.innerHTML = `<div class="section-heading"><div><p class="eyebrow">今日行动</p><h2>${tasks.length} 件小事</h2></div><span class="streak">连续完成 ${GP.calculateStats(store).streak} 天</span></div>
  <div class="habit-list">${tasks.map(task => `<article class="habit-card ${store.checkins[todayKey()]?.[task.id] ? "done" : ""}" data-task-id="${task.id}"><span class="habit-icon">${task.icon}</span><div class="habit-copy"><strong class="habit-title">${escapeHtml(task.name)}</strong><span class="habit-detail">${escapeHtml(task.detail)}</span></div><button class="check-button" type="button">✓</button></article>`).join("")}</div>
  <article class="night-card"><span class="night-icon">☾</span><div><strong>今晚顺序</strong><p>读书 15 分钟 → 提炼观点 → 复盘 10 分钟 → 睡觉</p></div></article>
  <article class="compound-intro today-compound"><span>↗</span><div><strong>别让今天读过的内容消失</strong><p>提炼一个观点，并安排一次真实应用。</p><button class="compound-quick-button" id="todayKnowledge" type="button">记录今天学到的</button></div></article>`;
  $$(".habit-card").forEach(card => card.onclick = () => {
    const wasComplete = percent === 100; GP.toggleCheckin(todayKey(), card.dataset.taskId, store); store = GP.loadStore(); renderAll();
    if (!wasComplete && GP.completionForDate(todayKey(), store)?.ratio === 1) showToast("今天全部完成，做得漂亮。");
  });
  $("#todayKnowledge").onclick = () => openKnowledgeDialog();
}
function renderPlan() {
  if (!store.activePlan) {
    $("#planSummary").innerHTML = emptyState("还没有计划", "创建计划后，这里会显示完整六周路线。", "创建计划");
    $("#planSummary button").onclick = () => openPlanDialog(false); $("#weekList").innerHTML = ""; $("#editPlanButton").hidden = true; return;
  }
  $("#editPlanButton").hidden = false; const p = GP.getPlanDay(todayKey(), store.activePlan);
  const completedDays = Math.max(0, Math.min(42, p.offset + 1));
  $("#planSummary").innerHTML = `<article class="plan-summary panel"><div><strong>${escapeHtml(store.activePlan.name)}</strong><span>${store.activePlan.startDate} 至 ${store.activePlan.endDate}</span></div><div class="mini-progress"><i style="width:${Math.round(completedDays / 42 * 100)}%"></i></div><small>日历进度 ${completedDays}/42 天</small></article>`;
  $("#weekList").innerHTML = store.activePlan.weeks.map((week, index) => {
    const n = index + 1; const state = p.week > n ? "past" : p.week === n && p.state === "active" ? "current" : "future";
    return `<article class="week-card ${state}"><div class="week-badge"><span>第</span><strong>${n}</strong><span>周</span></div><div><span class="week-state">${state === "past" ? "已走过" : state === "current" ? "进行中" : "未开始"}</span><strong>${escapeHtml(week.focus)}</strong><div class="week-meta"><span>📚 ${escapeHtml(week.read)}</span><span>💪 ${escapeHtml(week.pushup)}</span><span>🏊 ${escapeHtml(week.swim)}</span></div></div></article>`;
  }).join("");
}
function renderReview() {
  $("#reviewDate").value = reviewDate; $("#reviewDate").max = todayKey(); $("#nextReview").disabled = reviewDate >= todayKey(); const saved = store.reviews[reviewDate] || {};
  $$("[data-review]").forEach(textarea => textarea.value = saved[textarea.dataset.review] || "");
}
function renderProfile() {
  $("#appVersion").textContent = `V${APP_VERSION}`;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  $("#installHint").textContent = standalone ? "已从手机桌面启动" : installPrompt ? "点击即可安装" : "查看安装方法";
  if (!store.activePlan) { $("#statsGrid").innerHTML = ""; $("#calendar").innerHTML = ""; $("#goalStats").innerHTML = ""; $("#planInfo").textContent = "当前没有进行中的计划。"; return; }
  const stats = GP.calculateStats(store); const today = GP.completionForDate(todayKey(), store);
  $("#statsGrid").innerHTML = [["执行天数", stats.totalExecutionDays], ["连续完成", `${stats.streak} 天`], ["今日完成", today ? `${Math.round(today.ratio * 100)}%` : "—"]].map(([label, value]) => `<article class="stat-card"><strong>${value}</strong><span>${label}</span></article>`).join("");
  const now = GP.parseDateKey(todayKey()), year = now.getFullYear(), month = now.getMonth(), first = new Date(year, month, 1).getDay(), days = new Date(year, month + 1, 0).getDate();
  $("#calendarTitle").textContent = `${year} 年 ${month + 1} 月`;
  $("#calendar").innerHTML = ["日","一","二","三","四","五","六"].map(d => `<b>${d}</b>`).join("") + Array(first).fill("<span></span>").join("") + Array.from({ length: days }, (_, i) => {
    const key = GP.toDateKey(new Date(year, month, i + 1, 12)), result = GP.completionForDate(key, store);
    const state = !result || result.done === 0 ? "" : result.ratio === 1 ? "complete" : "partial";
    return `<span class="${state} ${key === todayKey() ? "today" : ""}">${i + 1}</span>`;
  }).join("");
  $("#goalStats").innerHTML = Object.entries(store.activePlan.goals).map(([id, goal]) => `<div class="goal-stat"><span>${goal.icon} ${escapeHtml(goal.name)}</span><div class="mini-progress"><i style="width:${stats.goalRates[id]}%"></i></div><strong>${stats.goalRates[id]}%</strong></div>`).join("");
  $("#planInfo").textContent = `${store.activePlan.name} · ${store.activePlan.startDate} 至 ${store.activePlan.endDate}`;
}
function knowledgeStatusLabel(status) {
  return ({ pending: "待实践", applied: "已实践", validated: "长期原则" })[status] || "待实践";
}
function knowledgeCardHtml(card, due = false) {
  const needsApplication = card.status === "pending" && card.applyDate <= todayKey();
  const needsReview = (card.reviewDates || []).some(date => date <= todayKey() && !(card.reviewedDates || []).includes(date));
  return `<article class="knowledge-card ${due ? "due" : ""}" data-knowledge-id="${card.id}">
    <div class="knowledge-card-header"><strong>${escapeHtml(card.insight)}</strong><span class="knowledge-status">${knowledgeStatusLabel(card.status)}</span></div>
    <p><strong>我的理解：</strong>${escapeHtml(card.ownWords)}</p>
    <p><strong>应用行动：</strong>${escapeHtml(card.application)} · ${escapeHtml(card.applyDate)}</p>
    ${card.result ? `<p><strong>实践结果：</strong>${escapeHtml(card.result)}</p>` : ""}
    <div class="knowledge-actions">
      ${needsApplication ? `<button data-action="apply" type="button">记录实践结果</button>` : ""}
      ${needsReview ? `<button data-action="review" type="button">完成本次回忆</button>` : ""}
      <button class="secondary" data-action="edit" type="button">编辑卡片</button>
    </div>
  </article>`;
}
function renderKnowledge() {
  const cards = store.knowledgeCards || [];
  const summary = GP.getKnowledgeSummary(store);
  $("#knowledgeStats").innerHTML = [
    ["知识卡", summary.total],
    ["待应用", summary.pendingApplication],
    ["待复习", summary.dueReview],
    ["长期原则", summary.validated]
  ].map(([label, value]) => `<article class="stat-card"><strong>${value}</strong><span>${label}</span></article>`).join("");
  const due = cards.filter(card => (card.status === "pending" && card.applyDate <= todayKey()) ||
    (card.reviewDates || []).some(date => date <= todayKey() && !(card.reviewedDates || []).includes(date)));
  $("#knowledgeDue").innerHTML = due.length ? due.map(card => knowledgeCardHtml(card, true)).join("") :
    '<div class="empty-knowledge">今天没有待应用或待复习的卡片。读完后，提炼一个值得实践的观点吧。</div>';
  $("#knowledgeList").innerHTML = cards.length ? cards.map(card => knowledgeCardHtml(card)).join("") :
    '<div class="empty-knowledge">还没有知识卡片。真正的复利，从把第一个观点用于现实开始。</div>';
  $$("[data-knowledge-id] button").forEach(button => button.onclick = () => {
    const card = cards.find(item => item.id === button.closest("[data-knowledge-id]").dataset.knowledgeId);
    if (button.dataset.action === "review") {
      GP.markKnowledgeReviewed(card.id, todayKey(), store); store = GP.loadStore(); renderKnowledge(); showToast("已完成主动回忆");
    } else openKnowledgeDialog(card, button.dataset.action === "apply");
  });
}
function renderAll() { renderToday(); renderPlan(); renderReview(); renderKnowledge(); renderProfile(); }
function openPlanDialog(editing) {
  editingPlan = editing; const config = editing && store.activePlan ? store.activePlan : GP.defaultPlanConfig(); const form = $("#planForm");
  $("#dialogTitle").textContent = editing ? "编辑计划" : "创建计划"; $("#savePlanButton").textContent = editing ? "保存修改" : "开始计划";
  form.elements.planName.value = config.name; form.elements.startDate.value = config.startDate; form.elements.startDate.disabled = editing;
  $("#goalFields").innerHTML = Object.entries(config.goals).map(([id, goal]) => `<label class="field compact"><span>${goal.icon}</span><input name="goal-${id}" value="${escapeHtml(goal.name)}" required maxlength="12"></label>`).join("");
  $("#weekdayOptions").innerHTML = ["日","一","二","三","四","五","六"].map((day, i) => `<label><input type="checkbox" name="swimDay" value="${i}" ${config.goals.swim.weekdays.includes(i) ? "checked" : ""}><span>周${day}</span></label>`).join("");
  const currentWeek = store.activePlan ? GP.getPlanDay(todayKey(), store.activePlan).week : 0;
  $("#weekFields").innerHTML = config.weeks.map((week, i) => `<details ${i === Math.max(0, currentWeek) ? "open" : ""}><summary>第 ${i + 1} 周 · ${escapeHtml(week.focus)}</summary>${["focus","read","pushup","swim"].map(field => `<label class="field"><span>${({focus:"阶段重点",read:"阅读",pushup:"俯卧撑",swim:"游泳"})[field]}</span><input name="week-${i}-${field}" value="${escapeHtml(week[field])}" ${editing && i + 1 <= currentWeek ? "disabled" : ""}></label>`).join("")}</details>`).join("");
  $("#planDialog").showModal();
}
function planFromForm() {
  const form = $("#planForm"), base = editingPlan ? JSON.parse(JSON.stringify(store.activePlan)) : GP.defaultPlanConfig();
  base.name = form.elements.planName.value; base.startDate = form.elements.startDate.value;
  Object.keys(base.goals).forEach(id => base.goals[id].name = form.elements[`goal-${id}`].value);
  const days = [...form.querySelectorAll('[name="swimDay"]:checked')].map(input => Number(input.value)); base.goals.swim.weekdays = days.length ? days : [2, 6];
  base.weeks = base.weeks.map((week, i) => Object.fromEntries(["focus","read","pushup","swim"].map(field => [field, form.elements[`week-${i}-${field}`]?.value || week[field]]))); return base;
}
function openKnowledgeDialog(card = null, focusResult = false) {
  const form = $("#knowledgeForm");
  $("#knowledgeDialogTitle").textContent = card ? (focusResult ? "记录实践结果" : "编辑知识卡片") : "记录新观点";
  form.elements.knowledgeId.value = card?.id || "";
  form.elements.insight.value = card?.insight || "";
  form.elements.ownWords.value = card?.ownWords || "";
  form.elements.application.value = card?.application || "";
  form.elements.applyDate.value = card?.applyDate || GP.addDays(todayKey(), 1);
  form.elements.result.value = card?.result || "";
  form.elements.knowledgeStatus.value = focusResult ? "applied" : card?.status || "pending";
  $("#knowledgeDialog").showModal();
  if (focusResult) setTimeout(() => form.elements.result.focus(), 100);
}
$$(".nav-item").forEach(button => button.onclick = () => openPage(button.dataset.page));
$("#editPlanButton").onclick = () => openPlanDialog(true);
$("#newKnowledge").onclick = () => openKnowledgeDialog();
$("#previousReview").onclick = () => { reviewDate = GP.addDays(reviewDate, -1); renderReview(); };
$("#nextReview").onclick = () => { reviewDate = GP.addDays(reviewDate, 1); renderReview(); };
$("#reviewDate").onchange = event => { reviewDate = event.target.value > todayKey() ? todayKey() : event.target.value; renderReview(); };
$("#reviewForm").oninput = () => {
  const review = Object.fromEntries($$("[data-review]").map(input => [input.dataset.review, input.value])); GP.saveReview(reviewDate, review, store); store = GP.loadStore();
  $("#saveState").textContent = "已保存"; clearTimeout(renderReview.timer); renderReview.timer = setTimeout(() => $("#saveState").textContent = "自动保存", 1200); if (reviewDate === todayKey()) renderToday();
};
$("#planForm").onsubmit = event => {
  if (event.submitter?.value === "cancel") return; event.preventDefault(); const config = planFromForm();
  if (editingPlan) { store.activePlan.name = config.name; store.activePlan.goals = config.goals; store.activePlan.weeks = config.weeks; GP.saveStore(store); } else GP.createPlan(config, store);
  store = GP.loadStore(); $("#planDialog").close(); renderAll(); openPage("todayPage"); showToast(editingPlan ? "计划已更新" : "六周计划已开始");
};
$("#knowledgeForm").onsubmit = event => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const form = event.currentTarget;
  GP.saveKnowledgeCard({
    id: form.elements.knowledgeId.value || undefined,
    insight: form.elements.insight.value.trim(),
    ownWords: form.elements.ownWords.value.trim(),
    application: form.elements.application.value.trim(),
    applyDate: form.elements.applyDate.value,
    result: form.elements.result.value.trim(),
    status: form.elements.knowledgeStatus.value
  }, store);
  store = GP.loadStore(); $("#knowledgeDialog").close(); renderAll(); openPage("knowledgePage"); showToast("知识卡片已保存");
};
$("#restartPlan").onclick = () => { if (confirm("重新开始会归档当前计划，并清空当前打卡和复盘。确定继续吗？") && confirm("请再次确认：要重新开始吗？")) openPlanDialog(false); };
$("#clearData").onclick = () => { if (confirm("这会删除全部计划、打卡和复盘，确定继续吗？") && confirm("删除后无法恢复。请再次确认。")) { GP.clearAll(); store = GP.loadStore(); renderAll(); openPage("todayPage"); showToast("全部数据已清除"); } };

function downloadBackup(backup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const filename = `造神计划备份-${todayKey()}.json`;
  const file = new File([blob], filename, { type: "application/json" });
  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ title: "造神计划数据备份", files: [file] }).catch(() => saveBlob(blob, filename));
  } else saveBlob(blob, filename);
}
function saveBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
$("#exportBackup").onclick = () => {
  if (!confirm("备份文件包含你的计划和复盘记录，请妥善保存。现在导出吗？")) return;
  downloadBackup(GP.exportBackup(store)); showToast("备份文件已生成");
};
$("#importBackup").onclick = () => $("#backupFile").click();
$("#backupFile").onchange = async event => {
  const file = event.target.files[0]; event.target.value = ""; if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    const validation = GP.validateBackup(backup);
    if (!validation.valid) throw new Error(validation.error);
    const summary = validation.summary;
    showInfo("确认恢复备份", `<div class="backup-summary"><p><strong>计划：</strong>${escapeHtml(summary.planName)}</p><p><strong>备份时间：</strong>${escapeHtml(new Date(summary.exportedAt).toLocaleString("zh-CN"))}</p><p><strong>打卡记录：</strong>${summary.checkinDays} 天</p><p><strong>复盘记录：</strong>${summary.reviewDays} 天</p><p><strong>知识卡片：</strong>${summary.knowledgeCards} 张</p><p><strong>历史计划：</strong>${summary.archivedPlans} 个</p><em>恢复将覆盖当前手机中的全部数据。</em></div>`, "恢复此备份", () => {
      if (!confirm("请再次确认：覆盖当前数据并恢复备份吗？")) return;
      GP.importBackup(backup); store = GP.loadStore(); $("#infoDialog").close(); renderAll(); showToast("备份恢复成功");
    });
  } catch (error) { showInfo("无法导入备份", `<p>${escapeHtml(error.message || "文件无效")}</p>`); }
};
$("#installApp").onclick = async () => {
  if (installPrompt) {
    installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; renderProfile(); return;
  }
  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  showInfo("安装到手机桌面", isiOS
    ? "<ol><li>使用 Safari 打开本页面。</li><li>点击浏览器底部的“分享”按钮。</li><li>选择“添加到主屏幕”。</li><li>点击右上角“添加”。</li></ol>"
    : "<ol><li>打开浏览器菜单。</li><li>选择“安装应用”或“添加到主屏幕”。</li><li>确认安装后，从桌面图标打开。</li></ol>");
};
$("#showHelp").onclick = () => showInfo("手机使用说明", "<h3>离线使用</h3><p>首次联网打开后，即使没有网络也能打卡和复盘。</p><h3>保护数据</h3><p>数据仅保存在当前手机。换手机、卸载应用或清理浏览器数据前，请先导出备份。</p><h3>恢复数据</h3><p>在新手机打开“我的”，选择“导入数据备份”。</p>");
$("#closeInfo").onclick = () => $("#infoDialog").close();
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); installPrompt = event; renderProfile(); });
window.addEventListener("appinstalled", () => { installPrompt = null; showToast("已安装到手机桌面"); renderProfile(); });

function updateConnectionStatus(event) {
  $("#connectionStatus").hidden = navigator.onLine;
  if (navigator.onLine && event?.type === "online") showToast("网络已恢复");
}
window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);
updateConnectionStatus(null);

if ("serviceWorker" in navigator) window.addEventListener("load", async () => {
  const registration = await navigator.serviceWorker.register("sw.js");
  const showUpdate = worker => {
    if (!worker) return;
    waitingWorker = worker;
    $("#updateBanner").hidden = false;
  };
  if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration.waiting);
  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdate(worker);
    });
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload());
  registration.update().catch(() => {});
});
$("#dismissUpdate").onclick = () => { $("#updateBanner").hidden = true; };
$("#updateApp").onclick = () => {
  if (!waitingWorker) { $("#updateBanner").hidden = true; showToast("当前已经是最新版本"); return; }
  $("#updateApp").disabled = true;
  $("#updateApp").textContent = "更新中";
  waitingWorker.postMessage({ type: "SKIP_WAITING" });
  setTimeout(() => { $("#updateBanner").hidden = true; }, 3000);
};
renderAll();
if (["#todayPage", "#planPage", "#knowledgePage", "#reviewPage", "#profilePage"].includes(window.location.hash)) openPage(window.location.hash.slice(1));
