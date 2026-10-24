// smash — business details shown in the legal pages. Fill once, used everywhere.
export const BIZ = {
  brand: "smash",
  operator: "פיטנס 360",          // legal name of the business that runs smash
  id: "",                          // ע.מ / ח.פ
  email: "",                       // contact email for customers and accessibility requests
  phone: "",                       // optional
  a11yCoordinator: "",             // name of the accessibility coordinator (רכז נגישות)
  updated: "24 באוקטובר 2026",
};

// fill <span data-biz="email"> etc. Empty fields show a neutral fallback.
export function fillBiz(root = document) {
  const fallback = { email: "דרך פרטי הקשר שיפורסמו באתר", phone: "", id: "", a11yCoordinator: "נציג השירות של smash" };
  for (const el of root.querySelectorAll("[data-biz]")) {
    const k = el.dataset.biz, v = BIZ[k] || fallback[k] || "";
    el.textContent = v;
    if (!v) { const row = el.closest("[data-biz-row]"); if (row) row.hidden = true; }
  }
}
