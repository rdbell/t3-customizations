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
  assert.equal(harness.notificationInstances[0].title, "Thread finished");

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
  assert.equal(harness.feature.settings().badgeCount, 1);
}

async function testNeedsInputFromIdleAndFromWorking() {
  const harness = createHarness();
  const idle = harness.addRow({ id: "idle-input", status: "Done" });
  const working = harness.addRow({ id: "working-input" });
  await harness.feature.enable();
  harness.update();

  idle.status = "Input";
  harness.update();
  assert.equal(harness.feature.settings().badgeCount, 1);
  assert.equal(harness.notificationInstances.at(-1).title, "Thread needs your input");
  assert.match(harness.notificationInstances.at(-1).options.body, /Input/);

  working.status = "Approval";
  harness.update();
  assert.equal(harness.feature.settings().badgeCount, 2);
  assert.equal(harness.notificationInstances.at(-1).title, "Thread needs approval");
  assert.match(harness.notificationInstances.at(-1).options.body, /Approval/);
}

async function testNeedsInputDoesNotNotifyAgainOnSameStatus() {
  const harness = createHarness();
  const row = harness.addRow({ id: "same-input", status: "Done" });
  await harness.feature.enable();
  harness.update();

  row.status = "Input";
  harness.update();
  assert.equal(harness.notificationInstances.length, 1);

  harness.update();
  assert.equal(harness.notificationInstances.length, 1);
  assert.equal(harness.feature.settings().badgeCount, 1);
}

async function testDoneAfterAcknowledgedInputNotifiesFinished() {
  const harness = createHarness();
  const row = harness.addRow({ id: "input-then-done", status: "Done" });
  await harness.feature.enable();
  harness.update();

  row.status = "Input";
  harness.update();
  assert.equal(harness.notificationInstances.length, 1);
  assert.equal(harness.notificationInstances[0].title, "Thread needs your input");

  row.props.isActive = true;
  harness.update();
  assert.equal(harness.feature.settings().badgeCount, 0);

  row.status = "Done";
  harness.update();
  assert.equal(harness.notificationInstances.length, 2);
  assert.equal(harness.notificationInstances[1].title, "Thread finished");
  assert.equal(harness.feature.settings().badgeCount, 1);
}

async function testFailedAndPlanNotifyWithDistinctTitles() {
  const harness = createHarness();
  const failed = harness.addRow({ id: "failed-idle", status: null });
  const plan = harness.addRow({
    id: "plan-ready",
    status: null,
    thread: {
      interactionMode: "plan",
      hasActionableProposedPlan: true,
      latestTurn: { status: "completed", completedAt: "2026-09-08T00:00:00.000Z" },
    },
  });
  await harness.feature.enable();
  harness.update();
  assert.equal(harness.notificationInstances.length, 0);

  failed.status = "Failed";
  harness.update();
  assert.equal(harness.notificationInstances.at(-1).title, "Thread failed");
  assert.equal(harness.feature.status(failed), "Failed");

  plan.props.thread.hasActionableProposedPlan = false;
  harness.update();
  plan.props.thread.hasActionableProposedPlan = true;
  harness.update();
  assert.equal(harness.feature.status(plan), "Plan");
  assert.equal(harness.notificationInstances.at(-1).title, "Plan is ready");
}

