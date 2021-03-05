// ==UserScript==
// @name         Twitch Prime Auto Rust Drops
// @namespace    https://twitch.facepunch.com/
// @version      0.6.7
// @updateURL    https://raw.githubusercontent.com/ErikS270102/Tampermonkey-Scripts/master/Twitch%20Prime%20Auto%20Rust%20Drops.user.js
// @downloadURL  https://raw.githubusercontent.com/ErikS270102/Tampermonkey-Scripts/master/Twitch%20Prime%20Auto%20Rust%20Drops.user.js
// @description  Automatically switches to Rust Streamers that have Drops enabled if url has the "drops" parameter set. (Non-Channel-Specific Drops wont get shown as uncompleted, but by the time the others are done they are too)
// @author       Erik
// @match        https://www.twitch.tv/drops/inventory?checkonly
// @match        https://twitch.facepunch.com/*
// @match        https://www.twitch.tv/*?rustdrops
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.4.1/jquery.min.js
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_notification
// ==/UserScript==

(async () => {
    "use strict";

    var queryInterval;
    var reloadTimeout;

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function onMessage(label, callback) {
        GM_addValueChangeListener(label, (name, old_value, new_value, remote) => {
            if (new_value != "MSG_CLEAR") callback(new_value);
        });
        sendMessage(label, "MSG_CLEAR");
    }

    function sendMessage(label, message) {
        GM_setValue(label, message);
        GM_setValue(label, "MSG_CLEAR");
    }

    function openQueryTabs() {
        GM_openInTab("https://twitch.facepunch.com/?checkonly", { active: false, insert: true });
        GM_openInTab("https://www.twitch.tv/drops/inventory?checkonly", { active: false, insert: true });
    }

    $(async () => {
        if (location.host == "twitch.facepunch.com") {
            if (location.search == "?checkonly") {
                const drops = $("section.streamer-drops a")
                    .toArray()
                    .map((elem) => {
                        return { name: $(elem).find(".drop-footer > .drop-name").text(), url: $(elem).attr("href") + "?rustdrops", live: $(elem).hasClass("is-live") };
                    });
                setTimeout(() => {
                    sendMessage("drops", { type: "FACEPUNCH", drops });
                    window.close();
                }, 1000);
            } else {
                $("section.streamer-drops a").map((i, elem) => {
                    const old = elem.getAttribute("href");
                    elem.setAttribute("href", old + "?rustdrops");
                    return elem;
                });
            }
        } else if (location.href == "https://www.twitch.tv/drops/inventory?checkonly") {
            do {
                console.log($(`[data-test-selector="drops-list__wrapper"] > .tw-tower > .tw-flex`).length);
                await sleep(100);
            } while ($(`[data-test-selector="drops-list__wrapper"] > .tw-tower > .tw-flex`).length == 0);

            $(`[data-test-selector="DropsCampaignInProgressRewardPresentation-claim-button"]`).trigger("click");
            await sleep(4000);
            const drops = $(`[data-test-selector="drops-list__wrapper"] > .tw-tower > .tw-flex`)
                .toArray()
                .filter((e) => {
                    return $(e).find(`[data-test-selector="awarded-drop__game-name"]`).text() == "Rust";
                })
                .map((e) => {
                    return $(e).find(`[data-test-selector="awarded-drop__drop-name"]`).text();
                });
            console.log(drops);

            setTimeout(() => {
                sendMessage("drops", { type: "TWITCH", drops });
                window.close();
            }, 1000);
        } else if (location.host == "www.twitch.tv") {
            let fpDrops = [];
            let twDrops = [];
            let remainingDrops = [];
            let remainingDropsLive = [];
            onMessage("drops", (msg) => {
                console.log("[Auto Rust Drops] MSG:", msg);
                if (msg.type == "TWITCH") twDrops = msg.drops;
                if (msg.type == "FACEPUNCH") fpDrops = msg.drops;

                if (msg.type == "TWITCH" && fpDrops.length > 0) {
                    function rpl(s) {
                        return s.toLowerCase().replace(/[-_\s]/, "");
                    }
                    remainingDrops = fpDrops.filter((fp) => !twDrops.some((tw) => rpl(tw) == rpl(fp.name) || rpl(tw).startsWith(new URL(fp.url).pathname.substring(1))));
                    remainingDropsLive = remainingDrops.filter((drop) => drop.live);

                    const currentDrop = remainingDropsLive.find((drop) => drop.url == location.href);
                    if (currentDrop) {
                        console.log(`[Auto Rust Drops] %c${currentDrop.name} %cStill not claimed`, "color: purple; font-weight: bold;", "color: none");
                    } else if (remainingDrops.length > 0) {
                        if (remainingDropsLive.length > 0) {
                            location.assign(remainingDropsLive[0].url);
                        } else {
                            console.log(`[Auto Rust Drops] %cNobody Online :( %cRemaining: %c\n${remainingDrops.map((drop) => drop.name).join("\n")}`, "color: red; font-weight: bold;", "color: none", "color: purple; font-weight: bold;");
                            const firstLive = fpDrops.find((fp) => fp.live);
                            if (firstLive && location.href != firstLive.url) location.assign(firstLive.url);
                        }
                    } else if (remainingDrops.length == 0) {
                        clearInterval(queryInterval);
                        clearTimeout(reloadTimeout);
                        GM_notification("All Rust Drops Claimed!", "All Rust Twitch Prime Drops have been claimed!", "https://twitch.facepunch.com/favicon.png");
                    }
                }
            });

            openQueryTabs();
            queryInterval = setInterval(openQueryTabs, 5 * 60000); // Check for Drops every 5min
            reloadTimeout = setTimeout(location.reload, 30 * 60000); // Reload every 30min (Just to make sure Stream is Running)
        }
    });
})();
