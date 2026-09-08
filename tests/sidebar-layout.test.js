const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const groupingSource = fs.readFileSync(
  path.join(__dirname, "..", "features", "sidebar-project-groups.js"),
  "utf8",
);
const sortingSource = fs.readFileSync(
  path.join(__dirname, "..", "features", "sidebar-sorting.js"),
  "utf8",
);
const settingsSource = fs.readFileSync(
  path.join(__dirname, "..", "features", "settings.js"),
  "utf8",
);

function tokenizeSelector(selector) {
  return [...selector.matchAll(/\[([^\]]+)\]/g)].map((match) => {
    const body = match[1];
    const eq = body.indexOf("=");
    if (eq === -1) return { name: body.replace(/^data-/, "data-"), attr: body, value: null };
    const attr = body.slice(0, eq);
    const value = body.slice(eq + 1).replace(/^["']|["']$/g, "");
    return { attr, value };
  });
}

function createDocument() {
  let nextId = 1;
  const byId = new Map();

  class Node {
    constructor() {
      this.childNodes = [];
      this.parentNode = null;
    }
    get children() {
      return this.childNodes.filter((node) => node.nodeType === 1);
    }
    get firstElementChild() {
      return this.children[0] ?? null;
    }
    appendChild(node) {
      node.parentNode?.removeChild(node);
      node.parentNode = this;
      this.childNodes.push(node);
      return node;
    }
    insertBefore(node, reference) {
      node.parentNode?.removeChild(node);
      node.parentNode = this;
      const index = this.childNodes.indexOf(reference);
      this.childNodes.splice(index === -1 ? this.childNodes.length : index, 0, node);
      return node;
    }
    removeChild(node) {
      const index = this.childNodes.indexOf(node);
      if (index >= 0) {
        this.childNodes.splice(index, 1);
        node.parentNode = null;
      }
      return node;
    }
    remove() {
      this.parentNode?.removeChild(this);
    }
    replaceWith(node) {
      const parent = this.parentNode;
      if (!parent) return;
      parent.insertBefore(node, this);
      parent.removeChild(this);
    }
    replaceChildren(...nodes) {
      for (const child of [...this.childNodes]) this.removeChild(child);
      for (const node of nodes) this.appendChild(node);
    }
  }

  class TextNode extends Node {
    constructor(value = "") {
      super();
      this.nodeType = 3;
      this.textContent = value;
    }
  }

  class Element extends Node {
    constructor(tagName) {
      super();
      this.nodeType = 1;
      this.tagName = String(tagName).toUpperCase();
      this.attributes = new Map();
      this.style = {
        display: "",
        order: "",
        removeProperty(name) {
          this[name] = "";
        },
      };
      this.onclick = null;
      this.hidden = false;
      this._id = nextId++;
    }
    get className() {
      return this.getAttribute("class") ?? "";
    }
    set className(value) {
      this.setAttribute("class", value);
    }
    get id() {
      return this.getAttribute("id") ?? "";
    }
    set id(value) {
      this.setAttribute("id", value);
      byId.set(value, this);
    }
    get textContent() {
      if (this.childNodes.length === 0) return this._text ?? "";
      return this.childNodes
        .map((node) => (node.nodeType === 3 ? node.textContent : node.textContent))
        .join("");
    }
    set textContent(value) {
      this.childNodes = [];
      this._text = String(value);
      if (value) this.appendChild(new TextNode(String(value)));
    }
    get innerHTML() {
      return this.textContent;
    }
    set innerHTML(value) {
      this.textContent = "";
      this._innerHTML = String(value);
    }
    setAttribute(name, value = "") {
      this.attributes.set(name, String(value));
      if (name === "id") byId.set(String(value), this);
      if (name === "hidden") this.hidden = true;
    }
    getAttribute(name) {
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    hasAttribute(name) {
      return this.attributes.has(name);
    }
    removeAttribute(name) {
      this.attributes.delete(name);
      if (name === "hidden") this.hidden = false;
    }
    matches(selector) {
      const parts = selector.split(",").map((part) => part.trim());
      return parts.some((part) => this.matchesOne(part));
    }
    matchesOne(selector) {
      let rest = selector.trim();
      if (rest.startsWith(":scope > ")) rest = rest.slice(":scope > ".length);
      if (rest === "button") return this.tagName === "BUTTON";
      if (rest === "li[data-thread-item]") {
        return this.tagName === "LI" && this.hasAttribute("data-thread-item");
      }
      if (rest === "img:not(.hidden), svg") {
        return (
          (this.tagName === "IMG" && !/\bhidden\b/.test(this.className)) || this.tagName === "SVG"
        );
      }
      if (rest.startsWith("img:not(.hidden)")) {
        return this.tagName === "IMG" && !/\bhidden\b/.test(this.className);
      }
      if (rest === "svg") return this.tagName === "SVG";
      const tagMatch = rest.match(/^[a-z][\w-]*/i);
      if (tagMatch) {
        if (this.tagName !== tagMatch[0].toUpperCase()) return false;
        rest = rest.slice(tagMatch[0].length);
      }
      if (!rest) return true;
      return tokenizeSelector(rest).every(({ attr, value }) => {
        if (value === null) return this.hasAttribute(attr);
        return this.getAttribute(attr) === value;
      });
    }
    closest(selector) {
      let node = this;
      while (node) {
        if (node.matches?.(selector)) return node;
        node = node.parentNode;
      }
      return null;
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    }
    querySelectorAll(selector) {
      const results = [];
      const parts = selector.split(",").map((part) => part.trim());
      const visit = (node) => {
        for (const child of node.children ?? []) {
          if (parts.some((part) => child.matchesOne(part.replace(/^:scope > /, "")))) {
            results.push(child);
          }
          visit(child);
        }
      };
      if (selector.startsWith(":scope > ")) {
        const rest = selector.slice(":scope > ".length);
        const combinator = rest.split(/\s*>\s*/);
        if (combinator.length === 2) {
          const results = [];
          for (const child of this.children) {
            if (!child.matches(combinator[0])) continue;
            results.push(...child.children.filter((grandchild) => grandchild.matches(combinator[1])));
          }
          return results;
        }
        return this.children.filter((child) => child.matches(rest));
      }
      visit(this);
      return results;
    }
    cloneNode(deep) {
      const clone = new Element(this.tagName.toLowerCase());
      for (const [name, value] of this.attributes) clone.setAttribute(name, value);
      if (deep) {
        for (const child of this.childNodes) {
          clone.appendChild(child.nodeType === 3 ? new TextNode(child.textContent) : child.cloneNode(true));
        }
      }
      return clone;
    }
  }

  const documentElement = new Element("html");
  const head = new Element("head");
  const body = new Element("body");
  documentElement.appendChild(head);
  documentElement.appendChild(body);

  const document = {
    documentElement,
    head,
    body,
    createElement(tag) {
      return new Element(tag);
    },
    createElementNS(_ns, tag) {
      return new Element(tag);
    },
    getElementById(id) {
      return byId.get(id) ?? null;
    },
    querySelector(selector) {
      return document.querySelectorAll(selector)[0] ?? null;
    },
    querySelectorAll(selector) {
      return documentElement.querySelectorAll(selector);
    },
  };

  return { Element, document };
}

function el(document, tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name === "text") node.textContent = value;
    else node.setAttribute(name, value);
  }
  for (const child of children) node.appendChild(child);
  return node;
}

