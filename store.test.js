const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const data = {};
const localStorage = {
  getItem: key => data[key] ?? null,
  setItem: (key, value) => { data[key] = String(value); },
  removeItem: key => { delete data[key]; },
  key: index => Object.keys(data)[index],
  get length() { return Object.keys(data).length; }
};
const context = { window: {}, localStorage, Date, console };
vm.createContext(context);
vm.runInContext(fs.readFileSync("store.js", "utf8"), context);
const GP = context.window.GodPlanStore;

let store = GP.loadStore();
const config = GP.defaultPlanConfig();
config.startDate = "2026-06-08";
GP.createPlan(config, store);
store = GP.loadStore();

assert.equal(GP.getPlanDay("2026-06-08", store.activePlan).week, 1);
assert.equal(GP.getPlanDay("2026-06-15", store.activePlan).week, 2);
assert.equal(GP.getPlanDay("2026-07-20", store.activePlan).state, "ended");
assert(GP.getTasksForDate("2026-06-09", store.activePlan).some(task => task.id === "swim"));
assert(!GP.getTasksForDate("2026-06-10", store.activePlan).some(task => task.id === "swim"));

GP.toggleCheckin("2026-06-08", "read", store);
GP.saveReview("2026-06-08", { work: "完成核心功能" }, store);
store = GP.loadStore();
assert.equal(store.checkins["2026-06-08"].review, true);
assert.equal(GP.completionForDate("2026-06-08", store).done, 2);
GP.toggleCheckin("2026-06-08", "pushup", store);
store = GP.loadStore();
assert.equal(GP.calculateStats(store, "2026-06-09").streak, 1);
const next = GP.defaultPlanConfig();
next.startDate = "2026-08-01";
GP.createPlan(next, store);
store = GP.loadStore();
assert.equal(store.archivedPlans.length, 1);
assert(store.archivedPlans[0].checkins["2026-06-08"]);
GP.saveKnowledgeCard({
  insight: "输出能加深理解",
  ownWords: "只有能解释和使用，才算真正学会",
  application: "明天向朋友解释今天学到的内容",
  applyDate: "2026-08-02",
  status: "pending",
  result: ""
}, store);
store = GP.loadStore();
assert.equal(store.knowledgeCards.length, 1);
assert(store.knowledgeCards[0].id);
assert.equal(GP.getKnowledgeSummary(store, "2026-08-02").pendingApplication, 1);
const firstReviewDate = store.knowledgeCards[0].reviewDates[0];
GP.markKnowledgeReviewed(store.knowledgeCards[0].id, "2099-01-01", store);
store = GP.loadStore();
assert(store.knowledgeCards[0].reviewedDates.includes(firstReviewDate));
assert.equal(GP.getKnowledgeSummary(store, "2099-01-01").dueReview, 0);
const backup = GP.exportBackup(store);
assert.equal(backup.product, "god-plan");
assert.equal(GP.validateBackup(backup).valid, true);
assert.equal(GP.validateBackup({ product: "other", exportVersion: 1, data: store }).valid, false);
assert.throws(() => GP.importBackup({ product: "god-plan", exportVersion: 99, data: store }));
GP.clearAll();
assert.equal(GP.loadStore().activePlan, null);
GP.importBackup(backup);
assert.equal(GP.loadStore().activePlan.name, store.activePlan.name);
assert.equal(GP.loadStore().knowledgeCards.length, 1);

console.log("全部核心数据规则测试通过。");