async function testPlanReadyOutranksDonePill() {
  const harness = createHarness();
  const row = harness.addRow({
    id: "plan-over-done",
    status: "Done",
    thread: {
      interactionMode: "plan",
      hasActionableProposedPlan: true,
      latestTurn: { completedAt: "2026-09-08T00:00:00.000Z" },
    },
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

async function testExistingAttentionOnFirstLoadDoesNotNotify() {
  const harness = createHarness();
  harness.addRow({ id: "already-done", status: "Done" });
  harness.addRow({ id: "already-input", status: "Input" });
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

async function testOpenThreadCompletionNotifiesWhenWindowIsBackgrounded() {
  const harness = createHarness({ focused: false });
  const row = harness.addRow({
    id: "open-background",
    viewing: true,
    status: "Working",
    thread: {
      latestTurn: { status: "in_progress", completedAt: null },
      session: { status: "running" },
    },
  });
  await harness.feature.enable();
  harness.update();

  row.status = null;
  row.props.thread.session = { status: "idle" };
  row.props.thread.latestTurn = {
    status: "completed",
    completedAt: "2026-09-08T16:00:00.000Z",
  };
  harness.update();

  assert.equal(harness.feature.status(row), null);
  assert.equal(harness.feature.settings().badgeCount, 1);
  assert.equal(harness.notificationInstances.length, 1);
  assert.equal(harness.notificationInstances[0].title, "Thread finished");
}

async function testSameCompletedAtDoesNotNotifyAgain() {
  const harness = createHarness({ focused: false });
  const row = harness.addRow({
    id: "same-completed",
    viewing: true,
    status: "Working",
    thread: {
      latestTurn: { status: "in_progress", completedAt: null },
      session: { status: "running" },
    },
  });
  await harness.feature.enable();
  harness.update();

  row.status = null;
  row.props.thread.session = { status: "idle" };
  row.props.thread.latestTurn = {
    status: "completed",
    completedAt: "2026-09-08T16:00:00.000Z",
  };
  harness.update();
  assert.equal(harness.notificationInstances.length, 1);

  harness.update();
  assert.equal(harness.notificationInstances.length, 1);
  assert.equal(harness.feature.settings().badgeCount, 1);
}

async function testSelectedThreadNotifiesWhenWorkingLabelDisappears() {
  const harness = createHarness({ focused: false });
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
  assert.equal(harness.notificationInstances.length, 1);
  assert.equal(harness.notificationInstances[0].title, "Thread finished");
  assert.equal(harness.feature.settings().badgeCount, 1);
}

async function testUserStopOnSelectedThreadStillSuppressed() {
  const harness = createHarness({ focused: false });
  const row = harness.addRow({
    id: "selected-stop",
    viewing: true,
    status: "Working",
  });
  await harness.feature.enable();
  harness.update();

  harness.feature.acknowledge("test-environment:selected-stop", { suppressNextStop: true });
  row.status = null;
  harness.update();
  assert.equal(harness.notificationInstances.length, 0);
  assert.equal(harness.feature.settings().badgeCount, 0);
}

async function testSkippedBusyStillNotifiesOnCompletion() {
  const harness = createHarness();
  const row = harness.addRow({
    id: "skipped-busy",
    status: null,
    thread: { latestTurn: { completedAt: "2026-09-08T15:00:00.000Z" } },
  });
  await harness.feature.enable();
  harness.update();
  assert.equal(harness.notificationInstances.length, 0);

  row.props.thread.latestTurn = { completedAt: "2026-09-08T16:00:00.000Z" };
  harness.update();
  assert.equal(harness.notificationInstances.at(-1).title, "Thread finished");
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
  await testIgnoresNonThreadStatusLabels();
  await testNeedsInputFromIdleAndFromWorking();
  await testNeedsInputDoesNotNotifyAgainOnSameStatus();
  await testDoneAfterAcknowledgedInputNotifiesFinished();
  await testFailedAndPlanNotifyWithDistinctTitles();
  await testPlanReadyOutranksDonePill();
  await testExistingAttentionOnFirstLoadDoesNotNotify();
  await testParsesNativeInputStatusLabels();
  await testReadsWorkingPrefixFromLiveRegion();
  await testOpenThreadCompletionNotifiesWhenWindowIsBackgrounded();
  await testSameCompletedAtDoesNotNotifyAgain();
  await testSelectedThreadNotifiesWhenWorkingLabelDisappears();
  await testUserStopOnSelectedThreadStillSuppressed();
  await testSkippedBusyStillNotifiesOnCompletion();
  await testPendingPermissionCannotUndoDisable();
  console.log("Notification state tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
