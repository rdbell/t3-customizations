/** Adds a Reuse message action beside Copy on user messages. */
(() => {
  const registry = (window.__t3CustomizationFeatureFactories ??= {});

  registry.messageReuse = function createMessageReuse(context) {
    const AUTO_SEND_STORAGE_KEY = "t3-message-reuse-auto-send-v1";
    const BUTTON_ATTRIBUTE = "data-t3-reuse-message";
    const COMPOSER_SELECTOR = '[data-testid="composer-editor"]';
    const USER_MESSAGE_SELECTOR = '[data-message-role="user"]';
    let frame = 0;
    let reuseFrame = 0;
    let autoSend = (() => {
      try {
        return localStorage.getItem(AUTO_SEND_STORAGE_KEY) === "true";
      } catch {
        return false;
      }
    })();

    function settings() {
      return { autoSend };
    }

    function setAutoSend(value) {
      if (typeof value !== "boolean") {
        throw new TypeError("Reuse auto-send must be enabled or disabled.");
      }
      autoSend = value;
      try {
        localStorage.setItem(AUTO_SEND_STORAGE_KEY, String(value));
      } catch {
        // The current setting still works when localStorage is unavailable.
      }
      context.schedule();
      return settings();
    }

    function findReactProps(element, predicate) {
      const fiberKey = Reflect.ownKeys(element).find(
        (key) => typeof key === "string" && key.startsWith("__reactFiber$"),
      );
      if (!fiberKey) return null;

      const first = element[fiberKey];
      const queue = [first, first?.alternate];
      const seen = new Set();
      while (queue.length) {
        const fiber = queue.shift();
        if (!fiber || seen.has(fiber)) continue;
        seen.add(fiber);

        const props = fiber.memoizedProps ?? fiber.pendingProps;
        if (props && typeof props === "object" && predicate(props)) return props;
        queue.push(fiber.return, fiber.alternate);
      }
      return null;
    }

    function readMessage(row) {
      const props = findReactProps(
        row,
        (candidate) =>
          candidate.row?.kind === "message" && candidate.row.message?.role === "user",
      );
      return props?.row?.message ?? null;
    }

    function stripAttachedContext(value) {
      let prompt = value;
      const trailingBlocks = [
        /\n*<terminal_context>\n[\s\S]*?\n<\/terminal_context>\s*$/,
        /\n*<element_context>\n[\s\S]*?\n<\/element_context>\s*$/,
        /\n*<preview_annotation>\n(?:(?!<preview_annotation>)[\s\S])*?\n<\/preview_annotation>\s*$/,
        /\n*<review_comment\b[^>]*>[\s\S]*?<\/review_comment>\s*$/,
      ];

      while (true) {
        const previous = prompt;
        for (const pattern of trailingBlocks) prompt = prompt.replace(pattern, "");
        if (prompt === previous) break;
      }
      return prompt.trimEnd();
    }

    function composerProps(editor, expectedValue) {
      return findReactProps(
        editor,
        (candidate) =>
          typeof candidate.value === "string" &&
          typeof candidate.onChange === "function" &&
          Array.isArray(candidate.terminalContexts) &&
          candidate.editorRef &&
          (expectedValue === undefined || candidate.value === expectedValue),
      );
    }

    function reuseMessage(row) {
      const rawText = readMessage(row)?.text;
      if (typeof rawText !== "string") return false;

      const editor = document.querySelector(COMPOSER_SELECTOR);
      if (!editor || editor.getAttribute("contenteditable") === "false") return false;
      if (editor.getAttribute("aria-disabled") === "true") return false;

      const props = composerProps(editor);
      if (!props) return false;

      const prompt = stripAttachedContext(rawText);
      props.onChange(prompt, prompt.length, prompt.length, false, []);
      cancelAnimationFrame(reuseFrame);
      reuseFrame = requestAnimationFrame(() => {
        reuseFrame = 0;
        composerProps(editor, prompt)?.editorRef.current?.focusAt?.(prompt.length);
        if (!autoSend || !prompt.trim()) return;

        reuseFrame = requestAnimationFrame(() => {
          reuseFrame = 0;
          if (!autoSend || !composerProps(editor, prompt)) return;
          const form = editor.closest("form");
          const submitButton = [...(form?.querySelectorAll('button[type="submit"]') ?? [])].find(
            (button) => !button.disabled,
          );
          submitButton?.click();
        });
      });
      return true;
    }

    function makeIcon() {
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("aria-hidden", "true");
      icon.setAttribute("class", "size-3");
      icon.setAttribute("fill", "none");
      icon.setAttribute("stroke", "currentColor");
      icon.setAttribute("stroke-linecap", "round");
      icon.setAttribute("stroke-linejoin", "round");
      icon.setAttribute("stroke-width", "2");
      icon.setAttribute("viewBox", "0 0 24 24");

      for (const pathData of ["M3 12a9 9 0 1 0 3-7.7L3 7", "M3 3v4h4"]) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathData);
        icon.appendChild(path);
      }
      return icon;
    }

    function addButton(row) {
      if (row.querySelector(`[${BUTTON_ATTRIBUTE}]`)) return;
      const copyButton = row.querySelector('button[aria-label="Copy link"]');
      if (!copyButton?.parentElement) return;

      const button = copyButton.cloneNode(false);
      button.removeAttribute("aria-describedby");
      button.removeAttribute("aria-disabled");
      button.removeAttribute("data-disabled");
      button.removeAttribute("data-popup-open");
      button.removeAttribute("disabled");
      button.setAttribute(BUTTON_ATTRIBUTE, "");
      button.setAttribute("aria-label", "Reuse message");
      button.setAttribute("title", "Reuse message");
      button.setAttribute("type", "button");
      button.appendChild(makeIcon());
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!reuseMessage(row)) {
          console.warn("Could not reuse this message because the composer is unavailable.");
        }
      });
      copyButton.insertAdjacentElement("beforebegin", button);
    }

    function apply() {
      for (const row of document.querySelectorAll(USER_MESSAGE_SELECTOR)) addButton(row);
    }

    function schedule() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
    }

    const observer = new MutationObserver((records) => {
      if (
        records.some((record) => {
          const target =
            record.target instanceof Element ? record.target : record.target.parentElement;
          if (target?.closest(USER_MESSAGE_SELECTOR)) return true;
          return [...record.addedNodes].some(
            (node) =>
              node instanceof Element &&
              (node.matches(USER_MESSAGE_SELECTOR) || node.querySelector(USER_MESSAGE_SELECTOR)),
          );
        })
      ) {
        schedule();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    function destroy() {
      observer.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(reuseFrame);
      document.querySelectorAll(`[${BUTTON_ATTRIBUTE}]`).forEach((button) => button.remove());
    }

    apply();
    return { apply, buttonAttribute: BUTTON_ATTRIBUTE, destroy, setAutoSend, settings };
  };
})();
