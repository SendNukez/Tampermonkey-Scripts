// ==UserScript==
// @name         Twitch Auto Claim Channel Points
// @homepage     https://www.twitch.tv/
// @version      1.0
// @downloadURL  https://github.com/ErikS270102/Tampermonkey-Scripts/raw/master/scripts/Twitch%20Auto%20Claim%20Channel%20Points.user.js
// @description  Automatically claims Twitch Channel Points
// @author       Erik
// @match        https://www.twitch.tv/*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    window.lastPointsClaimed = 0;

    let MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
    if (MutationObserver) {
        let observer = new MutationObserver((e) => {
            if (Date.now() - window.lastPointsClaimed < 20000) {
                return;
            }

            let bonus = document.querySelector(".claimable-bonus__icon");
            if (bonus) {
                window.lastPointsClaimed = Date.now();
                setTimeout(() => {
                    bonus.click();
                    console.log("[Auto Claimer] Claimed");
                }, 1000);
            }
        });
        setTimeout(() => {
            console.log("[Auto claimer] Observing for Changes...");
            observer.observe(document.body, { childList: true, subtree: true });
        }, 10000);
    } else {
        console.log("[Auto claimer] Unsupported Browser");
    }
})();
