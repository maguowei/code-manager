/* =========================================================================
   Code Manager 主页交互脚本（零依赖，渐进增强）
   职责：语言切换、主题切换、当前导航高亮、页脚年份。
   防闪烁的初始 lang/theme 已在 <head> 内联脚本中设定，这里只负责切换。
   ========================================================================= */
(function () {
  "use strict";

  var root = document.documentElement;

  /* ---- 语言切换 ---- */
  var langToggle = document.getElementById("lang-toggle");
  var langLabel = document.getElementById("lang-label");

  // 按钮始终显示「切到另一种语言」的标签
  function syncLangLabel() {
    if (langLabel) langLabel.textContent = root.lang === "zh" ? "EN" : "中";
  }
  syncLangLabel();

  if (langToggle) {
    langToggle.addEventListener("click", function () {
      var next = root.lang === "zh" ? "en" : "zh";
      root.setAttribute("lang", next);
      try {
        localStorage.setItem("aim-lang", next);
      } catch (e) {}
      syncLangLabel();
      syncCopyTitles();
    });
  }

  /* ---- 主题切换 ---- */
  var themeToggle = document.getElementById("theme-toggle");
  var iconSun = document.getElementById("icon-sun");
  var iconMoon = document.getElementById("icon-moon");

  // 深色时展示太阳（点击转浅色），浅色时展示月亮（点击转深色）
  function syncThemeIcon() {
    var dark = root.getAttribute("data-theme") === "dark";
    if (iconSun) iconSun.hidden = !dark;
    if (iconMoon) iconMoon.hidden = dark;
  }
  syncThemeIcon();

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem("aim-theme", next);
      } catch (e) {}
      syncThemeIcon();
    });
  }

  /* ---- 页脚年份 ---- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---- 导航当前区块高亮 ---- */
  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll(".nav-links a[href^='#']")
  );
  var sections = navLinks
    .map(function (a) {
      return document.getElementById(a.getAttribute("href").slice(1));
    })
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    var byId = {};
    navLinks.forEach(function (a) {
      byId[a.getAttribute("href").slice(1)] = a;
    });

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            navLinks.forEach(function (a) {
              a.removeAttribute("aria-current");
            });
            var active = byId[entry.target.id];
            if (active) active.setAttribute("aria-current", "true");
          }
        });
      },
      // 命中视口上 1/3 处的区块视为「当前」
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );

    sections.forEach(function (s) {
      observer.observe(s);
    });
  }

  /* ---- 代码块一键复制 ---- */
  // 复制图标 + 对勾图标（stroke 风格，与页面其它 SVG 一致），由 CSS 控制显隐
  var COPY_ICONS =
    '<svg class="icon-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg>' +
    '<svg class="icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  // 「复制命令」提示文案随当前语言变化
  function copyLabel() {
    return root.lang === "zh" ? "复制命令" : "Copy command";
  }

  // 语言切换时同步所有复制按钮的 title / aria-label
  function syncCopyTitles() {
    var label = copyLabel();
    Array.prototype.forEach.call(
      document.querySelectorAll(".copy-btn"),
      function (b) {
        b.title = label;
        b.setAttribute("aria-label", label);
      }
    );
  }

  // 取代码块的纯命令文本：去掉注释行与按钮自身，折叠空白
  function commandOf(block) {
    var clone = block.cloneNode(true);
    var comment = clone.querySelector(".c");
    if (comment) comment.parentNode.removeChild(comment);
    var btn = clone.querySelector(".copy-btn");
    if (btn) btn.parentNode.removeChild(btn);
    return clone.textContent.replace(/\s+/g, " ").trim();
  }

  // 复制到剪贴板：优先 Clipboard API，回退临时 textarea + execCommand
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  }

  Array.prototype.forEach.call(
    document.querySelectorAll(".codeblock"),
    function (block) {
      block.classList.add("has-copy");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-btn";
      btn.innerHTML = COPY_ICONS;
      var label = copyLabel();
      btn.title = label;
      btn.setAttribute("aria-label", label);
      var timer;
      btn.addEventListener("click", function () {
        copyText(commandOf(block))
          .then(function () {
            btn.classList.add("copied");
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () {
              btn.classList.remove("copied");
            }, 1600);
          })
          .catch(function () {});
      });
      block.appendChild(btn);
    }
  );
})();
