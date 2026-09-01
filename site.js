const FEATURES = {
  projectGroups: {
    label: "Project groups",
    file: "features/sidebar-project-groups.js",
  },
  sidebarSorting: {
    label: "Sidebar sorting",
    file: "features/sidebar-sorting.js",
  },
  notifications: {
    label: "Thread notifications",
    file: "features/notifications.js",
  },
  messageReuse: {
    label: "Reuse messages",
    file: "features/message-reuse.js",
  },
};

const rootUrl = new URL("./", import.meta.url);
const inputs = [...document.querySelectorAll("[data-feature]")];
const projectGroupsInput = document.querySelector('[data-feature="projectGroups"]');
const sortingInput = document.querySelector('[data-feature="sidebarSorting"]');
const count = document.querySelector("[data-feature-count]");
const selectedList = document.querySelector("[data-selected-list]");
const preview = document.querySelector("[data-bundle-preview]");
const copyButton = document.querySelector("[data-copy-bundle]");
const copyButtonLabel = copyButton.querySelector("span");
const status = document.querySelector("[data-copy-status]");

function currentSelection() {
  return Object.fromEntries(inputs.map((input) => [input.dataset.feature, input.checked]));
}

function selectedEntries() {
  const selection = currentSelection();
  return Object.entries(FEATURES).filter(([key]) => selection[key]);
}

function syncDependency(changedInput) {
  if (changedInput === sortingInput && sortingInput.checked) {
    projectGroupsInput.checked = true;
  }
  if (changedInput === projectGroupsInput && !projectGroupsInput.checked) {
    sortingInput.checked = false;
  }
}

function renderSelection() {
  const entries = selectedEntries();
  count.textContent = `${entries.length} selected`;
  copyButton.disabled = entries.length === 0;
  selectedList.replaceChildren();

  if (entries.length === 0) {
    const item = document.createElement("li");
    item.className = "empty-selection";
    item.textContent = "Choose at least one feature to build a bundle.";
    selectedList.appendChild(item);
    preview.textContent = "// Select a feature to begin.";
  } else {
    for (const [, feature] of entries) {
      const item = document.createElement("li");
      item.textContent = feature.label;
      selectedList.appendChild(item);
    }
    const names = entries.map(([, feature]) => `// + ${feature.label}`).join("\n");
    preview.textContent = [
      "// Paste into T3 Code DevTools",
      names,
      "",
      "window.__t3CustomizationSelection = { ... };",
      "// Feature modules and coordinator follow.",
    ].join("\n");
  }

  status.className = "copy-status";
  status.textContent = "The bundle is assembled in this browser and copied locally.";
}

async function fetchText(path) {
  const response = await fetch(new URL(path, rootUrl), { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load ${path}.`);
  return response.text();
}

async function fetchBase64(path) {
  const response = await fetch(new URL(path, rootUrl), { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load ${path}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function buildBundle() {
  const selection = currentSelection();
  if (!Object.values(selection).some(Boolean)) {
    throw new Error("Choose at least one feature.");
  }

  const files = [];
  if (selection.notifications) files.push(FEATURES.notifications.file);
  if (selection.sidebarSorting) files.push(FEATURES.sidebarSorting.file);
  if (selection.messageReuse) files.push(FEATURES.messageReuse.file);
  if (selection.notifications || selection.sidebarSorting || selection.messageReuse) {
    files.push("features/settings.js");
  }
  if (selection.projectGroups) files.push(FEATURES.projectGroups.file);
  files.push("customizations.js");

  const [sources, codecSound] = await Promise.all([
    Promise.all(files.map(fetchText)),
    selection.notifications ? fetchBase64("codec.wav") : Promise.resolve(null),
  ]);
  const prefix = [
    codecSound ? `window.__t3CodecNotificationSoundBase64=${JSON.stringify(codecSound)};` : "",
    `window.__t3CustomizationSelection=${JSON.stringify(selection)};`,
  ].filter(Boolean);
  return [...prefix, ...sources].join("\n");
}

async function writeClipboard(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard access was denied.");
}

async function copyBundle() {
  copyButton.disabled = true;
  copyButton.classList.add("is-loading");
  copyButtonLabel.textContent = "Building bundle";
  status.className = "copy-status";
  status.textContent = "Loading the selected source files.";

  try {
    const bundle = await buildBundle();
    await writeClipboard(bundle);
    copyButtonLabel.textContent = "Copied";
    status.className = "copy-status is-success";
    status.textContent = `${Math.round(bundle.length / 1024)} KB copied. Paste it into T3 Code DevTools.`;
  } catch (error) {
    copyButtonLabel.textContent = "Try again";
    status.className = "copy-status is-error";
    status.textContent = error instanceof Error ? error.message : "Could not build the bundle.";
  } finally {
    copyButton.classList.remove("is-loading");
    copyButton.disabled = selectedEntries().length === 0;
  }
}

for (const input of inputs) {
  input.addEventListener("change", () => {
    syncDependency(input);
    renderSelection();
  });
}

for (const button of document.querySelectorAll("[data-selection-action]")) {
  button.addEventListener("click", () => {
    const checked = button.dataset.selectionAction === "all";
    for (const input of inputs) input.checked = checked;
    renderSelection();
  });
}

copyButton.addEventListener("click", () => void copyBundle());
renderSelection();
