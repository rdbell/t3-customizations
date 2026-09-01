# T3 Code customizations

Build a selective, paste-ready bundle with the [web configurator](https://rdbell.github.io/t3-customizations/).
Choose the customizations you want, select **Copy bundle**, then paste the result into T3 Code's
DevTools console. Everything is assembled in your browser; no selections or source code are sent
to a server.

## Features

[`customizations.js`](./customizations.js) coordinates the feature modules and their shared T3 DOM
access. The current features group threads by project, send completion notifications, reuse sent
messages, and add a Customizations page to Settings.

The customization:

- keeps pinned threads first within their project;
- sorts project groups by T3 order, name, or attention state;
- sorts Active threads by T3 order, title, attention state, update time, or age;
- sorts Snoozed threads by T3 order, title, update time, or age;
- optionally keeps pinned Snoozed threads and their project groups first;
- makes every project group independently collapsible;
- moves the project favicon and name into the group header;
- removes repeated project identity from thread rows;
- compresses active cards to two lines;
- shows an activity or attention summary on collapsed groups;
- sends a desktop notification with optional custom sound when an active thread stops working;
- badges affected project groups and, where supported, the app icon until the thread is opened;
- adds a Reuse message action beside Copy on user messages, with optional auto-send;
- adds a Customizations page to Settings with notification and sorting controls;
- persists settings and collapse choices in `localStorage`; and
- reapplies itself after normal React rerenders without rebuilding unchanged group headers.

### Build a selective bundle

Open the [web configurator](https://rdbell.github.io/t3-customizations/), select one or more
features, and select **Copy bundle**. Sidebar sorting depends on project groups, so choosing
sorting automatically includes project grouping.

### Copy the full bundle locally

Clone this repository and run:

```sh
zsh copy-customization.sh
```

The helper includes every customization and embeds [`codec.wav`](./codec.wav) into the copied
script so it can play within T3's Content Security Policy. Open T3 Code's DevTools console and
paste it. Running a newer copy automatically removes the old instance first.

The customization lasts until the renderer reloads. Run the script again after restarting or
reloading T3 Code.

### Settings

Open **Settings → Customizations** to adjust notification volume, message reuse, and sidebar
sorting. Releasing the slider previews the current notification sound.

Hover over one of your messages and select Reuse message beside Copy. The message moves into the
composer without sending. Reusing a message replaces the current composer text and removes old
terminal, element, preview, and review context blocks from that message.

Auto-send reused messages is off by default. When enabled, Reuse submits through T3's normal send
button after updating the composer. If T3 disables sending, the reused text stays in the composer.

Project order applies to Active, Snoozed, and Settled groups. Active and Snoozed have separate
thread-order controls within each project. Pinned Active threads stay ahead of unpinned threads.
The optional Snoozed toggle moves projects containing pinned threads first and keeps those threads
at the top of their project. Settled retains T3's completion-time ordering.

### Console controls

Expand every project group:

```js
window.__t3ProjectGroupedSections.expandAll()
```

Reapply the layout manually:

```js
window.__t3ProjectGroupedSections.refresh()
```

Inspect or change message reuse:

```js
window.__t3ProjectGroupedSections.messageReuseStatus()
window.__t3ProjectGroupedSections.setReuseAutoSend(true)
window.__t3ProjectGroupedSections.setReuseAutoSend(false)
```

Check or test desktop notifications:

```js
window.__t3ProjectGroupedSections.notificationStatus()
window.__t3ProjectGroupedSections.testNotification()
```

Choose a notification sound and volume:

```js
window.__t3ProjectGroupedSections.setNotificationSound("codec")
window.__t3ProjectGroupedSections.setNotificationSound("system")
window.__t3ProjectGroupedSections.setNotificationSound("chime")
window.__t3ProjectGroupedSections.setNotificationSound("ping")
window.__t3ProjectGroupedSections.setNotificationSound("none")
window.__t3ProjectGroupedSections.setNotificationVolume(0.5)
```

Inspect or change sidebar sorting:

```js
window.__t3ProjectGroupedSections.sortingStatus()
window.__t3ProjectGroupedSections.setProjectOrder("alphabetical")
window.__t3ProjectGroupedSections.setProjectOrder("attention")
window.__t3ProjectGroupedSections.setProjectOrder("default")
window.__t3ProjectGroupedSections.setActiveThreadOrder("attention")
window.__t3ProjectGroupedSections.setActiveThreadOrder("alphabetical")
window.__t3ProjectGroupedSections.setActiveThreadOrder("recent")
window.__t3ProjectGroupedSections.setActiveThreadOrder("oldest")
window.__t3ProjectGroupedSections.setActiveThreadOrder("default")
window.__t3ProjectGroupedSections.setSnoozedThreadOrder("alphabetical")
window.__t3ProjectGroupedSections.setSnoozedThreadOrder("recent")
window.__t3ProjectGroupedSections.setSnoozedThreadOrder("oldest")
window.__t3ProjectGroupedSections.setSnoozedThreadOrder("default")
window.__t3ProjectGroupedSections.setSnoozedPinnedFirst(true)
window.__t3ProjectGroupedSections.setSnoozedPinnedFirst(false)
```

`codec.wav` and volume `0.5` are the defaults. The sound and volume persist in `localStorage`. A
project badge clears when you open one of its notified threads. Clear every badge manually with:

```js
window.__t3ProjectGroupedSections.clearNotificationBadges()
```

Enable or disable desktop notifications:

```js
window.__t3ProjectGroupedSections.enableNotifications()
window.__t3ProjectGroupedSections.disableNotifications()
```

Disable it without reloading:

```js
window.__t3ProjectGroupedSections.destroy()
```

### Source layout

The web configurator fetches the selected feature modules and coordinator, then assembles the
DevTools payload entirely in the browser. The local copy helper includes every module. The source
stays split up without adding a build tool or runtime imports.

```text
customizations.js
index.html
site.css
site.js
.nojekyll
features/
  notifications.js
  message-reuse.js
  sidebar-sorting.js
  settings.js
  sidebar-project-groups.js
copy-customization.sh
codec.wav
```

Add feature behavior to its matching module. Keep shared DOM lookup, scheduling, lifecycle, and
the public console API in `customizations.js`.

### Compatibility

This script was tested against the DOM and React structure shipped in T3 Code `0.0.37`. It uses
React's internal row and composer properties to recover project names and reuse message text, so a
future T3 Code update may require selector or layout adjustments.
