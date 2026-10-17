"use client";

import { useEffect } from "react";

/** 注册 PWA Service Worker。注册失败不影响页面正常使用。 */
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* 忽略：无 SW 时仍可作为普通网页使用 */
      });
    }
  }, []);
  return null;
}