function loadFeatures(document) {
  const window = {
    __t3CustomizationFeatureFactories: {},
    document,
  };
  const sandbox = {
    document,
    window,
    localStorage: {
      store: new Map(),
      getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
      },
      setItem(key, value) {
        this.store.set(key, String(value));
      },
    },
    console,
    Map,
    Set,
    JSON,
    Array,
    String,
    Boolean,
    Number,
    TypeError,
    RangeError,
  };
  vm.runInNewContext(groupingSource + "\n" + sortingSource + "\n" + settingsSource, sandbox, {
    filename: "features.js",
  });
  return window.__t3CustomizationFeatureFactories;
}

function cardRow(document, { project, status, pinned = false, title }) {
  const statusNode = el(document, "span", { role: "status", text: status });
  const name = el(document, "span", { text: project });
  const top = el(document, "div", {}, [
    el(document, "img", { alt: "" }),
    name,
    ...(pinned ? [el(document, "button", { "aria-label": "Unpin thread" })] : []),
    statusNode,
  ]);
  const content = el(document, "div", {}, [
    top,
    el(document, "div", { text: title }),
    el(document, "div", { text: "main" }),
  ]);
  const card = el(document, "div", { "data-testid": "sidebar-row-card" }, [content]);
  return el(
    document,
    "li",
    {
      "data-thread-item": "",
      "data-project": project,
      "data-section": "active",
      ...(pinned ? { "data-pinned": "true" } : {}),
    },
    [card],
  );
}

function slimRow(document, { project, section, title }) {
  const slim = el(document, "div", { "data-testid": "sidebar-row-slim" }, [
    el(document, "span", { text: project }),
    el(document, "span", { text: title }),
    el(
      document,
      "button",
      {
        "aria-label": section === "snoozed" ? "Wake thread now" : "Un-settle thread",
      },
    ),
  ]);
  return el(
    document,
    "li",
    {
      "data-thread-item": "",
      "data-project": project,
      "data-section": section,
    },
    [slim],
  );
}

