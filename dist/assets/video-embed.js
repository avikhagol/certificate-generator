/*
 * Click-to-play YouTube facade.
 *
 * The app claims "works offline" and "nothing leaves your browser", so no
 * YouTube resource may be requested on page load. The poster image is local;
 * the real <iframe> is only inserted after the visitor presses play.
 */
(() => {
  "use strict";

  const mount = document.getElementById("demoVideo");
  const trigger = document.getElementById("demoVideoPlay");
  if (!mount || !trigger) return;

  const videoId = mount.dataset.video;
  if (!videoId) return;

  trigger.addEventListener("click", () => {
    const iframe = document.createElement("iframe");
    iframe.width = "560";
    iframe.height = "315";
    iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1`;
    iframe.title = "YouTube video player";
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute(
      "allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    );
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    iframe.setAttribute("allowfullscreen", "");
    mount.replaceChildren(iframe);
    iframe.focus();
  });
})();
