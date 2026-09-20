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
  const navigator = {};
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

  function addRow({
    id,
    status = "Working",
    viewing = false,
    active = true,
    extraStatusLabels = [],
    thread = {},
  }) {
    const row = {
      active,
      props: {
        isActive: viewing,
        projectTitle: "Test project",
        thread: {
          environmentId: "test-environment",
          id,
          title: `Thread ${id}`,
          ...thread,
        },
      },
      status,
      extraStatusLabels,
      querySelectorAll(selector) {
        if (selector !== '[role="status"]') return [];
        const labels = [];
        if (this.status) labels.push(this.status);
        labels.push(...this.extraStatusLabels);
        return labels.map((textContent) => ({ textContent }));
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
    feature,
    notificationInstances,
    permissionRequest,
    addRow,
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

function planThread() {
  return {
    interactionMode: "plan",
    hasActionableProposedPlan: true,
    latestTurn: { state: "completed", completedAt: "2026-09-08T00:00:00.000Z" },
  };
}

async function testNativeBackgroundStatusesDoNotOverlayNotify() {
  const harness = createHarness({ focused: false });
  const done = harness.addRow({ id: "native-done" });
  const input = harness.addRow({ id: "native-input", status: "Working" });
  const failed = harness.addRow({ id: "native-failed", status: null });
  await harness.feature.enable();
  harness.update();

  done.status = "Done";
  input.status = "Input";
  failed.status = "Failed";
  harness.update();

  assert.equal(harness.notificationInstances.length, 0);
  assert.equal(harness.feature.settings().badgeCount, 0);
  assert.equal(harness.feature.status(done), "Done");
  assert.equal(harness.feature.status(input), "Input");
  assert.equal(harness.feature.status(failed), "Failed");
}

async function testFocusedUnselectedStatusesDoNotOverlayNotify() {
  const harness = createHarness({ focused: true });
  const row = harness.addRow({ id: "other-thread", viewing: false });
  await harness.feature.enable();
  harness.update();

  row.status = "Done";
  harness.update();
  assert.equal(harness.notificationInstances.length, 0);
  assert.equal(harness.feature.settings().badgeCount, 0);
}

async function testPlanReadyNotifiesEvenInBackground() {
  const harness = createHarness({ focused: false });
  const row = harness.addRow({
    id: "plan-ready",
    status: null,
    thread: planThread(),
  });
  await harness.feature.enable();
  harness.update();
  assert.equal(harness.notificationInstances.length, 0);

  row.props.thread.hasActionableProposedPlan = false;
  harness.update();
  row.props.thread.hasActionableProposedPlan = true;
  harness.update();

  assert.equal(harness.feature.status(row), "Plan");
  assert.equal(harness.notificationInstances.at(-1).title, "Plan is ready");
  assert.equal(harness.feature.settings().badgeCount, 1);
}

async function testPlanReadyOutranksDonePill() {
  const harness = createHarness({ focused: false });
  const row = harness.addRow({
    id: "plan-over-done",
    status: "Done",
    thread: planThread(),
  });
  await harness.feature.enable();
  harness.update();
  assert.equal(harness.feature.status(row), "Plan");
  assert.equal(harness.notificationInstances.length, 0);

  row.props.thread.hasActionableProposedPlan = false;
  harness.update();
  row.props.thread.hasActionableProposedPlan = true;
  harness.update();
  assert.equal(harness.notificationInstances.at(-1).title, "Plan is ready");
}

async function testFocusedSelectedThreadNotifiesForNativeStatuses() {
  const harness = createHarness({ focused: true });
  const row = harness.addRow({ id: "focused-selected", viewing: true });
  await harness.feature.enable();
  harness.update();

  row.status = "Done";
  harness.update();
  assert.equal(harness.notificationInstances.at(-1).title, "Thread finished");
  assert.equal(harness.feature.settings().badgeCount, 1);

  assert.equal(harness.feature.acknowledgeViewedThread(), true);
  assert.equal(harness.feature.settings().badgeCount, 0);
  assert.equal(harness.notificationInstances[0].closed, true);

  row.status = "Working";
  harness.update();
  row.status = "Input";
  harness.update();
  assert.equal(harness.notificationInstances.at(-1).title, "Thread needs your input");
}

async function testBackgroundSelectedThreadLeavesNativeStatusesToT3() {
  const harness = createHarness({ focused: false });
  const row = harness.addRow({
    id: "selected-background",
    viewing: true,
    status: "Working",
    thread: {
      latestTurn: { state: "in_progress", completedAt: null },
      session: { status: "running" },
    },
  });
  await harness.feature.enable();
  harness.update();

  row.status = null;
  row.props.thread.session = { status: "idle" };
  row.props.thread.latestTurn = {
    state: "completed",
    completedAt: "2026-09-08T16:00:00.000Z",
  };
  harness.update();

  assert.equal(harness.feature.status(row), null);
  assert.equal(harness.notificationInstances.length, 0);
  assert.equal(harness.feature.settings().badgeCount, 0);
}

async function testFocusedSelectedHiddenCompletionNotifies() {
  const harness = createHarness({ focused: true });
  const row = harness.addRow({
    id: "selected-no-pill",
    viewing: true,
    status: "Working",
    thread: {
      latestTurn: { completedAt: "2026-09-08T16:00:00.000Z" },
      session: { status: "running" },
    },
  });
  await harness.feature.enable();
  harness.update();

  row.status = null;
  row.props.thread.session = { status: "idle" };
  harness.update();

  assert.equal(harness.feature.status(row), null);
  assert.equal(harness.notificationInstances.at(-1).title, "Thread finished");
  assert.equal(harness.feature.settings().badgeCount, 1);

  harness.update();
  assert.equal(harness.notificationInstances.length, 1);
}

async function testUserStopOnFocusedSelectedThreadStillSuppressed() {
  const harness = createHarness({ focused: true });
  const row = harness.addRow({
    id: "selected-stop",
    viewing: true,
    status: "Working",
  });
  await harness.feature.enable();
  harness.update();

  harness.feature.acknowledge("test-environment:selected-stop", { suppressNextStop: true });
  row.status = "Done";
  harness.update();
  assert.equal(harness.notificationInstances.length, 0);
  assert.equal(harness.feature.settings().badgeCount, 0);
}

async function testDisableStopsOverlayNotifications() {
  const harness = createHarness({ focused: true });
  const row = harness.addRow({
    id: "disabled",
    viewing: true,
    status: null,
    thread: planThread(),
  });
  await harness.feature.enable();
  harness.update();

  harness.feature.disable();
  row.props.thread.hasActionableProposedPlan = false;
  harness.update();
  row.props.thread.hasActionableProposedPlan = true;
  harness.update();
  assert.equal(harness.feature.settings().enabled, false);
  assert.equal(harness.feature.settings().desktopEnabled, false);
  assert.equal(harness.feature.settings().badgeCount, 0);
  assert.equal(harness.notificationInstances.length, 0);

  await harness.feature.enable();
  row.props.thread.hasActionableProposedPlan = false;
  harness.update();
  row.props.thread.hasActionableProposedPlan = true;
  harness.update();
  assert.equal(harness.feature.settings().badgeCount, 1);
  assert.equal(harness.notificationInstances.at(-1).title, "Plan is ready");
}

async function testIgnoresNonThreadStatusLabels() {
  const harness = createHarness();
  const row = harness.addRow({
    id: "extra-status",
    extraStatusLabels: ["Regenerating title", "Pin"],
  });
  await harness.feature.enable();
  harness.update();
  assert.equal(harness.feature.status(row), "Working");

  row.status = "Done";
  harness.update();
  assert.equal(harness.feature.status(row), "Done");
  assert.equal(harness.feature.settings().badgeCount, 0);
}

async function testExistingAttentionOnFirstLoadDoesNotNotify() {
  const harness = createHarness({ focused: true });
  harness.addRow({ id: "already-done", viewing: true, status: "Done" });
  harness.addRow({ id: "already-plan", status: null, thread: planThread() });
  await harness.feature.enable();
  harness.update();
  assert.equal(harness.notificationInstances.length, 0);
  assert.equal(harness.feature.settings().badgeCount, 0);
}

async function testParsesNativeInputStatusLabels() {
  const harness = createHarness();
  const approval = harness.addRow({ id: "pending-approval", status: "Pending Approval" });
  const input = harness.addRow({ id: "awaiting-input", status: "Awaiting Input" });
  await harness.feature.enable();
  harness.update();

  assert.equal(harness.feature.status(approval), "Approval");
  assert.equal(harness.feature.status(input), "Input");
}

async function testReadsWorkingPrefixFromLiveRegion() {
  const harness = createHarness();
  const row = harness.addRow({ id: "working-prefix", status: "Working 0:12" });
  await harness.feature.enable();
  harness.update();
  assert.equal(harness.feature.status(row), "Working");
}

async function testFailedFromLatestTurnState() {
  const harness = createHarness();
  const row = harness.addRow({
    id: "turn-error",
    status: null,
    thread: { latestTurn: { state: "error" } },
  });
  await harness.feature.enable();
  harness.update();
  assert.equal(harness.feature.status(row), "Failed");
  assert.equal(harness.notificationInstances.length, 0);
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
  await testNativeBackgroundStatusesDoNotOverlayNotify();
  await testFocusedUnselectedStatusesDoNotOverlayNotify();
  await testPlanReadyNotifiesEvenInBackground();
  await testPlanReadyOutranksDonePill();
  await testFocusedSelectedThreadNotifiesForNativeStatuses();
  await testBackgroundSelectedThreadLeavesNativeStatusesToT3();
  await testFocusedSelectedHiddenCompletionNotifies();
  await testUserStopOnFocusedSelectedThreadStillSuppressed();
  await testDisableStopsOverlayNotifications();
  await testIgnoresNonThreadStatusLabels();
  await testExistingAttentionOnFirstLoadDoesNotNotify();
  await testParsesNativeInputStatusLabels();
  await testReadsWorkingPrefixFromLiveRegion();
  await testFailedFromLatestTurnState();
  await testPendingPermissionCannotUndoDisable();
  console.log("Notification state tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
