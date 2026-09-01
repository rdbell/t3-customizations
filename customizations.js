/**
 * Personal T3 Code customizations.
 *
 * Run copy-customization.sh, then paste the copied payload into T3 Code's
 * DevTools console. Re-running it replaces the previous instance. The
 * customization lasts until the renderer reloads.
 * Tested against T3 Code 0.0.37.
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
        ...rows.filter((row) => pinnedRows.has(row)),
        ...rows.filter((row) => !pinnedRows.has(row)),
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
            child.querySelector?.('[data-testid="sidebar-snoozed-shelf-toggle"]') ||
            child.querySelector?.('[data-testid="sidebar-settled-shelf-toggle"]'),
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
    return (
      [...row.querySelectorAll('[role="status"]')]
        .map((node) => node.textContent.trim())
        .find((label) => THREAD_STATUSES.has(label)) ?? null
    );
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
      if (record.type === "characterData") {
        return Boolean(
          target?.closest('li[data-thread-item]') && target.closest('[role="status"]'),
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
    characterData: true,
    childList: true,
    subtree: true,
  });

  function handleThreadClick(event) {
    if (!(event.target instanceof Element)) return;
    settingsFeature?.handleClick(event);

    if (!notifications) return;
    const row = event.target.closest('li[data-thread-item]');
    if (!row?.closest("[data-app-sidebar]")) return;
    const snapshot = notifications.snapshot(row, rowSection(row) === "active");
    if (snapshot) notifications.clearBadge(snapshot.key);
  }
  document.addEventListener("click", handleThreadClick, true);

  function handleNavigation() {
    settingsFeature?.handleNavigation();
  }
  window.addEventListener("hashchange", handleNavigation);
  window.addEventListener("popstate", handleNavigation);

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
