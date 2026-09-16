/* ============ UI 逻辑 ============ */
var S = window.SCHEDULER;
/* 页面内提示（替代 alert，避免 iframe 拦截导致"没反应"） */
function toast(msg, type){
  var t=document.getElementById("appToast");
  if(!t){ t=document.createElement("div"); t.id="appToast"; t.className="toast"; document.body.appendChild(t); }
  t.textContent=msg;
  t.className="toast "+(type||"ok");
  t.style.display="block";
  clearTimeout(t._tm);
  t._tm=setTimeout(function(){ t.style.display="none"; }, 4200);
}
var APP = { config:null, teachers:[], state:null, view:"class", selTeacher:null, selClass:null, dragTeacher:null, ctxCell:null, leftGrade:"all", leftSearch:"", leftSubject:"" };
var LS_KEY = "scheduler_v2_state";
var ALL_SUBJECTS = ["语文","数学","英语","科学","体育与健康","音乐","美术","足球","体能","劳动","道德与法治","综合与实践","书法","信息","计算机","自习","班会"];

function defaultConfig(){
  return {
    days:5, morning:3, afternoon:3, earlyReading:false, eveningSelfStudy:false,
    grades:[
      {grade:1,classCount:15,hasSelfStudy:true,curriculum:{语文:5,数学:4,"体育与健康":3,"道德与法治":2,音乐:2,足球:1,"综合与实践":1,美术:2,体能:1,劳动:1,科学:1,书法:1}},
      {grade:2,classCount:17,hasSelfStudy:false,curriculum:{语文:5,数学:4,英语:3,"道德与法治":2,音乐:2,美术:2,科学:2,劳动:1,"信息":1}},
      {grade:3,classCount:23,hasSelfStudy:false,curriculum:{语文:5,数学:4,英语:3,"道德与法治":2,音乐:2,美术:2,科学:2,劳动:1,"信息":1}},
      {grade:4,classCount:23,hasSelfStudy:false,curriculum:{语文:5,数学:4,英语:3,"道德与法治":2,音乐:2,美术:2,科学:2,劳动:1,"信息":1}},
      {grade:5,classCount:11,hasSelfStudy:false,curriculum:{语文:5,数学:4,英语:3,"道德与法治":2,音乐:2,美术:2,科学:2,劳动:1,"信息":1}},
      {grade:6,classCount:10,hasSelfStudy:false,curriculum:{语文:5,数学:4,英语:3,"道德与法治":2,音乐:2,美术:2,科学:2,劳动:1,"信息":1}}
    ],
    rooms:{music:2,art:2,computer:2,science:1},
    roomNames:{music:"音乐教室",art:"美术教室",computer:"计算机教室",science:"科学实验室"},
    roomSubjs:{music:["音乐"],art:["美术"],computer:["计算机","信息"],science:["科学"]},
    meeting:true,
    headMaxSubj:1,
    otherMaxSubj:2,
    rules:{mainSubjects:["语文","数学","英语","科学"],mainMorning:true,noBackToBackSame:true,peNotFirst:true,peNoConsecutive:true,mainFollowSelfStudy:false,balance:true}
  };
}

function classIdFromLabel(label){
  var m = label.match(/^([一二三四五六])\((\d+)\)$/); if(!m) return null;
  var gm={"一":1,"二":2,"三":3,"四":4,"五":5,"六":6};
  var g=gm[m[1]], idx=parseInt(m[2],10)-1;
  return "g"+g+"c"+idx;
}
/* 多科目辅助 */
function isMainSubject(subj){ return S.isMain(subj, APP.config); }
function subjListOf(t){ return (t && t.subjects && t.subjects.length) ? t.subjects : [{subject:t.subject, hours:t.hours, isMain:isMainSubject(t.subject)}]; }
function primarySubjectOf(t){ var s=subjListOf(t); return s[0]; }
function totalHoursOf(t){ return subjListOf(t).reduce(function(a,x){return a+(x.hours||0);},0); }
function subjLabelOf(t){ return subjListOf(t).map(function(x){return x.subject;}).join(" / "); }
function syncTeacherMainFlags(){
  APP.teachers.forEach(function(t){ subjListOf(t).forEach(function(s){ s.isMain=isMainSubject(s.subject); }); });
}
function teacherPlaced(tid){
  if(!APP.state) return 0;
  var n=0; APP.state.classes.forEach(function(c){ APP.state.grid[c.id].forEach(function(cell){ if(cell.teacherId===tid && !cell.fixed && cell.pairRole!=="selfStudy") n++; }); });
  return n;
}
function showTeacherTip(t, el){
  var tip=document.getElementById("teacherTip");
  var st=APP.state;
  var classes=[];
  if(st){ st.classes.forEach(function(c){ if(st.grid[c.id].some(function(cell){return cell.teacherId===t.id;})) classes.push(c.label); }); }
  var subs=subjListOf(t);
  var html='<h4>'+t.name+(t.isHeadTeacher?(' · 班主任('+(st&&st.classById[t.headClass]?st.classById[t.headClass].label:'')+')'):'')+'</h4>';
  html+='<div class="r"><span>周课时</span><span class="m">'+totalHoursOf(t)+' · 已排 '+(st?teacherPlaced(t.id):0)+'</span></div>';
  subs.forEach(function(s,i){ html+='<div class="r"><span>'+s.subject+'</span><span class="m">'+(i===0?'主教':'兼教')+' · '+(isMainSubject(s.subject)?'主科':'非主科')+' '+s.hours+'节</span></div>'; });
  html+='<div class="sec r"><span>任教年级</span><span class="m">'+t.grades.map(function(g){return g+'年级';}).join('、')+'</span></div>';
  html+='<div class="r"><span>任教班级</span><span class="m">'+(classes.length?classes.join('、'):'尚未排课')+'</span></div>';
  tip.innerHTML=html;
  tip.style.display='block';
  var r=el.getBoundingClientRect();
  var tw=tip.offsetWidth, th=tip.offsetHeight;
  var left=r.right+8, top=r.top;
  if(left+tw>window.innerWidth) left=Math.max(8,r.left-tw-8);
  if(top+th>window.innerHeight) top=Math.max(8,window.innerHeight-th-8);
  tip.style.left=left+'px'; tip.style.top=top+'px';
}
function hideTeacherTip(){ var tip=document.getElementById("teacherTip"); if(tip) tip.style.display='none'; }

function render(){ renderLeft(); renderRight(); }

/* ---- 渲染左侧 ---- */
function ensureFilters(){
  var box=document.getElementById("leftFilters"); if(!box) return;
  if(box.children.length) return; // 已构建则复用
  var map={all:"全部",1:"一",2:"二",3:"三",4:"四",5:"五",6:"六"};
  var tabs=document.createElement("div"); tabs.className="grade-tabs";
  ["all",1,2,3,4,5,6].forEach(function(g){
    var b=document.createElement("button"); b.textContent=map[g]; b.dataset.g=g;
    b.className=APP.leftGrade===g?"on":"";
    b.onclick=function(){
      APP.leftGrade=g;
      if(APP.state && g!=="all"){
        var gNum=parseInt(g,10);
        var first=APP.state.classes.find(function(c){ return c.grade===gNum; });
        if(first) APP.selClass=first.id;
      }
      updateFilterTab(); render();
    };
    tabs.appendChild(b);
  });
  var search=document.createElement("input"); search.type="text"; search.placeholder="搜索姓名 / 科目";
  search.value=APP.leftSearch;
  search.oninput=function(){ APP.leftSearch=this.value.trim().toLowerCase(); renderLeftList(); };
  var subjSel=document.createElement("select");
  subjSel.style.cssText="width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:6px;font-size:12px;background:#fff;";
  subjSel.innerHTML='<option value="">全部学科（班级课表）</option>'+ALL_SUBJECTS.map(function(s){return '<option value="'+s+'">'+s+'</option>';}).join("");
  subjSel.value=APP.leftSubject;
  subjSel.onchange=function(){ APP.leftSubject=this.value; render(); };
  box.appendChild(tabs); box.appendChild(subjSel); box.appendChild(search);
}
function updateFilterTab(){
  var tabs=document.querySelectorAll(".grade-tabs button");
  tabs.forEach(function(b){ b.className=b.dataset.g===""+APP.leftGrade?"on":""; });
}
function renderLeftList(){
  var list=document.getElementById("leftList"); if(!list) return; list.innerHTML="";
  var grade=APP.leftGrade;
  var kw=APP.leftSearch;
  var filtered=APP.teachers.filter(function(t){
    var gOk=(grade==="all" || t.grades.indexOf(parseInt(grade,10))>=0);
    var sOk=!APP.leftSubject || subjListOf(t).some(function(s){ return s.subject===APP.leftSubject; });
    var kOk=!kw || t.name.toLowerCase().indexOf(kw)>=0 || subjLabelOf(t).toLowerCase().indexOf(kw)>=0;
    return gOk && sOk && kOk;
  });
  var hd=document.createElement("div"); hd.className="left-hd";
  hd.innerHTML='<span>教师池 <b>'+filtered.length+'</b> / '+APP.teachers.length+'</span><span style="font-size:11px">'+(APP.leftSubject?'该学科老师':'拖入右侧课表')+'</span>';
  list.appendChild(hd);
  filtered.forEach(function(t){
    var d=document.createElement("div");
    d.className="item"+(APP.selTeacher===t.id?" sel":"");
    d.draggable=true;
    d.ondragstart=function(e){ APP.dragTeacher=t.id; e.dataTransfer.setData("text/plain",t.id); e.dataTransfer.effectAllowed="copy"; };
    var placed=teacherPlaced(t.id);
    var headTag="";
    if(t.isHeadTeacher){
      var cl=(APP.state && APP.state.classById[t.headClass])?APP.state.classById[t.headClass].label:"";
      headTag='<span class="tag head">班主任'+(t.headClass?"·"+cl:"")+'</span>';
    }
    var locked=APP.state && APP.state._lockedTeachers[t.id]?'<span class="tag">已锁</span>':"";
    d.innerHTML='<div class="nm">'+t.name+headTag+locked+'</div><div class="row2"><div class="sb">'+subjLabelOf(t)+'</div><div class="sb">'+placed+'/'+totalHoursOf(t)+'节</div></div>';
    d.onclick=function(){ APP.selTeacher=t.id; render(); };
    d.ondblclick=function(){ APP.view="teacher"; APP.selTeacher=t.id; updateViewSeg(); render(); };
    d.onmouseenter=function(){ var tt=t; clearTimeout(APP._tipTimer); APP._tipTimer=setTimeout(function(){ showTeacherTip(tt,d); }, 800); };
    d.onmouseleave=function(){ clearTimeout(APP._tipTimer); hideTeacherTip(); };
    d.oncontextmenu=function(e){ e.preventDefault(); openTeacherMenu(t,e); };
    list.appendChild(d);
  });
}
function renderLeft(){ ensureFilters(); updateFilterTab(); renderLeftList(); }
function updateViewSeg(){
  var seg=document.getElementById("viewSeg"); if(!seg) return;
  Array.prototype.forEach.call(seg.children,function(x){ x.classList.toggle("on", x.getAttribute("data-v")===APP.view); });
}

