/** Desktop notifications, project badges, sound playback, and persisted sound settings. */
(() => {
  const registry = (window.__t3CustomizationFeatureFactories ??= {});

  registry.notifications = function createNotifications(context) {
    const SOUND_STORAGE_KEY = "t3-thread-notification-sound-v2";
    const VOLUME_STORAGE_KEY = "t3-thread-notification-volume-v4";
    const SOUND_PRESETS = new Set(["codec", "system", "chime", "ping", "none"]);
    const BUSY_STATUSES = new Set(["Working", "Monitoring"]);
    const THREAD_STATUSES = new Set([
      ...BUSY_STATUSES,
      "Approval",
      "Input",
      "Failed",
      "Woke",
      "Done",
    ]);

    let enabled = false;
    let codecSoundUrl = null;
    const threadStates = new Map();
    const badges = new Map();
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

    function status(row) {
      const statusRoot = context.activeCardParts(row)?.top ?? row;
      return (
        [...statusRoot.querySelectorAll('[role="status"]')]
          .map((node) => node.textContent.trim())
          .find((label) => THREAD_STATUSES.has(label)) ?? null
      );
    }

    function snapshot(row, active) {
      const props = context.findReactRowProps(row);
      const thread = props?.thread;
      if (!thread?.id) return null;

      const currentStatus = status(row);
      return {
        active,
        key: `${thread.environmentId ?? "local"}:${thread.id}`,
        project: props.projectTitle?.trim() || context.projectName(row),
        status: currentStatus,
        title: thread.title?.trim() || "Untitled thread",
        working: BUSY_STATUSES.has(currentStatus),
      };
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
        appBadgeSupported: typeof navigator.setAppBadge === "function",
        badgeCount: badges.size,
        enabled,
        permission: window.Notification?.permission ?? "unsupported",
        sound,
        volume,
      };
    }

    async function syncAppBadge() {
      try {
        if (badges.size > 0 && typeof navigator.setAppBadge === "function") {
          await navigator.setAppBadge(badges.size);
        } else if (badges.size === 0) {
          if (typeof navigator.clearAppBadge === "function") {
            await navigator.clearAppBadge();
          } else if (typeof navigator.setAppBadge === "function") {
            await navigator.setAppBadge(0);
          }
        }
      } catch {
        // Electron may expose Chromium's API without supporting the host OS badge.
      }
    }

    function clearBadge(key) {
      if (!badges.delete(key)) return false;
      void syncAppBadge();
      context.schedule();
      return true;
    }

    function clearBadges() {
      if (badges.size === 0) return 0;
      const count = badges.size;
      badges.clear();
      void syncAppBadge();
      context.schedule();
      return count;
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
      if (!enabled || window.Notification?.permission !== "granted") return;

      try {
        const currentStatus = thread.status ?? "Ready";
        const notification = new window.Notification("Thread stopped working", {
          body: `${thread.title}\n${thread.project} · ${currentStatus}`,
          silent: sound !== "system",
          tag: `t3-thread-stopped-${thread.key}`,
        });
        void playSound();
        notification.onclick = () => {
          clearBadge(thread.key);
          window.focus();
          findRowByThreadKey(thread.key)
            ?.querySelector('[data-testid="sidebar-row-card"], [data-testid="sidebar-row-slim"]')
            ?.click();
          notification.close();
        };
      } catch (error) {
        console.warn("Could not show the T3 thread notification.", error);
      }
    }

    function update(rows, activeRows) {
      const activeSet = new Set(activeRows);
      const currentKeys = new Set();

      for (const row of rows) {
        const current = snapshot(row, activeSet.has(row));
        if (!current) continue;

        currentKeys.add(current.key);
        const previous = threadStates.get(current.key);
        if (previous?.active && previous.working && !current.working) {
          badges.set(current.key, current);
          void syncAppBadge();
          show(current);
        }
        threadStates.set(current.key, current);
      }

      for (const key of threadStates.keys()) {
        if (!currentKeys.has(key)) threadStates.delete(key);
      }
    }

    async function enable() {
      const NotificationApi = window.Notification;
      if (typeof NotificationApi !== "function") {
        enabled = false;
        console.warn("Desktop notifications are not available in this T3 renderer.");
        return false;
      }

      try {
        const permission =
          NotificationApi.permission === "default"
            ? await NotificationApi.requestPermission()
            : NotificationApi.permission;
        enabled = permission === "granted";
        if (!enabled) console.warn(`T3 thread notifications are ${permission}.`);
        return enabled;
      } catch (error) {
        enabled = false;
        console.warn("Could not enable T3 thread notifications.", error);
        return false;
      }
    }

    function disable() {
      enabled = false;
      console.info("T3 thread notifications disabled.");
    }

    function test() {
      if (!enabled || window.Notification?.permission !== "granted") return false;
      new window.Notification("T3 notifications are working", {
        body: "You will be notified when an active thread stops working.",
        silent: sound !== "system",
        tag: "t3-thread-notification-test",
      });
      void playSound();
      return true;
    }

    function destroy() {
      badges.clear();
      void syncAppBadge();
      if (codecSoundUrl) URL.revokeObjectURL(codecSoundUrl);
    }

    return {
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
