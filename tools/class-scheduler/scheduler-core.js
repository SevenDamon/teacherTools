/*
 * scheduler-core.js  (v2, 交互式)
 * 支持：固定课(批量规则+单格) / 班主任手动带班(第一层) / 其他老师自动分配(第二层)
 *       / 三粒度锁定(老师/单格/班级科目组) / 拖拽(交换·替换·固定禁覆盖) / 一键重排未锁定
 * 同时支持浏览器(window.SCHEDULER)与 Node(module.exports)。
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.SCHEDULER = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var GRADE_LABEL = { 1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六" };
  var DEFAULT_MAIN_SUBJECTS = ["语文", "数学", "英语", "科学"];

  function mainSubjectsOf(configOrState) {
    var config = configOrState && configOrState.config ? configOrState.config : configOrState;
    var list = config && config.rules && config.rules.mainSubjects;
    if (!Array.isArray(list)) return DEFAULT_MAIN_SUBJECTS;
    return list.filter(function (s, i) { return typeof s === "string" && !!s && list.indexOf(s) === i; });
  }
  function isMain(s, configOrState) { return !!s && mainSubjectsOf(configOrState).indexOf(s) >= 0; }
  function isPE(s) { return !!s && (s.indexOf("体育") >= 0 || s.indexOf("足球") >= 0 || s.indexOf("体能") >= 0); }
  function roomTypeOf(s, config) {
    if (!s) return null;
    var subjs = config && config.roomSubjs;
    if (subjs) {
      for (var t in subjs) { if (subjs[t] && subjs[t].indexOf(s) >= 0) return t; }
      return null;
    }
    if (s.indexOf("音乐") >= 0) return "music";
    if (s.indexOf("美术") >= 0) return "art";
    if (s.indexOf("计算机") >= 0 || s.indexOf("信息") >= 0) return "computer";
    if (s.indexOf("科学") >= 0) return "science";
    return null;
  }
  function classLabel(grade, idx) { return GRADE_LABEL[grade] + "(" + (idx + 1) + ")"; }

  function buildClasses(config) {
    var classes = [];
    config.grades.forEach(function (g) {
      for (var i = 0; i < g.classCount; i++) {
        classes.push({ id: "g" + g.grade + "c" + i, grade: g.grade, idx: i, label: classLabel(g.grade, i), hasSelfStudy: !!g.hasSelfStudy });
      }
    });
    return classes;
  }

  // ---------- 状态 ----------
  // 每天总节数：早读+上午+下午+晚自习（旧 config 兼容 periodsPerDay）
  function dailyTotal(c) { var n=(c.earlyReading?1:0)+(c.morning||0)+(c.afternoon||0)+(c.eveningSelfStudy?1:0); if(n>0) return n; return (c.periodsPerDay||0)>0 ? c.periodsPerDay : 6; }
  // 每天节次分段：[{label, count, startSlot, name}]，用于 UI 分块表头
  function scheduleSegments(c) {
    var segs = [], start = 0;
    // 旧配置（无 morning/afternoon）→ 全天一段，所有节都可排课
    if (!c.morning && !c.afternoon && !c.earlyReading && !c.eveningSelfStudy) {
      return [{ label:"", count:(c.periodsPerDay||6), startSlot:0, name:"第" }];
    }
    if (c.earlyReading) { segs.push({ label:"早读", count:1, startSlot:start, name:"早读" }); start += 1; }
    if (c.morning) { segs.push({ label:"上午", count:c.morning, startSlot:start, name:"上午第" }); start += c.morning; }
    if (c.afternoon) { segs.push({ label:"下午", count:c.afternoon, startSlot:start, name:"下午第" }); start += c.afternoon; }
    if (c.eveningSelfStudy) { segs.push({ label:"晚自习", count:1, startSlot:start, name:"晚自习" }); start += 1; }
    return segs;
  }
  // 该全局 slot 是否可排课（早读/晚自习不可排；旧配置全天可排）
  function isClassSlot(state, s) {
    var segs = state.segs;
    if (!segs || !segs.length) return true;
    var p = s % state.P;
    for (var i = 0; i < segs.length; i++) {
      if (segs[i].label === "早读" || segs[i].label === "晚自习") continue;
      if (p >= segs[i].startSlot && p < segs[i].startSlot + segs[i].count) return true;
    }
    return false;
  }

  // 统计 grid[cid] 在某 day 上是否已含 subj 节数（用 dailyMinMain 检查）
  function countSubjectInDay(grid, subj, day, P) {
    var n = 0, base = day * P;
    for (var k = 0; k < P; k++) { var c = grid[base + k]; if (c && c.subject === subj) n++; }
    return n;
  }

  // 兜底：把 subj 填进 cid 当天最早可腾出的非锁定非固定格；不搬动已有主科/不搬动已排好的原班课
  // 返回 [slot] 或 null 表示无法安排
  function fillDailyMinOne(grid, teacherBusy, subj, day, P, TOTAL, state, rules) {
    var baseSlot = day * P;
    // 找该 cid 班级今天一个已有同一主科任务的老师候选（任课老师）
    var teachers = state.teachers.filter(function (t) { return (t.subjects || [{ subject: t.subject }]).some(function (x) { return x.subject === subj; }); });
    if (!teachers.length) return null;
    // 选当天上午段的最早空 slot
    var candidates = [];
    for (var p = 0; p < P; p++) { var s = baseSlot + p; if (isClassSlot(state, s)) candidates.push(s); }
    candidates.sort(function (a, b) { return (a % P) - (b % P); });
    for (var i = 0; i < candidates.length; i++) {
      var s = candidates[i];
      var c = grid[s];
      if (c.fixed || c.locked) continue;
      if (c.subject === subj) return s; // 已经在那（避免无谓驱逐）
      // 直接放：找没冲突的老师
      var tid = null;
      for (var ti = 0; ti < teachers.length; ti++) {
        var t = teachers[ti];
        if (teacherBusy[t.id][s]) continue;
        // 教室容量
        var rt = roomTypeOf(subj, state.config);
        if (rt && roomCap(state, rt) && roomCount(state, rt, s) >= roomCap(state, rt)) continue;
        tid = t.id; break;
      }
      if (tid) { c.subject = subj; c.teacherId = tid; teacherBusy[tid][s] = true; return s; }
      // 找不到不冲突的 → 尝试驱逐 c.subject（旧课），把它挪到当天另一格或别的天
      if (c.subject && !c.fixed && !c.locked) {
        var oldSubj = c.subject, oldTid = c.teacherId;
        // 找一个能容纳 oldSubj 的空 slot 且该老老师不冲突
        var relocated = false;
        for (var s2 = 0; s2 < TOTAL; s2++) {
          if (s2 === s) continue;
          var c2 = grid[s2];
          if (c2.subject !== null || c2.fixed || c2.locked) continue;
          if (!isClassSlot(state, s2)) continue;
          if (oldTid && teacherBusy[oldTid][s2]) continue;
          var rt2 = roomTypeOf(oldSubj, state.config);
          if (rt2 && roomCap(state, rt2) && roomCount(state, rt2, s2) >= roomCap(state, rt2)) continue;
          // 搬
          c2.subject = oldSubj; c2.teacherId = oldTid; if (oldTid) teacherBusy[oldTid][s2] = true;
          c.subject = subj;
          // 把 subj 老师占上：找一个不冲突的老师
          for (var ti2 = 0; ti2 < teachers.length; ti2++) {
            var t2 = teachers[ti2];
            if (teacherBusy[t2.id][s]) continue;
            c.teacherId = t2.id; teacherBusy[t2.id][s] = true;
            relocated = true;
            break;
          }
          if (relocated) return s;
        }
      }
    }
    return null;
  }

  function initState(config, teachers) {
    var classes = buildClasses(config);
    var classById = {}; classes.forEach(function (c) { classById[c.id] = c; });
    var teacherById = {}; teachers.forEach(function (t) { teacherById[t.id] = t; });
    var P = dailyTotal(config);
    var TOTAL = config.days * P;
    var grid = {};
    classes.forEach(function (c) {
      var arr = new Array(TOTAL);
      for (var s = 0; s < TOTAL; s++) arr[s] = { subject: null, teacherId: null, fixed: false, locked: false, manual: false };
      grid[c.id] = arr;
    });
    return {
      config: config, teachers: teachers, classes: classes, classById: classById, teacherById: teacherById,
      grid: grid, TOTAL: TOTAL, P: P, segs: scheduleSegments(config), fixedRules: [], _lockedTeachers: {}
    };
  }

  // 默认固定课：自习/班会始终落在"下午"段的最后一节（早读/晚自习是空时段，不放默认固定课）
  function applyDefaultFixed(state) {
    var P = state.P, D = state.config.days;
    var segs = state.segs;
    var pm = null;
    for (var i = 0; i < segs.length; i++) if (segs[i].label === "下午") { pm = segs[i]; break; }
    var lastSegLastSlot = pm ? (pm.startSlot + pm.count - 1) : (segs.length ? (segs[segs.length - 1].startSlot + segs[segs.length - 1].count - 1) : (P - 1));
    state.classes.forEach(function (c) {
      if (c.hasSelfStudy) {
        for (var d = 0; d < D; d++) {
          if (d === 0) continue; // 周一留给班会
          var s = d * P + lastSegLastSlot;
          state.grid[c.id][s].subject = "自习"; state.grid[c.id][s].fixed = true;
        }
      }
      if (state.config.meeting !== false) {
        var ms = 0 * P + lastSegLastSlot; // 周一末段最后一节=班会
        state.grid[c.id][ms].subject = "班会"; state.grid[c.id][ms].fixed = true;
        var head = state.teachers.find(function (t) { return t.isHeadTeacher && t.headClass === c.id; });
        state.grid[c.id][ms].teacherId = head ? head.id : null;
      }
    });
  }

  // 单格固定 (UI：班级课表点格 -> 设为固定)
  function setFixedCell(state, cid, slot, subject, teacherId) {
    clearRulePair(state, cid, slot);
    var cell = state.grid[cid][slot];
    cell.subject = subject; cell.teacherId = teacherId || null; cell.fixed = true; cell.manual = false; cell.locked = false;
  }
  function clearFixedCell(state, cid, slot) {
    var cell = state.grid[cid][slot];
    if (!cell.fixed) return;
    cell.subject = null; cell.teacherId = null; cell.fixed = false;
  }

  // “主课 + 自习”规则生成的两个格子作为一个整体维护。
  function clearRulePair(state, cid, slot) {
    var grid = state.grid[cid], cell = grid && grid[slot];
    if (!cell || cell.ruleGenerated !== "mainFollowSelfStudy") return false;
    var otherSlot = cell.pairedSlot;
    [slot, otherSlot].forEach(function (s) {
      if (s == null || !grid[s]) return;
      var c = grid[s];
      c.subject = null; c.teacherId = null; c.fixed = false; c.locked = false; c.manual = false;
      delete c.ruleGenerated; delete c.pairRole; delete c.pairedSlot;
    });
    return true;
  }

  // ---------- 两层分配(阶段A) ----------
  function computeAssignments(state, fixedCount, occ) {
    var config = state.config;
    var wt = state.teachers.map(function (t, i) {
      var subs = (t.subjects && t.subjects.length) ? t.subjects : [{ subject: t.subject, hours: t.hours, isMain: isMain(t.subject, config) }];
      return { ref: t, id: t.id != null ? t.id : "T" + i, name: t.name != null ? t.name : ("T" + i), subjects: subs, grades: t.grades.slice(), isHead: !!t.isHeadTeacher, headClass: t.headClass };
    });
    // 已锁定/固定的课时不再重排(避免翻倍)；按 老师|科目 维度
    var remain = {};
    wt.forEach(function (t) {
      if (state._lockedTeachers && state._lockedTeachers[t.id]) { t.subjects.forEach(function (s) { remain[t.id + "|" + s.subject] = 0; }); return; }
      t.subjects.forEach(function (s) {
        var k = t.id + "|" + s.subject;
        remain[k] = Math.max(0, s.hours - (occ && occ[k] ? occ[k] : 0));
      });
    });
    function teaches(t, subj) { return t.subjects.some(function (s) { return s.subject === subj; }); }
    function remOf(t, subj) { return remain[t.id + "|" + subj] || 0; }
    var atoms = [], supplyDemand = [];
    config.grades.forEach(function (g) {
      Object.keys(g.curriculum).forEach(function (subj) {
        var needPerClass = g.curriculum[subj] | 0; if (needPerClass <= 0) return;
        for (var c = 0; c < g.classCount; c++) {
          var cid = "g" + g.grade + "c" + c;
          var fc = (fixedCount[cid + "|" + subj]) || 0;
          var need = needPerClass - fc; if (need <= 0) continue;
          // 班主任优先(仅当其带本班且教此科)；班主任独占本班该科
          var pool = wt.filter(function (t) {
            if (!teaches(t, subj)) return false;
            if (t.grades.indexOf(g.grade) < 0) return false;
            if (t.isHead && t.headClass && t.headClass !== cid) return false; // 其他班班主任不教本班
            if (t.isHead) return true; // 本班班主任独占该科
            return remOf(t, subj) > 0;
          });
          var headT = pool.find(function (t) { return t.isHead && t.headClass === cid; });
          var chosen;
          if (headT) chosen = headT; // 班主任独占本班该科，不再派他人补
          else {
            chosen = pool.length ? pool[c % pool.length] : null;
            if (!chosen || remOf(chosen, subj) <= 0) chosen = pool.find(function (t) { return remOf(t, subj) > 0; }) || null;
          }
          for (var k = 0; k < need; k++) {
            if (!chosen) { atoms.push({ classId: cid, grade: g.grade, subject: subj, teacherId: null, unassigned: true }); continue; }
            if (remOf(chosen, subj) <= 0) continue; // 课时已尽(多为锁定占用)，不再分配
            remain[chosen.id + "|" + subj] -= 1;
            atoms.push({ classId: cid, grade: g.grade, subject: subj, teacherId: chosen.id, layer: headT ? "head" : "other", unassigned: false });
          }
        }
        var demand = g.classCount * needPerClass;
        var supply = wt.filter(function (t) { return teaches(t, subj) && t.grades.indexOf(g.grade) >= 0; }).reduce(function (a, t) { return a + t.subjects.reduce(function (s, x) { return s + (x.subject === subj ? x.hours : 0); }, 0); }, 0);
        supplyDemand.push({ grade: g.grade, subject: subj, demand: demand, supply: supply, status: supply < demand ? "SHORT" : "OK" });
      });
    });
    return { atoms: atoms, supplyDemand: supplyDemand, wt: wt };
  }

  // ---------- 落位(阶段B) ----------
  function placeInto(state, atoms, fixedCount, rules, onlyT) {
    if(onlyT && !(onlyT instanceof Set)) onlyT = new Set(onlyT);
    var P = state.P, TOTAL = state.TOTAL, grid = state.grid;
    var teacherBusy = {}; state.teachers.forEach(function (t) { teacherBusy[t.id] = new Array(TOTAL).fill(false); });
    var pairMainSelfStudy = !!rules.mainFollowSelfStudy;
    function needsPair(subj) { return pairMainSelfStudy && isMain(subj, state.config); }
    function pairSlotAvailable(cid, s, tid) {
      var n = s + 1;
      if (n >= TOTAL || Math.floor(n / P) !== Math.floor(s / P) || !isClassSlot(state, n)) return false;
      var next = grid[cid][n];
      return !!next && next.subject === null && !next.fixed && !next.locked && !teacherBusy[tid][n];
    }
    function placeCourse(cid, s, subj, tid) {
      var cell = grid[cid][s];
      cell.subject = subj; cell.teacherId = tid; teacherBusy[tid][s] = true;
      if (!needsPair(subj)) return;
      var n = s + 1, next = grid[cid][n];
      cell.locked = true; cell.ruleGenerated = "mainFollowSelfStudy"; cell.pairRole = "main"; cell.pairedSlot = n;
      next.subject = "自习"; next.teacherId = tid; next.locked = true; next.manual = false;
      next.ruleGenerated = "mainFollowSelfStudy"; next.pairRole = "selfStudy"; next.pairedSlot = s;
      teacherBusy[tid][n] = true;
    }
    // 固定/锁定格先占(防双开)
    state.classes.forEach(function (c) {
      for (var s = 0; s < TOTAL; s++) { var cell = grid[c.id][s]; if ((cell.fixed || cell.locked) && cell.teacherId) teacherBusy[cell.teacherId][s] = true; }
    });

    // 任务聚合
    var tasks = {};
    atoms.forEach(function (a) {
      if (a.unassigned) return;
      var key = a.classId + "|" + a.teacherId + "|" + a.subject;
      if (!tasks[key]) tasks[key] = { classId: a.classId, teacherId: a.teacherId, subject: a.subject, count: 0 };
      tasks[key].count++;
    });
    var taskArr = Object.keys(tasks).map(function (k) { return tasks[k]; });
    taskArr.sort(function (a, b) { return (isMain(b.subject, state.config) ? 1 : 0) - (isMain(a.subject, state.config) ? 1 : 0); });

    taskArr.forEach(function (task) {
      var cid = task.classId, tid = task.teacherId, subj = task.subject;
      var avail = [];
      for (var s = 0; s < TOTAL; s++) { var cell = grid[cid][s]; if (!cell.fixed && !cell.locked && isClassSlot(state, s)) avail.push(s); }
      if (rules.peNotFirst && isPE(subj)) avail = avail.filter(function (s) { return (s % P) !== 0; });
      var order = avail.slice().sort(function (a, b) { return ((a % P) < P - 2 ? 0 : 1) - ((b % P) < P - 2 ? 0 : 1); });
      var dailyMin = !!(rules.dailyMinMain && rules.dailyMinMain[subj] && isMain(subj, state.config));
      function pickBestSlot() {
        // 返回 order 中"打分最高（最小）"且未被 teacherBusy/容量/已占用拦截的位置
        var bestS = -1, bestScore = 1e9;
        for (var j = 0; j < order.length; j++) {
          var s = order[j];
          if (grid[cid][s].subject !== null) continue;
          if (grid[cid][s].fixed || grid[cid][s].locked) continue;
          if (teacherBusy[tid][s]) continue;
          if (needsPair(subj) && !pairSlotAvailable(cid, s, tid)) continue;
          var _rt = roomTypeOf(subj, state.config);
          if (_rt && roomCap(state, _rt) && roomCount(state, _rt, s) >= roomCap(state, _rt)) continue;
          if (rules.noBackToBackSame) { var p = s % P; if (p > 0 && grid[cid][s - 1].subject === subj) continue; if (p < P - 1 && grid[cid][s + 1].subject === subj) continue; }
          if (rules.peNoConsecutive && isPE(subj)) { var p = s % P; if (p > 0 && isPE(grid[cid][s - 1].subject)) continue; if (p < P - 1 && isPE(grid[cid][s + 1].subject)) continue; }
          var score = 0;
          if (dailyMin) {
            var dA = Math.floor(s / P);
            var cntA = 0; for (var kk = 0; kk < P; kk++) if (grid[cid][dA * P + kk].subject === subj) cntA++;
            // 0 次的天优先；其次 1 次；用 (cntA, 上下午) 作为分数
            score = cntA * 100 + (s % P < P - 2 ? 0 : 1);
          } else {
            score = (s % P < P - 2 ? 0 : 1);
          }
          if (score < bestScore) { bestScore = score; bestS = s; if (score === 0) break; }
        }
        return bestS;
      }
      var taken = 0;
      while (taken < task.count) {
        var s = pickBestSlot();
        if (s < 0) break;
        placeCourse(cid, s, subj, tid); taken++;
      }
      task._short = task.count - taken;
    });

    // 修复Pass：补漏(硬约束优先，软规则兜底)
    var shortList = [];
    state.config.grades.forEach(function (g) {
      for (var ci = 0; ci < g.classCount; ci++) {
        var cid = "g" + g.grade + "c" + ci;
        Object.keys(g.curriculum).forEach(function (subj) {
          var need = g.curriculum[subj] | 0; if (need <= 0) return;
          var fc = (fixedCount[cid + "|" + subj]) || 0;
          var placed = grid[cid].filter(function (x) { return x.subject === subj; }).length;
          var shortN = need - placed - fc;
          if (shortN > 0) shortList.push({ classId: cid, grade: g.grade, subject: subj, short: shortN });
        });
      }
    });
    // onlyT 模式下，补漏只在 onlyT 老师所教科目范围内找（防止越界补漏超课时）
    if (onlyT) {
      var onlyTSubjs = {};
      state.teachers.forEach(function (t) { if (onlyT.has(t.id)) t.subjects.forEach(function (s) { onlyTSubjs[s.subject] = true; }); });
      shortList = shortList.filter(function (it) { return !!onlyTSubjs[it.subject]; });
    }
    // 已排课时统计 + 课时上限查询（补漏按 老师|科目 上限拦截，防止锁定/缩课时后被补漏越排）
    var placedMap = {};
    state.classes.forEach(function (c) { for (var s2 = 0; s2 < TOTAL; s2++) { var cl = grid[c.id][s2]; if (cl.teacherId && cl.subject) placedMap[cl.teacherId + "|" + cl.subject] = (placedMap[cl.teacherId + "|" + cl.subject] || 0) + 1; } });
    function hoursOf(tid, subj) { var t = state.teacherById[tid]; if (!t) return Infinity; var subs = t.subjects || [{ subject: t.subject, hours: t.hours }]; for (var i = 0; i < subs.length; i++) if (subs[i].subject === subj) return subs[i].hours; return 0; }
    var atomTeacher = {};
    atoms.forEach(function (a) { if (a.teacherId) atomTeacher[a.classId + "|" + a.subject] = a.teacherId; });
    function findFree(subj, grade, s) {
      var list = state.teachers.filter(function (t) { return (t.subjects || [{ subject: t.subject }]).some(function (x) { return x.subject === subj; }) && t.grades.indexOf(grade) >= 0; });
      if (onlyT) list = list.filter(function (t) { return onlyT.has(t.id); });
      for (var i = 0; i < list.length; i++) { var tid = list[i].id; if ((placedMap[tid + "|" + subj] || 0) >= hoursOf(tid, subj)) continue; if (teacherBusy[tid][s]) continue; var rt = roomTypeOf(subj, state.config); if (rt && roomCap(state, rt) && roomCount(state, rt, s) >= roomCap(state, rt)) continue; return tid; }
      return null;
    }
    shortList.forEach(function (item) {
      var Tid = atomTeacher[item.classId + "|" + item.subject];
      var rtT = roomTypeOf(item.subject, state.config);
      for (var n = 0; n < item.short; n++) {
        var done = false;
        var empty = [], occ = [];
        for (var s = 0; s < TOTAL; s++) { var cell = grid[item.classId][s]; if (cell.fixed || cell.locked || !isClassSlot(state, s)) continue; if (cell.subject === null) empty.push(s); else occ.push(s); }
        var mf = function (a, b) { return ((a % P) < P - 2 ? 0 : 1) - ((b % P) < P - 2 ? 0 : 1); };
        empty.sort(mf); occ.sort(mf);
        var order = empty.concat(occ);
        for (var oi = 0; oi < order.length && !done; oi++) {
          var s = order[oi];
          if (Tid && teacherBusy[Tid][s]) continue;
          if (rtT && roomCap(state, rtT) && roomCount(state, rtT, s) >= roomCap(state, rtT)) continue;
          if (rules.peNotFirst && isPE(item.subject) && (s % P) === 0) continue;
          // mainMorning 为软规则：order 已按上午优先排序，这里不再硬性禁止主科落下午（否则主科在上午被占满时永远补不上）
          if (rules.noBackToBackSame) { var p = s % P; if (p > 0 && grid[item.classId][s - 1].subject === item.subject) continue; if (p < P - 1 && grid[item.classId][s + 1].subject === item.subject) continue; }
          if (rules.peNoConsecutive && isPE(item.subject)) { var p = s % P; if (p > 0 && isPE(grid[item.classId][s - 1].subject)) continue; if (p < P - 1 && isPE(grid[item.classId][s + 1].subject)) continue; }
          var tid = null;
          if (Tid && (placedMap[Tid + "|" + item.subject] || 0) < hoursOf(Tid, item.subject)) tid = Tid;
          if (!tid) tid = findFree(item.subject, item.grade, s);
          if (!tid) continue;
          if (needsPair(item.subject) && !pairSlotAvailable(item.classId, s, tid)) continue;
          if (grid[item.classId][s].subject === null) {
            placeCourse(item.classId, s, item.subject, tid); placedMap[tid + "|" + item.subject] = (placedMap[tid + "|" + item.subject] || 0) + 1; done = true; break;
          }
          // 成对课块不能通过单格驱逐来补，否则会留下孤立的主课或自习。
          if (needsPair(item.subject)) continue;
          // 占用 -> 尝试把 X 换到别处(固定/锁定不许动；主科不落末两节优先)
          var X = grid[item.classId][s].subject, Xtid = grid[item.classId][s].teacherId;
          if (grid[item.classId][s].fixed || grid[item.classId][s].locked) continue;
          var rtX = roomTypeOf(X, state.config), evict = -1, evictFb = -1;
          for (var s2 = 0; s2 < TOTAL; s2++) {
            if (s2 === s) continue;
            if (!isClassSlot(state, s2)) continue;
            var c2 = grid[item.classId][s2];
            if (c2.subject !== null || c2.fixed || c2.locked) continue;
            if (teacherBusy[Xtid][s2]) continue;
            if (rtX && roomCap(state, rtX) && roomCount(state, rtX, s2) >= roomCap(state, rtX)) continue;
            if (rules.peNotFirst && isPE(X) && (s2 % P) === 0) continue;
            if (rules.mainMorning && isMain(X, state.config) && (s2 % P) >= P - 2) { if (evictFb < 0) evictFb = s2; continue; }
            evict = s2; break;
          }
          var use = evict >= 0 ? evict : evictFb;
          if (use >= 0) {
            grid[item.classId][use].subject = X; grid[item.classId][use].teacherId = Xtid; teacherBusy[Xtid][use] = true;
            grid[item.classId][s].subject = null; grid[item.classId][s].teacherId = null; teacherBusy[Xtid][s] = false;
            grid[item.classId][s].subject = item.subject; grid[item.classId][s].teacherId = tid; teacherBusy[tid][s] = true; placedMap[tid + "|" + item.subject] = (placedMap[tid + "|" + item.subject] || 0) + 1; done = true;
          }
        }
      }
    });

    // 阶段 D：每日最少主科数兜底（dailyMinMain）
    // 只对已启用且本年级课程里出现的主科做强制保证；遍历每 (cid, day) 找缺的那天
    // 把该主科任务的下一节挤进当天最早可腾出格（不碰固定/锁定，必要时驱逐非主科）
    if (rules.dailyMinMain && !pairMainSelfStudy) {
      var dmmSubjs = Object.keys(rules.dailyMinMain).filter(function (s) { return rules.dailyMinMain[s] && isMain(s, state.config); });
      state.config.grades.forEach(function (g0) {
        var subjectsHere = dmmSubjs.filter(function (s) { return (g0.curriculum[s] | 0) > 0; });
        if (!subjectsHere.length) return;
        subjectsHere.forEach(function (subj) {
          var pool = atoms.filter(function (a) { return a.classId && a.grade === g0.grade && a.subject === subj; });
          if (!pool.length) return;
          // 每班级：扫每天；缺该主科则强行排一节进当天的最早可用非锁定格
          for (var ci = 0; ci < g0.classCount; ci++) {
            var cid0 = "g" + g0.grade + "c" + ci;
            for (var day = 0; day < state.config.days; day++) {
              if (countSubjectInDay(grid[cid0], subj, day, state.P) >= 1) continue;
              fillDailyMinOne(grid[cid0], teacherBusy, subj, day, state.P, TOTAL, state, rules);
            }
          }
        });
      });
    }

    // 统计漏排
    var unscheduled = [];
    state.config.grades.forEach(function (g) {
      for (var ci = 0; ci < g.classCount; ci++) {
        var cid = "g" + g.grade + "c" + ci;
        Object.keys(g.curriculum).forEach(function (subj) {
          var need = g.curriculum[subj] | 0; if (need <= 0) return;
          var fc = (fixedCount[cid + "|" + subj]) || 0;
          var placed = grid[cid].filter(function (x) { return x.subject === subj; }).length;
          if (placed + fc < need) unscheduled.push({ classId: cid, subject: subj, need: need, placed: placed + fc });
        });
      }
    });
    return unscheduled;
  }

  function roomCount(state, rt, slot) {
    var cnt = 0;
    state.classes.forEach(function (c) { if (roomTypeOf(state.grid[c.id][slot].subject, state.config) === rt) cnt++; });
    return cnt;
  }
  // 教室容量：>0 才约束；0 或未配置 = 不约束（普通教室上）
  function roomCap(state, rt) { var c = state.config.rooms[rt]; return (c > 0) ? c : 0; }

  // 固定占用统计
  function computeFixedCount(state) {
    var fc = {};
    state.classes.forEach(function (c) {
      for (var s = 0; s < state.TOTAL; s++) { var cell = state.grid[c.id][s]; if (cell.fixed && cell.subject) fc[c.id + "|" + cell.subject] = (fc[c.id + "|" + cell.subject] || 0) + 1; }
    });
    return fc;
  }

  // ---------- 一键重排 ----------
  function autoSchedule(state, opts) {
    opts = opts || {};
    var rules = state.config.rules || {};
    var onlyT = opts.teachers; // Set<id> 或 undefined
    var fixedCount = computeFixedCount(state);
    // 计算每老师每科目已在 锁定/固定 格占用的课时，重排时按 老师|科目 扣除
    var occ = {};
    state.classes.forEach(function (c) { for (var s = 0; s < state.TOTAL; s++) { var cell = state.grid[c.id][s]; if ((cell.fixed || cell.locked) && cell.teacherId && cell.subject) occ[cell.teacherId + "|" + cell.subject] = (occ[cell.teacherId + "|" + cell.subject] || 0) + 1; } });

    // 清空受影响格(未锁定非固定)
    state.classes.forEach(function (c) {
      for (var s = 0; s < state.TOTAL; s++) {
        var cell = state.grid[c.id][s];
        if (cell.fixed || cell.locked) continue;
        if (onlyT) { if (cell.teacherId && onlyT.has(cell.teacherId)) { cell.subject = null; cell.teacherId = null; cell.manual = false; } }
        else { cell.subject = null; cell.teacherId = null; cell.manual = false; }
      }
    });

    var assign = computeAssignments(state, fixedCount, occ);
    var atoms = assign.atoms;
    if (onlyT) atoms = atoms.filter(function (a) { return onlyT.has(a.teacherId); });
    var unscheduled = placeInto(state, atoms, fixedCount, rules, onlyT);
    state._lastSupply = assign.supplyDemand;
    state._lastUnscheduled = unscheduled;
    return state;
  }

  // ---------- 手动操作(拖拽) ----------
  function placeManual(state, cid, slot, teacherId, subject) {
    var cell = state.grid[cid][slot];
    if (cell.fixed || cell.locked) return false; // 固定/锁定课禁覆盖
    var pairRule = !!(state.config.rules && state.config.rules.mainFollowSelfStudy && isMain(subject, state.config));
    if (pairRule) {
      var nextSlot = slot + 1;
      if (nextSlot >= state.TOTAL || Math.floor(nextSlot / state.P) !== Math.floor(slot / state.P) || !isClassSlot(state, nextSlot)) return false;
      var next = state.grid[cid][nextSlot];
      if (!next || next.subject !== null || next.fixed || next.locked) return false;
      // 同一老师在主课和下一节都不能已被其他班占用。
      for (var ci = 0; ci < state.classes.length; ci++) {
        var otherCid = state.classes[ci].id;
        if (otherCid !== cid && (state.grid[otherCid][slot].teacherId === teacherId || state.grid[otherCid][nextSlot].teacherId === teacherId)) return false;
      }
      cell.subject = subject; cell.teacherId = teacherId; cell.manual = true; cell.locked = true;
      cell.ruleGenerated = "mainFollowSelfStudy"; cell.pairRole = "main"; cell.pairedSlot = nextSlot;
      next.subject = "自习"; next.teacherId = teacherId; next.manual = false; next.locked = true;
      next.ruleGenerated = "mainFollowSelfStudy"; next.pairRole = "selfStudy"; next.pairedSlot = slot;
      return true;
    }
    cell.subject = subject; cell.teacherId = teacherId; cell.manual = true; cell.locked = false;
    return true;
  }
  function swapCells(state, cid, a, b) {
    var ca = state.grid[cid][a], cb = state.grid[cid][b];
    if (ca.fixed || cb.fixed || ca.locked || cb.locked) return false;
    var tmpS = ca.subject, tmpT = ca.teacherId, tmpM = ca.manual;
    ca.subject = cb.subject; ca.teacherId = cb.teacherId; ca.manual = cb.manual;
    cb.subject = tmpS; cb.teacherId = tmpT; cb.manual = tmpM;
    return true;
  }

  // ---------- 锁定 ----------
  function lockTeacher(state, tid) {
    state._lockedTeachers[tid] = true;
    state.classes.forEach(function (c) { for (var s = 0; s < state.TOTAL; s++) { var cell = state.grid[c.id][s]; if (cell.teacherId === tid && !cell.fixed) cell.locked = true; } });
  }
  function unlockTeacher(state, tid) {
    delete state._lockedTeachers[tid];
    state.classes.forEach(function (c) { for (var s = 0; s < state.TOTAL; s++) { var cell = state.grid[c.id][s]; if (cell.teacherId === tid && !cell.ruleGenerated) cell.locked = false; } });
  }
  function lockCell(state, cid, slot) { if (!state.grid[cid][slot].fixed) state.grid[cid][slot].locked = true; }
  function unlockCell(state, cid, slot) { if (!state.grid[cid][slot].ruleGenerated) state.grid[cid][slot].locked = false; }
  function lockSubjectGroup(state, cid, subj) {
    for (var s = 0; s < state.TOTAL; s++) { var cell = state.grid[cid][s]; if (cell.subject === subj && !cell.fixed) cell.locked = true; }
  }
  function unlockSubjectGroup(state, cid, subj) {
    for (var s = 0; s < state.TOTAL; s++) { var cell = state.grid[cid][s]; if (cell.subject === subj && !cell.ruleGenerated) cell.locked = false; }
  }

  // ---------- 校验 / 导出 ----------
  function validate(state) {
    var P = state.P, TOTAL = state.TOTAL, issues = [];
    Object.keys(state.config.rooms || {}).forEach(function (rt) {
      if (!state.config.rooms[rt]) return;
      var nm = (state.config.roomNames && state.config.roomNames[rt]) || rt;
      for (var s = 0; s < TOTAL; s++) {
        var cnt = 0; state.classes.forEach(function (c) { if (roomTypeOf(state.grid[c.id][s].subject, state.config) === rt) cnt++; });
        if (cnt > state.config.rooms[rt]) issues.push("教室超额：" + nm + " 第" + (Math.floor(s / P) + 1) + "天第" + (s % P + 1) + "节 需" + cnt + "间/仅" + state.config.rooms[rt]);
      }
    });
    // 每日主科存在性检查
    var dmm = (state.config.rules && state.config.rules.dailyMinMain) || {};
    var dmmKeys = Object.keys(dmm).filter(function (k) { return dmm[k] && isMain(k, state.config); });
    if (dmmKeys.length) {
      state.classes.forEach(function (c) {
        dmmKeys.forEach(function (subj) {
          var gr = c.grade;
          var g = state.config.grades.find(function (x) { return x.grade === gr; });
          if (!g || (g.curriculum[subj] | 0) <= 0) return;
          for (var day = 0; day < state.config.days; day++) {
            if (countSubjectInDay(state.grid[c.id], subj, day, P) < 1) {
              issues.push("每日主科未达：班级 " + c.label + " 第" + (day + 1) + "天无 " + subj);
            }
          }
        });
      });
    }
    // “主课后跟自习”成对完整性检查。
    if (state.config.rules && state.config.rules.mainFollowSelfStudy) {
      state.classes.forEach(function (c) {
        for (var s = 0; s < TOTAL; s++) {
          var cell = state.grid[c.id][s];
          if (!isMain(cell.subject, state.config)) continue;
          var n = s + 1, next = n < TOTAL ? state.grid[c.id][n] : null;
          if (!next || Math.floor(n / P) !== Math.floor(s / P) || next.subject !== "自习" || next.teacherId !== cell.teacherId) {
            issues.push("主课跟自习未达：班级 " + c.label + " 第" + (Math.floor(s / P) + 1) + "天第" + (s % P + 1) + "节 " + cell.subject);
          }
        }
      });
    }
    return issues;
  }

  function buildTeacherTimetable(state) {
    var TOTAL = state.TOTAL, tt = {};
    state.classes.forEach(function (c) {
      for (var s = 0; s < TOTAL; s++) {
        var cell = state.grid[c.id][s];
        if (!cell.subject || !cell.teacherId) continue;
        if (!tt[cell.teacherId]) tt[cell.teacherId] = new Array(TOTAL).fill(null);
        tt[cell.teacherId][s] = c.label + "\n" + cell.subject;
      }
    });
    return tt;
  }

  function generatePilotTeachers(config) {
    var teachers = [], letter = 0;
    function nextName() { letter++; return String.fromCharCode(64 + letter); }
    config.grades.forEach(function (g) {
      Object.keys(g.curriculum).forEach(function (subj) {
        var need = g.curriculum[subj] | 0; if (need <= 0) return;
        var n = Math.max(1, Math.round((g.classCount * need) / 14));
        var cnt = new Array(n).fill(0);
        for (var c = 0; c < g.classCount; c++) cnt[c % n]++;
        for (var i = 0; i < n; i++) { var h = cnt[i] * need; if (h <= 0) continue; teachers.push({ id: "P" + g.grade + subj + i, name: nextName(), subject: subj, subjects: [{ subject: subj, hours: h, isMain: isMain(subj, config) }], grades: [g.grade], hours: h }); }
      });
    });
    return teachers;
  }

  return {
    initState: initState, applyDefaultFixed: applyDefaultFixed, setFixedCell: setFixedCell, clearFixedCell: clearFixedCell,
    autoSchedule: autoSchedule, placeManual: placeManual, swapCells: swapCells, clearRulePair: clearRulePair,
    lockTeacher: lockTeacher, unlockTeacher: unlockTeacher, lockCell: lockCell, unlockCell: unlockCell,
    lockSubjectGroup: lockSubjectGroup, unlockSubjectGroup: unlockSubjectGroup,
    validate: validate, buildTeacherTimetable: buildTeacherTimetable, generatePilotTeachers: generatePilotTeachers,
    buildClasses: buildClasses, roomTypeOf: roomTypeOf, isPE: isPE, isMain: isMain, mainSubjectsOf: mainSubjectsOf, computeFixedCount: computeFixedCount,
    dailyTotal: dailyTotal, scheduleSegments: scheduleSegments
  };
});