/* ---- 渲染右侧 ---- */
function renderRight(){
  var el=document.getElementById("right"); el.innerHTML="";
  if(!APP.state){
    var empty=document.createElement("div"); empty.className="empty"; empty.style.cssText="text-align:center;padding-top:12vh;";
    empty.innerHTML='<div style="font-size:16px;margin-bottom:10px;">尚未初始化课表</div>'+
      '<div style="font-size:13px;color:var(--muted);margin-bottom:18px;">建议流程：设置 → 导入教师 → 初始化排课 → 排班主任 → 一键全排 → 拖拽微调</div>'+
      '<button class="btn primary" style="font-size:14px;padding:10px 22px;" onclick="doInit()">初始化排课</button>';
    el.appendChild(empty); return;
  }
  // 统计条
  var st=APP.state;
  var uns = st._lastUnscheduled? st._lastUnscheduled.length:0;
  var issues = S.validate(st).length;
  var sd = st._lastSupply? st._lastSupply.filter(function(x){return x.status==="SHORT";}).length:0;
  var peFirst=0,mainLast=0;
  st.classes.forEach(function(c){ st.grid[c.id].forEach(function(cell,idx){ if(S.isPE(cell.subject)&&idx%S.dailyTotal(st.config)===0)peFirst++; if(S.isMain(cell.subject,st.config)&&idx%S.dailyTotal(st.config)>=S.dailyTotal(st.config)-2)mainLast++; }); });
  var stats=document.createElement("div"); stats.className="stats";
  function statHtml(label,val,bad,type){ var cls="stat"+(bad?' bad':(val===0?' zero':'')); return '<div class="'+cls+'" data-type="'+type+'" onclick="showIssues(\''+type+'\')">'+label+' <b>'+val+'</b></div>'; }
  stats.innerHTML=statHtml('未排',uns,uns>0,'unscheduled')+statHtml('规则/资源冲突',issues,issues>0,'room')+statHtml('供需短缺',sd,sd>0,'supply')+statHtml('体育第1节',peFirst,peFirst>0,'peFirst')+statHtml('主科末两节',mainLast,mainLast>0,'mainLast');
  el.appendChild(stats);

  if(APP.view==="teacher") renderTeacherView(el);
  else if(APP.leftSubject) renderSubjectView(el);
  else renderClassView(el);
}

/* ---- 学科视图：某学科全部老师 + 排课分布 ---- */
function renderSubjectView(el){
  var st=APP.state, subj=APP.leftSubject;
  var P=S.dailyTotal(st.config);
  var grade=APP.leftGrade, kw=APP.leftSearch;
  var teachers=APP.teachers.filter(function(t){
    if(!subjListOf(t).some(function(s){ return s.subject===subj; })) return false;
    if(grade!=="all" && t.grades.indexOf(parseInt(grade,10))<0) return false;
    if(kw && t.name.toLowerCase().indexOf(kw)<0) return false;
    return true;
  });
  var rows=teachers.map(function(t){
    var cells=[], cnt=0;
    st.classes.forEach(function(c){ st.grid[c.id].forEach(function(cell,idx){ if(cell.teacherId===t.id && cell.subject===subj){ cnt++; cells.push({label:c.label,d:Math.floor(idx/P)+1,p:(idx%P)+1}); } }); });
    var o=subjListOf(t).find(function(s){ return s.subject===subj; });
    return { t:t, total:o?o.hours:0, cnt:cnt, cells:cells };
  });
  // 排序：先分两组——不缺课(已排满, cnt>=total)在前，缺课(未排/缺节)在后；
  // 组内都按"任教最低年级"升序，再按姓名笔画序
  rows.sort(function(a,b){
    var aMiss = a.cnt < a.total ? 1 : 0;
    var bMiss = b.cnt < b.total ? 1 : 0;
    if (aMiss !== bMiss) return aMiss - bMiss;
    var ga = a.t.grades.length ? Math.min.apply(null, a.t.grades) : 99;
    var gb = b.t.grades.length ? Math.min.apply(null, b.t.grades) : 99;
    if (ga !== gb) return ga - gb;
    return (a.t.name || "").localeCompare(b.t.name || "", "zh-CN");
  });
  var totalH=rows.reduce(function(a,r){ return a+r.total; },0);
  var placedH=rows.reduce(function(a,r){ return a+r.cnt; },0);
  var head=document.createElement("div"); head.className="bar";
  head.innerHTML='<b>'+subj+'</b> <span style="color:var(--muted)">'+teachers.length+' 位老师 · 总课时 '+totalH+' · 已排 '+placedH+'</span>';
  el.appendChild(head);
  if(!rows.length){ el.appendChild(function(){ var e=document.createElement("div"); e.className="empty"; e.textContent="无老师任教该学科。"; return e; }()); return; }
  var hint=document.createElement("div"); hint.className="hint"; hint.style.cssText="margin:0 0 10px;";
  hint.innerHTML='双击老师看其个人课表；右键可管理（改学科/课时/班主任）。未排的课：先点「一键全排」，或在班级课表里拖拽。';
  el.appendChild(hint);
  rows.forEach(function(r){
    var card=document.createElement("div"); card.className="subj-card";
    var status = r.cnt===0 ? '<span class="tag" style="background:var(--muted)">未排</span>' : (r.cnt<r.total ? '<span class="tag" style="background:var(--warn)">缺'+(r.total-r.cnt)+'节</span>' : '<span class="tag" style="background:var(--primary)">排满</span>');
    var hd=document.createElement("div"); hd.className="sc-hd";
    hd.innerHTML='<b>'+r.t.name+'</b> '+status+' <span style="color:var(--muted);font-size:12px;">'+r.cnt+' / '+r.total+' 节</span>'+(r.t.isHeadTeacher?('<span class="tag head" style="font-size:10px;">班主任</span>'):"");
    card.appendChild(hd);
    var dist=document.createElement("div"); dist.className="sc-dist";
    if(r.cells.length){ dist.innerHTML=r.cells.map(function(x){ return '<span class="chip-sub">'+x.label+' 周'+x.d+'第'+x.p+'节</span>'; }).join(""); }
    else { dist.innerHTML='<span style="color:var(--muted);font-size:12px;">尚未排入课表</span>'; }
    card.appendChild(dist);
    card.onclick=function(){ APP.selTeacher=r.t.id; };
    card.ondblclick=function(){ APP.view="teacher"; APP.selTeacher=r.t.id; updateViewSeg(); render(); };
    card.oncontextmenu=function(e){ e.preventDefault(); openTeacherMenu(r.t,e); };
    el.appendChild(card);
  });
}

function gridHead(P,D){
  var thead="<tr><th>节\\周</th>";
  for(var d=1; d<=D; d++) thead+="<th>周"+d+"</th>";
  return thead+"</tr>";
}
function cellClass(cell){
  var cls="cell";
  if(cell.fixed) cls+=" fixed";
  if(cell.locked) cls+=" locked";
  if(!cell.fixed && !cell.locked && S.isMain(cell.subject,APP.config)) cls+=" main";
  return cls;
}

