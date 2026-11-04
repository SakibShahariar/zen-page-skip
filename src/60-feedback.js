function showNotificationToast(message, duration) {
  try {
    const notificationBox = window.gBrowser.getNotificationBox();
    notificationBox.getNotificationWithValue(TOAST_ID)?.close();
    const notification = notificationBox.appendNotification(TOAST_ID, {
      label: message,
      priority: notificationBox.PRIORITY_INFO_MEDIUM
    });
    window.setTimeout(() => notification?.close(), duration);
    return true;
  } catch (error) {
    console.warn("[Zen Page Skip] Notification unavailable:", error);
    return false;
  }
}

function showNativeToast(message, duration) {
  const zenUI = window.gZenUIManager;
  if (typeof zenUI?.showToast !== "function") return false;

  const applyMessage = () => {
    try {
      const container = document.getElementById("zen-toast-container");
      const toast = Array.from(container?.children || []).find((item) => item._messageId === TOAST_ID);
      const label = toast?.querySelector("label");
      if (!label) return false;
      label.removeAttribute("data-l10n-id");
      label.removeAttribute("data-l10n-args");
      label.textContent = message;
      return true;
    } catch (error) {
      return false;
    }
  };

  try {
    const result = zenUI.showToast(TOAST_ID, { timeout: duration });
    if (result && typeof result.then === "function") {
      applyMessage();
      result.then(() => {
        if (!applyMessage()) showNotificationToast(message, duration);
      }).catch(() => showNotificationToast(message, duration));
      return true;
    }
    return applyMessage();
  } catch (error) {
    debugLog("native-toast-unavailable", { errorName: error?.name || "Error" });
    return false;
  }
}

function showToast(message) {
  try {
    if (!getToastEnabled()) return;
    const duration = getToastDuration();
    if (showNativeToast(message, duration)) return;
    showNotificationToast(message, duration);
  } catch (error) {
    // A broken host toast API must never escape into pagination error handling.
    showNotificationToast(message, TOAST_DURATION_MS);
  }
}

