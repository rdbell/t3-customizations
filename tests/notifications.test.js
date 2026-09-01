const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const notificationSource = fs.readFileSync(
  path.join(__dirname, "..", "features", "notifications.js"),
  "utf8",
);

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createHarness(options = {}) {
  let focused = options.focused ?? false;
  let visible = options.visible ?? true;
  const permissionRequest = options.permissionRequest ?? null;
  const notificationInstances = [];
  const appBadgeValues = [];
  const appBadgeOperations = [];
  let clearAppBadgeCalls = 0;
  let scheduled = 0;

  class FakeNotification {
    static permission = options.permission ?? "granted";

    static async requestPermission() {
      const permission = permissionRequest
        ? await permissionRequest.promise
        : FakeNotification.permission;
      FakeNotification.permission = permission;
      return permission;
    }

    constructor(title, notificationOptions) {
      this.title = title;
      this.options = notificationOptions;
      this.closed = false;
      this.onclick = null;
      this.onclose = null;
      notificationInstances.push(this);
    }

    close() {
      if (this.closed) return;
      this.closed = true;
      this.onclose?.();
    }
  }

  const document = {
    get visibilityState() {
      return visible ? "visible" : "hidden";
    },
    hasFocus() {
      return focused;
    },
  };
  const localStorage = {
    getItem() {
      return null;
    },
    setItem() {},
  };
  const navigator = {
    async clearAppBadge() {
      clearAppBadgeCalls++;
      appBadgeOperations.push(["clear"]);
    },
    async setAppBadge(value) {
      appBadgeValues.push(value);
      appBadgeOperations.push(["set", value]);
    },
  };
  const window = {
    __t3CustomizationFeatureFactories: {},
    Notification: FakeNotification,
    location: { href: "https://example.test/" },
    focus() {
      focused = true;
    },
    setTimeout,
  };
  const sandbox = {
    Audio: class {
      async play() {}
    },
    Blob,
    Date,
    Map,
    Set,
    TypeError,
    URL,
    Uint8Array,
    atob,
    console,
    document,
    localStorage,
    navigator,
    window,
  };
  vm.runInNewContext(notificationSource, sandbox, { filename: "features/notifications.js" });

  const rows = [];
  const context = {
    activeCardParts(row) {
      return { top: row };
    },
    codecSoundBase64: null,
    findReactRowProps(row) {
      return row.props;
    },
    findThreadList() {
      return {
        querySelectorAll() {
          return rows;
        },
      };
    },
    projectName(row) {
      return row.props.projectTitle;
    },
    rowSection(row) {
      return row.active ? "active" : "settled";
    },
    schedule() {
      scheduled++;
    },
  };
  const feature = window.__t3CustomizationFeatureFactories.notifications(context);

  function addRow({ id, status = "Working", viewing = false, active = true }) {
    const row = {
      active,
      props: {
        isActive: viewing,
        projectTitle: "Test project",
        thread: {
          environmentId: "test-environment",
          id,
          title: `Thread ${id}`,
        },
      },
      status,
      querySelectorAll(selector) {
        if (selector !== '[role="status"]' || !this.status) return [];
        return [{ textContent: this.status }];
      },
    };
    rows.push(row);
    return row;
  }

  function update() {
    feature.update(
      rows,
      rows.filter((row) => row.active),
    );
  }

  return {
    appBadgeValues,
    appBadgeOperations,
    feature,
    notificationInstances,
    permissionRequest,
    addRow,
    clearAppBadgeCalls: () => clearAppBadgeCalls,
    scheduled: () => scheduled,
    setFocused(value) {
      focused = value;
    },
    setVisible(value) {
      visible = value;
    },
    update,
  };
}

async function testBackgroundCompletionAndRestart() {
  const harness = createHarness();
  const row = harness.addRow({ id: "background" });
  await harness.feature.enable();
  harness.update();

  row.status = "Done";
  harness.update();
  assert.equal(harness.feature.settings().badgeCount, 1);
  assert.equal(harness.notificationInstances.length, 1);

  row.status = "Working";
  harness.update();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.feature.settings().badgeCount, 0);
  assert.equal(harness.notificationInstances[0].closed, true);
  assert.deepEqual(harness.appBadgeOperations.at(-1), ["clear"]);
}