function renderTeacherView(el){
  if(!APP.selTeacher){ el.innerHTML+='<div class="empty">从左侧选择一位教师查看其课表。</div>'; return; }
  var st=APP.state, tid=APP.selTeacher, t=st.teacherById[tid];
  var head=document.createElement("div"); head.className="bar";
  head.innerHTML='<b>'+t.name+'</b> <span style="color:var(--muted)">'+subjLabelOf(t)+(t.isHeadTeacher?(" · 班主任("+(st.classById[t.headClass]?st.classById[t.headClass].label:"?")+")"):"")+'</span> <span style="color:var(--muted)">周课时 '+totalHoursOf(t)+'，已排 '+teacherPlaced(tid)+'</span>';
  var lockBtn=document.createElement("button"); lockBtn.className="btn"; lockBtn.textContent= st._lockedTeachers[tid]?"解锁该老师":"锁定该老师";
  lockBtn.onclick=function(){ toggleLockTeacher(tid); };
  head.appendChild(lockBtn);
  el.appendChild(head);

  var tt = S.buildTeacherTimetable(st)[tid];
  var P=S.dailyTotal(st.config), D=st.config.days;
  var tbl=document.createElement("table"); tbl.className="grid"; tbl.innerHTML="<thead>"+gridHead(P,D)+"</thead>";
  var tb=document.createElement("tbody");
  st.segs.forEach(function(seg){
    if(seg.label){
      var shr=document.createElement("tr"); shr.className="seg-head";
      shr.innerHTML="<th colspan='"+(1+D)+"'>"+seg.label+"</th>";
      tb.appendChild(shr);
    }
    for(var k=0; k<seg.count; k++){
      var segName = (seg.name==="早读"||seg.name==="晚自习") ? seg.name : (seg.name + (k+1) + "节");
      var tr=document.createElement("tr"); tr.innerHTML="<th>"+segName+"</th>";
      for(var d=0; d<D; d++){
        var s=d*P+seg.startSlot+k; var td=document.createElement("td");
        var txt = tt? tt[s] : null;
        td.innerHTML = txt? '<div class="'+cellClass({subject:txt.split("\n")[1],fixed:false,locked:false})+'"><div class="subj">'+txt.replace("\n","<br>")+'</div></div>' : '<div class="cell"></div>';
        td.ondragover=function(e){e.preventDefault();};
        td.ondrop=function(e){
          e.preventDefault();
          var src=e.dataTransfer.getData("text/plain");
          if(!src||src===tid) return;
          var line=txt; if(!line) return;
          var cidLine=line.split("\n")[0]; var cid=st.classById[cidLine]?st.classById[cidLine].id:null; if(!cid) return;
          var subj=primarySubjectOf(st.teacherById[src]).subject;
          if(!S.placeManual(st,cid,s,src,subj)){ toast("目标格不可用；固定/锁定课不能覆盖，主课跟自习还需要下一节空闲"); }
          render();
        };
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    }
  });
  tbl.appendChild(tb); el.appendChild(tbl);
}

function renderClassView(el){
  if(!APP.selClass && APP.state && APP.state.classes.length){ APP.selClass=APP.state.classes[0].id; }
  if(!APP.selClass){ el.innerHTML+='<div class="empty">无班级可显示。</div>'; return; }
  var st=APP.state, cid=APP.selClass, c=st.classById[cid];

  // 班级选择器 + 锁定科目
  var bar=document.createElement("div"); bar.className="bar";
  bar.innerHTML='<b>'+c.label+'</b> <span style="color:var(--muted)">本班课表</span>';
  var sel=document.createElement("select"); sel.style.cssText="min-width:140px;padding:6px 8px;border:1px solid var(--line);border-radius:7px;font-size:13px;background:#fff;";
  var groups={}; st.classes.forEach(function(cl){ var g=cl.grade; if(!groups[g]) groups[g]=[]; groups[g].push(cl); });
  Object.keys(groups).sort(function(a,b){return a-b;}).forEach(function(g){
    var og=document.createElement("optgroup"); og.label=g+"年级";
    groups[g].forEach(function(cl){
      var opt=document.createElement("option"); opt.value=cl.id; opt.textContent=cl.label; if(cl.id===cid) opt.selected=true;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  });
  sel.onchange=function(){ APP.selClass=this.value; render(); };
  bar.appendChild(sel);
  var lockSubj=document.createElement("select"); lockSubj.style.cssText="min-width:150px;padding:6px 8px;border:1px solid var(--line);border-radius:7px;font-size:13px;background:#fff;";
  lockSubj.innerHTML='<option value="">锁定某科目整组…</option>'+Object.keys((st.config.grades.find(function(g){return g.grade===c.grade;})||{curriculum:{}}).curriculum).map(function(s){return '<option>'+s+'</option>';}).join("");
  lockSubj.onchange=function(){ if(lockSubj.value){ S.lockSubjectGroup(st,cid,lockSubj.value); render(); } };
  bar.appendChild(lockSubj);
  el.appendChild(bar);

  var hint=document.createElement("div"); hint.style.cssText="font-size:12px;color:var(--muted);margin-bottom:10px;"; hint.textContent="提示：从左侧教师池拖老师到课表格子进行替换；课表内拖拽格子=交换。";
  el.appendChild(hint);

  var P=S.dailyTotal(st.config), D=st.config.days;
  var tbl=document.createElement("table"); tbl.className="grid"; tbl.innerHTML="<thead>"+gridHead(P,D)+"</thead>";
  var tb=document.createElement("tbody");
  st.segs.forEach(function(seg){
    if(seg.label){
      var shr=document.createElement("tr"); shr.className="seg-head";
      shr.innerHTML="<th colspan='"+(1+D)+"'>"+seg.label+"</th>";
      tb.appendChild(shr);
    }
    for(var k=0; k<seg.count; k++){
      var segName = (seg.name==="早读"||seg.name==="晚自习") ? seg.name : (seg.name + (k+1) + "节");
      var tr=document.createElement("tr"); tr.innerHTML="<th>"+segName+"</th>";
      for(var d=0; d<D; d++){
        var s=d*P+seg.startSlot+k; var cell=st.grid[cid][s];
        var td=document.createElement("td");
        var fxMark = cell.fixed ? '<span class="fx">固</span>' : '';
        var lkMark = cell.locked ? '<span class="lk">锁</span>' : '';
        var tname = (cell.teacherId && st.teacherById[cell.teacherId]) ? st.teacherById[cell.teacherId].name : "";
        td.innerHTML = '<div class="' + cellClass(cell) + '" data-cid="' + cid + '" data-s="' + s + '" draggable="true">' + fxMark + lkMark + '<div class="subj">' + (cell.subject || "") + '</div>' + (cell.teacherId ? '<div class="tname">' + tname + '</div>' : '') + '</div>';
        // 拖拽：从左侧教师池拖入=替换；课表内拖拽=交换
        td.ondragover=function(e){e.preventDefault();};
        td.ondrop=function(e){
          e.preventDefault();
          var tc=this.querySelector(".cell"); var ccid=tc.getAttribute("data-cid"), cs=parseInt(tc.getAttribute("data-s"),10);
          if(APP.dragFrom){ // 课表内拖拽=交换（优先判断）
            if(APP.dragFrom.cid===ccid && APP.dragFrom.s===cs){ APP.dragFrom=null; return; }
            if(!S.swapCells(st,ccid,APP.dragFrom.s,cs)) toast("固定/锁定格不可交换");
            APP.dragFrom=null; render(); return;
          }
          // 从左侧教师池拖入：替换
          var src=APP.dragTeacher||e.dataTransfer.getData("text/plain");
          if(!src || src==="move") return;
          var tRef=st.teacherById[src]; if(!tRef) return;
          var targetSubj=st.grid[ccid][cs].subject;
          var sobj=(tRef.subjects||[]).find(function(x){return x.subject===targetSubj;})||primarySubjectOf(tRef);
          if(!S.placeManual(st,ccid,cs,src,sobj.subject)) toast("目标格不可用；固定/锁定课不能覆盖，主课跟自习还需要下一节空闲");
          render();
        };
        td.querySelector(".cell").ondragstart=function(e){ var cc=this; APP.dragFrom={cid:cc.getAttribute("data-cid"),s:parseInt(cc.getAttribute("data-s"),10)}; e.dataTransfer.setData("text/plain","move"); };
        // 单元格右键/点击菜单
        td.querySelector(".cell").oncontextmenu=function(e){ e.preventDefault(); openCtx(e, this.getAttribute("data-cid"), parseInt(this.getAttribute("data-s"),10)); };
        td.querySelector(".cell").onclick=function(e){ if(e.ctrlKey||e.metaKey) openCtx(e, this.getAttribute("data-cid"), parseInt(this.getAttribute("data-s"),10)); };
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    }
  });
  tbl.appendChild(tb); el.appendChild(tbl);
}

/* ---- 教师右键菜单（管理） ---- */
function openTeacherMenu(t, e){
  var m=document.getElementById("teacherMenu");
  if(!m){
    m=document.createElement("div"); m.id="teacherMenu"; m.className="tmenu"; document.body.appendChild(m);
    m.addEventListener("click", function(ev){ ev.stopPropagation(); });
    document.addEventListener("click", function(){ if(m) m.style.display="none"; });
  }
  APP._menuTeacher=t;
  renderTeacherMenu(m, t);
  m.style.display="block";
  var x=e.clientX, y=e.clientY, w=m.offsetWidth, h=m.offsetHeight;
  if(x+w>window.innerWidth) x=Math.max(8,window.innerWidth-w-8);
  if(y+h>window.innerHeight) y=Math.max(8,window.innerHeight-h-8);
  m.style.left=x+"px"; m.style.top=y+"px";
}
function renderTeacherMenu(m, t){
  m.innerHTML="";
  var st=APP.state;
  var h=document.createElement("h3");
  h.innerHTML='<span>'+t.name+'</span>';
  var close=document.createElement("span"); close.className="close"; close.textContent="×";
  close.onclick=function(){ m.style.display="none"; };
  h.appendChild(close); m.appendChild(h);

  // 班主任区
  var sec1=document.createElement("div"); sec1.className="sec";
  var t1=document.createElement("div"); t1.className="sec-t"; t1.textContent="班主任"; sec1.appendChild(t1);
  if(t.isHeadTeacher){
    var cur=st&&st.classById[t.headClass]?st.classById[t.headClass].label:"";
    var info=document.createElement("div"); info.style.cssText="font-size:13px;margin-bottom:6px;";
    info.innerHTML='当前：<b>'+cur+'</b> 班主任';
    sec1.appendChild(info);
    var btn=document.createElement("button"); btn.className="btn"; btn.textContent="取消班主任";
    btn.onclick=function(){ t.isHeadTeacher=false; t.headClass=null; afterTeacherEdit(t); };
    sec1.appendChild(btn);
  } else {
    var sel=document.createElement("select");
    (st?st.classes:[]).forEach(function(c){ var o=document.createElement("option"); o.value=c.id; o.textContent=c.label; sel.appendChild(o); });
    var btn2=document.createElement("button"); btn2.className="btn primary"; btn2.textContent="设为班主任";
    btn2.onclick=function(){
      if(!st){ toast("请先初始化排课，再设置班主任。"); return; }
      var cid=sel.value; if(!cid) return;
      var old=APP.teachers.find(function(x){ return x.isHeadTeacher && x.headClass===cid; });
      if(old && old!==t){
        if(!confirm("班级 "+st.classById[cid].label+" 已有班主任 "+old.name+"，是否替换为 "+t.name+"？")) return;
        old.isHeadTeacher=false; old.headClass=null;
      }
      t.isHeadTeacher=true; t.headClass=cid;
      var max=APP.config.headMaxSubj||1; t.subjects=t.subjects.slice(0,max);
      afterTeacherEdit(t);
    };
    var row=document.createElement("div"); row.style.cssText="display:flex;gap:6px;";
    row.appendChild(sel); row.appendChild(btn2); sec1.appendChild(row);
  }
  m.appendChild(sec1);

  // 学科区
  var sec2=document.createElement("div"); sec2.className="sec";
  var t2=document.createElement("div"); t2.className="sec-t";
  var maxSubj = t.isHeadTeacher ? (APP.config.headMaxSubj||1) : (APP.config.otherMaxSubj||2);
  t2.innerHTML='<span>担任学科</span><span>上限 '+maxSubj+' 科</span>';
  sec2.appendChild(t2);
  t.subjects.forEach(function(s, idx){
    var row=document.createElement("div"); row.className="subj-row";
    var nm=document.createElement("span"); nm.className="nm";
    nm.innerHTML=s.subject+' <span style="font-size:11px;color:var(--muted)">'+(idx===0?'主教':'兼教')+' · '+(isMainSubject(s.subject)?'主科':'非主科')+'</span>';
    var inp=document.createElement("input"); inp.type="number"; inp.min="0"; inp.value=s.hours;
    inp.onchange=function(){ s.hours=Math.max(0,parseInt(inp.value,10)||0); afterTeacherEdit(t); };
    row.appendChild(nm); row.appendChild(inp);
    if(idx>0){ var del=document.createElement("button"); del.className="btn"; del.textContent="删"; del.style.cssText="padding:2px 8px;";
      del.onclick=function(){ t.subjects.splice(idx,1); afterTeacherEdit(t); }; row.appendChild(del); }
    sec2.appendChild(row);
  });
  if(!t.isHeadTeacher && t.subjects.length<maxSubj){
    var add=document.createElement("div"); add.className="add-row";
    var sel2=document.createElement("select");
    ALL_SUBJECTS.forEach(function(su){ if(su==="自习"||su==="班会") return; if(!t.subjects.some(function(x){return x.subject===su;})){ var o=document.createElement("option"); o.value=su; o.textContent=su; sel2.appendChild(o); } });
    var hinp=document.createElement("input"); hinp.type="number"; hinp.min="1"; hinp.value="1"; hinp.style.cssText="width:48px;padding:4px 6px;border:1px solid var(--line);border-radius:6px;font-size:12px;";
    var addb=document.createElement("button"); addb.className="btn primary"; addb.textContent="加";
    addb.onclick=function(){ var su=sel2.value; if(!su) return; t.subjects.push({subject:su,hours:Math.max(1,parseInt(hinp.value,10)||1),isMain:isMainSubject(su)}); afterTeacherEdit(t); };
    add.appendChild(sel2); add.appendChild(hinp); add.appendChild(addb); sec2.appendChild(add);
  } else if(t.isHeadTeacher && t.subjects.length>=maxSubj){
    var hint=document.createElement("div"); hint.className="hint-sm"; hint.textContent="班主任限 "+maxSubj+" 科，不可添加其他学科。"; sec2.appendChild(hint);
  } else if(!t.isHeadTeacher && t.subjects.length>=maxSubj){
    var hint2=document.createElement("div"); hint2.className="hint-sm"; hint2.textContent="已达上限（"+maxSubj+" 科），如需更多请在「设置」调大「其他老师最多科目数」。"; sec2.appendChild(hint2);
  }
  m.appendChild(sec2);

  var note=document.createElement("div"); note.className="hint-sm"; note.textContent="修改后自动重排并保存；锁定的课与老师不受影响。"; sec2.appendChild(note);
}
function afterTeacherEdit(t){
  if(APP.state) S.autoSchedule(APP.state);
  saveLocal(); render();
  var m=document.getElementById("teacherMenu");
  if(m && m.style.display!=="none") renderTeacherMenu(m, t);
}

/* ---- 上下文菜单 ---- */
function openCtx(e,cid,s){
  APP.ctxCell={cid:cid,s:s};
  var m=document.getElementById("ctx"); m.style.display="block";
  m.style.left=Math.min(e.clientX, window.innerWidth-160)+"px";
  m.style.top=Math.min(e.clientY, window.innerHeight-160)+"px";
  e.stopPropagation();
}
document.getElementById("ctx").addEventListener("click",function(e){
  var a=e.target.getAttribute("data-a"); if(!a) return;
  var cc=APP.ctxCell; if(cc){
    var st=APP.state;
    if(a==="fix"){ var subj=prompt("固定科目：","音乐"); if(subj){ var tid=prompt("固定老师ID(可空)：",""); S.setFixedCell(st,cc.cid,cc.s,subj,tid||null); } }
    else if(a==="lock") S.lockCell(st,cc.cid,cc.s);
    else if(a==="unlock") S.unlockCell(st,cc.cid,cc.s);
    else if(a==="clear"){ var cell=st.grid[cc.cid][cc.s]; if(cell.fixed){ toast("固定课请用「固定课」设置清除"); } else if(!S.clearRulePair(st,cc.cid,cc.s)){ cell.subject=null; cell.teacherId=null; cell.manual=false; cell.locked=false; } }
  }
  document.getElementById("ctx").style.display="none"; render();
});
document.addEventListener("click",function(){ document.getElementById("ctx").style.display="none"; });

/* ---- 锁定 ---- */
function toggleLockTeacher(tid){
  if(!APP.state) return;
  if(APP.state._lockedTeachers[tid]) S.unlockTeacher(APP.state,tid); else S.lockTeacher(APP.state,tid);
  render();
}

/* ---- 锁定管理（集中解锁） ---- */
function openLockManager(){
  if(!APP.state){ toast("请先初始化排课"); return; }
  renderLockList();
  openModal("mLocks");
}
function renderLockList(){
  var st=APP.state;
  var box=document.getElementById("lockList"); box.innerHTML="";
  // 1) 教师整组锁定
  var teacherLocks=APP.teachers.filter(function(t){ return st._lockedTeachers[t.id]; });
  var sec1=document.createElement("div"); sec1.className="lock-sec";
  sec1.innerHTML='<h3>教师整组锁定（'+teacherLocks.length+'）</h3>';
  box.appendChild(sec1);
  if(teacherLocks.length===0){ var e1=document.createElement("div"); e1.className="lock-empty"; e1.textContent="暂无"; box.appendChild(e1); }
  teacherLocks.forEach(function(t){
    var row=document.createElement("div"); row.className="lock-row";
    row.innerHTML='<span>'+t.name+' · '+subjLabelOf(t)+'</span>';
    var b=document.createElement("button"); b.className="btn"; b.textContent="解锁";
    b.onclick=function(){ S.unlockTeacher(st,t.id); renderLockList(); render(); };
    row.appendChild(b); box.appendChild(row);
  });
  // 2) 单格锁定（排除教师整组锁定带来的格子）
  var cellLocks=[];
  st.classes.forEach(function(c){ st.grid[c.id].forEach(function(cell,idx){
    if(cell.locked && !cell.ruleGenerated && !(cell.teacherId && st._lockedTeachers[cell.teacherId])) cellLocks.push({cid:c.id,label:c.label,s:idx,cell:cell});
  }); });
  var sec2=document.createElement("div"); sec2.className="lock-sec";
  sec2.innerHTML='<h3>单格锁定（'+cellLocks.length+'）</h3>';
  box.appendChild(sec2);
  if(cellLocks.length===0){ var e2=document.createElement("div"); e2.className="lock-empty"; e2.textContent="暂无"; box.appendChild(e2); }
  cellLocks.forEach(function(item){
    var P=S.dailyTotal(st.config), d=Math.floor(item.s/P)+1, p=item.s%P+1;
    var tname=item.cell.teacherId && st.teacherById[item.cell.teacherId]?st.teacherById[item.cell.teacherId].name:"";
    var row=document.createElement("div"); row.className="lock-row";
    row.innerHTML='<span>'+item.label+' 周'+d+'第'+p+'节 · '+(item.cell.subject||"")+(tname?('('+tname+')'):'')+'</span>';
    var b=document.createElement("button"); b.className="btn"; b.textContent="解锁";
    b.onclick=function(){ S.unlockCell(st,item.cid,item.s); renderLockList(); render(); };
    row.appendChild(b); box.appendChild(row);
  });
}

/* ---- 操作 ---- */
function doInit(){
  APP.config = APP.config || defaultConfig();
  normalizeCurric(APP.config);
  normalizeSchedule(APP.config);
  // 确保教师有 id
  APP.teachers.forEach(function(t,i){ if(t.id==null) t.id="T"+(i+1); });
  APP.state = S.initState(APP.config, APP.teachers);
  if(document.getElementById("setSelf") && document.getElementById("setSelf").checked) { /* default applied below */ }
  APP.state.config = APP.config;
  applyDefaultFixedIfEnabled();
  APP.selTeacher = APP.teachers.length? APP.teachers[0].id : null;
  APP.selClass = APP.state.classes.length? APP.state.classes[0].id : null;
  APP.view = "class";
  updateViewSeg();
  saveLocal(); render();
  toast("已初始化。请点「排班主任」批量排所有班主任，再点「一键全排」排其他老师。");
}
function applyDefaultFixedIfEnabled(){
  // 依据 config 中 grades[].hasSelfStudy 与 rules 是否启用班会
  S.applyDefaultFixed(APP.state);
}
function doHead(){
  if(!APP.state){ toast("请先初始化排课"); return; }
  var heads=APP.teachers.filter(function(t){ return t.isHeadTeacher; });
  if(!heads.length){ toast("教师名单中没有班主任。请检查导入名单的「是否班主任」列（填 Y）和「带班」列。"); return; }
  var ids=new Set(heads.map(function(t){ return t.id; }));
  S.autoSchedule(APP.state,{teachers:ids});
  saveLocal(); render();
  var placed=0; APP.state.classes.forEach(function(c){ APP.state.grid[c.id].forEach(function(cell){ if(cell.subject && !cell.fixed) placed++; }); });
  if(placed===0) toast("⚠️ 没排到课。请检查「设置→课程」科目课时和「导入」教师名单是否给了科目。");
  else toast("已排班主任 "+heads.length+" 名（共 "+placed+" 节）。可继续点「一键全排」排其他老师。");
}
function doAll(){
  if(!APP.state){ toast("请先初始化排课"); return; }
  S.autoSchedule(APP.state);
  saveLocal(); render();
  var st=APP.state;
  var uns = st._lastUnscheduled ? st._lastUnscheduled.length : 0;
  var placed = 0;
  st.classes.forEach(function(c){ st.grid[c.id].forEach(function(cell){ if(cell.subject && !cell.fixed) placed++; }); });
  if(placed === 0){
    toast("⚠️ 没排到任何课。请检查「设置→课程」是否还有科目课时（被清空会变成 0），以及「导入」教师名单是否给了科目。");
  } else if(uns){
    toast("已一键全排。未排 " + uns + " 节（多为教室容量不足，可在「设置→教室」调大间数）。");
  } else {
    toast("已一键全排。所有课程排满 ✓");
  }
}

/* ---- 弹窗与导入 ---- */
function openModal(id){ document.getElementById(id).classList.add("show"); }
function closeModal(id){ document.getElementById(id).classList.remove("show"); }

/* 统计条钻取：根据 data-type 渲染具体清单 */
function showIssues(type){
  if(!APP.state) return;
  var st=APP.state, P=S.dailyTotal(st.config);
  var TITLE={unscheduled:"未排课程清单",room:"规则与资源冲突清单",supply:"供需短缺清单",peFirst:"体育第1节清单",mainLast:"主科末两节清单"};
  var html="";
  function esc(s){ return (""+s).replace(/[<>&]/g,function(c){return {"<":"&lt;",">":"&gt;","&":"&amp;"}[c];}); }
  if(type==="unscheduled"){
    var list=st._lastUnscheduled||[];
    if(!list.length){ html='<div class="empty" style="padding:24px;">✓ 无未排课程</div>'; }
    else { html='<div class="hint" style="margin:0 0 8px;">共 '+list.length+' 节未排。提示：未排可能是供不应求（看「供需短缺」），或排课约束冲突。</div><table class="grid" style="font-size:12px;"><thead><tr><th>班级</th><th>科目</th><th>需</th><th>已排</th><th>缺</th></tr></thead><tbody>'+list.map(function(x){var cl=st.classById[x.classId]?st.classById[x.classId].label:x.classId; return '<tr><td>'+cl+'</td><td>'+esc(x.subject)+'</td><td>'+x.need+'</td><td>'+x.placed+'</td><td><b style="color:var(--danger)">'+(x.need-x.placed)+'</b></td></tr>'; }).join('')+'</tbody></table>'; }
  } else if(type==="room"){
    var issues=S.validate(st);
    if(!issues.length){ html='<div class="empty" style="padding:24px;">✓ 无规则或资源冲突</div>'; }
    else { html='<div class="hint" style="margin:0 0 8px;">共 '+issues.length+' 条。可能来自教室容量、每日主科或“主课后跟自习”等硬规则。</div><ul style="padding-left:20px;line-height:1.8;font-size:13px;">'+issues.map(function(x){return '<li>'+esc(x)+'</li>'; }).join('')+'</ul>'; }
  } else if(type==="supply"){
    var list=(st._lastSupply||[]).filter(function(x){return x.status==="SHORT";});
    if(!list.length){ html='<div class="empty" style="padding:24px;">✓ 无供需短缺</div>'; }
    else { html='<div class="hint" style="margin:0 0 8px;">供不应求意味着即便无约束也排不下，建议加老师或加副科。</div><table class="grid" style="font-size:12px;"><thead><tr><th>年级</th><th>科目</th><th>需求</th><th>供给</th><th>缺口</th></tr></thead><tbody>'+list.map(function(x){return '<tr><td>'+({1:"一",2:"二",3:"三",4:"四",5:"五",6:"六"})[x.grade]+'年级</td><td>'+esc(x.subject)+'</td><td>'+x.demand+'</td><td>'+x.supply+'</td><td><b style="color:var(--danger)">'+(x.demand-x.supply)+'</b></td></tr>'; }).join('')+'</tbody></table>'; }
  } else if(type==="peFirst"){
    var items=[];
    st.classes.forEach(function(c){ st.grid[c.id].forEach(function(cell,idx){ if(cell.fixed||cell.locked)return; if(S.isPE(cell.subject)&&(idx%P)===0){ items.push({label:c.label,d:Math.floor(idx/P)+1,p:(idx%P)+1,sub:cell.subject}); } }); });
    if(!items.length){ html='<div class="empty" style="padding:24px;">✓ 体育未排第1节</div>'; }
    else { html='<ul style="padding-left:20px;line-height:1.8;font-size:13px;columns:2;column-gap:24px;">'+items.map(function(x){return '<li>'+x.label+' 周'+x.d+'第'+x.p+'节 '+esc(x.sub)+'</li>'; }).join('')+'</ul>'; }
  } else if(type==="mainLast"){
    var items=[];
    st.classes.forEach(function(c){ st.grid[c.id].forEach(function(cell,idx){ if(cell.fixed||cell.locked)return; if(S.isMain(cell.subject,st.config)&&(idx%P)>=P-2){ var tname=cell.teacherId&&st.teacherById[cell.teacherId]?st.teacherById[cell.teacherId].name:""; items.push({label:c.label,d:Math.floor(idx/P)+1,p:(idx%P)+1,sub:cell.subject,tname:tname}); } }); });
    if(!items.length){ html='<div class="empty" style="padding:24px;">✓ 无主科落末两节</div>'; }
    else { html='<div class="hint" style="margin:0 0 8px;">共 '+items.length+' 节主科落末两节（软规则无法满足时会被迫落末）。</div><ul style="padding-left:20px;line-height:1.8;font-size:13px;columns:2;column-gap:24px;">'+items.map(function(x){return '<li>'+x.label+' 周'+x.d+'第'+x.p+'节 '+esc(x.sub)+(x.tname?(' · '+esc(x.tname)):'')+'</li>'; }).join('')+'</ul>'; }
  }
  document.getElementById("issuesTitle").textContent=TITLE[type]||"清单";
  document.getElementById("issuesBody").innerHTML=html;
  openModal("mIssues");
}

function applyTeachers(){
  var txt=document.getElementById("taTeachers").value.trim();
  if(!txt){ closeModal("mTeachers"); return; }
  var lines=txt.split(/\n+/), teachers=[];
  lines.forEach(function(line,idx){
    line=line.trim(); if(!line) return;
    var p=line.split(/[,，\t]/);
    if(p.length<4) return;
    var name=p[0].trim(), subject=p[1].trim();
    var grades=p[2].trim().split(/[-－]/).map(function(x){return parseInt(x,10);}).filter(function(x){return x>=1&&x<=6;});
    var hours=parseInt(p[3],10)||0;
    var isHead=/[yY]/.test(p[4]||"N");
    var headClass=null;
    if(isHead && p[5]) headClass=classIdFromLabel(p[5].trim());
    teachers.push({id:"T"+(idx+1),name:name,subject:subject,grades:grades.length?grades:[1],hours:hours,isHeadTeacher:isHead,headClass:headClass});
  });
  APP.teachers=teachers;
  saveLocal(); closeModal("mTeachers");
  if(APP.state){ APP.selTeacher=teachers.length?teachers[0].id:null; }
  render();
  toast("已导入 "+teachers.length+" 位教师。");
}

/* xlsx 上传：按列名识别，支持老师调列顺序 */
function applyTeachersXlsx(input){
  var file=input.files && input.files[0]; if(!file) return;
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var data=new Uint8Array(e.target.result);
      var wb=XLSX.read(data,{type:"array",cellDates:true});
      var ws=wb.Sheets[wb.SheetNames[0]];
      var rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
      // 找表头行（第一个含“姓名”的行）
      var headIdx=-1;
      for(var i=0;i<rows.length;i++){ if(rows[i] && rows[i].some(function(c){return (""+c).indexOf("姓名")>=0;})){ headIdx=i; break; } }
      if(headIdx<0){ toast("未找到含「姓名」的表头行，请使用模板表头。"); input.value=""; return; }
      var head=rows[headIdx].map(function(c){return (""+c).trim();});
      function colId(cands){ for(var k=0;k<cands.length;k++){ var j=head.indexOf(cands[k]); if(j>=0) return j; } for(var k=0;k<cands.length;k++){ for(var j=0;j<head.length;j++){ if(head[j].indexOf(cands[k])>=0) return j; } } return -1; }
      // 新表头：主教/兼教科目分列；旧表头“主科/副科”和“科目/周课时”均兼容
      var cName=colId(["姓名","名字","教师姓名","老师"]);
      var cMain=colId(["主科","主教科目","第一学科"]);
      var cMainH=colId(["主教科目课时","主科课时","主科周课时","主科总课时"]);
      var cSub1=colId(["兼教科目1","副科1","副科一","第二学科"]);
      var cSub1H=colId(["兼教科目1课时","副科1课时","副科1周课时"]);
      var cSub2=colId(["兼教科目2","副科2","副科二","第三学科"]);
      var cSub2H=colId(["兼教科目2课时","副科2课时","副科2周课时"]);
      var cGrade=colId(["任教年级","年级"]);
      var cHead=colId(["是否班主任","班主任"]);
      var cClass=colId(["带班","班级","所带班级"]);
      var useNew = cMain>=0 && cMainH>=0;
      var cSubj=-1, cHours=-1;
      if(!useNew){ cSubj=colId(["科目","学科"]); cHours=colId(["周课时","课时","总课时"]); }
      if(cName<0||cGrade<0){ toast("表头缺少必要列（姓名/任教年级）。"); input.value=""; return; }
      if(!useNew && (cSubj<0||cHours<0)){ toast("表头缺少必要列（科目/周课时 或 主教科目/主教科目课时）。"); input.value=""; return; }
      var teachers=[], n=0;
      for(var r=headIdx+1;r<rows.length;r++){
        var row=rows[r]; if(!row||!(""+row[cName]).trim()) continue;
        var name=(""+row[cName]).trim();
        var grades=(""+(row[cGrade]||"")).trim().split(/[-－、,，]/).map(function(x){return parseInt(x,10);}).filter(function(x){return x>=1&&x<=6;});
        var isHead=cHead>=0 && /[yY是]/.test(""+(row[cHead]||""));
        var headClass=null;
        if(isHead && cClass>=0 && (""+row[cClass]).trim()) headClass=classIdFromLabel((""+row[cClass]).trim());
        var subsArr=[];
        if(useNew){
          var main=(""+(row[cMain]||"")).trim();
          if(main) subsArr.push({subject:main, hours:parseInt(row[cMainH],10)||0, isMain:isMainSubject(main)});
          if(cSub1>=0 && (""+(row[cSub1]||"")).trim()){
            var s1=(""+row[cSub1]).trim();
            subsArr.push({subject:s1, hours:parseInt(row[cSub1H],10)||0, isMain:isMainSubject(s1)});
          }
          if(cSub2>=0 && (""+(row[cSub2]||"")).trim()){
            var s2=(""+row[cSub2]).trim();
            subsArr.push({subject:s2, hours:parseInt(row[cSub2H],10)||0, isMain:isMainSubject(s2)});
          }
        } else {
          var subject=(""+row[cSubj]).trim();
          var subs=subject.split(/[|／/、,，]/).map(function(x){return x.trim();}).filter(Boolean);
          var hrs=(""+(row[cHours]||"")).split(/[|／/、,，]/).map(function(x){return parseInt(x,10)||0;});
          subsArr=subs.map(function(s,i){ return {subject:s, hours: hrs[i]||0, isMain:isMainSubject(s)}; });
          if(!subsArr.length) subsArr=[{subject:subject,hours:parseInt(row[cHours],10)||0,isMain:isMainSubject(subject)}];
        }
        if(!subsArr.length) continue;
        teachers.push({id:"T"+(++n),name:name,subjects:subsArr,grades:grades.length?grades:[1],isHeadTeacher:isHead,headClass:headClass});
      }
      APP.teachers=teachers;
      var impCourse = document.getElementById("impCourse");
      var courseN = (impCourse && impCourse.checked) ? applyCourseSheet(wb) : 0;
      saveLocal(); closeModal("mTeachers");
      if(APP.state){ APP.selTeacher=teachers.length?teachers[0].id:null; }
      render();
      var msg = "已导入 "+teachers.length+" 位教师（班主任 "+teachers.filter(function(t){return t.isHeadTeacher;}).length+" 名）";
      if(courseN > 0) msg += "，课程已同步 "+courseN+" 个年级";
      else if(impCourse && impCourse.checked) msg += "，未找到模板课程页（课程未变）";
      toast(msg + (courseN>0 ? "。请重新「初始化排课」生效。" : "。"));
    }catch(err){ toast("读取失败："+err.message); }
    input.value="";
  };
  reader.readAsArrayBuffer(file);
}

/* 下载空模板：只含表头，数据为空 */
function downloadTemplate(scope){
  var HEAD=["姓名","主教科目","主教科目课时","兼教科目1","兼教科目1课时","兼教科目2","兼教科目2课时","任教年级","是否班主任","带班"];
  var wb=XLSX.utils.book_new();
  var ws=XLSX.utils.aoa_to_sheet([HEAD]);
  ws["!cols"]=[{wch:12},{wch:14},{wch:8},{wch:14},{wch:8},{wch:14},{wch:8},{wch:8},{wch:12},{wch:10}];
  XLSX.utils.book_append_sheet(wb,ws,"教师名单");
  // 各年级课程（与当前设置同步）
  var grades = APP.config && APP.config.grades ? APP.config.grades : defaultConfig().grades;
  var GNM={1:"一年级",2:"二年级",3:"三年级",4:"四年级",5:"五年级",6:"六年级"};
  var curRows=[["年级","班级数","科目（周课时）"]];
  grades.forEach(function(g){ if(scope!=="all" && g.grade!==scope) return; var s=Object.keys(g.curriculum).map(function(k){return k+":"+g.curriculum[k];}).join("  "); curRows.push([GNM[g.grade]||(g.grade+"年级"),g.classCount,s]); });
  var wsCur=XLSX.utils.aoa_to_sheet(curRows); wsCur["!cols"]=[{wch:10},{wch:8},{wch:70}];
  XLSX.utils.book_append_sheet(wb,wsCur,"各年级课程");
  // 填写说明
  var guide=[
    ["列","说明","填写规则 / 示例"],
    ["姓名","教师姓名","如：张伟。必填"],
    ["主教科目","教师主要任教学科","必填。科目名须与「设置-课程」完全一致；是否属于主科由「设置-规则」决定"],
    ["主教科目课时","主教科目每周课时","数字 = 所带班级数 × 该科周课时。必填"],
    ["兼教科目1","兼任第二学科","选填。如：劳动/美术"],
    ["兼教科目1课时","兼教科目每周课时","数字 = 该科覆盖班级数 × 该科周课时"],
    ["兼教科目2","兼任第三学科","选填"],
    ["兼教科目2课时","第二兼教科目每周课时","数字"],
    ["任教年级","任教年级","单年级填数字，如 1；跨年级用短横 1-2-3。必填"],
    ["是否班主任","是否班主任","Y 表示是；留空表示否。班主任须填「带班」"],
    ["带班","班主任所带班级","仅班主任填，格式严格为 一(1)/二(3)"],
    ["","",""],
    ["注意1","科目名一致性","科目必须与设置里的课程名逐字一致，否则该科排不进课表"],
    ["注意2","班主任限1科","班主任默认只填主教科目，不填兼教科目"],
    ["注意3","兼教课时算法","兼教课时 = 该科覆盖的班级数 × 该科周课时"],
    ["注意4","保存格式","填写后另存为 .xlsx 上传到本页即可一键识别"]
  ];
  var wsGuide=XLSX.utils.aoa_to_sheet(guide); wsGuide["!cols"]=[{wch:18},{wch:28},{wch:48}];
  XLSX.utils.book_append_sheet(wb,wsGuide,"填写说明");
  var out=XLSX.write(wb,{bookType:"xlsx",type:"array"});
  var blob=new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  var a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download = scope==="all" ? "教师名单空模板_全年级.xlsx" : "教师名单空模板_一年级.xlsx";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1500);
}

/* ---- 设置弹窗：可视化编辑器（年级班级数 / 教室 / 课程矩阵） ---- */
var _draft = null;

function initDraft(){
  var cfg = APP.config || defaultConfig();
  normalizeRoomMeta(cfg);
  normalizeCurric(cfg);
  normalizeSchedule(cfg);
  var GN = {1:15,2:17,3:23,4:23,5:11,6:10};
  _draft = {
    days: cfg.days || 5,
    morning: cfg.morning || 3,
    afternoon: cfg.afternoon || 3,
    earlyReading: !!cfg.earlyReading,
    eveningSelfStudy: !!cfg.eveningSelfStudy,
    selfStudy: !!(cfg.grades||[]).some(function(g){ return g.hasSelfStudy; }),
    meeting: cfg.meeting !== false,
    headMax: cfg.headMaxSubj || 1,
    otherMax: cfg.otherMaxSubj || 2,
    rules: Object.assign({mainSubjects:["语文","数学","英语","科学"],mainMorning:true,noBackToBackSame:true,peNotFirst:true,peNoConsecutive:true,mainFollowSelfStudy:false,balance:true, dailyMinMain:{}}, cfg.rules || {}),
    grades: [],
    rooms: [],
    curric: {}
  };
  _draft.rules.mainSubjects = Array.isArray(_draft.rules.mainSubjects) ? _draft.rules.mainSubjects.slice() : ["语文","数学","英语","科学"];
  _draft.rules.dailyMinMain = Object.assign({}, _draft.rules.dailyMinMain || {});
  // 教室 → 数组：[{type, name, subs, count}]
  Object.keys(cfg.rooms || {}).forEach(function(t){
    _draft.rooms.push({
      type: t,
      name: (cfg.roomNames && cfg.roomNames[t]) || t,
      subs: (cfg.roomSubjs && cfg.roomSubjs[t] || []).slice(),
      count: Math.max(0, parseInt(cfg.rooms[t],10) || 0)
    });
  });
  // 仅当从未配置过教室（cfg.rooms 缺失）才填默认 4 类；
  // 用户保存的空对象 {}（删光所有教室）保持为空，不恢复默认
  if(!_draft.rooms.length && !cfg.rooms){
    ["music","art","computer","science"].forEach(function(t){
      _draft.rooms.push({ type:t, name:{music:"音乐教室",art:"美术教室",computer:"计算机教室",science:"科学实验室"}[t], subs:{music:["音乐"],art:["美术"],computer:["计算机","信息"],science:["科学"]}[t].slice(), count: t==="science"?1:2 });
    });
  }
  for(var g=1; g<=6; g++){
    var found = (cfg.grades||[]).find(function(x){ return x.grade===g; });
    _draft.grades.push({
      grade: g,
      classCount: found? found.classCount : GN[g],
      enabled: !!found
    });
  }
  // 收集所有出现过的科目（按 ALL_SUBJECTS 优先顺序，再补其余）
  var subjSet = {}; var order = [];
  ALL_SUBJECTS.forEach(function(s){ if(!subjSet[s]){ subjSet[s]=true; order.push(s); } });
  (cfg.grades||[]).forEach(function(g){
    Object.keys(g.curriculum||{}).forEach(function(s){ if(!subjSet[s]){ subjSet[s]=true; order.push(s); } });
  });
  order.forEach(function(s){ _draft.curric[s] = {}; });
  (cfg.grades||[]).forEach(function(g){
    Object.keys(g.curriculum||{}).forEach(function(s){ if(_draft.curric[s]) _draft.curric[s][g.grade] = g.curriculum[s]; });
  });
}

function buildGradesTable(){
  var tb = document.querySelector("#setGradesTable tbody"); if(!tb) return;
  tb.innerHTML="";
  var GN = {1:"一年级",2:"二年级",3:"三年级",4:"四年级",5:"五年级",6:"六年级"};
  _draft.grades.forEach(function(g){
    var tr = document.createElement("tr"); tr.dataset.g = g.grade;
    tr.innerHTML =
      '<td>'+GN[g.grade]+'</td>'+
      '<td><button type="button" class="btn-step" onclick="stepGrade('+g.grade+',-1)">−</button> '+
        '<input type="number" min="0" max="40" value="'+g.classCount+'" oninput="onGradeCnt('+g.grade+',this.value)"> '+
        '<button type="button" class="btn-step" onclick="stepGrade('+g.grade+',1)">+</button></td>'+
      '<td><input type="checkbox" '+(g.enabled?'checked':'')+' onchange="onGradeEn('+g.grade+',this.checked)"></td>';
    tb.appendChild(tr);
  });
}
function stepGrade(g, d){ var it=_draft.grades.find(function(x){return x.grade===g;}); it.classCount=Math.max(0,Math.min(40,it.classCount+d)); buildGradesTable(); }
function onGradeCnt(g,v){ var it=_draft.grades.find(function(x){return x.grade===g;}); it.classCount=Math.max(0,parseInt(v,10)||0); }
function onGradeEn(g,en){ var it=_draft.grades.find(function(x){return x.grade===g;}); it.enabled=en; buildCourseTable(); refreshSubjOptions(); }

function buildRoomsTable(){
  var tb = document.querySelector("#setRoomsTable tbody"); if(!tb) return;
  tb.innerHTML="";
  _draft.rooms.forEach(function(r, idx){
    var tr = document.createElement("tr"); tr.dataset.t = r.type;
    var q = r.type.replace(/'/g,"\\'");
    tr.innerHTML =
      '<td><input type="text" class="nm-input" value="'+r.name.replace(/"/g,"&quot;")+'" oninput="onRoomName(\''+q+'\',this.value)"></td>'+
      '<td><input type="text" value="'+r.subs.join("，")+'" placeholder="如：书法，综合与实践" oninput="onRoomSubs(\''+q+'\',this.value)"></td>'+
      '<td><button type="button" class="btn-step" onclick="stepRoom(\''+q+'\',-1)">−</button> '+
        '<input type="number" min="0" max="20" value="'+r.count+'" oninput="onRoomCnt(\''+q+'\',this.value)"> '+
        '<button type="button" class="btn-step" onclick="stepRoom(\''+q+'\',1)">+</button></td>'+
      '<td><button type="button" class="rm-btn" onclick="removeRoom(\''+q+'\', this)">删除</button></td>';
    tb.appendChild(tr);
  });
}
function roomByType(t){ return _draft.rooms.find(function(r){ return r.type===t; }); }
function stepRoom(t,d){ var r=roomByType(t); if(r) r.count=Math.max(0,Math.min(20,r.count+d)); buildRoomsTable(); }
function onRoomCnt(t,v){ var r=roomByType(t); if(r) r.count=Math.max(0,parseInt(v,10)||0); }
function onRoomName(t,v){ var r=roomByType(t); if(r) r.name=v; }
function onRoomSubs(t,v){ var r=roomByType(t); if(r) r.subs=v.split(/[,，、;；]/).map(function(x){return x.trim();}).filter(Boolean); }
function addRoom(){
  var idx = 1;
  while(roomByType("r"+idx)) idx++;
  _draft.rooms.push({ type:"r"+idx, name:"新教室"+idx, subs:[], count:1 });
  buildRoomsTable();
}
/* 二次点击确认（避免误删/误覆盖；不用 confirm，防 iframe 拦截） */
function armConfirm(key, btn, fn, text){
  if(btn.dataset.arm==="1"){
    delete btn.dataset.arm; btn.textContent="删除"; btn.classList.remove("arm");
    fn(); return;
  }
  btn.dataset.arm="1";
  var old = btn.textContent;
  btn.textContent = text || "确认？";
  btn.classList.add("arm");
  setTimeout(function(){
    if(btn && btn.dataset.arm==="1"){ delete btn.dataset.arm; btn.textContent=old; btn.classList.remove("arm"); }
  }, 2500);
}
function removeRoom(t, btn){
  armConfirm(t, btn, function(){
    _draft.rooms = _draft.rooms.filter(function(r){ return r.type!==t; });
    buildRoomsTable();
  }, "确认删除？");
}
function removeCourse(subj, btn){
  armConfirm(subj, btn, function(){
    delete _draft.curric[subj];
    buildCourseTable(); refreshSubjOptions();
  }, "确认删除？");
}

function refreshSubjOptions(){
  var dl = document.getElementById("setSubjList"); if(!dl) return;
  dl.innerHTML = ALL_SUBJECTS.filter(function(s){ return !_draft.curric[s]; }).map(function(s){ return '<option value="'+s+'">'; }).join("");
}

function buildCourseTable(){
  var tb = document.getElementById("setCourseTable"); if(!tb) return;
  tb.innerHTML="";
  var GL = {1:"一",2:"二",3:"三",4:"四",5:"五",6:"六"};
  // 表头：科目 + 启用的年级
  var thead = document.createElement("thead");
  var trh = document.createElement("tr");
  var html = '<th>科目</th>';
  var enabled = _draft.grades.filter(function(g){ return g.enabled; }).map(function(g){ return g.grade; });
  enabled.forEach(function(g){ html += '<th>'+GL[g]+'年级</th>'; });
  html += '<th></th>';
  trh.innerHTML = html;
  thead.appendChild(trh); tb.appendChild(thead);
  // 主体
  var tbody = document.createElement("tbody");
  Object.keys(_draft.curric).forEach(function(subj){
    var tr = document.createElement("tr");
    var cells = '<td>'+subj+'</td>';
    enabled.forEach(function(g){
      var v = _draft.curric[subj][g] || 0;
      cells += '<td><input type="number" min="0" max="20" value="'+v+'" oninput="onCourse(\''+subj.replace(/'/g,"\\'")+'\','+g+',this.value)"></td>';
    });
    cells += '<td><button type="button" class="rm-btn" onclick="removeCourse(\''+subj.replace(/'/g,"\\'")+'\', this)">删除</button></td>';
    tr.innerHTML = cells;
    tbody.appendChild(tr);
  });
  tb.appendChild(tbody);
}
function onCourse(subj,g,v){ _draft.curric[subj]=_draft.curric[subj]||{}; _draft.curric[subj][g]=Math.max(0,parseInt(v,10)||0); }
function addCourseSubject(){
  var inp = document.getElementById("setSubjInput");
  var s = (inp.value||"").trim();
  if(!s){ toast("请输入科目名"); return; }
  if(_draft.curric[s]){ toast("该科目已存在"); return; }
  _draft.curric[s] = {};
  // 追加到末尾（不重排已有顺序）
  inp.value = "";
  buildCourseTable(); refreshSubjOptions();
}
function copyG1ToAll(btn){
  var src = {}; for(var s in _draft.curric){ src[s] = _draft.curric[s][1] || 0; }
  var enabled = _draft.grades.filter(function(g){ return g.enabled && g.grade>1; });
  if(!enabled.length) return;
  armConfirm("g1toall", btn, function(){
    enabled.forEach(function(g){
      for(var s in _draft.curric){ _draft.curric[s][g.grade] = src[s] || 0; }
    });
    buildCourseTable();
  }, "确认覆盖？");
}
/* 恢复默认课程：按 gradeCurric 把各年级课时填回（用于误清空课时一键恢复） */
function resetCourseDefault(){
  if(!_draft) initDraft();
  armConfirm("resetCourse", document.activeElement || document.body, function(){
    for(var g=1; g<=6; g++){
      var cur = gradeCurric(g);
      Object.keys(cur).forEach(function(s){
        if(!_draft.curric[s]) _draft.curric[s] = {};
        _draft.curric[s][g] = cur[s];
      });
    }
    buildCourseTable(); refreshSubjOptions();
  }, "确认覆盖？");
}

/* 兼容：补齐教室元数据（旧数据只有 rooms 数字） */
function normalizeRoomMeta(cfg){
  if(!cfg) return cfg;
  if(!cfg.rooms) cfg.rooms = {music:2,art:2,computer:2,science:1};
  if(!cfg.roomSubjs) cfg.roomSubjs = {music:["音乐"],art:["美术"],computer:["计算机","信息"],science:["科学"]};
  if(!cfg.roomNames) cfg.roomNames = {music:"音乐教室",art:"美术教室",computer:"计算机教室",science:"科学实验室"};
  return cfg;
}
/* 兼容：修复曾误存为"科目×年级矩阵"的 curriculum（值为 {grade:hours} 对象 → 转回本年级课时） */
function normalizeCurric(cfg){
  if(!cfg || !cfg.grades) return cfg;
  cfg.grades.forEach(function(g){
    if(!g.curriculum) return;
    Object.keys(g.curriculum).forEach(function(s){
      var v = g.curriculum[s];
      if(v && typeof v === "object"){
        g.curriculum[s] = v[g.grade] || 0;
      }
    });
  });
  return cfg;
}
/* 兼容：旧 periodsPerDay 迁移到 morning/afternoon（默认上午3+下午3） */
function normalizeSchedule(cfg){
  if(!cfg) return cfg;
  if(cfg.periodsPerDay != null && cfg.morning == null){
    cfg.afternoon = cfg.afternoon || Math.max(0, Math.floor(cfg.periodsPerDay / 2));
    cfg.morning = Math.max(1, cfg.periodsPerDay - cfg.afternoon);
    delete cfg.periodsPerDay;
  }
  if(cfg.morning == null) cfg.morning = 3;
  if(cfg.afternoon == null) cfg.afternoon = 3;
  if(cfg.earlyReading == null) cfg.earlyReading = false;
  if(cfg.eveningSelfStudy == null) cfg.eveningSelfStudy = false;
  return cfg;
}

function applySettings(){
  try{
    if(!_draft){ initDraft(); }
    var days = _draft.days;
    var grades = [];
    _draft.grades.forEach(function(g){
      if(g.enabled && g.classCount>0){
        // 每年级独立的 {科目: 课时}（不能共享矩阵对象，否则引擎读到的课时全是 0）
        var cur = {};
        Object.keys(_draft.curric).forEach(function(subj){
          var h = _draft.curric[subj][g.grade] || 0;
          if(h > 0) cur[subj] = h;
        });
        grades.push({
          grade: g.grade,
          classCount: g.classCount,
          hasSelfStudy: _draft.selfStudy && g.grade === 1,
          curriculum: cur
        });
      }
    });
    if(!grades.length){ toast("至少启用一个年级并设置班级数"); return; }
    var rooms = {}, roomNames = {}, roomSubjs = {};
    _draft.rooms.forEach(function(r){
      rooms[r.type] = r.count;
      roomNames[r.type] = r.name || r.type;
      roomSubjs[r.type] = (r.subs || []).slice();
    });
    var enabledSubject = {};
    grades.forEach(function(g){ Object.keys(g.curriculum).forEach(function(s){ if((g.curriculum[s]|0)>0) enabledSubject[s]=true; }); });
    var mainSubjects = (_draft.rules.mainSubjects||[]).filter(function(s,i,a){ return enabledSubject[s] && a.indexOf(s)===i; });
    var dailyMinMain = {};
    mainSubjects.forEach(function(s){ if(_draft.rules.dailyMinMain && _draft.rules.dailyMinMain[s]) dailyMinMain[s]=true; });
    APP.config = {
      days: days,
      morning: _draft.morning,
      afternoon: _draft.afternoon,
      earlyReading: _draft.earlyReading,
      eveningSelfStudy: _draft.eveningSelfStudy,
      grades: grades,
      rooms: rooms,
      roomNames: roomNames,
      roomSubjs: roomSubjs,
      meeting: _draft.meeting,
      headMaxSubj: _draft.headMax,
      otherMaxSubj: _draft.otherMax,
      rules: Object.assign({}, _draft.rules, {balance:true, mainSubjects:mainSubjects, dailyMinMain:dailyMinMain})
    };
    syncTeacherMainFlags();
    saveLocal(); closeModal("mSettings");
    // 保存后自动按新结构重建课表并重排；结构可能变化，因此原课表和锁定会清空。
    if(APP.state){
      rebuildState();
      toast("设置已保存，已按新结构重建课表并重排；原课表和锁定已清空。");
    } else {
      toast("设置已保存。请点「初始化排课」开始。");
    }
  }catch(err){ toast("设置保存失败："+err.message); }
}
/* 用当前 APP.config 重建课表并全排（保存设置/导入后调用） */
function rebuildState(){
  APP.teachers.forEach(function(t,i){ if(t.id==null) t.id="T"+(i+1); });
  APP.state = S.initState(APP.config, APP.teachers);
  S.applyDefaultFixed(APP.state);
  S.autoSchedule(APP.state);
  APP.selTeacher = APP.teachers.length ? APP.teachers[0].id : null;
  APP.selClass = APP.state.classes.length ? APP.state.classes[0].id : null;
  APP.view = "class";
  updateViewSeg();
  saveLocal(); render();
}
/* 从导入的 xlsx 中读取「各年级课程」sheet，填充 config.grades[*].curriculum（勾选"同步课程"时调用） */
function applyCourseSheet(wb){
  if(!wb || !APP.config || !APP.config.grades) return 0;
  var sn = wb.SheetNames.find(function(n){ return (""+n).indexOf("课程")>=0; });
  if(!sn) return 0;
  var rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header:1, defval:"" });
  var hi = -1;
  for(var i=0;i<rows.length;i++){
    if(rows[i] && rows[i].some(function(c){ return (""+c).indexOf("年级")>=0; }) && rows[i].some(function(c){ return (""+c).indexOf("科目")>=0; })){ hi=i; break; }
  }
  if(hi<0) return 0;
  var GNM = {"一":1,"二":2,"三":3,"四":4,"五":5,"六":6};
  var updated = 0;
  rows.slice(hi+1).forEach(function(r){
    if(!r || !(""+r[0]).trim()) return;
    var label = (""+r[0]).trim();
    var g = GNM[label.charAt(0)] || parseInt(label,10);
    if(!g || g<1 || g>6) return;
    var subjStr = "" + (r[2]||"");
    var cur = {};
    subjStr.split(/[\s]+/).forEach(function(part){
      part = part.trim(); if(!part) return;
      var kv = part.split(":");
      if(kv.length===2 && kv[1] !== "") cur[kv[0].trim()] = parseInt(kv[1],10)||0;
    });
    if(!Object.keys(cur).length) return;
    var found = APP.config.grades.find(function(x){ return x.grade===g; });
    if(found){ found.curriculum = cur; updated++; }
  });
  return updated;
}

function gradeCurric(g){
  var base={语文:5,数学:4,英语:3,"道德与法治":2,音乐:2,美术:2,科学:2,劳动:1,"信息":1};
  if(g===1) return {语文:5,数学:4,"体育与健康":3,"道德与法治":2,音乐:2,足球:1,"综合与实践":1,美术:2,体能:1,劳动:1,科学:1,书法:1};
  return base;
}

function applyBatchFixed(){
  if(!APP.state){ toast("请先初始化排课"); return; }
  var day=parseInt(document.getElementById("fxDay").value,10)-1;
  var per=parseInt(document.getElementById("fxPer").value,10)-1;
  var subj=document.getElementById("fxSubj").value.trim();
  if(!subj) return;
  var P=APP.S.dailyTotal(state.config), slot=day*P+per;
  var cnt=0;
  APP.state.classes.forEach(function(c){
    // 仅对含该科目的班固定
    var cur=APP.state.config.grades.find(function(g){return g.grade===c.grade;});
    if(cur && cur.curriculum[subj]){ S.setFixedCell(APP.state,c.id,slot,subj,null); cnt++; }
  });
  saveLocal(); closeModal("mFixed"); render();
  toast("已批量固定「"+subj+"」到 周"+(day+1)+"第"+(per+1)+"节，共"+cnt+"班。");
}

/* ---- 导出/打印 ---- */
function doExport(){
  if(!APP.state){ toast("请先排课"); return; }
  var st=APP.state, P=st.P, D=st.config.days;
  // 行标签（节次）：依据分段结构 早读/上午第N/下午第N/晚自习 生成
  var rowLabels=[];
  (st.segs||[]).forEach(function(seg){
    for(var i=0;i<seg.count;i++){ rowLabels.push(seg.count>1 ? seg.name+(i+1) : seg.name); }
  });
  if(!rowLabels.length){ for(var k=0;k<P;k++) rowLabels.push("第"+(k+1)+"节"); }
  // 列头（周）
  var wname=["一","二","三","四","五","六","日"];
  var dayHeads=[];
  for(var d=0; d<D; d++){ dayHeads.push(d<7 ? "周"+wname[d] : "周"+(d+1)); }
  // 组装：每班一个区块，行=节次、列=周一..周日，格="科目·教师"
  var lines=[];
  lines.push("全校课表矩阵");
  lines.push("");
  st.classes.forEach(function(c){
    lines.push(c.label+"班");
    lines.push(["节次"].concat(dayHeads).join(","));
    for(var p=0; p<P; p++){
      var row=[rowLabels[p]];
      for(var d=0; d<D; d++){
        var cell=st.grid[c.id][d*P+p];
        var txt="";
        if(cell && cell.subject){
          txt=cell.subject;
          if(cell.teacherId && st.teacherById[cell.teacherId]) txt+="·"+st.teacherById[cell.teacherId].name;
        }
        row.push(txt);
      }
      lines.push(row.join(","));
    }
    lines.push(""); // 班级之间空一行分隔
  });
  download("全校课表矩阵.csv", lines.join("\n"));
}
function download(name,content){
  var blob=new Blob(["\ufeff"+content],{type:"text/csv;charset=utf-8"});
  var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.click();
}
function doPrint(){
  var t=document.getElementById("printTitle");
  var txt="";
  if(APP.leftSubject){ txt=APP.leftSubject+" 排课表"; }
  else if(APP.view==="class" && APP.selClass && APP.state){
    var c=APP.state.classById[APP.selClass];
    if(c) txt=c.label+"班 课程表";
  } else if(APP.view==="teacher" && APP.selTeacher && APP.state){
    var tc=APP.state.teacherById[APP.selTeacher];
    if(tc) txt=tc.name+"老师 课程表";
  }
  if(txt && t){ t.textContent=txt; }
  window.print();
}

/* ---- 持久化 ---- */
function saveLocal(){
  try{
    localStorage.setItem(LS_KEY, JSON.stringify({config:APP.config, teachers:APP.teachers, grid: APP.state? APP.state.grid:null, locked: APP.state? APP.state._lockedTeachers:null}));
  }catch(e){}
}
function loadLocal(){
  try{
    var raw=localStorage.getItem(LS_KEY); if(!raw) return false;
    var d=JSON.parse(raw);
    APP.config=d.config||null; APP.teachers=d.teachers||[];
    if(APP.config){ normalizeRoomMeta(APP.config); normalizeCurric(APP.config); normalizeSchedule(APP.config); }
    APP.teachers.forEach(function(t){ if(!t.subjects){ t.subjects=[{subject:t.subject, hours:t.hours, isMain:isMainSubject(t.subject)}]; } });
    if(d.grid && d.config){
      APP.state=S.initState(d.config, APP.teachers);
      APP.state.grid=d.grid;
      APP.state._lockedTeachers=d.locked||{};
      APP.selTeacher=APP.teachers.length?APP.teachers[0].id:null;
      APP.selClass=APP.state.classes.length?APP.state.classes[0].id:null;
      APP.view="class";
      APP.state._lastUnscheduled=[]; APP.state._lastSupply=[];
      return true;
    }
  }catch(e){}
  return false;
}

/* ---- 分隔条拖拽 ---- */
function initResizer(){
  var r=document.getElementById("resizer"); if(!r) return;
  r.onpointerdown=function(e){
    e.preventDefault();
    r.classList.add("resizing");
    var startX=e.clientX;
    var startW=parseFloat(getComputedStyle(document.querySelector(".left")).width);
    document.body.style.cursor="col-resize";
    function onMove(ev){
      var newW=startW+(ev.clientX-startX);
      var minW=180, maxW=Math.max(minW, window.innerWidth-760);
      if(newW<minW) newW=minW; if(newW>maxW) newW=maxW;
      document.querySelector(".left").style.width=newW+"px";
    }
    function onUp(){
      r.classList.remove("resizing");
      document.removeEventListener("pointermove",onMove);
      document.removeEventListener("pointerup",onUp);
      document.body.style.cursor="";
    }
    document.addEventListener("pointermove",onMove);
    document.addEventListener("pointerup",onUp);
  };
}

/* ---- 视图切换 ---- */
document.getElementById("viewSeg").addEventListener("click",function(e){
  var b=e.target.getAttribute("data-v"); if(!b) return;
  APP.view=b;
  Array.prototype.forEach.call(this.children,function(x){ x.classList.toggle("on", x.getAttribute("data-v")===b); });
  render();
});

/* ---- 绑定按钮 ---- */
document.getElementById("btnInit").onclick=doInit;
document.getElementById("btnHead").onclick=doHead;
document.getElementById("btnAll").onclick=doAll;
document.getElementById("btnFixed").onclick=function(){ openModal("mFixed"); };
document.getElementById("btnImport").onclick=function(){ openModal("mTeachers"); };
document.getElementById("btnSettings").onclick=function(){
  if(!APP.config) return;
  initDraft();
  _settingsTab="basic";
  Array.prototype.forEach.call(document.querySelectorAll("#setNav button"), function(b){ b.classList.toggle("on", b.dataset.tab==="basic"); });
  renderSettingsTab();
  // 固定课范围年级
  var sel=document.getElementById("fxScope"); sel.innerHTML='<option value="all">全校</option>'+APP.config.grades.map(function(g){return '<option value="'+g.grade+'">'+({1:"一年级",2:"二年级",3:"三年级",4:"四年级",5:"五年级",6:"六年级"})[g.grade]+'</option>';}).join("");
  openModal("mSettings");
};
document.getElementById("setNav").addEventListener("click", function(e){
  var b=e.target.closest("button[data-tab]"); if(!b) return;
  switchSettingsTab(b.dataset.tab);
});
document.getElementById("btnExport").onclick=doExport;
document.getElementById("btnPrint").onclick=doPrint;

var _settingsTab = "basic";
function switchSettingsTab(tab){
  _settingsTab = tab;
  Array.prototype.forEach.call(document.querySelectorAll("#setNav button"), function(b){ b.classList.toggle("on", b.dataset.tab===tab); });
  renderSettingsTab();
}
function renderSettingsTab(){
  var el = document.getElementById("setContent"); if(!el) return;
  var html = "";
  function escAttr(s){ return (""+s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
  if(_settingsTab==="basic"){
    html = '<h3>基础</h3>'
      +'<div class="field-row"><label>每周天数</label><input id="setDays" type="number" min="1" max="7" oninput="onDraft(\'days\',this.value)"></div>'
      +'<div class="field-row"><label>上午节数</label><input id="setMorning" type="number" min="1" max="8" oninput="onDraft(\'morning\',this.value)"></div>'
      +'<div class="field-row"><label>下午节数</label><input id="setAfternoon" type="number" min="1" max="8" oninput="onDraft(\'afternoon\',this.value)"></div>'
      +'<div style="margin:6px 0;display:flex;flex-direction:column;gap:8px;">'
        +'<label class="opt"><input type="checkbox" id="setEarly" onchange="onDraftChk(\'earlyReading\',this.checked)"> 启用早读（每天最前 1 节）</label>'
        +'<label class="opt"><input type="checkbox" id="setEvening" onchange="onDraftChk(\'eveningSelfStudy\',this.checked)"> 启用晚自习（每天最后 1 节）</label>'
        +'<label class="opt"><input type="checkbox" id="setSelf" onchange="onDraftChk(\'selfStudy\',this.checked)"> 默认自习（非周末最后节；周一给班会）</label>'
        +'<label class="opt"><input type="checkbox" id="setMeet" onchange="onDraftChk(\'meeting\',this.checked)"> 默认班会（周一最后节）</label>'
      +'</div>'
      +'<p class="hint" style="margin:0;font-size:11px;">总节数/天 = '+(_draft.earlyReading?'1+':'')+'上午'+_draft.morning+'节 + 下午'+_draft.afternoon+'节'+(_draft.eveningSelfStudy?'+1':'')+' = '+((_draft.earlyReading?1:0)+_draft.morning+_draft.afternoon+(_draft.eveningSelfStudy?1:0))+' 节</p>';
  } else if(_settingsTab==="grades"){
    html = '<h3>年级与班级数</h3>'
      +'<p class="hint" style="margin:0 0 8px;">关闭启用 = 不生成该年级班级（也不会排课）。</p>'
      +'<table class="set-table" id="setGradesTable"><thead><tr><th>年级</th><th>班级数</th><th>启用</th></tr></thead><tbody></tbody></table>';
  } else if(_settingsTab==="rooms"){
    html = '<h3>专用教室</h3>'
      +'<p class="hint" style="margin:0 0 8px;">可增删。「适用科目」决定哪些科目占这间教室的容量（空 = 不查容量）。</p>'
      +'<table class="set-table" id="setRoomsTable"><thead><tr><th>教室名称</th><th>适用科目（逗号分隔）</th><th>间数</th><th></th></tr></thead><tbody></tbody></table>'
      +'<div class="course-add" style="margin-top:8px;"><button type="button" class="btn primary" onclick="addRoom()">+ 添加教室</button></div>';
  } else if(_settingsTab==="courses"){
    html = '<h3>各年级课程</h3>'
      +'<p class="hint" style="margin:0 0 8px;">点格子编辑课时（0 = 不教）。可增删科目；表头只显示启用的年级。</p>'
      +'<div style="margin:0 0 8px;"><button type="button" class="btn" onclick="resetCourseDefault()">恢复默认课程</button> <span style="font-size:11px;color:var(--muted);margin-left:6px;">误清空课时时一键填回默认（一年含体育/足球/体能，二年级起含英语/美术/道德…）</span></div>'
      +'<div class="course-add">'
        +'<input list="setSubjList" id="setSubjInput" placeholder="选择或输入科目名">'
        +'<datalist id="setSubjList"></datalist>'
        +'<button type="button" class="btn primary" onclick="addCourseSubject()">+ 添加科目</button>'
        +'<button type="button" class="btn" onclick="copyG1ToAll(this)">复制一年级到全部</button>'
      +'</div>'
      +'<div class="course-table-wrap" style="margin-top:8px;"><table class="set-table course-table" id="setCourseTable"></table></div>';
  } else if(_settingsTab==="rules"){
    var configuredMain = _draft.rules.mainSubjects || [];
    var mainChoices = Object.keys(_draft.curric||{}).filter(function(s){
      if(s==="自习"||s==="班会") return false;
      if(configuredMain.indexOf(s)>=0) return true;
      return _draft.grades.some(function(g){ return g.enabled && _draft.curric[s] && (_draft.curric[s][g.grade]|0)>0; });
    });
    var mainChoiceHtml = mainChoices.length ? mainChoices.map(function(s){
      return '<label class="opt"><input type="checkbox" data-main-subject="'+escAttr(s)+'" onchange="onDraftMainSubject(this)" '+(configuredMain.indexOf(s)>=0?'checked':'')+'> '+escAttr(s)+'</label>';
    }).join('') : '<div class="hint">请先在“课程”中设置至少一门课程。</div>';
    var dailyMainHtml = configuredMain.length ? configuredMain.map(function(s){
      var ck=!!(_draft.rules.dailyMinMain&&_draft.rules.dailyMinMain[s]);
      return '<label class="opt"><input type="checkbox" data-daily-main="'+escAttr(s)+'" onchange="onDraftDailyMain(this)" '+(ck?'checked':'')+'> 每天至少 1 节'+escAttr(s)+'</label>';
    }).join('') : '<div class="hint">尚未选择主科，此规则不生效。</div>';
    html = '<h3>规则开关</h3>'
      +'<p class="hint" style="margin:0 0 8px;">先选择本学年认定的主科。下面所有“主科”规则、排课优先级、颜色和统计都会使用这份名单。</p>'
      +'<div class="opt-grid" style="margin-bottom:14px;">'+mainChoiceHtml+'</div>'
      +'<div class="opt-grid">'
        +'<label class="opt"><input type="checkbox" id="rMain" onchange="onDraftChk(\'rMain\',this.checked)"> 主科集中上午</label>'
        +'<label class="opt"><input type="checkbox" id="rNoSame" onchange="onDraftChk(\'rNoSame\',this.checked)"> 同科不连堂</label>'
        +'<label class="opt"><input type="checkbox" id="rPe1" onchange="onDraftChk(\'rPe1\',this.checked)"> 体育不排第1节</label>'
        +'<label class="opt"><input type="checkbox" id="rPeNo" onchange="onDraftChk(\'rPeNo\',this.checked)"> 体育不连堂</label>'
        +'<label class="opt"><input type="checkbox" id="rMainSelf" onchange="onDraftChk(\'rMainSelf\',this.checked)"> 主课后固定跟自习（同老师，成对锁定）</label>'
      +'</div>'
      +'<p class="hint" style="margin:8px 0 0;">该项是硬规则：每节选中的主科后占用一节普通课位作为自习，不能跨天或占用早读、晚自习。启用前请核对总课位；主课较多时会造成其他课程大量未排。</p>'
      +'<h3 style="margin-top:18px;">每日最少主科</h3>'
      +'<p class="hint" style="margin:0 0 8px;">只列出上面选中的主科。某年级没有该课程时会自动跳过；与“主课后跟自习”同时启用时，成对规则优先，未达到每日最低会列入冲突清单。</p>'
      +'<div class="opt-grid">'+dailyMainHtml+'</div>';
  } else if(_settingsTab==="teachers"){
    html = '<h3>教师多科目</h3>'
      +'<div class="field-row"><label>班主任最多科目数</label><input id="setHeadMax" type="number" min="1" max="6" oninput="onDraft(\'headMax\',this.value)"></div>'
      +'<div class="field-row"><label>其他老师最多科目数</label><input id="setOtherMax" type="number" min="1" max="6" oninput="onDraft(\'otherMax\',this.value)"></div>'
      +'<p class="hint" style="margin-top:0;">主科名单在“规则”中设置；班主任默认限1科。</p>';
  }
  el.innerHTML = html;
  if(_settingsTab==="basic"){
    document.getElementById("setDays").value=_draft.days;
    document.getElementById("setMorning").value=_draft.morning;
    document.getElementById("setAfternoon").value=_draft.afternoon;
    document.getElementById("setEarly").checked=_draft.earlyReading;
    document.getElementById("setEvening").checked=_draft.eveningSelfStudy;
    document.getElementById("setSelf").checked=_draft.selfStudy;
    document.getElementById("setMeet").checked=_draft.meeting;
  } else if(_settingsTab==="rules"){
    document.getElementById("rMain").checked=!!_draft.rules.mainMorning;
    document.getElementById("rNoSame").checked=!!_draft.rules.noBackToBackSame;
    document.getElementById("rPe1").checked=!!_draft.rules.peNotFirst;
    document.getElementById("rPeNo").checked=!!_draft.rules.peNoConsecutive;
    document.getElementById("rMainSelf").checked=!!_draft.rules.mainFollowSelfStudy;
  } else if(_settingsTab==="teachers"){
    document.getElementById("setHeadMax").value=_draft.headMax;
    document.getElementById("setOtherMax").value=_draft.otherMax;
  } else if(_settingsTab==="grades"){
    buildGradesTable();
  } else if(_settingsTab==="rooms"){
    buildRoomsTable();
  } else if(_settingsTab==="courses"){
    buildCourseTable(); refreshSubjOptions();
  }
}
/* 编辑时写回 _draft（保存不依赖当前 tab 的 DOM） */
function onDraft(key, v){
  if(key==="days") _draft.days=Math.max(1,Math.min(7,parseInt(v,10)||5));
  else if(key==="morning") _draft.morning=Math.max(1,Math.min(8,parseInt(v,10)||3));
  else if(key==="afternoon") _draft.afternoon=Math.max(1,Math.min(8,parseInt(v,10)||3));
  else if(key==="headMax") _draft.headMax=Math.max(1,parseInt(v,10)||1);
  else if(key==="otherMax") _draft.otherMax=Math.max(1,parseInt(v,10)||2);
}
function onDraftChk(key, ck){
  if(key==="selfStudy") _draft.selfStudy=ck;
  else if(key==="meeting") _draft.meeting=ck;
  else if(key==="earlyReading") _draft.earlyReading=ck;
  else if(key==="eveningSelfStudy") _draft.eveningSelfStudy=ck;
  else if(key==="rMain") _draft.rules.mainMorning=ck;
  else if(key==="rNoSame") _draft.rules.noBackToBackSame=ck;
  else if(key==="rPe1") _draft.rules.peNotFirst=ck;
  else if(key==="rPeNo") _draft.rules.peNoConsecutive=ck;
  else if(key==="rMainSelf") _draft.rules.mainFollowSelfStudy=ck;
}

function onDraftMainSubject(input){
  var key=input.getAttribute("data-main-subject"); if(!key) return;
  if(!_draft.rules.mainSubjects) _draft.rules.mainSubjects=[];
  var i=_draft.rules.mainSubjects.indexOf(key);
  if(input.checked && i<0) _draft.rules.mainSubjects.push(key);
  if(!input.checked && i>=0){
    _draft.rules.mainSubjects.splice(i,1);
    if(_draft.rules.dailyMinMain) delete _draft.rules.dailyMinMain[key];
  }
  renderSettingsTab();
}
function onDraftDailyMain(input){
  var key=input.getAttribute("data-daily-main"); if(!key) return;
  if(!_draft.rules.dailyMinMain) _draft.rules.dailyMinMain = {};
  _draft.rules.dailyMinMain[key] = !!input.checked;
}

/* ---- 启动 ---- */
if(!loadLocal()){ APP.config=defaultConfig(); APP.teachers=[]; }
render();
initResizer();