function createGroupingContext(document, list, factories) {
  const sorting = factories.sidebarSorting({
    findReactRowProps() {
      return null;
    },
    isPinned(row) {
      return row.getAttribute("data-pinned") === "true";
    },
    notifications: { status() { return null; } },
    schedule() {},
  });
  return factories.sidebarProjectGroups({
    activeCardParts(row) {
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
    },
    findThreadList() {
      return list;
    },
    isPinned(row) {
      return row.getAttribute("data-pinned") === "true";
    },
    notifications: {
      groupCount() {
        return 0;
      },
      status() {
        return null;
      },
      update() {},
    },
    projectName(row) {
      return row.getAttribute("data-project");
    },
    rowSection(row) {
      return row.getAttribute("data-section");
    },
    sorting,
    updateText(node, value) {
      if (node && node.textContent !== value) node.textContent = value;
    },
  });
}

function orderedKeys(list) {
  return [...list.children].map((child) => {
    if (child.hasAttribute("data-t3-project-group-heading")) {
      return `${child.getAttribute("data-t3-project-group-heading")}:${
        child.querySelector("[data-name]")?.textContent ?? ""
      }`;
    }
    return (
      child.getAttribute("data-testid") ||
      child.querySelector("[data-testid]")?.getAttribute("data-testid") ||
      child.querySelector("button")?.textContent ||
      child.getAttribute("data-section")
    );
  });
}

function testGroupsFlatPinnedList() {
  const { document } = createDocument();
  const factories = loadFeatures(document);
  const list = el(document, "ul", { role: "list" });
  document.body.appendChild(el(document, "aside", { "data-app-sidebar": "" }, [list]));

  const draft = el(document, "li", { class: "list-none" }, [
    el(document, "div", { "data-testid": "sidebar-draft-row", text: "Draft prompt" }),
  ]);
  const draftDivider = el(document, "li", { "data-testid": "sidebar-draft-divider" });
  const pinnedHeader = el(document, "li", { "data-testid": "sidebar-pinned-header" });
  const pinnedRow = cardRow(document, {
    project: "Alpha",
    status: "Working",
    pinned: true,
    title: "Pinned thread",
  });
  const pinnedDivider = el(document, "li", { "data-testid": "sidebar-pinned-divider" });
  const activePlaceholder = el(document, "li", { "data-testid": "sidebar-active-placeholder" });
  const activeRow = cardRow(document, {
    project: "Alpha",
    status: "Done",
    title: "Active thread",
  });
  const snoozedHeader = el(document, "li", { "data-testid": "sidebar-snoozed-header" }, [
    el(document, "button", { "data-testid": "sidebar-snoozed-shelf-toggle" }, [
      el(document, "span", { text: "Snoozed (1)" }),
    ]),
  ]);
  const snoozedRow = slimRow(document, {
    project: "Beta",
    section: "snoozed",
    title: "Later",
  });
  const settledHeader = el(document, "li", { "data-testid": "sidebar-settled-header" }, [
    el(document, "button", { "data-testid": "sidebar-settled-shelf-toggle" }, [
      el(document, "span", { text: "Settled (1)" }),
    ]),
  ]);
  const settledPlaceholder = el(document, "li", { "data-testid": "sidebar-settled-placeholder" });
  const settledRow = slimRow(document, {
    project: "Beta",
    section: "settled",
    title: "Done thread",
  });
  const showMore = el(document, "li", { class: "list-none" }, [
    el(document, "button", { type: "button", text: "Show 5 more" }),
  ]);

  for (const node of [
    draft,
    draftDivider,
    pinnedHeader,
    pinnedRow,
    pinnedDivider,
    activePlaceholder,
    activeRow,
    snoozedHeader,
    snoozedRow,
    settledHeader,
    settledPlaceholder,
    settledRow,
    showMore,
  ]) {
    list.appendChild(node);
  }

  createGroupingContext(document, list, factories).apply();

  assert.equal(list.querySelectorAll("[data-t3-project-group-flattened]").length, 0);
  assert.notEqual(pinnedDivider.style.display, "none");
  assert.notEqual(pinnedHeader.style.display, "none");
  assert.ok(Number(draft.style.order) < Number(pinnedHeader.style.order));
  assert.ok(Number(pinnedHeader.style.order) < Number(pinnedRow.style.order));
  assert.ok(Number(pinnedRow.style.order) < Number(pinnedDivider.style.order));
  assert.ok(Number(activePlaceholder.style.order) < Number(snoozedHeader.style.order));
  const keys = orderedKeys(list);
  assert.ok(keys.includes("section:Active"));
  assert.ok(keys.includes("project:Alpha"));
  assert.ok(keys.includes("project:Beta"));
}

