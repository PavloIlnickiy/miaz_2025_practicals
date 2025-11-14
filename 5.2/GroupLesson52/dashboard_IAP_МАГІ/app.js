// 1) Активні кнопки-фільтри (верхній ряд)
const filterPills = document.querySelectorAll(".filter-pill");

filterPills.forEach((pill) => {
  pill.addEventListener("click", () => {
    // зняти активність з усіх
    filterPills.forEach((p) => p.classList.remove("is-active"));
    // зробити активною ту, по якій натиснули
    pill.classList.add("is-active");
  });
});

// 2) Анімація всіх «ліній» (барів) при завантаженні сторінки
function animateBars(selector, duration = 800) {
  const bars = document.querySelectorAll(selector);

  bars.forEach((bar) => {
    const targetWidth = bar.style.width || bar.getAttribute("data-width");
    if (!targetWidth) return;

    // старт з 0%
    bar.style.width = "0%";

    // плавне «заповнення» до потрібного значення
    setTimeout(() => {
      bar.style.transition = `width ${duration}ms ease-out`;
      bar.style.width = targetWidth;
    }, 100);
  });
}

window.addEventListener("load", () => {
  // бари у правій панелі (готові/резерв/втрати)
  animateBars(".bcs-bar .seg", 700);

  // бари боєздатності техніки внизу
  animateBars(".tech-bar .tech-fill", 900);
});

// 3) Підсвічування рядків таблиць при наведенні
document.querySelectorAll(".table-wrapper table tbody tr").forEach((row) => {
  row.addEventListener("mouseenter", () => {
    row.classList.add("row-hover");
  });
  row.addEventListener("mouseleave", () => {
    row.classList.remove("row-hover");
  });
});

// 4) Індикатор «останнє оновлення» у футері
(function addLastUpdate() {
  const footerP = document.querySelector("footer p");
  if (!footerP) return;

  const span = document.createElement("span");
  span.id = "last-update";

  function updateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString("uk-UA", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    span.textContent = " · Оновлено: " + timeStr;
  }

  updateTime();
  setInterval(updateTime, 1000);

  footerP.appendChild(span);
})();
