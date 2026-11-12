export function setupPwa({ installButton, iosSheet, updateBar, updateButton }) {
  const isStandalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let deferredPrompt = null;

  if (!isStandalone && isIos) installButton.hidden = false;
  addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
    installButton.hidden = false;
  });
  addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installButton.hidden = true;
  });
  installButton.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installButton.hidden = true;
      return;
    }
    if (isIos) iosSheet.showModal();
  });

  if (!("serviceWorker" in navigator)) return;
  let updateRequested = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!updateRequested) return;
    updateRequested = false;
    location.reload();
  });
  navigator.serviceWorker.register("sw.js").then(registration => {
    const offerUpdate = worker => {
      updateBar.hidden = false;
      updateButton.onclick = () => {
        updateRequested = true;
        updateButton.disabled = true;
        worker.postMessage("SKIP_WAITING");
      };
    };
    if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") registration.update().catch(() => {});
    });
  }).catch(error => console.warn("service worker registration failed", error));
}
