// ==UserScript==
// @name         Twitch Auto Claim Channel Points
// @homepage     https://www.twitch.tv/
// @version      1.2
// @downloadURL  https://github.com/ErikS270102/Tampermonkey-Scripts/raw/master/scripts/Twitch%20Auto%20Claim%20Channel%20Points.user.js
// @description  Automatically claims Twitch Channel Points
// @author       Erik
// @match        https://www.twitch.tv/**
// @noframes
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.4.1/jquery.min.js
// @grant        none
// ==/UserScript==

(async () => {
    "use strict";

    if (!/^\/[a-z0-9]+$/i.test(location.pathname)) return;

    $(async () => {
        let observer = new MutationObserver(() => {
            const bonus = $(".claimable-bonus__icon");
            if (bonus.length != 0) {
                bonus.trigger("click");
                console.log("[Auto Claimer] Claimed");
            }
        });

        do {
            await new Promise((resolve) => setTimeout(resolve, 100)); // Sleep
        } while ($(".chat-input").length == 0);

        observer.observe($(".chat-input").get(0), { childList: true, subtree: true });
        console.log("[Auto claimer] Observing for Changes...");
    });
})();