async function testForegroundCompletionClearsWhenUserResponds() {
  const harness = createHarness({ focused: true });
  const row = harness.addRow({ id: "foreground", viewing: true });
  await harness.feature.enable();
  harness.update();

  row.status = "Done";
  harness.update();
  assert.equal(harness.feature.settings().badgeCount, 1);
  assert.equal(harness.notificationInstances.length, 1);

  assert.equal(harness.feature.acknowledgeViewedThread(), true);
  assert.equal(harness.feature.settings().badgeCount, 0);
  assert.equal(harness.notificationInstances[0].closed, true);
}

async function testReturningToViewedThreadAcknowledgesIt() {
  const harness = createHarness({ focused: false });
  const row = harness.addRow({ id: "focus-return", viewing: true });
  await harness.feature.enable();
  harness.update();

  row.status = "Done";
  harness.update();
  assert.equal(harness.feature.settings().badgeCount, 1);

  harness.setFocused(true);
  assert.equal(harness.feature.acknowledgeVisibleThread(), true);
  assert.equal(harness.feature.settings().badgeCount, 0);
  assert.equal(harness.notificationInstances[0].closed, true);
}

async function testOpeningAndSendingAcknowledge() {
  const harness = createHarness({ focused: false });
  const row = harness.addRow({ id: "open-and-send" });
  await harness.feature.enable();
  harness.update();

  row.status = "Done";
  harness.update();
  assert.equal(harness.feature.settings().badgeCount, 1);

  row.props.isActive = true;
  harness.update();
  assert.equal(harness.feature.settings().badgeCount, 0);

  row.status = "Working";
  harness.update();
  row.status = "Done";
  harness.update();
  assert.equal(harness.feature.settings().badgeCount, 1);
  assert.equal(harness.feature.acknowledgeViewedThread(), true);
  assert.equal(harness.feature.settings().badgeCount, 0);
}

async function testUserInitiatedStopIsSuppressed() {
  const harness = createHarness();
  const row = harness.addRow({ id: "user-stop" });
  await harness.feature.enable();
  harness.update();

  harness.feature.acknowledge("test-environment:user-stop", { suppressNextStop: true });
  row.status = "Done";
  harness.update();
  assert.equal(harness.feature.settings().badgeCount, 0);
  assert.equal(harness.notificationInstances.length, 0);
}

async function testDisableStopsBadgesAndDesktopNotifications() {
  const harness = createHarness();
  const row = harness.addRow({ id: "disabled" });
  await harness.feature.enable();
  harness.update();

  harness.feature.disable();
  row.status = "Done";
  harness.update();
  assert.equal(harness.feature.settings().enabled, false);
  assert.equal(harness.feature.settings().desktopEnabled, false);
  assert.equal(harness.feature.settings().badgeCount, 0);
  assert.equal(harness.notificationInstances.length, 0);

  row.status = "Working";
  harness.update();
  await harness.feature.enable();
  row.status = "Done";
  harness.update();
  assert.equal(harness.feature.settings().badgeCount, 1);
  assert.equal(harness.notificationInstances.length, 1);
}

async function testPendingPermissionCannotUndoDisable() {
  const permissionRequest = deferred();
  const harness = createHarness({ permission: "default", permissionRequest });
  const enabling = harness.feature.enable();
  harness.feature.disable();
  permissionRequest.resolve("granted");

  assert.equal(await enabling, false);
  assert.equal(harness.feature.settings().enabled, false);
  assert.equal(harness.feature.settings().desktopEnabled, false);
}

async function main() {
  await testBackgroundCompletionAndRestart();
  await testForegroundCompletionClearsWhenUserResponds();
  await testReturningToViewedThreadAcknowledgesIt();
  await testOpeningAndSendingAcknowledge();
  await testUserInitiatedStopIsSuppressed();
  await testDisableStopsBadgesAndDesktopNotifications();
  await testPendingPermissionCannotUndoDisable();
  console.log("Notification state tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
