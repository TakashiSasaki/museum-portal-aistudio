## 2026-07-03 - Pre-calculated CSS classes for DOM updates
**Learning:** In frontend loops, avoiding `Array.from(element.classList).filter(...)` string manipulation by pre-calculating possible classes to remove is a highly effective way to optimize layout and reduce unnecessary garbage collection and main thread blocking.
**Action:** Always extract static classes to remove into a constant array when manipulating classes in loops or frequent updates.
