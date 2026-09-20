/** Settings navigation and the Customizations page. */
(() => {
  const registry = (window.__t3CustomizationFeatureFactories ??= {});

  registry.settings = function createSettingsFeature(context) {
    const NAV = "data-t3-customizations-nav";
    const PAGE = "data-t3-customizations-page";
    const BREADCRUMB = "data-t3-customizations-breadcrumb";
    const HIDDEN = "data-t3-customizations-hidden";
    const NATIVE_ACTIVE = "data-t3-customizations-native-active";
    const CUSTOM_SWITCH = "data-t3-customization-switch";
    const REUSE_AUTO_SEND_SWITCH = "data-t3-reuse-auto-send";
    const SNOOZED_PINNED_SWITCH = "data-t3-snoozed-pinned-first";
    const STYLE_ID = "t3-customizations-settings-styles";
    let active = false;

    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [${HIDDEN}] { display: none !important; }
      [${CUSTOM_SWITCH}] {
        appearance: none;
        background: var(--input);
        border-radius: 999px;
        cursor: pointer;
        flex: none;
        height: 20px;
        position: relative;
        transition: background-color 150ms ease;
        width: 36px;
      }
      [${CUSTOM_SWITCH}]::after {
        background: var(--background);
        border-radius: 999px;
        box-shadow: 0 1px 2px rgb(0 0 0 / 20%);
        content: "";
        height: 16px;
        left: 2px;
        position: absolute;
        top: 2px;
        transition: transform 150ms ease;
        width: 16px;
      }
      [${CUSTOM_SWITCH}]:checked { background: var(--primary); }
      [${CUSTOM_SWITCH}]:checked::after { transform: translateX(16px); }
      [${CUSTOM_SWITCH}]:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
      }
    `;
    document.head.appendChild(style);

    function makeIcon(template) {
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("aria-hidden", "true");
      icon.setAttribute("fill", "none");
      icon.setAttribute("height", "24");
      icon.setAttribute("stroke", "currentColor");
      icon.setAttribute("stroke-linecap", "round");
      icon.setAttribute("stroke-linejoin", "round");
      icon.setAttribute("stroke-width", "2");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("width", "24");
      if (template?.getAttribute("class")) {
        icon.setAttribute("class", template.getAttribute("class"));
      }
      for (const pathData of [
        "M21 4H14",
        "M10 4H3",
        "M21 12H12",
        "M8 12H3",
        "M21 20H16",
        "M12 20H3",
        "M14 2V6",
        "M8 10V14",
        "M16 18V22",
      ]) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathData);
        icon.appendChild(path);
      }
      return icon;
    }

    function deactivatePage() {
      document.querySelectorAll(`[${PAGE}], [${BREADCRUMB}]`).forEach((node) => node.remove());
      document.querySelectorAll(`[${HIDDEN}]`).forEach((node) => node.removeAttribute(HIDDEN));
      document.querySelectorAll(`[${NATIVE_ACTIVE}]`).forEach((node) => {
        node.setAttribute("data-active", node.getAttribute(NATIVE_ACTIVE) ?? "false");
        node.removeAttribute(NATIVE_ACTIVE);
      });
    }

    function cleanup() {
      active = false;
      deactivatePage();
      document.querySelectorAll(`[${NAV}]`).forEach((node) => node.remove());
    }

    function destroy() {
      cleanup();
      style.remove();
    }

    function findMenu(sidebar) {
      return [...sidebar.querySelectorAll('ul[data-sidebar="menu"]')].find((menu) => {
        const labels = new Set(
          [...menu.querySelectorAll(':scope > li > [data-sidebar="menu-button"]')].map((button) =>
            button.textContent.trim(),
          ),
        );
        return labels.has("General") && labels.has("Appearance");
      });
    }

    function ensureNav(menu) {
      let item = menu.querySelector(`:scope > [${NAV}]`);
      if (!item) {
        const template = [...menu.querySelectorAll(':scope > li[data-sidebar="menu-item"]')].find(
          (candidate) =>
            candidate
              .querySelector(':scope > [data-sidebar="menu-button"]')
              ?.textContent.trim() === "General",
        );
        if (!template) return null;

        item = template.cloneNode(true);
        item.setAttribute(NAV, "");
        item.querySelector('[data-sidebar="menu-sub"]')?.remove();
        const button = item.querySelector(':scope > [data-sidebar="menu-button"]');
        const templateIcon = button.querySelector(":scope > svg");
        templateIcon?.replaceWith(makeIcon(templateIcon));
        const label = [...button.querySelectorAll(":scope > span")].at(-1);
        context.updateText(label, "Customizations");
        button.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          active = true;
          apply();
        };
        menu.appendChild(item);
      }

      item
        .querySelector(':scope > [data-sidebar="menu-button"]')
        .setAttribute("data-active", String(active));
      return item;
    }

    function syncVolumeSlider(page) {
      if (!context.notifications) return;
      const slider = page.querySelector('[data-t3-notification-volume="slider"]');
      const output = page.querySelector('[data-t3-notification-volume="output"]');
      if (!slider || !output) return;

      const percent = Math.round(context.notifications.settings().volume * 100);
      slider.value = String(percent);
      slider.setAttribute("aria-valuetext", `${percent}%`);
      slider.style.setProperty("--settings-slider-progress", `${percent}%`);
      slider.style.setProperty(
        "--settings-slider-fill-offset",
        `${0.5 - percent / 100}rem`,
      );
      context.updateText(output, `${percent}%`);
    }

    function syncSortingControls(page) {
      if (!context.sorting) return;
      const projectOrder = page.querySelector('[data-t3-sorting="project"]');
      const activeThreadOrder = page.querySelector('[data-t3-sorting="active-thread"]');
      const snoozedThreadOrder = page.querySelector('[data-t3-sorting="snoozed-thread"]');
      const snoozedPinnedFirst = page.querySelector(`[${SNOOZED_PINNED_SWITCH}]`);
      if (!projectOrder || !activeThreadOrder || !snoozedThreadOrder || !snoozedPinnedFirst) {
        return;
      }

      const sorting = context.sorting.settings();
      if (projectOrder.value !== sorting.projectOrder) {
        projectOrder.value = sorting.projectOrder;
      }
      if (activeThreadOrder.value !== sorting.activeThreadOrder) {
        activeThreadOrder.value = sorting.activeThreadOrder;
      }
      if (snoozedThreadOrder.value !== sorting.snoozedThreadOrder) {
        snoozedThreadOrder.value = sorting.snoozedThreadOrder;
      }
      snoozedPinnedFirst.checked = sorting.snoozedPinnedFirst;
      snoozedPinnedFirst.setAttribute("aria-checked", String(sorting.snoozedPinnedFirst));
    }

    function syncMessageReuseControl(page) {
      if (!context.messageReuse) return;
      const autoSend = page.querySelector(`[${REUSE_AUTO_SEND_SWITCH}]`);
      if (!autoSend) return;
      const enabled = context.messageReuse.settings().autoSend;
      autoSend.checked = enabled;
      autoSend.setAttribute("aria-checked", String(enabled));
    }

    function makePage(nativePage) {
      const page = nativePage.cloneNode(false);
      page.removeAttribute(HIDDEN);
      page.setAttribute(PAGE, "");
      if (nativePage.hasAttribute("data-settings-page-scroll")) {
        page.setAttribute("data-settings-page-scroll", "");
      }
      if (nativePage.hasAttribute("data-settings-page-layout")) {
        page.setAttribute("data-settings-page-layout", "");
      }

      const nativeContainer = nativePage.firstElementChild;
      const container = nativeContainer
        ? nativeContainer.cloneNode(false)
        : document.createElement("div");
      if (!nativeContainer) {
        container.className =
          "mx-auto flex w-full max-w-4xl flex-col gap-12 px-5 pt-6 pb-12 sm:px-6";
      }
      container.innerHTML = `
        <section class="space-y-3" data-t3-settings-section="notifications">
          <div class="flex min-h-8 items-center justify-between gap-4 px-3 sm:px-4">
            <h2 class="flex items-center gap-2 text-lg font-semibold tracking-[-0.025em] text-foreground">
              Notifications
            </h2>
            <div class="flex min-h-7 min-w-7 items-center justify-end"></div>
          </div>
          <div class="relative space-y-1 overflow-visible text-foreground">
            <div class="rounded-xl px-3 py-3 sm:px-4">
              <div class="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)] sm:items-center sm:gap-8">
                <div class="min-w-0 flex-1 space-y-1">
                  <div class="flex min-h-5 items-center gap-1.5">
                    <h3 class="text-sm font-medium tracking-[-0.005em] text-foreground">Notification volume</h3>
                  </div>
                  <p class="max-w-xl text-[13px] leading-[1.45] text-muted-foreground/80">
                    T3's Settings → General → Behavior handles Approval, Input, Failed, and Done.
                    This overlay still pings for Plan Ready and when the selected thread needs you
                    while T3 is focused. Volume applies to those overlay sounds. Release the slider
                    to preview codec.wav.
                  </p>
                </div>
                <div class="flex w-full shrink-0 items-center gap-3 sm:w-52 sm:justify-end">
                  <output
                    class="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
                    data-t3-notification-volume="output"
                    for="t3-notification-volume"
                  ></output>
                  <input
                    aria-label="Notification volume"
                    class="settings-slider min-w-0 flex-1"
                    data-t3-notification-volume="slider"
                    id="t3-notification-volume"
                    max="100"
                    min="0"
                    step="5"
                    type="range"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
        <section class="space-y-3" data-t3-settings-section="message-reuse">
          <div class="flex min-h-8 items-center justify-between gap-4 px-3 sm:px-4">
            <h2 class="flex items-center gap-2 text-lg font-semibold tracking-[-0.025em] text-foreground">
              Composer
            </h2>
            <div class="flex min-h-7 min-w-7 items-center justify-end"></div>
          </div>
          <div class="relative space-y-1 overflow-visible text-foreground">
            <div class="rounded-xl px-3 py-3 sm:px-4">
              <div class="flex items-center justify-between gap-8">
                <div class="min-w-0 flex-1 space-y-1">
                  <div class="flex min-h-5 items-center gap-1.5">
                    <label class="text-sm font-medium tracking-[-0.005em] text-foreground" for="t3-reuse-auto-send">Auto-send reused messages</label>
                  </div>
                  <p class="max-w-xl text-[13px] leading-[1.45] text-muted-foreground/80">
                    Send immediately after selecting Reuse message.
                  </p>
                </div>
                <input
                  aria-label="Auto-send reused messages"
                  data-t3-customization-switch
                  data-t3-reuse-auto-send
                  id="t3-reuse-auto-send"
                  role="switch"
                  type="checkbox"
                />
              </div>
            </div>
          </div>
        </section>
        <section class="space-y-3" data-t3-settings-section="sorting">
          <div class="flex min-h-8 items-center justify-between gap-4 px-3 sm:px-4">
            <h2 class="flex items-center gap-2 text-lg font-semibold tracking-[-0.025em] text-foreground">
              Sidebar sorting
            </h2>
            <div class="flex min-h-7 min-w-7 items-center justify-end"></div>
          </div>
          <div class="relative space-y-1 overflow-visible text-foreground">
            <div class="rounded-xl px-3 py-3 sm:px-4">
              <div class="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)] sm:items-center sm:gap-8">
                <div class="min-w-0 flex-1 space-y-1">
                  <div class="flex min-h-5 items-center gap-1.5">
                    <label class="text-sm font-medium tracking-[-0.005em] text-foreground" for="t3-project-order">Project order</label>
                  </div>
                  <p class="max-w-xl text-[13px] leading-[1.45] text-muted-foreground/80">
                    Order project groups across Active, Snoozed, and Settled.
                  </p>
                </div>
                <select
                  class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring sm:w-52"
                  data-t3-sorting="project"
                  id="t3-project-order"
                >
                  <option value="default">T3 default</option>
                  <option value="alphabetical">Alphabetical</option>
                  <option value="attention">Needs attention first</option>
                </select>
              </div>
            </div>
            <div class="rounded-xl px-3 py-3 sm:px-4">
              <div class="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)] sm:items-center sm:gap-8">
                <div class="min-w-0 flex-1 space-y-1">
                  <div class="flex min-h-5 items-center gap-1.5">
                    <label class="text-sm font-medium tracking-[-0.005em] text-foreground" for="t3-active-thread-order">Active thread order</label>
                  </div>
                  <p class="max-w-xl text-[13px] leading-[1.45] text-muted-foreground/80">
                    Pinned threads stay first. Status-based order updates as work changes.
                  </p>
                </div>
                <select
                  class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring sm:w-52"
                  data-t3-sorting="active-thread"
                  id="t3-active-thread-order"
                >
                  <option value="default">T3 default</option>
                  <option value="alphabetical">Alphabetical</option>
                  <option value="attention">Needs attention first</option>
                  <option value="recent">Recently updated</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>
            </div>
            <div class="rounded-xl px-3 py-3 sm:px-4">
              <div class="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)] sm:items-center sm:gap-8">
                <div class="min-w-0 flex-1 space-y-1">
                  <div class="flex min-h-5 items-center gap-1.5">
                    <label class="text-sm font-medium tracking-[-0.005em] text-foreground" for="t3-snoozed-thread-order">Snoozed thread order</label>
                  </div>
                  <p class="max-w-xl text-[13px] leading-[1.45] text-muted-foreground/80">
                    Within each project, T3 default keeps the earliest wake time first. Settled keeps T3's order.
                  </p>
                </div>
                <select
                  class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring sm:w-52"
                  data-t3-sorting="snoozed-thread"
                  id="t3-snoozed-thread-order"
                >
                  <option value="default">T3 default</option>
                  <option value="alphabetical">Alphabetical</option>
                  <option value="recent">Recently updated</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>
            </div>
            <div class="rounded-xl px-3 py-3 sm:px-4">
              <div class="flex items-center justify-between gap-8">
                <div class="min-w-0 flex-1 space-y-1">
                  <div class="flex min-h-5 items-center gap-1.5">
                    <label class="text-sm font-medium tracking-[-0.005em] text-foreground" for="t3-snoozed-pinned-first">Pinned Snoozed threads first</label>
                  </div>
                  <p class="max-w-xl text-[13px] leading-[1.45] text-muted-foreground/80">
                    Move projects with pinned Snoozed threads first, then keep those threads above the rest of their project.
                  </p>
                </div>
                <input
                  aria-label="Pinned Snoozed threads first"
                  data-t3-customization-switch
                  data-t3-snoozed-pinned-first
                  id="t3-snoozed-pinned-first"
                  role="switch"
                  type="checkbox"
                />
              </div>
            </div>
          </div>
        </section>
      `;
      if (!context.notifications) {
        container.querySelector('[data-t3-settings-section="notifications"]')?.remove();
      }
      if (!context.messageReuse) {
        container.querySelector('[data-t3-settings-section="message-reuse"]')?.remove();
      }
      if (!context.sorting) {
        container.querySelector('[data-t3-settings-section="sorting"]')?.remove();
      }
      page.appendChild(container);

      const slider = page.querySelector('[data-t3-notification-volume="slider"]');
      slider?.addEventListener("input", () => {
        context.notifications.setVolume(Number(slider.value) / 100);
        syncVolumeSlider(page);
      });
      slider?.addEventListener("change", () => void context.notifications.playSound());
      page
        .querySelector(`[${REUSE_AUTO_SEND_SWITCH}]`)
        ?.addEventListener("change", (event) => {
          context.messageReuse.setAutoSend(event.currentTarget.checked);
        });
      page
        .querySelector('[data-t3-sorting="project"]')
        ?.addEventListener("change", (event) => {
          context.sorting.setProjectOrder(event.currentTarget.value);
        });
      page
        .querySelector('[data-t3-sorting="active-thread"]')
        ?.addEventListener("change", (event) => {
          context.sorting.setActiveThreadOrder(event.currentTarget.value);
        });
      page
        .querySelector('[data-t3-sorting="snoozed-thread"]')
        ?.addEventListener("change", (event) => {
          context.sorting.setSnoozedThreadOrder(event.currentTarget.value);
        });
      page
        .querySelector(`[${SNOOZED_PINNED_SWITCH}]`)
        ?.addEventListener("change", (event) => {
          context.sorting.setSnoozedPinnedFirst(event.currentTarget.checked);
        });
      syncVolumeSlider(page);
      syncMessageReuseControl(page);
      syncSortingControls(page);
      return page;
    }

    function showPage(menu) {
      for (const button of menu.querySelectorAll(
        `:scope > li:not([${NAV}]) > [data-sidebar="menu-button"]`,
      )) {
        if (!button.hasAttribute(NATIVE_ACTIVE)) {
          button.setAttribute(NATIVE_ACTIVE, button.getAttribute("data-active") ?? "false");
        }
        button.setAttribute("data-active", "false");
      }

      const nativeBreadcrumb = document.querySelector(
        `nav[aria-label="Settings breadcrumb"]:not([${BREADCRUMB}])`,
      );
      if (nativeBreadcrumb) {
        nativeBreadcrumb.setAttribute(HIDDEN, "");
        let customBreadcrumb = document.querySelector(`[${BREADCRUMB}]`);
        if (!customBreadcrumb) {
          customBreadcrumb = nativeBreadcrumb.cloneNode(true);
          customBreadcrumb.removeAttribute(HIDDEN);
          customBreadcrumb.setAttribute(BREADCRUMB, "");
          const current = customBreadcrumb.querySelector('[aria-current="page"]');
          if (current) context.updateText(current, "Customizations");
          nativeBreadcrumb.insertAdjacentElement("afterend", customBreadcrumb);
        }
        for (const sibling of nativeBreadcrumb.parentElement?.children ?? []) {
          if (sibling !== nativeBreadcrumb && sibling !== customBreadcrumb) {
            sibling.setAttribute(HIDDEN, "");
          }
        }
      }

      const nativePage =
        [...document.querySelectorAll("[data-settings-page-scroll]")].find(
          (node) => !node.hasAttribute(PAGE),
        ) ??
        [...document.querySelectorAll("[data-settings-page-layout]")].find(
          (node) => !node.hasAttribute(PAGE),
        );
      if (!nativePage?.parentElement) return;
      nativePage.setAttribute(HIDDEN, "");

      let customPage = document.querySelector(`[${PAGE}]`);
      if (customPage?.parentElement !== nativePage.parentElement) {
        customPage?.remove();
        customPage = null;
      }
      if (!customPage) {
        customPage = makePage(nativePage);
        nativePage.insertAdjacentElement("afterend", customPage);
      }
      syncVolumeSlider(customPage);
      syncMessageReuseControl(customPage);
      syncSortingControls(customPage);
    }

    function apply() {
      const sidebar = document.querySelector("[data-app-sidebar]");
      if (!sidebar?.querySelector('[aria-label="Search settings"]')) {
        cleanup();
        return;
      }

      const menu = findMenu(sidebar);
      if (menu) ensureNav(menu);
      if (!active) {
        deactivatePage();
        return;
      }
      if (menu) showPage(menu);
    }

    function handleClick(event) {
      if (!(event.target instanceof Element)) return;
      const settingsButton = event.target.closest(
        '[data-app-sidebar] [data-sidebar="menu-button"]',
      );
      if (!active || !settingsButton || settingsButton.closest(`[${NAV}]`)) return;

      active = false;
      deactivatePage();
      document
        .querySelector(`[${NAV}] [data-sidebar="menu-button"]`)
        ?.setAttribute("data-active", "false");
    }

    function handleNavigation() {
      active = false;
      context.schedule();
    }

    return { apply, destroy, handleClick, handleNavigation };
  };
})();
