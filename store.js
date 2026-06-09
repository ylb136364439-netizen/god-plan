(function () {
  const STORAGE_KEY = "godPlan:v1";
  const PRODUCT_ID = "god-plan";
  const EXPORT_VERSION = 1;
  const DAY_MS = 86400000;
  const GOAL_IDS = ["read", "pushup", "swim", "review"];
  const DEFAULT_WEEKS = [
    { focus: "建立节奏", read: "第 1–3 章", pushup: "8 个 × 5 组", swim: "30 分钟/次" },
    { focus: "稳住基础", read: "第 4–7 章", pushup: "10 个 × 6 组", swim: "30 分钟/次" },
    { focus: "适当加强", read: "第 8–12 章", pushup: "10 个 × 8 组", swim: "45 分钟/次" },
    { focus: "达成目标", read: "第 13 章至结尾", pushup: "10 个 × 10 组", swim: "45 分钟/次" },
    { focus: "巩固成果", read: "回顾重点概念", pushup: "100 个/天巩固", swim: "45–60 分钟/次" },
    { focus: "形成习惯", read: "整理读书笔记", pushup: "缩短组间休息", swim: "自由畅游" }
  ];

  const clone = value => JSON.parse(JSON.stringify(value));

  function parseDateKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }

  function toDateKey(input = new Date()) {
    const date = input instanceof Date ? input : parseDateKey(input);
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function addDays(key, amount) {
    const date = parseDateKey(key);
    date.setDate(date.getDate() + amount);
    return toDateKey(date);
  }

  function daysBetween(start, end) {
    const asUtc = key => {
      const [year, month, day] = key.split("-").map(Number);
      return Date.UTC(year, month - 1, day);
    };
    return Math.round((asUtc(end) - asUtc(start)) / DAY_MS);
  }

  function defaultPlanConfig() {
    return {
      name: "造神计划",
      startDate: toDateKey(),
      goals: {
        read: { name: "读书", icon: "📚" },
        pushup: { name: "俯卧撑", icon: "💪" },
        swim: { name: "游泳", icon: "🏊", weekdays: [2, 6] },
        review: { name: "睡前复盘", icon: "🌙" }
      },
      weeks: clone(DEFAULT_WEEKS)
    };
  }

  const emptyStore = () => ({ version: 1, activePlan: null, checkins: {}, reviews: {}, archivedPlans: [] });

  function migrateLegacy(store) {
    Object.keys(localStorage).filter(key => key.startsWith("god-plan-habits-") || key.startsWith("god-plan-review-")).forEach(key => {
      const parts = key.match(/\d+/g);
      if (!parts || parts.length < 3) return;
      const date = `${parts[0]}-${String(parts[1]).padStart(2, "0")}-${String(parts[2]).padStart(2, "0")}`;
      try {
        const data = JSON.parse(localStorage.getItem(key) || "{}");
        if (key.startsWith("god-plan-habits-")) store.checkins[date] = data;
        else store.reviews[date] = data;
      } catch (_) {}
    });
    return store;
  }

  function loadStore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved?.version === 1) return { ...emptyStore(), ...saved };
    } catch (_) {}
    const store = migrateLegacy(emptyStore());
    saveStore(store);
    return store;
  }

  function saveStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return store;
  }

  function createPlan(config, store = loadStore()) {
    if (store.activePlan) store.archivedPlans.push({
      ...store.activePlan,
      archivedAt: new Date().toISOString(),
      checkins: clone(store.checkins),
      reviews: clone(store.reviews)
    });
    store.activePlan = {
      id: `plan-${Date.now()}`, name: config.name.trim() || "造神计划", startDate: config.startDate,
      endDate: addDays(config.startDate, 41), status: "active", goals: clone(config.goals),
      weeks: clone(config.weeks), createdAt: new Date().toISOString()
    };
    store.checkins = {};
    store.reviews = {};
    return saveStore(store);
  }

  function getPlanDay(date, plan) {
    if (!plan) return { state: "none", day: 0, week: 0, offset: null };
    const offset = daysBetween(plan.startDate, date);
    if (offset < 0) return { state: "upcoming", day: offset + 1, week: 0, offset };
    if (offset > 41) return { state: "ended", day: offset + 1, week: 7, offset };
    return { state: "active", day: offset + 1, week: Math.floor(offset / 7) + 1, offset };
  }

  function getTasksForDate(date, plan) {
    const position = getPlanDay(date, plan);
    if (!plan || position.state !== "active") return [];
    const week = plan.weeks[position.week - 1];
    const tasks = [
      { id: "read", ...plan.goals.read, detail: week.read },
      { id: "pushup", ...plan.goals.pushup, detail: week.pushup },
      { id: "review", ...plan.goals.review, detail: "约 10 分钟 · 写一句也算完成" }
    ];
    if (plan.goals.swim.weekdays.includes(parseDateKey(date).getDay())) tasks.splice(2, 0, { id: "swim", ...plan.goals.swim, detail: week.swim });
    return tasks;
  }

  function toggleCheckin(date, taskId, store = loadStore()) {
    store.checkins[date] ||= {};
    store.checkins[date][taskId] = !store.checkins[date][taskId];
    saveStore(store);
    return store.checkins[date][taskId];
  }

  function saveReview(date, review, store = loadStore()) {
    store.reviews[date] = { ...review, updatedAt: new Date().toISOString() };
    store.checkins[date] ||= {};
    store.checkins[date].review = Object.values(review).some(value => String(value).trim());
    return saveStore(store);
  }

  function completionForDate(date, store) {
    const tasks = getTasksForDate(date, store.activePlan);
    if (!tasks.length) return null;
    const done = tasks.filter(task => store.checkins[date]?.[task.id]).length;
    return { done, total: tasks.length, ratio: done / tasks.length };
  }

  function calculateStats(store = loadStore(), today = toDateKey()) {
    const done = Object.fromEntries(GOAL_IDS.map(id => [id, 0]));
    const total = Object.fromEntries(GOAL_IDS.map(id => [id, 0]));
    let totalExecutionDays = 0;
    let streak = 0;
    if (!store.activePlan) return { totalExecutionDays, streak, goalRates: done };
    const end = today < store.activePlan.endDate ? today : store.activePlan.endDate;
    if (end >= store.activePlan.startDate) {
      for (let date = store.activePlan.startDate; date <= end; date = addDays(date, 1)) {
        const tasks = getTasksForDate(date, store.activePlan);
        const result = completionForDate(date, store);
        tasks.forEach(task => { total[task.id]++; if (store.checkins[date]?.[task.id]) done[task.id]++; });
        if (result?.done > 0) totalExecutionDays++;
      }
      let streakEnd = end;
      if (end === today && completionForDate(end, store)?.ratio !== 1) streakEnd = addDays(end, -1);
      for (let date = streakEnd; date >= store.activePlan.startDate; date = addDays(date, -1)) {
        if (completionForDate(date, store)?.ratio === 1) streak++;
        else break;
      }
    }
    const goalRates = Object.fromEntries(GOAL_IDS.map(id => [id, total[id] ? Math.round(done[id] / total[id] * 100) : 0]));
    return { totalExecutionDays, streak, goalRates };
  }

  function clearAll() {
    localStorage.removeItem(STORAGE_KEY);
    Object.keys(localStorage).filter(key => key.startsWith("god-plan-habits-") || key.startsWith("god-plan-review-")).forEach(key => localStorage.removeItem(key));
  }

  function exportBackup(store = loadStore()) {
    return {
      product: PRODUCT_ID,
      exportVersion: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      data: clone(store)
    };
  }

  function validateBackup(backup) {
    if (!backup || typeof backup !== "object") return { valid: false, error: "备份文件不是有效对象" };
    if (backup.product !== PRODUCT_ID) return { valid: false, error: "这不是造神计划备份文件" };
    if (backup.exportVersion !== EXPORT_VERSION) return { valid: false, error: "备份版本暂不支持" };
    const data = backup.data;
    if (!data || data.version !== 1 || !data.checkins || Array.isArray(data.checkins) || typeof data.checkins !== "object" ||
        !data.reviews || Array.isArray(data.reviews) || typeof data.reviews !== "object" || !Array.isArray(data.archivedPlans)) {
      return { valid: false, error: "备份数据结构不完整" };
    }
    if (data.activePlan !== null && typeof data.activePlan !== "object") return { valid: false, error: "当前计划数据无效" };
    return {
      valid: true,
      summary: {
        exportedAt: backup.exportedAt,
        planName: data.activePlan?.name || "无当前计划",
        checkinDays: Object.keys(data.checkins).length,
        reviewDays: Object.keys(data.reviews).length,
        archivedPlans: data.archivedPlans.length
      }
    };
  }

  function importBackup(backup) {
    const validation = validateBackup(backup);
    if (!validation.valid) throw new Error(validation.error);
    return saveStore(clone(backup.data));
  }

  window.GodPlanStore = {
    addDays, calculateStats, clearAll, completionForDate, createPlan, defaultPlanConfig,
    exportBackup, getPlanDay, getTasksForDate, importBackup, loadStore, parseDateKey,
    saveReview, saveStore, toDateKey, toggleCheckin, validateBackup
  };
}());
