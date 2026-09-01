/** Active, Snoozed, and Settled project grouping for the thread sidebar. */
(() => {
  const registry = (window.__t3CustomizationFeatureFactories ??= {});

  registry.sidebarProjectGroups = function createSidebarProjectGroups(context) {
    const HEADING = "data-t3-project-group-heading";
    const HEADING_KEY = "data-t3-project-group-key";
    const ORDERED = "data-t3-project-group-ordered";
    const FLATTENED = "data-t3-project-group-flattened";
    const HIDDEN = "data-t3-project-group-hidden";
    const GROUPED_ROW = "data-t3-project-group-row";
    const PROJECT_IDENTITY = "data-t3-thread-project-identity";
    const ACTIVE_CARD = "data-t3-active-card";
    const ACTIVE_CONTENT = "data-t3-active-content";
    const ACTIVE_TOP = "data-t3-active-top";
    const ACTIVE_TITLE = "data-t3-active-title";
    const ACTIVE_META = "data-t3-active-meta";
    const SHELF_LABEL = "data-t3-shelf-label";
    const SHELF_COUNT = "data-t3-shelf-count";
    const NOTIFICATION_BADGE = "data-t3-notification-badge";
    const STYLE_ID = "t3-project-group-styles";
    const STORAGE_KEY = "t3-project-group-collapsed-v1";

    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [${HEADING}] {
        align-items: center;
        color: var(--sidebar-muted-foreground);
        display: flex;
        font-size: 11px;
        font-weight: 600;
        gap: 8px;
        line-height: 16px;
        list-style: none;
        min-width: 0;
        padding: 6px 10px 2px;
      }
      [${HEADING}]::after {
        background: var(--sidebar-border);
        content: "";
        flex: 1;
        height: 1px;
        opacity: .55;
      }
      [${HEADING}="section"] {
        font-size: 12px;
        padding-top: 10px;
      }
      [${HEADING}="project"] {
        display: block;
        padding: 2px 0 0;
      }
      [${HEADING}="project"]::after {
        display: none;
      }
      [${HEADING}="project"] > button {
        align-items: center;
        background: transparent;
        border: 0;
        border-radius: 6px;
        color: inherit;
        cursor: pointer;
        display: flex;
        font: inherit;
        gap: 8px;
        line-height: 16px;
        min-width: 0;
        padding: 5px 10px;
        text-align: left;
        width: 100%;
      }
      [${HEADING}="project"] > button:hover {
        background: var(--sidebar-row-hover);
        color: var(--sidebar-foreground);
      }
      [${HEADING}="project"] > button:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: -2px;
      }
      [${HEADING}] [data-name] {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      [${HEADING}] [data-count] {
        font-variant-numeric: tabular-nums;
        font-weight: 500;
        opacity: .65;
      }
      [${HEADING}="section"] [data-count],
      [${HEADING}="project"] button[aria-expanded="true"] [data-count] {
        display: none;
      }
      [${SHELF_LABEL}] {
        font-size: 0 !important;
      }
      [${SHELF_LABEL}]::before {
        content: attr(${SHELF_LABEL});
        font-size: 12px;
      }
      [${SHELF_LABEL}]::after {
        content: attr(${SHELF_COUNT});
        font-size: 10px;
        font-variant-numeric: tabular-nums;
        margin-left: 4px;
        opacity: .7;
      }
      [${SHELF_LABEL}]:not([${SHELF_COUNT}])::after {
        display: none;
      }
      [${HEADING}] [data-spacer] {
        flex: 1;
        min-width: 4px;
      }
      [${HEADING}] [data-project-icon] {
        align-items: center;
        display: inline-flex;
        flex: none;
        height: 16px;
        justify-content: center;
        width: 16px;
      }
      [${HEADING}] [data-project-icon] > img,
      [${HEADING}] [data-project-icon] > svg {
        height: 16px !important;
        width: 16px !important;
      }
      [${HEADING}] [data-summary] {
        border-radius: 999px;
        flex: none;
        font-size: 10px;
        font-weight: 600;
        line-height: 16px;
        padding: 0 6px;
      }
      [${HEADING}] [${NOTIFICATION_BADGE}] {
        align-items: center;
        background: var(--destructive);
        border-radius: 999px;
        color: white;
        display: inline-flex;
        flex: none;
        font-size: 9px;
        font-variant-numeric: tabular-nums;
        font-weight: 700;
        height: 16px;
        justify-content: center;
        line-height: 16px;
        min-width: 16px;
        padding: 0 4px;
      }
      [${HEADING}] [${NOTIFICATION_BADGE}][hidden] {
        display: none;
      }
      [${HEADING}] [data-summary="attention"] {
        background: color-mix(in srgb, var(--destructive) 12%, transparent);
        color: var(--destructive);
      }
      [${HEADING}] [data-summary="done"] {
        background: color-mix(in srgb, #16a34a 12%, transparent);
        color: #15803d;
      }
      [${HEADING}] [data-summary="working"] {
        background: color-mix(in srgb, #0284c7 12%, transparent);
        color: #0369a1;
      }
      .dark [${HEADING}] [data-summary="done"] {
        color: #4ade80;
      }
      .dark [${HEADING}] [data-summary="working"] {
        color: #38bdf8;
      }
      [${HEADING}] button[aria-expanded="true"] [data-summary] {
        display: none;
      }
      [${HEADING}] [data-chevron] {
        flex: none;
        height: 12px;
        transition: transform 150ms ease;
        width: 12px;
      }
      [${HEADING}] button[aria-expanded="false"] [data-chevron] {
        transform: rotate(-90deg);
      }
      [${GROUPED_ROW}] [data-testid="sidebar-row-card"],
      [${GROUPED_ROW}] [data-testid="sidebar-row-slim"] {
        margin-left: 8px;
        width: calc(100% - 8px);
      }
      [${PROJECT_IDENTITY}] {
        display: none !important;
      }
      [${ACTIVE_CONTENT}] {
        height: 3.875rem !important;
        padding-bottom: 8px !important;
        padding-top: 8px !important;
      }
      [${ACTIVE_TOP}] {
        height: 20px !important;
        position: absolute !important;
        right: var(--sidebar-row-content-inset);
        top: 8px;
        width: auto !important;
        z-index: 20;
      }
      [${ACTIVE_TITLE}] {
        margin-top: 0 !important;
        min-height: 20px;
        padding-right: 112px;
      }
      [${ACTIVE_META}] {
        margin-top: 2px !important;
      }
    `;
    document.head.appendChild(style);

    const collapsedGroups = (() => {
      try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
        return new Set(
          Array.isArray(value) ? value.filter((item) => typeof item === "string") : [],
        );
      } catch {
        return new Set();
      }
    })();

    function saveCollapsedGroups() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsedGroups]));
      } catch {
        // A blocked localStorage should not disable the in-memory toggles.
      }
    }

    function clear(options = {}) {
      if (!options.preserveHeadings) {
        document.querySelectorAll(`[${HEADING}]`).forEach((node) => node.remove());
      }
      document.querySelectorAll(`[${ORDERED}]`).forEach((node) => {
        node.style.removeProperty("order");
        node.removeAttribute(ORDERED);
      });
      document.querySelectorAll(`[${FLATTENED}]`).forEach((node) => {
        node.style.removeProperty("display");
        node.removeAttribute(FLATTENED);
      });
      document.querySelectorAll(`[${HIDDEN}]`).forEach((node) => {
        node.style.removeProperty("display");
        node.removeAttribute(HIDDEN);
      });
      for (const attribute of [
        GROUPED_ROW,
        PROJECT_IDENTITY,
        ACTIVE_CARD,
        ACTIVE_CONTENT,
        ACTIVE_TOP,
        ACTIVE_TITLE,
        ACTIVE_META,
        SHELF_LABEL,
        SHELF_COUNT,
      ]) {
        document
          .querySelectorAll(`[${attribute}]`)
          .forEach((node) => node.removeAttribute(attribute));
      }
    }

    function setOrder(node, order) {
      node.style.order = String(order);
      node.setAttribute(ORDERED, "");
    }

    function cloneProjectIcon(row) {
      const parts = context.activeCardParts(row);
      const slim = row.querySelector('[data-testid="sidebar-row-slim"]');
      const iconRoot = parts?.top ?? slim?.firstElementChild ?? null;
      if (!iconRoot) return null;

      const source =
        (iconRoot.matches?.('img:not(.hidden), svg') ? iconRoot : null) ??
        iconRoot.querySelector?.('img:not(.hidden), svg') ??
        null;
      if (!source) return null;

      const wrapper = document.createElement("span");
      wrapper.setAttribute("data-project-icon", "");
      wrapper.setAttribute("aria-hidden", "true");
      wrapper.appendChild(source.cloneNode(true));
      return wrapper;
    }

    function groupStatusSummary(rows) {
      let attention = 0;
      let done = 0;
      let working = 0;

      for (const row of rows) {
        const status = context.notifications.status(row);
        if (["Approval", "Input", "Failed", "Woke"].includes(status)) attention++;
        else if (status === "Done") done++;
        else if (status === "Working" || status === "Monitoring") working++;
      }

      if (attention > 0) {
        return {
          kind: "attention",
          label: attention === 1 ? "1 needs you" : `${attention} need you`,
        };
      }
      if (done > 0) return { kind: "done", label: `${done} done` };
      if (working > 0) return { kind: "working", label: `${working} working` };
      return null;
    }

    function decorateThreadRow(row, name) {
      row.setAttribute(GROUPED_ROW, "");
      const parts = context.activeCardParts(row);
      if (parts) {
        parts.card.setAttribute(ACTIVE_CARD, "");
        parts.content.setAttribute(ACTIVE_CONTENT, "");
        parts.top.setAttribute(ACTIVE_TOP, "");
        parts.title.setAttribute(ACTIVE_TITLE, "");
        parts.meta.setAttribute(ACTIVE_META, "");

        const topChildren = [...parts.top.children];
        const nameIndex = topChildren.findIndex(
          (node) => node.tagName === "SPAN" && node.textContent.trim() === name,
        );
        if (nameIndex >= 0) {
          for (const node of topChildren.slice(0, nameIndex + 1)) {
            node.setAttribute(PROJECT_IDENTITY, "");
          }
        }
        return;
      }

      row
        .querySelector('[data-testid="sidebar-row-slim"]')
        ?.firstElementChild?.setAttribute(PROJECT_IDENTITY, "");
    }

    function decorateShelfLabel(header, label) {
      const toggle = header?.querySelector(
        `[data-testid="sidebar-${label.toLowerCase()}-shelf-toggle"]`,
      );
      const labelNode = toggle?.firstElementChild;
      if (!labelNode) return;

      const match = labelNode.textContent.trim().match(/^(.+?)\s*\((\d+)\)$/);
      labelNode.setAttribute(SHELF_LABEL, match?.[1] ?? label);
      if (match) labelNode.setAttribute(SHELF_COUNT, match[2]);
      else labelNode.removeAttribute(SHELF_COUNT);
    }

    function makeSectionHeading(label, count, order, list, headings) {
      const headingKey = `section:${encodeURIComponent(label)}`;
      let item = headings.byKey.get(headingKey);
      if (!item) {
        item = document.createElement("li");
        item.setAttribute(HEADING, "section");
        item.setAttribute(HEADING_KEY, headingKey);

        const name = document.createElement("span");
        name.setAttribute("data-name", "");
        item.appendChild(name);

        const total = document.createElement("span");
        total.setAttribute("data-count", "");
        item.appendChild(total);

        list.appendChild(item);
        headings.byKey.set(headingKey, item);
      }

      item.setAttribute(HEADING, "section");
      item.style.order = String(order);
      context.updateText(item.querySelector("[data-name]"), label);
      context.updateText(item.querySelector("[data-count]"), String(count));
      headings.used.add(item);
    }

    function makeProjectHeading(input) {
      const headingKey = `project:${encodeURIComponent(input.section)}:${encodeURIComponent(input.label)}`;
      let item = input.headings.byKey.get(headingKey);
      if (!item) {
        item = document.createElement("li");
        item.setAttribute(HEADING, "project");
        item.setAttribute(HEADING_KEY, headingKey);

        const button = document.createElement("button");
        button.type = "button";
        for (const attribute of ["data-project-icon", "data-name", "data-count"]) {
          const span = document.createElement("span");
          span.setAttribute(attribute, "");
          if (attribute === "data-project-icon") span.setAttribute("aria-hidden", "true");
          button.appendChild(span);
        }

        const notificationBadge = document.createElement("span");
        notificationBadge.setAttribute(NOTIFICATION_BADGE, "");
        notificationBadge.hidden = true;
        button.appendChild(notificationBadge);

        const spacer = document.createElement("span");
        spacer.setAttribute("data-spacer", "");
        button.appendChild(spacer);

        const status = document.createElement("span");
        status.setAttribute("data-summary", "");
        status.hidden = true;
        button.appendChild(status);

        const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        chevron.setAttribute("data-chevron", "");
        chevron.setAttribute("viewBox", "0 0 20 20");
        chevron.setAttribute("aria-hidden", "true");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M5 7.5 10 12.5 15 7.5");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("stroke-width", "1.75");
        chevron.appendChild(path);
        button.appendChild(chevron);

        item.appendChild(button);
        input.list.appendChild(item);
        input.headings.byKey.set(headingKey, item);
      }

      item.setAttribute(HEADING, "project");
      item.style.order = String(input.order);
      const button = item.querySelector(":scope > button");
      button.setAttribute("aria-expanded", String(!input.collapsed));
      button.setAttribute(
        "aria-label",
        `${input.collapsed ? "Expand" : "Collapse"} ${input.label} in ${input.section}`,
      );
      button.onclick = () => input.onToggle(button);

      const iconSlot = button.querySelector("[data-project-icon]");
      const nextIcon = input.icon?.firstElementChild ?? null;
      if (nextIcon && iconSlot.firstElementChild?.outerHTML !== nextIcon.outerHTML) {
        iconSlot.replaceChildren(nextIcon.cloneNode(true));
      }
      context.updateText(button.querySelector("[data-name]"), input.label);
      context.updateText(button.querySelector("[data-count]"), String(input.count));

      const notificationBadge = button.querySelector(`[${NOTIFICATION_BADGE}]`);
      notificationBadge.hidden = input.notificationCount === 0;
      context.updateText(notificationBadge, String(input.notificationCount));
      notificationBadge.setAttribute(
        "aria-label",
        `${input.notificationCount} unread thread ${
          input.notificationCount === 1 ? "notification" : "notifications"
        }`,
      );

      const status = button.querySelector("[data-summary]");
      status.hidden = input.summary === null;
      if (input.summary) {
        status.setAttribute("data-summary", input.summary.kind);
        context.updateText(status, input.summary.label);
      }
      input.headings.used.add(item);
    }

    function setGroupRowsCollapsed(rows, collapsed) {
      for (const row of rows) {
        if (collapsed) {
          row.style.display = "none";
          row.setAttribute(HIDDEN, "");
        } else {
          row.style.removeProperty("display");
          row.removeAttribute(HIDDEN);
        }
      }
    }

    function renderProjectGroups(section, rows, list, nextOrder, headings, pinnedRows) {
      const groups = new Map();
      for (const row of rows) {
        const name = context.projectName(row);
        const group = groups.get(name);
        if (group) group.push(row);
        else groups.set(name, [row]);
      }

      const sortedGroups = context.sorting.sortGroups(
        [...groups].map(([name, groupRows]) => ({ name, rows: groupRows })),
        section,
      );

      for (const group of sortedGroups) {
        const { name } = group;
        const groupRows = context.sorting.sortThreads(group.rows, section, pinnedRows);
        const collapseKey = `${section}\u0000${name}`;
        const collapsed = collapsedGroups.has(collapseKey);
        let icon = null;
        for (const row of groupRows) {
          icon = cloneProjectIcon(row);
          if (icon) break;
        }
        makeProjectHeading({
          collapsed,
          count: groupRows.length,
          headings,
          icon,
          label: name,
          list,
          notificationCount: context.notifications.groupCount(groupRows),
          onToggle(button) {
            const nextCollapsed = !collapsedGroups.has(collapseKey);
            if (nextCollapsed) collapsedGroups.add(collapseKey);
            else collapsedGroups.delete(collapseKey);
            saveCollapsedGroups();
            button.setAttribute("aria-expanded", String(!nextCollapsed));
            button.setAttribute(
              "aria-label",
              `${nextCollapsed ? "Expand" : "Collapse"} ${name} in ${section}`,
            );
            setGroupRowsCollapsed(groupRows, nextCollapsed);
          },
          order: nextOrder(),
          section,
          summary: groupStatusSummary(groupRows),
        });
        for (const row of groupRows) {
          decorateThreadRow(row, name);
          setOrder(row, nextOrder());
        }
        setGroupRowsCollapsed(groupRows, collapsed);
      }
    }

    function apply() {
      clear({ preserveHeadings: true });
      const list = context.findThreadList();
      if (!list) return;

      const children = [...list.children];
      const existingHeadings = children.filter((child) => child.hasAttribute(HEADING));
      const headings = {
        byKey: new Map(
          existingHeadings.flatMap((heading) => {
            const key = heading.getAttribute(HEADING_KEY);
            return key ? [[key, heading]] : [];
          }),
        ),
        used: new Set(),
      };
      const pinnedList = list.querySelector(':scope > li ul[aria-label="Pinned threads"]');
      const pinnedWrapper = pinnedList?.closest("li") ?? null;
      const pinnedDivider = children.find((child) =>
        child.matches('[data-testid="sidebar-pinned-divider"]'),
      );
      const pinnedRows = pinnedList
        ? [...pinnedList.children].filter((child) => child.matches("li[data-thread-item]"))
        : [];
      const pinnedSet = new Set(pinnedRows);
      const directRows = children.filter((child) => child.matches("li[data-thread-item]"));
      const rows = [...pinnedRows, ...directRows];
      const active = rows.filter((row) => context.rowSection(row) === "active");
      const snoozed = rows.filter((row) => context.rowSection(row) === "snoozed");
      const settled = rows.filter((row) => context.rowSection(row) === "settled");
      const rowSet = new Set(rows);
      context.notifications.update(rows, active);

      const snoozedHeader = children.find((child) =>
        child.querySelector?.('[data-testid="sidebar-snoozed-shelf-toggle"]'),
      );
      const settledHeader = children.find((child) =>
        child.querySelector?.('[data-testid="sidebar-settled-shelf-toggle"]'),
      );
      decorateShelfLabel(snoozedHeader, "Snoozed");
      decorateShelfLabel(settledHeader, "Settled");
      const showMore = children.find((child) =>
        /^Show \d+ more$/.test(child.querySelector?.("button")?.textContent.trim() ?? ""),
      );
      const special = new Set(
        [
          pinnedWrapper,
          pinnedDivider,
          snoozedHeader,
          settledHeader,
          showMore,
          ...existingHeadings,
        ].filter(Boolean),
      );
      const prefix = children.filter((child) => !rowSet.has(child) && !special.has(child));

      let order = 0;
      const nextOrder = () => order++;
      for (const node of prefix) setOrder(node, nextOrder());

      if (active.length) {
        if (pinnedWrapper && pinnedList) {
          for (const node of [pinnedWrapper, pinnedList]) {
            node.style.display = "contents";
            node.setAttribute(FLATTENED, "");
          }
        }
        if (pinnedDivider) {
          pinnedDivider.style.display = "none";
          pinnedDivider.setAttribute(FLATTENED, "");
        }
        makeSectionHeading("Active", active.length, nextOrder(), list, headings);
        renderProjectGroups("Active", active, list, nextOrder, headings, pinnedSet);
      }

      if (snoozedHeader) setOrder(snoozedHeader, nextOrder());
      renderProjectGroups("Snoozed", snoozed, list, nextOrder, headings, pinnedSet);
      if (settledHeader) setOrder(settledHeader, nextOrder());
      renderProjectGroups("Settled", settled, list, nextOrder, headings, pinnedSet);
      if (showMore) setOrder(showMore, nextOrder());
      for (const heading of existingHeadings) {
        if (!headings.used.has(heading)) heading.remove();
      }
    }

    function expandAll() {
      collapsedGroups.clear();
      saveCollapsedGroups();
      apply();
    }

    function destroy() {
      clear();
      style.remove();
    }

    return { apply, destroy, expandAll, headingAttribute: HEADING };
  };
})();
