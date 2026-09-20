/** Overlay desktop notifications for Plan Ready and the focused selected thread. */
(() => {
  const registry = (window.__t3CustomizationFeatureFactories ??= {});

  registry.notifications = function createNotifications(context) {
    const SOUND_STORAGE_KEY = "t3-thread-notification-sound-v2";
    const VOLUME_STORAGE_KEY = "t3-thread-notification-volume-v4";
    const SOUND_PRESETS = new Set(["codec", "system", "chime", "ping", "none"]);
    const BUSY_STATUSES = new Set(["Working", "Monitoring"]);
    const ATTENTION_STATUSES = new Set(["Approval", "Input", "Plan", "Failed", "Done"]);
    const THREAD_STATUSES = new Set([
      ...BUSY_STATUSES,
      ...ATTENTION_STATUSES,
      "Woke",
    ]);
    const NATIVE_ATTENTION_STATUSES = new Set(["Approval", "Input", "Failed", "Done"]);
    const NOTIFICATION_COPY = {
      Approval: { title: "Thread needs approval", kind: "approval" },
      Input: { title: "Thread needs your input", kind: "input" },
      Plan: { title: "Plan is ready", kind: "plan" },
      Failed: { title: "Thread failed", kind: "failed" },
      Done: { title: "Thread finished", kind: "done" },
    };

    let enabled = true;
    let desktopEnabled = false;
    let enableRequest = 0;
    let codecSoundUrl = null;
    const threadStates = new Map();
    const badges = new Map();
    const desktopNotifications = new Map();
    const suppressedStops = new Map();
    let sound = (() => {
      try {
        const stored = localStorage.getItem(SOUND_STORAGE_KEY);
        if (stored === "codec" && !context.codecSoundBase64) return "system";
        return stored || (context.codecSoundBase64 ? "codec" : "system");
      } catch {
        return context.codecSoundBase64 ? "codec" : "system";
      }
    })();
    let volume = (() => {
      try {
        const value = Number(localStorage.getItem(VOLUME_STORAGE_KEY) ?? "0.5");
        return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
      } catch {
        return 0.5;
      }
    })();

    function statusLabel(node) {
      const raw = node.textContent.trim();
      if (THREAD_STATUSES.has(raw)) return raw;
      if (/^Pending Approval\b/i.test(raw) || /^Approval\b/i.test(raw)) return "Approval";
      if (/^Awaiting Input\b/i.test(raw) || /^Input\b/i.test(raw)) return "Input";
      if (/^Plan Ready\b/i.test(raw) || /^Plan\b/i.test(raw)) return "Plan";
      if (/^Completed\b/i.test(raw)) return "Done";
      const match = raw.match(/^(Working|Monitoring|Failed|Woke|Done)\b/);
      return match ? match[1] : null;
    }

    function latestTurnSettled(thread) {
      const latestTurn = thread?.latestTurn;
      const sessionStatus = thread?.session?.status;
      if (sessionStatus === "running" || sessionStatus === "starting") return false;
      if (
        latestTurn?.status === "completed" ||
        latestTurn?.state === "completed" ||
        latestTurn?.completedAt
      ) {
        return true;
      }
      return latestTurn == null && sessionStatus !== "error";
    }

    function planReadyFromThread(thread) {
      return (
        thread?.hasPendingUserInput !== true &&
        thread?.interactionMode === "plan" &&
        thread?.hasActionableProposedPlan === true &&
        latestTurnSettled(thread)
      );
    }

    function cardStatus(row) {
      const statusRoot = context.activeCardParts(row)?.top ?? row;
      for (const node of statusRoot.querySelectorAll('[role="status"]')) {
        const label = statusLabel(node);
        if (label) return label;
      }
      return null;
    }

    function resolveStatus(row, thread) {
      const fromCard = cardStatus(row);
      if (fromCard === "Approval" || thread?.hasPendingApprovals === true) return "Approval";
      if (fromCard === "Input" || thread?.hasPendingUserInput === true) return "Input";
      if (fromCard === "Working" || fromCard === "Monitoring") return fromCard;
      if (thread?.session?.status === "running" || thread?.session?.status === "starting") {
        return "Working";
      }
      if (
        fromCard === "Failed" ||
        thread?.session?.status === "error" ||
        thread?.latestTurn?.state === "error"
      ) {
        return "Failed";
      }
      if (fromCard === "Plan" || planReadyFromThread(thread)) return "Plan";
      return fromCard;
    }

    function status(row) {
      const thread = context.findReactRowProps(row)?.thread;
      return resolveStatus(row, thread);
    }

    function snapshot(row, active) {
      const props = context.findReactRowProps(row);
      const thread = props?.thread;
      if (!thread?.id) return null;

      const currentStatus = resolveStatus(row, thread);
      return {
        active,
        key: `${thread.environmentId ?? "local"}:${thread.id}`,
        project:
          props.projectTitle?.trim() ||
          props.projectDisplayName?.trim() ||
          props.project?.name?.trim?.() ||
          context.projectName(row),
        status: currentStatus,
        title: thread.title?.trim() || "Untitled thread",
        viewing: props.isActive === true,
        working: BUSY_STATUSES.has(currentStatus),
        attention: ATTENTION_STATUSES.has(currentStatus) ? currentStatus : null,
        completedAt: thread.latestTurn?.completedAt ?? null,
      };
    }

    function withHiddenCompletion(current, previous) {
      if (current.attention != null || current.working || !current.active) return current;
      if (previous == null) return current;
      const completedAtChanged =
        Boolean(current.completedAt) && previous.completedAt !== current.completedAt;
      const leftBusyWithoutStatus = previous.working === true;
      if (!completedAtChanged && !leftBusyWithoutStatus) return current;
      return { ...current, status: "Done", attention: "Done" };
    }

    function findRowByThreadKey(key) {
      const list = context.findThreadList();
      if (!list) return null;

      for (const row of list.querySelectorAll("li[data-thread-item]")) {
        const current = snapshot(row, context.rowSection(row) === "active");
        if (current?.key === key) return row;
      }
      return null;
    }

    function settings() {
      return {
        appBadgeSupported: false,
        badgeCount: badges.size,
        desktopEnabled,
        enabled,
        permission: window.Notification?.permission ?? "unsupported",
        sound,
        volume,
      };
    }

    function nativeCovers(status) {
      return NATIVE_ATTENTION_STATUSES.has(status);
    }

    function shouldNotify(current, attentionChanged, becameViewed) {
      if (!attentionChanged || becameViewed) return false;
      if (current.attention === "Plan") return true;
      return (
        nativeCovers(current.attention) &&
        current.viewing === true &&
        documentIsForeground()
      );
    }

    function closeDesktopNotification(key) {
      const notification = desktopNotifications.get(key);
      if (!notification) return false;

      desktopNotifications.delete(key);
      try {
        notification.close();
      } catch {
        // A notification can already be closed by the host.
      }
      return true;
    }

    function clearBadge(key) {
      const removed = badges.delete(key);
      const closed = closeDesktopNotification(key);
      if (!removed && !closed) return false;
      if (removed) context.schedule();
      return true;
    }

    function clearBadges() {
      const count = badges.size;
      badges.clear();
      for (const key of [...desktopNotifications.keys()]) closeDesktopNotification(key);
      if (count > 0) context.schedule();
      return count;
    }

    function documentIsForeground() {
      return (
        document.visibilityState !== "hidden" &&
        (typeof document.hasFocus !== "function" || document.hasFocus())
      );
    }

    function acknowledge(key, options = {}) {
      if (options.suppressNextStop === true) {
        suppressedStops.set(key, Date.now() + 10_000);
      }
      return clearBadge(key);
    }

    function acknowledgeViewedThread(options = {}) {
      const viewed = [...threadStates.values()].find((thread) => thread.viewing);
      if (!viewed) return false;
      return acknowledge(viewed.key, options);
    }

    function acknowledgeVisibleThread() {
      if (!documentIsForeground()) return false;
      return acknowledgeViewedThread();
    }

    function groupCount(rows) {
      let count = 0;
      for (const row of rows) {
        const current = snapshot(row, context.rowSection(row) === "active");
        if (current && badges.has(current.key)) count++;
      }
      return count;
    }

    function normalizeSound(value) {
      if (typeof value !== "string" || !value.trim()) {
        throw new TypeError("Notification sound must be a preset or audio URL.");
      }

      const nextSound = value.trim();
      if (nextSound === "codec" && !context.codecSoundBase64) {
        throw new Error(
          "codec.wav is not embedded. Copy the customization with copy-customization.sh.",
        );
      }
      if (SOUND_PRESETS.has(nextSound)) return nextSound;
      if (nextSound.startsWith("/")) return new URL(nextSound, "file://").href;

      try {
        return new URL(nextSound, window.location.href).href;
      } catch {
        throw new TypeError("Custom notification sounds must be valid audio URLs.");
      }
    }

    function getCodecSoundUrl() {
      if (codecSoundUrl) return codecSoundUrl;
      if (!context.codecSoundBase64) return null;

      const binary = atob(context.codecSoundBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
      }
      codecSoundUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
      return codecSoundUrl;
    }

    function setSound(value) {
      sound = normalizeSound(value);
      try {
        localStorage.setItem(SOUND_STORAGE_KEY, sound);
      } catch {
        // The current setting still works when localStorage is unavailable.
      }
      return settings();
    }

    function setVolume(value) {
      const nextVolume = Number(value);
      if (!Number.isFinite(nextVolume) || nextVolume < 0 || nextVolume > 1) {
        throw new RangeError("Notification volume must be between 0 and 1.");
      }
      volume = nextVolume;
      try {
        localStorage.setItem(VOLUME_STORAGE_KEY, String(nextVolume));
      } catch {
        // The current setting still works when localStorage is unavailable.
      }
      return settings();
    }

    async function playSound() {
      if (sound === "system" || sound === "none") return true;

      try {
        if (sound === "codec") {
          const url = getCodecSoundUrl();
          if (!url) return false;
          const audio = new Audio(url);
          audio.volume = volume;
          await audio.play();
          return true;
        }

        if (!SOUND_PRESETS.has(sound)) {
          const audio = new Audio(sound);
          audio.volume = volume;
          await audio.play();
          return true;
        }

        const AudioContextApi = window.AudioContext ?? window.webkitAudioContext;
        if (typeof AudioContextApi !== "function") return false;

        const audioContext = new AudioContextApi();
        await audioContext.resume();
        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.connect(audioContext.destination);

        const tones =
          sound === "ping"
            ? [[880, 0, 0.18]]
            : [
                [660, 0, 0.14],
                [880, 0.14, 0.24],
              ];
        for (const [frequency, offset, duration] of tones) {
          const oscillator = audioContext.createOscillator();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime + offset);
          oscillator.connect(gain);
          oscillator.start(audioContext.currentTime + offset);
          oscillator.stop(audioContext.currentTime + offset + duration);
        }

        gain.gain.exponentialRampToValueAtTime(
          Math.max(0.0001, volume * 0.22),
          audioContext.currentTime + 0.015,
        );
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          audioContext.currentTime + (sound === "ping" ? 0.18 : 0.38),
        );
        window.setTimeout(() => void audioContext.close(), 500);
        return true;
      } catch (error) {
        console.warn("Could not play the T3 notification sound.", error);
        return false;
      }
    }

    function show(thread) {
      if (!enabled || !desktopEnabled || window.Notification?.permission !== "granted") return;

      try {
        const currentStatus = thread.status ?? "Ready";
        closeDesktopNotification(thread.key);
        const copy = NOTIFICATION_COPY[currentStatus] ?? {
          title: "Thread stopped working",
          kind: "stopped",
        };
        const notification = new window.Notification(copy.title, {
          body: `${thread.title}\n${thread.project} · ${currentStatus}`,
          silent: sound !== "system",
          tag: `t3-thread-${copy.kind}-${thread.key}`,
        });
        desktopNotifications.set(thread.key, notification);
        void playSound();
        notification.onclick = () => {
          clearBadge(thread.key);
          window.focus();
          findRowByThreadKey(thread.key)
            ?.querySelector('[data-testid="sidebar-row-card"], [data-testid="sidebar-row-slim"]')
            ?.click();
          notification.close();
        };
        notification.onclose = () => {
          if (desktopNotifications.get(thread.key) === notification) {
            desktopNotifications.delete(thread.key);
          }
        };
      } catch (error) {
        console.warn("Could not show the T3 thread notification.", error);
      }
    }

    function update(rows, activeRows) {
      const activeSet = new Set(activeRows);
      const currentKeys = new Set();

      for (const row of rows) {
        let current = snapshot(row, activeSet.has(row));
        if (!current) continue;

        currentKeys.add(current.key);
        const previous = threadStates.get(current.key);
        current = withHiddenCompletion(current, previous);
        const becameViewed = previous && !previous.viewing && current.viewing;
        if (badges.has(current.key) && (current.working || becameViewed)) {
          clearBadge(current.key);
        }

        const attentionChanged =
          current.active &&
          current.attention !== null &&
          previous != null &&
          previous.attention !== current.attention;
        const suppressionExpiresAt = suppressedStops.get(current.key) ?? 0;
        const attentionWasSuppressed =
          attentionChanged && suppressionExpiresAt >= Date.now();
        if (attentionChanged || suppressionExpiresAt < Date.now()) {
          suppressedStops.delete(current.key);
        }

        if (
          enabled &&
          !attentionWasSuppressed &&
          shouldNotify(current, attentionChanged, becameViewed)
        ) {
          badges.set(current.key, current);
          show(current);
        }
        threadStates.set(current.key, current);
      }

      for (const key of threadStates.keys()) {
        if (!currentKeys.has(key)) threadStates.delete(key);
      }
    }

    async function enable() {
      const request = ++enableRequest;
      enabled = true;
      const NotificationApi = window.Notification;
      if (typeof NotificationApi !== "function") {
        desktopEnabled = false;
        console.warn("Desktop notifications are not available in this T3 renderer.");
        return false;
      }

      try {
        const permission =
          NotificationApi.permission === "default"
            ? await NotificationApi.requestPermission()
            : NotificationApi.permission;
        if (request !== enableRequest || !enabled) return false;
        desktopEnabled = permission === "granted";
        if (!desktopEnabled) console.warn(`T3 desktop notifications are ${permission}.`);
        return desktopEnabled;
      } catch (error) {
        if (request !== enableRequest || !enabled) return false;
        desktopEnabled = false;
        console.warn("Could not enable T3 thread notifications.", error);
        return false;
      }
    }

    function disable() {
      enableRequest++;
      enabled = false;
      desktopEnabled = false;
      suppressedStops.clear();
      clearBadges();
      console.info("T3 thread notifications disabled.");
    }

    function test() {
      if (!enabled || !desktopEnabled || window.Notification?.permission !== "granted") {
        return false;
      }
      new window.Notification("T3 notifications are working", {
        body: "You will be notified for Plan Ready and when the selected thread needs you while T3 is focused.",
        silent: sound !== "system",
        tag: "t3-thread-notification-test",
      });
      void playSound();
      return true;
    }

    function destroy() {
      badges.clear();
      suppressedStops.clear();
      for (const key of [...desktopNotifications.keys()]) closeDesktopNotification(key);
      if (codecSoundUrl) URL.revokeObjectURL(codecSoundUrl);
    }

    return {
      acknowledge,
      acknowledgeViewedThread,
      acknowledgeVisibleThread,
      clearBadge,
      clearBadges,
      destroy,
      disable,
      enable,
      groupCount,
      playSound,
      setSound,
      setVolume,
      settings,
      snapshot,
      status,
      test,
      update,
    };
  };
})();
