/**
 * Personal T3 Code customizations.
 *
 * Run copy-customization.sh, then paste the copied payload into T3 Code's
 * DevTools console. Re-running it replaces the previous instance. The
 * customization lasts until the renderer reloads.
 * Tested against T3 Code 0.0.40.
 */
(() => {
  const GLOBAL = "__t3ProjectGroupedSections";
  const CODEC_SOUND_GLOBAL = "__t3CodecNotificationSoundBase64";
  const SELECTION_GLOBAL = "__t3CustomizationSelection";
  const featureFactories = window.__t3CustomizationFeatureFactories;
  const requestedSelection = window[SELECTION_GLOBAL];
  delete window[SELECTION_GLOBAL];
  const selected = requestedSelection
    ? {
        messageReuse: requestedSelection.messageReuse === true,
        notifications: requestedSelection.notifications === true,
        projectGroups:
          requestedSelection.projectGroups === true || requestedSelection.sidebarSorting === true,
        sidebarSorting: requestedSelection.sidebarSorting === true,
      }
    : {
        messageReuse: true,
        notifications: true,
        projectGroups: true,
        sidebarSorting: true,
      };
  const settingsSelected =
    selected.messageReuse || selected.notifications || selected.sidebarSorting;

  if (
    (selected.notifications && !featureFactories?.notifications) ||
    (selected.sidebarSorting && !featureFactories?.sidebarSorting) ||
    (selected.messageReuse && !featureFactories?.messageReuse) ||
    (settingsSelected && !featureFactories?.settings) ||
    (selected.projectGroups && !featureFactories?.sidebarProjectGroups)
  ) {
    throw new Error("The customization bundle is missing a selected feature.");
  }

  window[GLOBAL]?.destroy?.();
  const codecSoundBase64 = window[CODEC_SOUND_GLOBAL] ?? null;
  delete window[CODEC_SOUND_GLOBAL];

  let frame = 0;
  const THREAD_STATUSES = new Set([
    "Working",
    "Monitoring",
    "Approval",
    "Input",
    "Plan",
    "Failed",
    "Woke",
    "Done",
  ]);

  const emptyNotifications = {
    groupCount: () => 0,
    status: threadStatus,
    update() {},
  };
  const emptySorting = {
    sortGroups: (groups) => [...groups],
    sortThreads(rows, section, pinnedRows = new Set()) {
      if (section !== "Active") return [...rows];
      return [
        ...rows.filter((row) => pinnedRows.has(row) || isPinned(row)),
        ...rows.filter((row) => !pinnedRows.has(row) && !isPinned(row)),
      ];
    },
  };
  const notifications = selected.notifications
    ? featureFactories.notifications({
        activeCardParts,
        codecSoundBase64,
        findReactRowProps,
        findThreadList,
        projectName,
        rowSection,
        schedule,
      })
    : null;
  const sorting = selected.sidebarSorting
    ? featureFactories.sidebarSorting({
        findReactRowProps,
        isPinned,
        notifications: notifications ?? emptyNotifications,
        schedule,
      })
    : null;
  const messageReuse = selected.messageReuse
    ? featureFactories.messageReuse({ schedule })
    : null;
  const settingsFeature = settingsSelected
    ? featureFactories.settings({
        messageReuse,
        notifications,
        schedule,
        sorting,
        updateText,
      })
    : null;
  const sidebarFeature = selected.projectGroups
    ? featureFactories.sidebarProjectGroups({
        activeCardParts,
        findThreadList,
        isPinned,
        notifications: notifications ?? emptyNotifications,
        projectName,
        rowSection,
        sorting: sorting ?? emptySorting,
        updateText,
      })
    : null;

  function findThreadList() {
    const sidebar = document.querySelector("[data-app-sidebar]");
    if (!sidebar) return null;

    return [...sidebar.querySelectorAll('ul[role="list"]')]
      .filter((list) => list.getAttribute("aria-label") !== "Pinned threads")
      .find((list) =>
        [...list.children].some(
          (child) =>
            child.matches("li[data-thread-item]") ||
            child.hasAttribute("data-t3-project-group-heading") ||
            child.matches?.(
              '[data-testid="sidebar-pinned-header"], [data-testid="sidebar-draft-divider"]',
            ) ||
            child.querySelector?.(
              '[data-testid="sidebar-draft-row"], [data-testid="sidebar-snoozed-shelf-toggle"], [data-testid="sidebar-settled-shelf-toggle"]',
            ),
        ),
      );
  }

  function findReactRowProps(row) {
    const fiberKey = Reflect.ownKeys(row).find(
      (key) => typeof key === "string" && key.startsWith("__reactFiber$"),
    );
    if (!fiberKey) return null;

    const first = row[fiberKey];
    const queue = [first, first?.alternate];
    const seen = new Set();

    while (queue.length) {
      const fiber = queue.shift();
      if (!fiber || seen.has(fiber)) continue;
      seen.add(fiber);

      const props = fiber.memoizedProps ?? fiber.pendingProps;
      if (
        props &&
        typeof props === "object" &&
        Object.hasOwn(props, "projectTitle") &&
        props.thread
      ) {
        return props;
      }

      queue.push(fiber.return, fiber.alternate);
    }
    return null;
  }

  function fallbackCardProject(row) {
    const card = row.querySelector('[data-testid="sidebar-row-card"]');
    const topLine = card?.firstElementChild?.firstElementChild;
    if (!topLine) return null;
    const label = [...topLine.children].find(
      (child) => child.tagName === "SPAN" && child.textContent.trim(),
    );
    return label?.textContent.trim() || null;
  }

  function projectName(row) {
    return (
      findReactRowProps(row)?.projectTitle?.trim() ||
      fallbackCardProject(row) ||
      "Unknown project"
    );
  }

  function rowSection(row) {
    if (row.querySelector('[aria-label="Wake thread now"]')) return "snoozed";
    if (row.querySelector('[aria-label="Un-settle thread"]')) return "settled";
    if (row.querySelector('[data-testid="sidebar-row-card"]')) return "active";
    return null;
  }

  function isPinned(row) {
    if (findReactRowProps(row)?.thread?.pinnedAt != null) return true;
    return Boolean(
      row.querySelector('[aria-label="Unpin thread"], [aria-label="Pinned"]'),
    );
  }

  function activeCardParts(row) {
    const card = row.querySelector('[data-testid="sidebar-row-card"]');
    const content = card?.firstElementChild ?? null;
    if (!card || !content || content.children.length < 3) return null;
    return {
      card,
      content,
      top: content.children[0],
      title: content.children[1],
      meta: content.children[2],
    };
  }

  function threadStatus(row) {
    const thread = findReactRowProps(row)?.thread;
    const statusRoot = activeCardParts(row)?.top ?? row;
    let fromCard = null;
    for (const node of statusRoot.querySelectorAll('[role="status"]')) {
      const raw = node.textContent.trim();
      if (THREAD_STATUSES.has(raw)) fromCard = raw;
      else if (/^Pending Approval\b/i.test(raw) || /^Approval\b/i.test(raw)) fromCard = "Approval";
      else if (/^Awaiting Input\b/i.test(raw) || /^Input\b/i.test(raw)) fromCard = "Input";
      else if (/^Plan Ready\b/i.test(raw) || /^Plan\b/i.test(raw)) fromCard = "Plan";
      else if (/^Completed\b/i.test(raw)) fromCard = "Done";
      else {
        const match = raw.match(/^(Working|Monitoring|Failed|Woke|Done)\b/);
        if (match) fromCard = match[1];
      }
      if (fromCard) break;
    }
    if (fromCard === "Approval" || thread?.hasPendingApprovals === true) return "Approval";
    if (fromCard === "Input" || thread?.hasPendingUserInput === true) return "Input";
    if (fromCard === "Working" || fromCard === "Monitoring") return fromCard;
    if (thread?.session?.status === "running" || thread?.session?.status === "starting") {
      return "Working";
    }
    if (fromCard === "Failed" || thread?.session?.status === "error") return "Failed";
    if (
      fromCard === "Plan" ||
      (thread?.hasPendingUserInput !== true &&
        thread?.interactionMode === "plan" &&
        thread?.hasActionableProposedPlan === true &&
        thread?.session?.status !== "running" &&
        thread?.session?.status !== "starting")
    ) {
      return "Plan";
    }
    return fromCard;
  }

  function updateText(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }

  function apply() {
    messageReuse?.apply();
    settingsFeature?.apply();
    if (sidebarFeature) {
      sidebarFeature.apply();
    } else if (notifications) {
      const rows = [...(findThreadList()?.querySelectorAll("li[data-thread-item]") ?? [])];
      notifications.update(
        rows,
        rows.filter((row) => rowSection(row) === "active"),
      );
    }
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      apply();
    });
  }

  const observer = new MutationObserver((records) => {
    const appChanged = records.some((record) => {
      const target =
        record.target instanceof Element ? record.target : record.target.parentElement;
      if (sidebarFeature && target?.closest(`[${sidebarFeature.headingAttribute}]`)) return false;
      if (record.type === "attributes") {
        return Boolean(
          target?.matches(
            '[data-testid="sidebar-row-card"], [data-testid="sidebar-row-slim"]',
          ),
        );
      }
      if (record.type === "characterData") {
        return Boolean(
          target?.closest("li[data-thread-item]") && target.closest('[role="status"]'),
        );
      }
      return [...record.addedNodes, ...record.removedNodes].some(
        (node) =>
          !(
            sidebarFeature &&
            node instanceof Element &&
            node.hasAttribute(sidebarFeature.headingAttribute)
          ),
      );
    });
    if (appChanged) schedule();
  });
  observer.observe(document.querySelector("[data-app-sidebar]") ?? document.documentElement, {
    attributeFilter: ["class"],
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  });

  function handleThreadClick(event) {
    if (!(event.target instanceof Element)) return;
    settingsFeature?.handleClick(event);

    if (!notifications) return;
    if (event.target.closest('[aria-label="Stop generation"]')) {
      notifications.acknowledgeViewedThread({ suppressNextStop: true });
      return;
    }
    const row = event.target.closest('li[data-thread-item]');
    if (!row?.closest("[data-app-sidebar]")) return;
    const snapshot = notifications.snapshot(row, rowSection(row) === "active");
    if (snapshot) {
      const suppressNextStop = Boolean(
        event.target.closest('[aria-label="Settle thread"], [aria-label="Snooze thread"]'),
      );
      notifications.acknowledge(snapshot.key, { suppressNextStop });
    }
  }
  document.addEventListener("click", handleThreadClick, true);

  function handleComposerSubmit(event) {
    if (!(event.target instanceof Element)) return;
    if (!event.target.matches('[data-chat-composer-form="true"]')) return;
    notifications?.acknowledgeViewedThread();
  }
  document.addEventListener("submit", handleComposerSubmit, true);

  function handleNavigation() {
    settingsFeature?.handleNavigation();
    schedule();
  }
  window.addEventListener("hashchange", handleNavigation);
  window.addEventListener("popstate", handleNavigation);

  function handleAttentionReturn() {
    notifications?.acknowledgeVisibleThread();
    schedule();
  }
  window.addEventListener("focus", handleAttentionReturn);
  document.addEventListener("visibilitychange", handleAttentionReturn);

  window[GLOBAL] = {
    refresh: apply,
    selected: { ...selected },
    ...(sidebarFeature ? { expandAll: sidebarFeature.expandAll } : {}),
    ...(notifications
      ? {
          clearNotificationBadges: notifications.clearBadges,
          disableNotifications: notifications.disable,
          enableNotifications: notifications.enable,
          notificationStatus: notifications.settings,
          setNotificationSound: notifications.setSound,
          setNotificationVolume: notifications.setVolume,
          testNotification() {
            if (!notifications.test()) {
              console.warn(`Enable notifications with window.${GLOBAL}.enableNotifications().`);
              return false;
            }
            return true;
          },
        }
      : {}),
    ...(sorting
      ? {
          setActiveThreadOrder: sorting.setActiveThreadOrder,
          setProjectOrder: sorting.setProjectOrder,
          setSnoozedPinnedFirst: sorting.setSnoozedPinnedFirst,
          setSnoozedThreadOrder: sorting.setSnoozedThreadOrder,
          sortingStatus: sorting.settings,
        }
      : {}),
    ...(messageReuse
      ? {
          messageReuseStatus: messageReuse.settings,
          setReuseAutoSend: messageReuse.setAutoSend,
        }
      : {}),
    destroy() {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("click", handleThreadClick, true);
      document.removeEventListener("submit", handleComposerSubmit, true);
      document.removeEventListener("visibilitychange", handleAttentionReturn);
      window.removeEventListener("focus", handleAttentionReturn);
      window.removeEventListener("hashchange", handleNavigation);
      window.removeEventListener("popstate", handleNavigation);
      settingsFeature?.destroy();
      messageReuse?.destroy();
      notifications?.destroy();
      sidebarFeature?.destroy();
      delete window[GLOBAL];
      console.info("T3 customizations disabled.");
    },
  };

  apply();
  if (notifications) void notifications.enable();
  console.info(`T3 customizations enabled. Disable with window.${GLOBAL}.destroy()`);
})();