function testSkipsApplyWhileNativeDragMarkersAreOpen() {
  const { document } = createDocument();
  const factories = loadFeatures(document);
  const list = el(document, "ul", { role: "list" });
  const pinnedHeader = el(document, "li", { "data-testid": "sidebar-pinned-header" }, [
    el(document, "div", { class: "sidebar-drag-boundary-label", text: "Pinned" }),
  ]);
  const row = cardRow(document, {
    project: "Alpha",
    status: "Done",
    title: "Active thread",
  });
  list.appendChild(pinnedHeader);
  list.appendChild(row);
  createGroupingContext(document, list, factories).apply();
  assert.equal(list.querySelector("[data-t3-project-group-heading]"), null);
}

function testStillFlattensLegacyNestedPinnedList() {
  const { document } = createDocument();
  const factories = loadFeatures(document);
  const list = el(document, "ul", { role: "list" });
  const nested = el(document, "ul", { role: "list", "aria-label": "Pinned threads" });
  nested.appendChild(
    cardRow(document, { project: "Alpha", status: "Working", pinned: true, title: "Pinned" }),
  );
  const wrapper = el(document, "li", {}, [nested]);
  const divider = el(document, "li", { "data-testid": "sidebar-pinned-divider" });
  const active = cardRow(document, { project: "Alpha", status: "Done", title: "Active" });
  list.appendChild(wrapper);
  list.appendChild(divider);
  list.appendChild(active);

  createGroupingContext(document, list, factories).apply();
  assert.equal(wrapper.style.display, "contents");
  assert.equal(nested.style.display, "contents");
  assert.notEqual(divider.style.display, "none");
}

function testSettingsNavDropsNativeSubmenu() {
  const { document } = createDocument();
  const factories = loadFeatures(document);
  const submenu = el(document, "ul", { "data-sidebar": "menu-sub" }, [
    el(document, "li", { "data-sidebar": "menu-sub-item" }, [
      el(document, "button", { "data-sidebar": "menu-sub-button", text: "Organization" }),
    ]),
  ]);
  const general = el(document, "li", { "data-sidebar": "menu-item" }, [
    el(document, "button", { "data-sidebar": "menu-button" }, [
      el(document, "svg"),
      el(document, "span", { text: "General" }),
    ]),
    submenu,
  ]);
  const appearance = el(document, "li", { "data-sidebar": "menu-item" }, [
    el(document, "button", { "data-sidebar": "menu-button" }, [
      el(document, "svg"),
      el(document, "span", { text: "Appearance" }),
    ]),
  ]);
  const menu = el(document, "ul", { "data-sidebar": "menu" }, [general, appearance]);
  const sidebar = el(document, "aside", { "data-app-sidebar": "" }, [
    el(document, "input", { "aria-label": "Search settings" }),
    menu,
  ]);
  document.body.appendChild(sidebar);

  factories
    .settings({
      messageReuse: null,
      notifications: null,
      schedule() {},
      sorting: null,
      updateText(node, value) {
        if (node && node.textContent !== value) node.textContent = value;
      },
    })
    .apply();

  const nav = menu.querySelector("[data-t3-customizations-nav]");
  assert.ok(nav);
  assert.equal(nav.querySelector('[data-sidebar="menu-sub"]'), null);
  assert.equal(
    [...nav.querySelectorAll(':scope > [data-sidebar="menu-button"]')].at(0)
      ?.querySelectorAll(":scope > span")
      .at(-1)?.textContent,
    "Customizations",
  );
}

function testDefaultActiveOrderKeepsPinnedFirst() {
  const { document } = createDocument();
  const factories = loadFeatures(document);
  const sorting = factories.sidebarSorting({
    findReactRowProps() {
      return null;
    },
    isPinned(row) {
      return row.pinned === true;
    },
    notifications: { status() { return "Done"; } },
    schedule() {},
  });
  const unpinned = { pinned: false };
  const pinned = { pinned: true };
  const ordered = sorting.sortThreads([unpinned, pinned], "Active", new Set());
  assert.equal(ordered.length, 2);
  assert.equal(ordered[0], pinned);
  assert.equal(ordered[1], unpinned);
}

function main() {
  testGroupsFlatPinnedList();
  testSkipsApplyWhileNativeDragMarkersAreOpen();
  testStillFlattensLegacyNestedPinnedList();
  testSettingsNavDropsNativeSubmenu();
  testDefaultActiveOrderKeepsPinnedFirst();
  console.log("Sidebar layout tests passed.");
}

main();
