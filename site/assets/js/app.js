/* =========================================================================
   AI Manager 主页交互脚本（零依赖，渐进增强）
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
})();
