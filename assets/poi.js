/* ============================================================
   燕园 · 北京大学校内 POI
   复用雾里楼台模板的写入作废：下列的水墨交互模块由 build.py 从模板切片注入，
   —— IUO 在本注入点之下才是本站自己的地图逻辑。
   ============================================================ */
  (function () {
    var gate = document.getElementById("gate");
    var cv = document.getElementById("gateCanvas");
    var btn = document.getElementById("gateBtn");
    var prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    function finish() {
      gate.classList.add("done");
      document.documentElement.style.overflow = prevOverflow;
    }
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
 
    var gl = cv.getContext("webgl2", { alpha: false, antialias: false });
    var ok = gl && (gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
    if (!ok) { // 降级：没有流体，只做淡出
      gate.classList.add("nogl");
      btn.addEventListener("click", function () {
        gate.classList.add("opening");
        setTimeout(finish, 1300);
      });
      return;
    }
 
    var cfg = { SIM: 150, DYE: 1024, ITER: 20, CURL: 20, VEL_DIS: 0.25, DYE_DIS: 0.05, DIFF: 0.1, FORCE: 5000, INK: 1, SIZE: 1 };
    var OPEN_DELAY = 250, OPEN_DUR = 1500, EDGE = 220;
 
    var VS = "#version 300 es\nout vec2 vUv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUv=p;gl_Position=vec4(p*2.-1.,0.,1.);}";
    var H = "#version 300 es\nprecision highp float;precision highp sampler2D;in vec2 vUv;out vec4 o;uniform vec2 ts;\n" +
      "#define vL (vUv-vec2(ts.x,0.))\n#define vR (vUv+vec2(ts.x,0.))\n#define vT (vUv+vec2(0.,ts.y))\n#define vB (vUv-vec2(0.,ts.y))\n";
    var FS = {
      splat: "uniform sampler2D uT;uniform float ar,rad;uniform vec3 col;uniform vec2 pt;" +
        "void main(){vec2 p=vUv-pt;p.x*=ar;o=vec4(texture(uT,vUv).rgb+exp(-dot(p,p)/rad)*col,1.);}",
      adv: "uniform sampler2D uV,uS;uniform vec2 vts,ds;uniform float dt,dis,dif;" +
        "void main(){vec2 c=vUv-dt*texture(uV,vUv).xy*vts;vec4 r=texture(uS,c);" +
        "if(dif>0.){vec4 a=(texture(uS,c+vec2(ds.x,0.))+texture(uS,c-vec2(ds.x,0.))+texture(uS,c+vec2(0.,ds.y))+texture(uS,c-vec2(0.,ds.y)))*.25;r=mix(r,a,dif);}" +
        "o=r/(1.+dis*dt);}",
      curl: "uniform sampler2D uV;void main(){float l=texture(uV,vL).y,r=texture(uV,vR).y,t=texture(uV,vT).x,b=texture(uV,vB).x;o=vec4(.5*(r-l-t+b),0.,0.,1.);}",
      vort: "uniform sampler2D uV,uC;uniform float cu,dt;" +
        "void main(){float l=texture(uC,vL).x,r=texture(uC,vR).x,t=texture(uC,vT).x,b=texture(uC,vB).x,c=texture(uC,vUv).x;" +
        "vec2 f=.5*vec2(abs(t)-abs(b),abs(r)-abs(l));f/=length(f)+1e-4;f*=cu*c;f.y*=-1.;" +
        "o=vec4(clamp(texture(uV,vUv).xy+f*dt,-1000.,1000.),0.,1.);}",
      div: "uniform sampler2D uV;" +
        "void main(){float l=texture(uV,vL).x,r=texture(uV,vR).x,t=texture(uV,vT).y,b=texture(uV,vB).y;vec2 c=texture(uV,vUv).xy;" +
        "if(vL.x<0.)l=-c.x;if(vR.x>1.)r=-c.x;if(vT.y>1.)t=-c.y;if(vB.y<0.)b=-c.y;o=vec4(.5*(r-l+t-b),0.,0.,1.);}",
      clear: "uniform sampler2D uT;uniform float val;void main(){o=texture(uT,vUv)*val;}",
      pres: "uniform sampler2D uP,uD;" +
        "void main(){float l=texture(uP,vL).x,r=texture(uP,vR).x,t=texture(uP,vT).x,b=texture(uP,vB).x;o=vec4((l+r+t+b-texture(uD,vUv).x)*.25,0.,0.,1.);}",
      grad: "uniform sampler2D uP,uV;" +
        "void main(){float l=texture(uP,vL).x,r=texture(uP,vR).x,t=texture(uP,vT).x,b=texture(uP,vB).x;o=vec4(texture(uV,vUv).xy-vec2(r-l,t-b),0.,1.);}",
      disp: "uniform sampler2D uD;uniform vec2 dts,res;uniform float t;uniform vec4 rp[8];" +
        "float hf(vec2 p){return sin(p.x*1.3+t*.5+2.*sin(p.y*.7+t*.3))+sin(p.y*1.9-t*.4+2.*sin(p.x*.8-t*.2))+.5*sin((p.x+p.y)*3.1+t*.9);}" +
        "void main(){float d=texture(uD,vUv).r;" +
        "float dl=texture(uD,vUv-vec2(dts.x,0.)).r,dr=texture(uD,vUv+vec2(dts.x,0.)).r,du=texture(uD,vUv+vec2(0.,dts.y)).r,db=texture(uD,vUv-vec2(0.,dts.y)).r;" +
        "float asp=res.x/res.y;vec2 p=vUv*vec2(asp,1.)*5.;vec2 e=vec2(.05,0.);" +
        "vec2 g=vec2(hf(p+e.xy)-hf(p-e.xy),hf(p+e.yx)-hf(p-e.yx))*.2;" +
        "for(int i=0;i<8;i++){float age=t-rp[i].z;if(age<0.||age>5.)continue;" +
        "vec2 dv=(vUv-rp[i].xy)*vec2(asp,1.);float r=length(dv);float f=r-.2*age;" +
        "float env=exp(-f*f*500.)*exp(-age*.7)*rp[i].w;g+=dv/(r+1e-4)*cos(f*80.)*env*.5;}" +
        "vec3 n=normalize(vec3(-g+vec2(dl-dr,db-du)*.8,1.));" +
        "vec2 q=vUv-.5;q.x*=asp;" +
        "vec3 bg=mix(vec3(.925,.94,.915),vec3(.74,.78,.76),smoothstep(.2,.95,length(q)));" +
        "bg*=.82+.26*dot(n,normalize(vec3(-.4,.6,.7)));" +
        "vec3 col=bg*exp(-d*vec3(2.6,2.25,2.15));" +
        "col+=pow(max(dot(n,normalize(vec3(-.1,.18,1.))),0.),150.)*.14;" +
        "col+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.;o=vec4(col,1.);}"
    };
 
    function mk(fs) {
      var p = gl.createProgram();
      [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, H + fs]].forEach(function (a) {
        var s = gl.createShader(a[0]); gl.shaderSource(s, a[1]); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
        gl.attachShader(p, s);
      });
      gl.linkProgram(p);
      return { p: p, loc: {} };
    }
    var P = {};
    for (var k in FS) P[k] = mk(FS[k]);
 
    function use(pr, o) {
      gl.useProgram(pr.p);
      var unit = 0;
      for (var k in o) {
        var v = o[k];
        var l = pr.loc[k] = pr.loc[k] || gl.getUniformLocation(pr.p, k);
        if (v instanceof WebGLTexture) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v); gl.uniform1i(l, unit++); }
        else if (typeof v === "number") gl.uniform1f(l, v);
        else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
        else gl.uniform3f(l, v[0], v[1], v[2]);
      }
    }
    function draw(t) {
      if (t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.f); gl.viewport(0, 0, t.w, t.h); }
      else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cv.width, cv.height); }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function fbo(w, h) {
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      var f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      return { t: t, f: f, w: w, h: h, ts: [1 / w, 1 / h] };
    }
    function dbl(w, h) {
      var a = fbo(w, h), b = fbo(w, h);
      return { get read() { return a; }, get write() { return b; }, swap: function () { var x = a; a = b; b = x; }, ts: [1 / w, 1 / h] };
    }
    function res(r) {
      var a = cv.width / cv.height; if (a < 1) a = 1 / a;
      var mn = Math.round(r), mx = Math.round(r * a);
      return cv.width > cv.height ? { w: mx, h: mn } : { w: mn, h: mx };
    }
    var vel, dye, pres, div, curl;
    function init() {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      cv.width = Math.floor(innerWidth * dpr); cv.height = Math.floor(innerHeight * dpr);
      var s = res(cfg.SIM), d = res(cfg.DYE);
      vel = dbl(s.w, s.h); dye = dbl(d.w, d.h); pres = dbl(s.w, s.h); div = fbo(s.w, s.h); curl = fbo(s.w, s.h);
    }
 
    function splat(x, y, dx, dy, amt, rad) {
      var ar = cv.width / cv.height, r = rad / 100; if (ar > 1) r *= ar;
      use(P.splat, { uT: vel.read.t, ar: ar, col: [dx, dy, 0], pt: [x, y], rad: r }); draw(vel.write); vel.swap();
      if (amt > 0) { use(P.splat, { uT: dye.read.t, ar: ar, col: [amt, 0, 0], pt: [x, y], rad: r * 0.6 }); draw(dye.write); dye.swap(); }
    }
    function step(dt) {
      use(P.curl, { uV: vel.read.t, ts: vel.ts }); draw(curl);
      use(P.vort, { uV: vel.read.t, uC: curl.t, ts: vel.ts, cu: cfg.CURL, dt: dt }); draw(vel.write); vel.swap();
      use(P.div, { uV: vel.read.t, ts: vel.ts }); draw(div);
      use(P.clear, { uT: pres.read.t, val: 0.8 }); draw(pres.write); pres.swap();
      for (var i = 0; i < cfg.ITER; i++) { use(P.pres, { uP: pres.read.t, uD: div.t, ts: vel.ts }); draw(pres.write); pres.swap(); }
      use(P.grad, { uP: pres.read.t, uV: vel.read.t, ts: vel.ts }); draw(vel.write); vel.swap();
      use(P.adv, { uV: vel.read.t, uS: vel.read.t, vts: vel.ts, ds: vel.ts, dt: dt, dis: cfg.VEL_DIS, dif: 0 }); draw(vel.write); vel.swap();
      use(P.adv, { uV: vel.read.t, uS: dye.read.t, vts: vel.ts, ds: dye.ts, dt: dt, dis: cfg.DYE_DIS, dif: cfg.DIFF }); draw(dye.write); dye.swap();
    }
 
    // 水波：最多 8 圈同时存在，xy=位置 z=起始时间 w=强度
    var rpa = new Float32Array(32), rpi = 0, T0 = performance.now();
    for (var i = 0; i < 8; i++) rpa[i * 4 + 2] = -100;
    function now() { return (performance.now() - T0) / 1000; }
    function ripple(x, y, amp) {
      rpa[rpi * 4] = x; rpa[rpi * 4 + 1] = y; rpa[rpi * 4 + 2] = now(); rpa[rpi * 4 + 3] = amp;
      rpi = (rpi + 1) % 8;
    }
    function render() {
      use(P.disp, { uD: dye.read.t, dts: dye.ts, res: [cv.width, cv.height], t: now() });
      gl.uniform4fv(gl.getUniformLocation(P.disp.p, "rp"), rpa);
      draw(null);
    }
 
    // 墨滴：中心落墨 + 一圈向外的小冲击，墨就会拉出丝状的细流
    function drop(x, y, k, burst) {
      var s = cfg.SIZE;
      splat(x, y, 0, 0, cfg.INK * 2.2 * k, 0.35 * s);
      var n = burst ? 16 : 8, v = burst ? 620 : 260;
      for (var i = 0; i < n; i++) {
        var a = i / n * 6.283 + Math.random() * 0.6;
        splat(x + Math.cos(a) * 0.004, y + Math.sin(a) * 0.004, Math.cos(a) * v, Math.sin(a) * v, 0, 0.08 * s);
      }
      ripple(x, y, 0.8 + 0.2 * Math.min(k, 2));
    }
 
    // 指针
    var p = { x: 0.5, y: 0.5, lx: 0.5, ly: 0.5, down: false, active: false };
    var opening = false;
    function setPos(e) { p.x = e.clientX / innerWidth; p.y = 1 - e.clientY / innerHeight; }
    gate.addEventListener("pointerdown", function (e) {
      if (opening || e.button !== 0 || (e.target.closest && e.target.closest("button"))) return;
      gate.setPointerCapture(e.pointerId); setPos(e);
      p.down = true; p.active = true; p.lx = p.x; p.ly = p.y;
      drop(p.x, p.y, 0.6, false);
    });
    gate.addEventListener("pointermove", function (e) {
      if (opening) return;
      setPos(e); if (!p.active) { p.active = true; p.lx = p.x; p.ly = p.y; }
    });
    function up() { p.down = false; }
    gate.addEventListener("pointerup", up);
    gate.addEventListener("pointercancel", up);
    gate.addEventListener("pointerleave", function () { if (!p.down) p.active = false; });
    function applyInput() {
      if (!p.active || opening) return;
      var ar = cv.width / cv.height, dx = p.x - p.lx, dy = p.y - p.ly, dist = Math.hypot(dx, dy);
      if (dist === 0 && !p.down) return;
      if (ar < 1) dx *= ar; if (ar > 1) dy /= ar;
      var n = Math.max(1, Math.min(12, Math.ceil(dist * 100)));
      var kf = p.down ? 1 : 0.6, rad = (p.down ? 0.2 : 0.25) * cfg.SIZE;
      for (var i = 1; i <= n; i++) {
        var t = i / n;
        splat(p.lx + (p.x - p.lx) * t, p.ly + (p.y - p.ly) * t, dx * cfg.FORCE * kf / n, dy * cfg.FORCE * kf / n, p.down ? 0.22 * cfg.INK : 0, rad);
      }
      p.lx = p.x; p.ly = p.y;
    }
 
    // 入楼台：落一大滴墨，连起三圈水波，水面从点击处裂开一个越来越大的洞
    var ox = 0, oy = 0, openT = 0, maxR = 0, raf = 0;
    btn.addEventListener("click", function () {
      if (opening) return;
      opening = true; p.down = false; p.active = false;
      gate.classList.add("opening");
      var b = btn.getBoundingClientRect();
      ox = b.left + b.width / 2; oy = b.top + b.height / 2;
      var ux = ox / innerWidth, uy = 1 - oy / innerHeight;
      drop(ux, uy, 2.4, true);
      setTimeout(function () { ripple(ux, uy, 1.2); }, 150);
      setTimeout(function () { ripple(ux, uy, 1.0); }, 320);
      maxR = Math.max(Math.hypot(ox, oy), Math.hypot(innerWidth - ox, oy), Math.hypot(ox, innerHeight - oy), Math.hypot(innerWidth - ox, innerHeight - oy));
      openT = performance.now() + OPEN_DELAY;
    });
    function setHole(R) {
      var m = "radial-gradient(circle at " + ox + "px " + oy + "px, transparent " + R + "px, #000 " + (R + EDGE) + "px)";
      gate.style.webkitMaskImage = m; gate.style.maskImage = m;
    }
 
    var nextAmb = 0, last = performance.now();
    function frame(t) {
      var dt = Math.min((t - last) / 1000, 0.0167) || 0.0167; last = t;
      if (!opening && t > nextAmb) { // 平时偶尔落一圈雨点似的涟漪
        ripple(0.1 + Math.random() * 0.8, 0.1 + Math.random() * 0.8, 0.5);
        nextAmb = t + 2200 + Math.random() * 2400;
      }
      applyInput(); step(dt); render();
      if (opening) {
        var k = Math.min(1, Math.max(0, (t - openT) / OPEN_DUR));
        var e = 1 - Math.pow(1 - k, 3);
        setHole(-EDGE + e * (maxR + EDGE * 2));
        if (k >= 1) {
          finish();
          var ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext();
          return;
        }
      }
      raf = requestAnimationFrame(frame);
    }
 
    var rt;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { if (!opening) init(); }, 200); });
 
    init();
    setTimeout(function () { drop(0.38, 0.56, 1, false); setTimeout(function () { drop(0.63, 0.44, 0.8, false); }, 500); }, 350);
    raf = requestAnimationFrame(frame);
  })();

  /* ---------- 时辰 ---------- */
  var SHICHEN = ["子时","丑时","寅时","卯时","辰时","巳时","午时","未时","申时","酉时","戌时","亥时"];
  function shichen(h) { return SHICHEN[Math.floor(((h + 1) % 24) / 2)]; }
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function tickClock() {
    var d = new Date();
    var h = d.getHours();
    document.getElementById("navClock").textContent =
      shichen(h) + " " + pad(h) + ":" + pad(d.getMinutes());
  }
  tickClock();
  setInterval(tickClock, 30000);


  /* ---------- 诗签 ---------- */
  var VERSES = [
    "文章本天成，妙手偶得之。——陆游",
    "两句三年得，一吟双泪流。——贾岛",
    "清水出芙蓉，天然去雕饰。——李白",
    "笔落惊风雨，诗成泣鬼神。——杜甫",
    "我手写我心，我笔即我情。",
    "纸上得来终觉浅，绝知此事要躬行。——陆游",
    "言为心声，墨为心迹。",
    "粗缯大布裹生涯，腹有诗书气自华。——苏轼"
  ];
  document.getElementById("verseText").textContent =
    VERSES[Math.floor(Math.random() * VERSES.length)];


  /* ---------- 组件 ---------- */

  function toast(msg) {
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove("show"); }, 2400);
  }

  function charCount(s) {
    return String(s || "").replace(/\s/g, "").length;
  }

  function stamp(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "." + pad(d.getMonth() + 1) + "." + pad(d.getDate()) +
      " " + shichen(d.getHours()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }


  /* ---------- 盖印 ---------- */
  function sealStamp() {
    var seal = document.getElementById("seal");
    seal.classList.remove("show");
    void seal.offsetWidth;
    seal.classList.add("show");
    setTimeout(function () { seal.classList.remove("show"); }, 1300);
  }


  /* ---------- 落花 ---------- */
  var petals = [];
  var petalRunning = true;
  var cv = document.getElementById("petalCanvas");
  var ctx = cv.getContext("2d");
  var COLORS = ["rgba(47,74,69,", "rgba(92,120,112,", "rgba(62,88,82,"];
  function sizeCanvas() {
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
  }
  sizeCanvas();
  window.addEventListener("resize", sizeCanvas);

  function makePetal(init) {
    return {
      x: Math.random() * cv.width,
      y: init ? Math.random() * cv.height : -24,
      r: 2.5 + Math.random() * 3.5,
      vy: 0.35 + Math.random() * 0.75,
      vx: (Math.random() - 0.5) * 0.4,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.04,
      c: COLORS[Math.floor(Math.random() * COLORS.length)] + (0.28 + Math.random() * 0.22) + ")"
    };
  }
  for (var i = 0; i < 16; i++) petals.push(makePetal(true));

  function petalLoop() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    petals.forEach(function (p, idx) {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      p.vx += (Math.random() - 0.5) * 0.02;
      if (p.y > cv.height + 30) { petals[idx] = makePetal(false); return; }
      if (p.x < -30) p.x = cv.width + 20;
      if (p.x > cv.width + 30) p.x = -20;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r * 1.25, p.r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    if (petalRunning) requestAnimationFrame(petalLoop);
  }
  petalLoop();

  document.getElementById("bloomToggle").addEventListener("click", function () {
    petalRunning = !petalRunning;
    if (petalRunning) { petalLoop(); this.textContent = "花"; toast("落花又起"); }
    else { ctx.clearRect(0, 0, cv.width, cv.height); this.textContent = "静"; toast("花落已歇"); }
  });

  render();

/* ------------------------------------------------------------
   站内：校门/湖山/楼台/院系/食堂/场馆/纪念 → 腾讯地图 GL JS
   ------------------------------------------------------------ */
(function () {
  "use strict";

  /* ===== 分类配色（取自模板：松绿 / 朱砂 / 赭 / 黛） ===== */
  var CATS = {
    gate:     { name: "校门",   fill: "#9a4a3a" },
    lake:     { name: "湖山",   fill: "#4a6b63" },
    building: { name: "楼台",   fill: "#2f4a45" },
    school:   { name: "院系",   fill: "#6b4a3a" },
    dining:   { name: "食堂",   fill: "#7a6b3a" },
    sports:   { name: "场馆",   fill: "#3a5a6b" },
    memory:   { name: "纪念",   fill: "#8e3a27" }
  };

  /* ===== POI 清单：名字 + 分类 + 一句简介 + 检索词 =====
     坐标不写死，页面加载时由地图检索服务在线解析，结果缓存到本机。 */
  var POIS = [
    { id: "xixiaomen",   n: "西校门（校友门）",  cat: "gate",     q: "北京大学西校门",   d: "燕园最有名的门，三开朱红大门，校徽上的那座。校庆时张灯。" },
    { id: "nanmen",      n: "南校门",            cat: "gate",     q: "北京大学南门",     d: "主校门之一，往南接成府路，人车流最大。" },
    { id: "dongmen",     n: "东校门",            cat: "gate",     q: "北京大学东门",     d: "临中关村北大街，地铁四号线北京大学东门站在侧。" },
    { id: "dongnanmen",  n: "东南校门",          cat: "gate",     q: "北京大学东南门",   d: "靠近成府路，外卖与快递的集散口。" },
    { id: "xinanmen",    n: "西南校门",          cat: "gate",     q: "北京大学西南门",   d: "较安静的小门，通往蔚秀园、承泽园一带。" },
    { id: "xiaoximen",   n: "小西门",            cat: "gate",     q: "北京大学小西门",   d: "西门南侧的便门，日常进出用得多。" },

    { id: "weiminghu",   n: "未名湖",            cat: "lake",     q: "北京大学未名湖",   d: "燕园的眼睛。钱穆先生命名，冬结冰夏有荷，环湖一圈约两公里。" },
    { id: "boyata",      n: "博雅塔",            cat: "lake",     q: "北京大学博雅塔",   d: "1924 年建的水塔，仿通州燃灯塔。塔影落湖，是北大最经典的画面。" },
    { id: "fanwei",      n: "翻尾石鱼",          cat: "lake",     q: "北京大学翻尾石鱼", d: "未名湖中的石雕，原为圆明园谐奇趣遗物。" },
    { id: "shifang",     n: "石舫",              cat: "lake",     q: "北京大学未名湖石舫", d: "湖心岛旁的不系舟，乾隆时圆明园旧物移来。" },
    { id: "zhongting",   n: "钟亭",              cat: "lake",     q: "北京大学钟亭",     d: "湖东侧小亭，悬一口老钟，毕业季总有人来拍照。" },
    { id: "huashenmiao", n: "花神庙",            cat: "lake",     q: "北京大学花神庙",   d: "未名湖畔小庙，石额『慈济寺』，仅存门与残墙。" },
    { id: "linhuxuan",   n: "临湖轩",            cat: "lake",     q: "北京大学临湖轩",   d: "原为教员居所，今作校方接待与小型活动场所。" },
    { id: "xiaojingting",n: "校景亭",            cat: "lake",     q: "北京大学校景亭",   d: "鸣鹤园中，原赐园旧物，可俯瞰一带水木。" },
    { id: "honghu",      n: "红湖",              cat: "lake",     q: "北京大学红湖",     d: "勺园旁的小湖，夏日荷花开得比未名湖还清。" },
    { id: "jingyuan",    n: "静园草坪",          cat: "lake",     q: "北京大学静园草坪", d: "燕园最大的一块草坪，毕业典礼与音乐节都在这里办。" },
    { id: "langrun",     n: "朗润园",            cat: "lake",     q: "北京大学朗润园",   d: "北大国家发展研究院（原中国经济研究中心）所在，院落幽静。" },
    { id: "jingchun",    n: "镜春园",            cat: "lake",     q: "北京大学镜春园",   d: "未名湖北岸旧园，今多为办公与研究机构。" },
    { id: "yannanyuan",  n: "燕南园",            cat: "lake",     q: "北京大学燕南园",   d: "燕大时期的教授住宅群，冯友兰、翦伯赞、周培源曾居此。" },

    { id: "library",     n: "图书馆",            cat: "building", q: "北京大学图书馆",   d: "馆藏逾千万册，亚洲高校规模最大。自习要抢座。" },
    { id: "bainian",     n: "百周年纪念讲堂",     cat: "building", q: "北京大学百周年纪念讲堂", d: "百年校庆落成，演出与大型典礼的核心场所。" },
    { id: "jingliu",     n: "静园六院",          cat: "building", q: "北京大学静园六院", d: "六座三合院围成两排，燕园最完整的院落肌理。" },
    { id: "ewenlou",     n: "俄文楼",            cat: "building", q: "北京大学俄文楼",   d: "燕大早期教学楼，如今多为公共课教室。" },
    { id: "saikele",     n: "赛克勒考古与艺术博物馆", cat: "building", q: "北京大学赛克勒考古与艺术博物馆", d: "西门内，高校里少有的正规博物馆。" },
    { id: "xiaoshiguan", n: "校史馆",            cat: "building", q: "北京大学校史馆",   d: "从 1898 年京师大学堂至今的全部履历。" },
    { id: "stanford",    n: "斯坦福中心",        cat: "building", q: "北京大学斯坦福中心", d: "北大－斯坦福交流基地，院落式建筑，靠近西门。" },

    { id: "guanghua",    n: "光华管理学院",       cat: "school",   q: "北京大学光华管理学院", d: "东侧两栋红楼，报考竞争最激烈的学院之一。" },
    { id: "ccer",        n: "国家发展研究院",      cat: "school",   q: "北京大学国家发展研究院", d: "朗润园内，原中国经济研究中心，经济学双学位所在地。" },
    { id: "faxue",       n: "法学院（凯原楼）",    cat: "school",   q: "北京大学法学院凯原楼", d: "法学院主楼，位于东南角。" },
    { id: "jingjixue",   n: "经济学院",           cat: "school",   q: "北京大学经济学院",  d: "旧法学楼群中的一栋，经济学部本部。" },
    { id: "liaokaiyuan", n: "政府管理学院（廖凯原楼）", cat: "school", q: "北京大学廖凯原楼", d: "灰砖立面，内部环状天井。" },
    { id: "qiulin",      n: "国际关系学院（秋林报告厅）", cat: "school", q: "北京大学秋林报告厅", d: "秋林报告厅所在，讲座密集。" },
    { id: "xinwen",      n: "新闻与传播学院（王克桢楼）", cat: "school", q: "北京大学王克桢楼", d: "腾讯创始人之一捐建，新传学院所在地。" },
    { id: "like1",       n: "理科一号楼",         cat: "school",   q: "北京大学理科一号楼", d: "数学、物理等理科院系的教学楼。" },
    { id: "like2",       n: "理科二号楼",         cat: "school",   q: "北京大学理科二号楼", d: "理科楼群中的一栋，习题课多在此。" },
    { id: "dixue",       n: "地学楼",             cat: "school",   q: "北京大学地学楼",   d: "地球与空间科学学院所在，门外有化石剖面。" },
    { id: "huaxue",      n: "化学学院",           cat: "school",   q: "北京大学化学学院",  d: "A/B/C 座连体实验楼，夜里常亮灯到很晚。" },
    { id: "wenshilou",   n: "文史楼",             cat: "school",   q: "北京大学文史楼",   d: "中文、历史等院系的老教学楼，走廊很窄。" },

    { id: "xueyi",       n: "学一食堂（松林园餐厅）", cat: "dining", q: "北京大学松林园餐厅", d: "口碑最好之一的食堂，一层二层风味不同。" },
    { id: "xuesan",      n: "学三食堂",           cat: "dining",   q: "北京大学学三食堂",  d: "南区老食堂，早饭人多。" },
    { id: "xuewu",       n: "学五食堂",           cat: "dining",   q: "北京大学学五食堂",  d: "靠近宿舍区，夜宵时段热闹。" },
    { id: "nongyuan",    n: "农园食堂",           cat: "dining",   q: "北京大学农园食堂",  d: "东侧大食堂，三层自选，许多人的第一食堂。" },
    { id: "jiayuan",     n: "家园食堂",           cat: "dining",   q: "北京大学家园食堂",  d: "较新的食堂，座位多。" },
    { id: "tongyuan",    n: "佟园清真食堂",       cat: "dining",   q: "北京大学佟园餐厅",  d: "清真食堂，牛羊肉窗口稳定。" },

    { id: "wusi",        n: "五四体育场",         cat: "sports",   q: "北京大学五四体育场", d: "操场与看台，体育课、军训、运动会都在此。" },
    { id: "qiudeba",     n: "邱德拔体育馆",       cat: "sports",   q: "北京大学邱德拔体育馆", d: "2008 奥运会乒乓球馆，校内最大综合体育馆。" },
    { id: "dier",        n: "第二体育馆",         cat: "sports",   q: "北京大学第二体育馆", d: "老体育馆，羽毛球与形体课多在此。" },
    { id: "bingchang",   n: "未名湖冰场（冬季）",  cat: "sports",   q: "北京大学未名湖冰场", d: "冬日结冰后开放的天然冰场，燕园限定的冬季项目。" },

    { id: "lidaizhao",   n: "李大钊塑像",         cat: "memory",   q: "北京大学李大钊塑像", d: "西南联大纪念碑旁。北大教授，中国共产党的主要创始人之一。" },
    { id: "caiyuanpei",  n: "蔡元培铜像",         cat: "memory",   q: "北京大学蔡元培铜像", d: "未名湖东南侧小丘。1917 年出任校长，倡『思想自由，兼容并包』。" },
    { id: "sinuo",       n: "斯诺墓",             cat: "memory",   q: "北京大学斯诺墓",     d: "未名湖南岸。斯诺曾任教燕大，著《红星照耀中国》。" },
    { id: "lieshi",      n: "革命烈士纪念碑",      cat: "memory",   q: "北京大学革命烈士纪念碑", d: "静园草坪北侧，纪念为民族独立与人民解放牺牲的北大师生。" }
  ];

  var CACHE_KEY = "yy.poi.geo.v1";
  var map = null, markers = null, infoWin = null, resolvedCount = 0;

  function el(id) { return document.getElementById(id); }

  /* 墨滴：按分类生成内联 SVG 图标，不用任何外部图片 */
  function dotSVG(fill) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">'
      + '<circle cx="12" cy="12" r="10" fill="rgba(255,255,255,.85)"/>'
      + '<circle cx="12" cy="12" r="6.5" fill="' + fill + '"/>'
      + '</svg>';
    return "data:image/svg+xml," + svg;
  }

  /* SDK 是否就绪（密钥代理 / 自带 key 两种加载方式都有延迟） */
  function ensureTMap(cb, tries) {
    tries = tries || 0;
    if (window.TMap) { cb(); return; }
    if (tries > 100) {
      fail("地图组件没加载上。公网页点请在 assets/mapkey.js 里填入自己的腾讯位置服务 key。");
      renderList(POIS);   // 降级：地图没了，点录照常可读
      return;
    }
    setTimeout(function () { ensureTMap(cb, tries + 1); }, 150);
  }

  function fail(msg) {
    if (el("poiStatus")) el("poiStatus").textContent = msg;
  }

  function setProgress(done, total) {
    if (!el("poiStatus")) return;
    el("poiStatus").textContent = total
      ? "正在用地图检索定位点位：" + done + " / " + total
      : "点位已载入（来自本机缓存）";
  }

  /* ---------- 名称 → 坐标（优先缓存，次用地点检索，最后用地址解析） ---------- */
  function resolveOne(p, cb) {
    var sug;
    try {
      sug = new TMap.service.Suggestion({ pageSize: 3 });
    } catch (e) { sug = null; }

    if (sug) {
      sug.getSuggestions({ keyword: p.q, location: new TMap.LatLng(39.9924, 116.3050) })
        .then(function (res) {
          var arr = (res && res.data) || [];
          for (var i = 0; i < arr.length; i++) {
            var loc = arr[i] && arr[i].location;
            if (loc && typeof loc.lat === "number") {
              p.lat = loc.lat; p.lng = loc.lng;
              cb(true); return;
            }
          }
          cb(false);
        })
        .catch(function () { cb(false); });
      return;
    }
    cb(false);
  }

  function runQueue(items, worker, conc, onStep, done) {
    var i = 0, running = 0, finished = 0, n = items.length;
    if (!n) { done(); return; }
    function next() {
      while (running < conc && i < n) {
        running++;
        worker(items[i++], function (ok) {
          running--; finished++;
          onStep(finished, n);
          if (finished === n) { done(); } else { next(); }
        });
      }
    }
    next();
  }

  function buildStyles() {
    var styles = {};
    Object.keys(CATS).forEach(function (k) {
      styles[k] = new TMap.MarkerStyle({ width: 24, height: 24, anchor: { x: 12, y: 12 }, src: dotSVG(CATS[k].fill) });
    });
    return styles;
  }

  function located() {
    return POIS.filter(function (p) { return typeof p.lat === "number"; });
  }

  function refresh() {
    if (!map) return;
    var list = located().filter(function (p) {
      var okCat = state.cat === "all" || p.cat === state.cat;
      var q = state.q.trim();
      var okQ = !q || p.n.indexOf(q) > -1 || (p.d || "").indexOf(q) > -1;
      return okCat && okQ;
    });
    if (markers) markers.setGeometries(list.map(function (p) {
      return { id: p.id, styleId: p.cat, position: new TMap.LatLng(p.lat, p.lng) };
    }));
    renderList(list);
  }

  function renderList(list) {
    var wrap = el("poiList");
    if (!wrap) return;
    if (el("poiCount")) el("poiCount").textContent = list.length + " 处";
    wrap.textContent = "";
    if (!list.length) {
      wrap.innerHTML = '<p class="hint" style="padding:14px 2px">没有符合条件的点位。</p>';
      return;
    }
    list.forEach(function (p) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "poi-item";
      btn.setAttribute("data-id", p.id);
      btn.innerHTML =
        '<div class="poi-item-top">'
          + '<span class="poi-dot" style="background:' + CATS[p.cat].fill + '"></span>'
          + '<span class="poi-name">' + p.n + '</span>'
          + '<span class="poi-cat">' + CATS[p.cat].name + '</span>'
        + '</div>'
        + '<div class="poi-desc">' + p.d + '</div>';
      btn.addEventListener("click", function () { focusPoi(p); });
      wrap.appendChild(btn);
    });
  }

  function focusPoi(p) {
    if (!map || typeof p.lat !== "number") {
      toast("坐标还没解析出来，先看简介吧。");
      return;
    }
    map.easeTo({ center: new TMap.LatLng(p.lat, p.lng), zoom: 18 }, { duration: 500 });
    openInfo(p);
    var items = document.querySelectorAll(".poi-item");
    for (var i = 0; i < items.length; i++) {
      items[i].className = "poi-item" + (items[i].getAttribute("data-id") === p.id ? " active" : "");
    }
  }

  function openInfo(p) {
    if (!infoWin) { infoWin = new TMap.InfoWindow({ map: map, enableCustom: true, offset: { x: 0, y: -18 } }); }
    infoWin.setPosition(new TMap.LatLng(p.lat, p.lng));
    infoWin.setContent(
      '<div style="max-width:250px;padding:12px 14px;background:#f4f9f3;border:1px solid rgba(27,43,42,.16);'
      + 'font-family:\'Noto Serif SC\',serif;color:#1b2b2a;">'
      + '<div style="font-size:15px;font-weight:600;margin-bottom:3px;">' + p.n + '</div>'
      + '<div style="font-size:11.5px;color:#74867f;margin-bottom:6px;">' + CATS[p.cat].name + '</div>'
      + '<div style="font-size:12.5px;line-height:1.7;color:#3d504c;">' + p.d + '</div>'
      + '</div>'
    );
    infoWin.open();
  }

  var state = { cat: "all", q: "" };

  function initFilters() {
    var box = el("poiFilters");
    if (!box) return;
    var all = [{ k: "all", name: "全部" }];
    Object.keys(CATS).forEach(function (k) { all.push({ k: k, name: CATS[k].name }); });
    all.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "poi-chip";
      b.textContent = c.name;
      b.setAttribute("aria-pressed", String(c.k === "all"));
      b.addEventListener("click", function () {
        state.cat = c.k;
        var chips = box.querySelectorAll(".poi-chip");
        for (var i = 0; i < chips.length; i++) chips[i].setAttribute("aria-pressed", String(chips[i] === b));
        refresh();
      });
      box.appendChild(b);
    });
    var s = el("poiSearch");
    if (s) s.addEventListener("input", function () { state.q = this.value; refresh(); });
  }

  function loadCache() {
    try {
      var raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (raw && typeof raw === "object") {
        POIS.forEach(function (p) {
          var hit = raw[p.id];
          if (hit && typeof hit.lat === "number") { p.lat = hit.lat; p.lng = hit.lng; }
        });
      }
    } catch (e) { /* 缓存坏了就重来 */ }
  }

  function saveCache() {
    try {
      var box = {};
      POIS.forEach(function (p) { if (typeof p.lat === "number") box[p.id] = { lat: p.lat, lng: p.lng }; });
      localStorage.setItem(CACHE_KEY, JSON.stringify(box));
    } catch (e) { /* 存不下就算了 */ }
  }

  /* 固化的坐标兜底：仓库里若有 poi-coords.json，优先用它，省掉一轮检索 */
  function loadStaticCoords(cb) {
    fetch("poi-coords.json").then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (box) {
        if (box && typeof box === "object") {
          POIS.forEach(function (p) {
            var hit = box[p.id];
            if (hit && typeof hit.lat === "number") { p.lat = hit.lat; p.lng = hit.lng; }
          });
        }
        cb();
      });
  }

  function init() {
    loadCache();
    initFilters();
    map = new TMap.Map("poiMap", {
      center: new TMap.LatLng(39.9924, 116.3050),
      zoom: 16
    });
    markers = new TMap.MultiMarker({ map: map, styles: buildStyles(), geometries: [] });
    markers.on("click", function (evt) {
      var hit = null;
      POIS.forEach(function (p) { if (p.id === evt.geometry.id) hit = p; });
      if (hit) focusPoi(hit);
    });

    renderList(located());
    var pending = POIS.filter(function (p) { return typeof p.lat !== "number"; });
    if (!pending.length) { setProgress(0, 0); refresh(); return; }

    setProgress(0, pending.length);
    runQueue(pending, resolveOne, 3, function (done, total) { setProgress(done, total); }, function () {
      saveCache();
      setProgress(0, 0);
      refresh();
    });
  }

  ensureTMap(function () { loadStaticCoords(init); });
})();
