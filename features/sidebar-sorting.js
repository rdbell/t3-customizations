/** Persisted project, Active-thread, and Snoozed-thread sorting rules. */
(() => {
  const registry = (window.__t3CustomizationFeatureFactories ??= {});

  registry.sidebarSorting = function createSidebarSorting(context) {
    const STORAGE_KEY = "t3-sidebar-sorting-v1";
    const PROJECT_ORDERS = new Set(["default", "alphabetical", "attention"]);
    const ACTIVE_THREAD_ORDERS = new Set([
      "default",
      "alphabetical",
      "attention",
      "recent",
      "oldest",
    ]);
    const SNOOZED_THREAD_ORDERS = new Set([
      "default",
      "alphabetical",
      "recent",
      "oldest",
    ]);
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

    let current = (() => {
      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
        return {
          projectOrder: PROJECT_ORDERS.has(stored.projectOrder)
            ? stored.projectOrder
            : "default",
          activeThreadOrder: ACTIVE_THREAD_ORDERS.has(
            stored.activeThreadOrder ?? stored.threadOrder,
          )
            ? (stored.activeThreadOrder ?? stored.threadOrder)
            : "default",
          snoozedThreadOrder: SNOOZED_THREAD_ORDERS.has(stored.snoozedThreadOrder)
            ? stored.snoozedThreadOrder
            : "default",
          snoozedPinnedFirst: stored.snoozedPinnedFirst === true,
        };
      } catch {
        return {
          projectOrder: "default",
          activeThreadOrder: "default",
          snoozedThreadOrder: "default",
          snoozedPinnedFirst: false,
        };
      }
    })();

    function settings() {
      return { ...current };
    }

    function save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      } catch {
        // The current settings still work when localStorage is unavailable.
      }
    }

    function setProjectOrder(value) {
      if (!PROJECT_ORDERS.has(value)) {
        throw new RangeError(`Unknown project order: ${value}`);
      }
      if (current.projectOrder === value) return settings();
      current = { ...current, projectOrder: value };
      save();
      context.schedule();
      return settings();
    }

    function setActiveThreadOrder(value) {
      if (!ACTIVE_THREAD_ORDERS.has(value)) {
        throw new RangeError(`Unknown Active thread order: ${value}`);
      }
      if (current.activeThreadOrder === value) return settings();
      current = { ...current, activeThreadOrder: value };
      save();
      context.schedule();
      return settings();
    }

    function setSnoozedThreadOrder(value) {
      if (!SNOOZED_THREAD_ORDERS.has(value)) {
        throw new RangeError(`Unknown Snoozed thread order: ${value}`);
      }
      if (current.snoozedThreadOrder === value) return settings();
      current = { ...current, snoozedThreadOrder: value };
      save();
      context.schedule();
      return settings();
    }

    function setSnoozedPinnedFirst(value) {
      if (typeof value !== "boolean") {
        throw new TypeError("Snoozed pinned-first must be true or false.");
      }
      if (current.snoozedPinnedFirst === value) return settings();
      current = { ...current, snoozedPinnedFirst: value };
      save();
      context.schedule();
      return settings();
    }

    function stableSort(items, compare) {
      return items
        .map((item, index) => ({ index, item }))
        .sort((left, right) => compare(left.item, right.item) || left.index - right.index)
        .map(({ item }) => item);
    }

    function attentionRank(row) {
      const status = context.notifications.status(row);
      if (["Approval", "Input", "Plan", "Failed", "Woke"].includes(status)) return 0;
      if (status === "Done") return 1;
      if (status === "Working" || status === "Monitoring") return 3;
      return 2;
    }

    function groupAttentionRank(group) {
      return group.rows.reduce(
        (best, row) => Math.min(best, attentionRank(row)),
        Number.POSITIVE_INFINITY,
      );
    }

    function isPinned(row) {
      if (typeof context.isPinned === "function") return context.isPinned(row);
      if (context.findReactRowProps(row)?.thread?.pinnedAt != null) return true;
      return Boolean(row.querySelector?.('[aria-label="Unpin thread"], [aria-label="Pinned"]'));
    }

    function compareGroups(left, right) {
      if (current.projectOrder === "alphabetical") {
        return collator.compare(left.name, right.name);
      }
      if (current.projectOrder === "attention") {
        return groupAttentionRank(left) - groupAttentionRank(right);
      }
      return 0;
    }

    function sortGroups(groups, section) {
      const prioritizePinned = section === "Snoozed" && current.snoozedPinnedFirst;
      if (!prioritizePinned && current.projectOrder === "default") return [...groups];

      return stableSort(groups, (left, right) => {
        if (prioritizePinned) {
          const pinnedDifference =
            Number(right.rows.some(isPinned)) - Number(left.rows.some(isPinned));
          if (pinnedDifference !== 0) return pinnedDifference;
        }
        return compareGroups(left, right);
      });
    }

    function threadTimestamp(row, field) {
      const value = context.findReactRowProps(row)?.thread?.[field];
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function threadTitle(row) {
      return context.findReactRowProps(row)?.thread?.title?.trim() ?? "";
    }

    function compareThreads(left, right, order) {
      if (order === "alphabetical") {
        const leftTitle = threadTitle(left);
        const rightTitle = threadTitle(right);
        if (!leftTitle) return rightTitle ? 1 : 0;
        if (!rightTitle) return -1;
        return collator.compare(leftTitle, rightTitle);
      }
      if (order === "attention") {
        return attentionRank(left) - attentionRank(right);
      }
      if (order === "recent") {
        return threadTimestamp(right, "updatedAt") - threadTimestamp(left, "updatedAt");
      }
      if (order === "oldest") {
        const leftCreated = threadTimestamp(left, "createdAt") || Number.POSITIVE_INFINITY;
        const rightCreated = threadTimestamp(right, "createdAt") || Number.POSITIVE_INFINITY;
        return leftCreated - rightCreated;
      }
      return 0;
    }

    function sortThreads(rows, section, pinnedRows = new Set()) {
      const order =
        section === "Active"
          ? current.activeThreadOrder
          : section === "Snoozed"
            ? current.snoozedThreadOrder
            : "default";
      const prioritizePinned =
        section === "Active" || (section === "Snoozed" && current.snoozedPinnedFirst);
      if (order === "default" && !prioritizePinned) return [...rows];

      const compare = (left, right) => compareThreads(left, right, order);
      if (!prioritizePinned) return stableSort(rows, compare);

      const pinned = [];
      const unpinned = [];
      for (const row of rows) {
        const rowIsPinned =
          section === "Active" ? pinnedRows.has(row) || isPinned(row) : isPinned(row);
        (rowIsPinned ? pinned : unpinned).push(row);
      }
      return [...stableSort(pinned, compare), ...stableSort(unpinned, compare)];
    }

    return {
      settings,
      setProjectOrder,
      setActiveThreadOrder,
      setSnoozedPinnedFirst,
      setSnoozedThreadOrder,
      sortGroups,
      sortThreads,
    };
  };
})();
