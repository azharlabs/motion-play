let targetTabId = null;

async function setBadge(tabId, armed) {
  try {
    await chrome.action.setBadgeText({ tabId, text: armed ? "ON" : "" });
    if (armed) await chrome.action.setBadgeBackgroundColor({ tabId, color: "#22c55e" });
  } catch {
    // Tab may have closed between the click and the badge update.
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  if (targetTabId && targetTabId !== tab.id) await setBadge(targetTabId, false);
  targetTabId = tab.id;
  await chrome.storage.session.set({ motionPlayTargetTabId: targetTabId });
  await setBadge(tab.id, true);
});

chrome.runtime.onStartup.addListener(async () => {
  const stored = await chrome.storage.session.get("motionPlayTargetTabId");
  targetTabId = stored.motionPlayTargetTabId ?? null;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId !== targetTabId) return;
  targetTabId = null;
  chrome.storage.session.remove("motionPlayTargetTabId");
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "MOTIONPLAY_CONTROL") return;
  if (!targetTabId || sender.tab?.id === targetTabId) return;

  chrome.tabs.sendMessage(targetTabId, {
    type: "MOTIONPLAY_APPLY_CONTROL",
    payload: message.payload,
  }).catch(() => {
    // Some protected browser pages reject content scripts. The controller
    // remains alive so the user can arm a normal game tab instead.
  });
});
