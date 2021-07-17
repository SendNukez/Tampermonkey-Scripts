// ==UserScript==
// @name         Twitch Prime Auto Rust Drops
// @homepage     https://twitch.facepunch.com/
// @version      2.6.2
// @downloadURL  https://github.com/ErikS270102/Tampermonkey-Scripts/raw/master/scripts/Twitch%20Prime%20Auto%20Rust%20Drops.user.js
// @description  Automatically switches to Rust Streamers that have Drops enabled if url has the "drops" parameter set. (Just klick on a Streamer on https://twitch.facepunch.com/)
// @author       Erik
// @match        https://www.twitch.tv/**
// @match        https://twitch.facepunch.com/*
// @noframes
// @require      https://openuserjs.org/src/libs/sizzle/GM_config.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.4.1/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.1/moment-with-locales.min.js
// @require      https://kit.fontawesome.com/acc839bd0c.js
// @require      https://unpkg.com/string-similarity/umd/string-similarity.min.js
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_getResourceText
// @grant        GM_addStyle
// ==/UserScript==

(async () => {
    "use strict";

    GM_registerMenuCommand("Open Drops Page", () => {
        GM_openInTab("https://twitch.facepunch.com/", { active: true, insert: true });
    });

    GM_config.init({
        id: "Config",
        fields: {
            /*notifications: {
                label: "Enable Desktop Notifications",
                type: "checkbox",
                default: true
            },*/
            popupopen: {
                label: "Open Popup by default",
                type: "checkbox",
                default: false
            },
            progressonfp: {
                label: "Show Progress on the Facepunch Drops Site",
                type: "checkbox",
                default: true
            }
        }
    });
    GM_registerMenuCommand("Settings", () => {
        GM_config.open();
    });

    window.hasPopup = false;
    window.popupShown = false;
    window.currentDrop = null;
    window.fpDrops = [];
    window.remainingDrops = [];
    window.remainingDropsLive = [];
    window.queryInterval = null;
    window.reloadTimeout = null;
    window.stopped = false;

    function log(...data) {
        console.log("%cAuto Rust Drops:", "color: #1e2020; background-color: #cd412b; padding: 2px 5px; border-radius: 5px; font-weight: bold;", ...data);
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function rpl(s) {
        return s.toLowerCase().replace(/[^a-z]/g, "");
    }
    function rpl1st(s) {
        return rpl(s.split(" ")[0]);
    }

    function isSameFpTw(fp, tw) {
        return rpl(tw) == rpl(fp.name) || rpl1st(tw) == rpl1st(fp.name) || rpl(tw).startsWith(rpl(new URL(fp.url).pathname)) || stringSimilarity.compareTwoStrings(tw, fp.name) >= 0.8;
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

    function openQueryTabs(type = "ALL") {
        if (!type) type = "ALL";
        type = type.toUpperCase();

        if (type == "ALL" || type == "FACEPUNCH") GM_openInTab("https://twitch.facepunch.com/?checkonly", { active: false, insert: true });
        if (type == "ALL" || type == "TWITCH") GM_openInTab("https://www.twitch.tv/drops/inventory?checkonly", { active: false, insert: true });
    }

    function stop() {
        window.stopped = true;
        clearInterval(window.queryInterval);
        clearTimeout(window.reloadTimeout);
    }

    function sendNotification(title, message, iconUrl, desktopNotification = true) {
        //if (desktopNotification && GM_config.get("notifications")) GM_notification(title, message, iconUrl ?? "https://twitch.facepunch.com/favicon.png");
    }

    function updatePopup(toggle = false) {
        if (!window.hasPopup) {
            GM_addStyle(`
                .rustdrops-popup {
                    position: absolute;
                    display: grid;
                    grid-template-columns: 1fr auto;
                    grid-template-rows: auto 1fr;
                    gap: 1rem 1rem;
                    grid-template-areas:
                        "Current Buttons"
                        "List List";
                    top: 6rem;
                    left: -50px;
                    padding: 1.5rem;
                    width: calc(100% + 100px);
                    overflow: hidden;
                    background-color: var(--color-background-base);
                    border-radius: var(--border-radius-large);
                    border: var(--border-width-default) solid var(--color-border-base);
                    box-shadow: var(--shadow-elevation-2);
                    color: var(--color-text-base);
                    transition: height 500ms ease-in;
                }

                .rustdrops-popup.collapsed {
                    row-gap: 0px;
                    transition: height 500ms ease-out;
                }

                .rustdrops-popup-current {
                    grid-area: Current;
                }

                .rustdrops-popup-buttons {
                    grid-area: Buttons;
                    display: grid;
                    grid-template-rows: 1fr;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 1rem;
                }

                .rustdrops-popup-buttons > button {
                    display: flex;
                    align-items: center;
                    margin: auto;
                    width: 2.4rem;
                    height: 2.4rem;
                    border-radius: var(--border-radius-large);
                    /*transform: rotate(0deg);*/
                    /*transition: transform 250ms ease;*/
                }

                .rustdrops-popup-buttons > button > * {
                    margin: auto
                }

                .rustdrops-popup-buttons > button:hover {
                    background-color: var(--color-background-button-text-hover);
                }

                .rustdrops-popup.collapsed .rustdrops-popup-collapse {
                    transform: rotate(180deg);
                }

                .rustdrops-popup-collapse > svg {
                    display: block;
                    fill: var(--color-text-base);
                }

                .rustdrops-popup .done {
                    opacity: 0.6;
                    color: var(--color-text-alt-2) !important;
                }

                .rustdrops-popup .muted {
                    color: var(--color-text-alt-2) !important;
                }

                .rustdrops-popup .small {
                    font-size: var(--font-size-8) !important;
                }

                .rustdrops-popup p {
                    font-size: var(--font-size-5) !important;
                }

                .rustdrops-popup-progress-container {
                    width: 100%;
                    display: grid;
                    grid-template-columns: auto 1fr;
                    gap: 0px 1rem;
                }

                .rustdrops-popup-progress-outer {
                    height: 0.5rem;
                    width: 100%;
                    margin: auto;
                    border-radius: var(--border-radius-large)!important;
                    background: var(--color-background-progress);
                    overflow: hidden;
                }

                .rustdrops-popup-progress-inner {
                    height: 100%;
                    width: 0%;
                    background-color: var(--color-background-progress-status);
                    transition: width 1s ease-in-out, color 500ms ease;
                }

                .rustdrops-popup .rustdrops-popup-list {
                    grid-area: List;
                    display: block;
                    width: calc(100% - 20px);
                    display: grid;
                    margin: 0px 10px;
                    overflow: hidden;
                    grid-template-columns: repeat(2, 1fr);
                    grid-auto-rows: auto;
                }

                .rustdrops-popup.collapsed .rustdrops-popup-list {
                    display: none;
                }

                .rustdrops-popup .rustdrops-popup-list .live,
                .rustdrops-popup .rustdrops-popup-list .p-icon,
                .rustdrops-popup .rustdrops-popup-list i {
                    margin-left: 5px;
                    display: inline-block;
                }

                .rustdrops-popup .rustdrops-popup-list .live {
                    font-size: 10px;
                    color: white;
                    background-color: red;
                    font-weight: bold;
                    padding: 2px 4px;
                    border-radius: 3px;
                }

                .rustdrops-popup .rustdrops-popup-list a {
                    color: var(--color-text-link);
                }

                .rustdrops-popup .rustdrops-popup-list .p-icon {
                    position: relative;
                    overflow: hidden;
                    border-radius: 50%;
                    width: 12px;
                    height: 12px;
                    border: 2px solid #ffbb00;
                    margin-bottom: -1px;
                }

                .rustdrops-popup .rustdrops-popup-list .p-icon > div {
                    position: absolute;
                    width: calc(100% + 10px);
                    left: -5px;
                    bottom: 0px;
                    background-color: #ffbb00;
                }
            `);

            $(".top-nav__search-container").append(`
                <div class="rustdrops-popup${GM_config.get("popupopen") ? "" : " collapsed"}">
                    <div class="rustdrops-popup-current">
                        <p class="rustdrops-popup-name">NAME</p>
                        <div class="rustdrops-popup-progress-container">
                            <div class="rustdrops-popup-progress-text muted">PRECENTAGE</div>
                            <div class="rustdrops-popup-progress-outer"><div class="rustdrops-popup-progress-inner" style="width: 0%;"></div></div>
                        </div>
                    </div>
                    <div class="rustdrops-popup-buttons">
                        <button class="rustdrops-popup-refresh"><i class="fas fa-redo" style="font-size: 11px;"></i></button>
                        <button class="rustdrops-popup-collapse"><svg width="20px" height="20px" version="1.1" viewBox="0 0 20 20" x="0px" y="0px"><g><path d="M14.5 6.5L10 11 5.5 6.5 4 8l6 6 6-6-1.5-1.5z"></path></g></svg></button>
                    </div>
                    <div class="rustdrops-popup-list"></div>
                </div>
            `);

            $(".rustdrops-popup-refresh").on("click", (e) => {
                openQueryTabs();
            });

            $(".rustdrops-popup-collapse").on("click", (e) => {
                updatePopup(true);
            });

            window.hasPopup = true;
        }

        if (window.currentDrop) {
            const progress = window.currentDrop.progress;
            $(".rustdrops-popup-name").text(window.currentDrop.name);
            $(".rustdrops-popup-progress-text").html(`${progress < 100 ? `${progress}%` : "Done!"}${progress == 100 ? `<i class="fas fa-check-circle" style="color: #00c7ac; margin-left: 5px;"></i>` : ""}`);
            $(".rustdrops-popup-progress-inner").attr("style", `width: ${progress}%;${progress == 100 ? " background-color: #00c7ac;" : ""}`);
        }
        if (window.fpDrops.length > 0) {
            $(".rustdrops-popup .rustdrops-popup-list").html(
                window.fpDrops
                    .filter((drop) => new URL(drop.url).pathname != location.pathname)
                    .map((drop) => {
                        const isTwitchDrop = drop.url.includes("twitch.tv");
                        // The REPLACEME is for things like the "Trauzooka" where i can't just replace the first word bc there is only one word
                        const dropNameWithLink = isTwitchDrop ? (drop.name.split(" ").length <= 1 ? "REPLACEME " + drop.name : drop.name).replace(/^\S*/i, `<a href="${drop.url}">${new URL(drop.url).pathname.toLowerCase()}</a>`) : drop.name;
                        if (drop.url == location.href) return "";
                        if (drop.progress == 100) return `<div title="Done!" class="small done">${dropNameWithLink}<i class="fas fa-check-circle" style="color: #00c7ac;"></i></div>`;
                        return `<div title="${drop.progress}%" class="small">${dropNameWithLink}${drop.progress > 0 ? `<div class="p-icon"><div style="height: ${drop.progress}%;"></div></div>` : ""}${drop.isLive ? `<span class="live">LIVE</span>` : ""}</div>`;
                    })
                    .join("")
            );
        }

        if (toggle) $(".rustdrops-popup").toggleClass("collapsed");
    }

    $(async () => {
        const params = new URL(location.href).searchParams;
        if (location.host == "twitch.facepunch.com") {
            if (GM_config.get("progressonfp") && !params.has("checkonly")) {
                GM_addStyle(`
                    .drop.is-claimed .drop-footer {
                        background-color: #003e36 !important;
                    }

                    .drop.is-live.is-claimed .drop-footer {
                        background-color: #00806f !important;
                    }

                    .drop.in-progress .drop-footer {
                        background-color: #9e7300 !important;
                    }

                    .drop.is-live.in-progress .drop-footer {
                        background-color: #c48f00 !important;
                    }

                    .drop .drop-name i,
                    .drop .drop-name .p-icon {
                        margin-left: 5px;
                    }

                    .drop .drop-name .p-icon {
                        display: inline-block;
                        position: relative;
                        overflow: hidden;
                        border-radius: 50%;
                        width: 1em;
                        height: 1em;
                        border: 2px solid #ffbb00;
                        margin-bottom: -1px;
                    }
    
                    .drop .drop-name .p-icon > div {
                        position: absolute;
                        width: calc(100% + 10px);
                        left: -5px;
                        bottom: 0px;
                        background-color: #ffbb00;
                    }
                `);

                onMessage("drops", (msg) => {
                    if (msg.type == "FACEPUNCH") window.fpDrops = msg.drops;
                    if (msg.type == "TWITCH") window.twDrops = msg.drops;
                    if (msg.type != "TWITCH") return;

                    window.twDrops = msg.drops;
                    window.remainingDrops = window.fpDrops.filter((fp) => !window.twDrops.some((tw) => isSameFpTw(fp, tw)));
                    window.remainingDropsLive = window.remainingDrops.filter((drop) => drop.isTwitch && drop.isLive);
                    window.fpDrops = window.fpDrops.map((fp) => {
                        const claimed = !window.remainingDrops.find((e) => e.name == fp.name);
                        return { ...fp, progress: (msg.percentages.find((percentage) => isSameFpTw(fp, percentage.name)) ?? { percentage: claimed ? 100 : 0 }).percentage };
                    });

                    $(".drop")
                        .toArray()
                        .forEach((e) => {
                            const drop = window.fpDrops.find((fp) => fp.name == $(e).find(".drop-name").text());
                            console.log(e, drop);

                            if (drop.progress == 100) {
                                $(e).attr("title", "Claimed!");
                                $(e).addClass("is-claimed");
                                if ($(e).find(".fa-check-circle").length == 0) $(e).find(".drop-name").append(`<i class="fas fa-check-circle" style="color: #00c7ac;"></i>`);
                            } else if (drop.progress > 0) {
                                $(e).attr("title", `${drop.progress}%`);
                                $(e).addClass("in-progress");
                                if ($(e).find(".p-icon").length == 0) {
                                    $(e).find(".drop-name").append(`<div class="p-icon"><div style="height: ${drop.progress}%;"></div></div>`);
                                } else {
                                    $(e).find(".p-icon > div").attr("style", `height: ${drop.progress}%;`);
                                }
                            }
                        });
                });
                openQueryTabs("TWITCH");
            }

            $("section.streamer-drops a, section.general-drops a")
                .removeAttr("target")
                .map((i, elem) => {
                    const old = elem.getAttribute("href");
                    if (new URL(old).host == "www.twitch.tv") elem.setAttribute("href", old + "?rustdrops");
                    return elem;
                });

            const drops = $(".drop-name")
                .toArray()
                .map((name) => {
                    const parent = $(name).closest(".drop");
                    return { name: $(name).text().trim(), url: parent.attr("href"), isTwitch: !parent.hasClass("generic"), isLive: parent.hasClass("is-live") };
                });

            log(drops);
            sendMessage("drops", { type: "FACEPUNCH", drops });
            if (params.has("checkonly")) window.close();
        } else if (location.href == "https://www.twitch.tv/drops/inventory?checkonly") {
            let tries = 0;
            do {
                if (tries == 100) location.reload();
                tries++;
                await sleep(100);
            } while ($(`[data-test-selector="drops-list__wrapper"] > .tw-tower`).length == 0);
            await sleep(100);

            let claimed = false;
            $(`[data-test-selector="DropsCampaignInProgressRewardPresentation-claim-button"]`).each(function () {
                const parent = $(this).closest(".tw-flex-grow-1");
                sendMessage("drops", { type: "CLAIMED", name: parent.find(".tw-pd-1").text(), image: parent.find("img").attr("src") });
                $(this).trigger("click");
                claimed = true;
            });

            if (claimed) await sleep(4000);

            const lang = $(document.documentElement).attr("lang");
            const percentages = $(`[data-test-selector="DropsCampaignInProgressRewards-container"] > * > *`)
                .toArray()
                .filter((e) => $(e).children().length != 0)
                .filter((e) => !$(e).find(`[data-test-selector="DropsCampaignInProgressRewardPresentation-progress-section"]`).css("visibility").includes("hidden"))
                .map((e) => {
                    return { name: $(e).find("p").first().text(), percentage: Number($(e).find(`[role="progressbar"]`).attr("aria-valuenow")) };
                });
            const drops = $(`[data-test-selector="drops-list__wrapper"] > .tw-tower > *`)
                .toArray()
                .filter((e) => {
                    const agoArr = $(e).find("p").first().text().toLowerCase().split(" ");
                    let daysAgo = 0;
                    if (lang.startsWith("en-")) {
                        if (agoArr[0] == "yesterday") daysAgo = 1; // yesterday
                        if (agoArr.length == 2) daysAgo = Math.abs(moment().subtract(1, agoArr[1]).diff(moment(), "day")); // last year
                        if (agoArr.length == 3) daysAgo = Math.abs(moment().subtract(agoArr[0], agoArr[1]).diff(moment(), "day")); // 2 days ago
                    } else if (lang.startsWith("de-")) {
                        if (agoArr[0] == "gestern") daysAgo = 1;
                        if (agoArr.join(" ") == "letzten monat") daysAgo = 30;
                        if (agoArr.join(" ") == "letztes jahr") daysAgo = 365;
                        if (agoArr.length == 3) {
                            let unit = "days";
                            if (agoArr[2] == "monaten") unit = "months";
                            if (agoArr[2] == "jahren") unit = "years";
                            daysAgo = Math.abs(moment().subtract(agoArr[1], unit).diff(moment(), "day")); // vor 2 tagen
                        }
                    }
                    return $(e).find(`[data-test-selector="awarded-drop__game-name"]`).text() == "Rust" && daysAgo <= 8;
                })
                .map((e) => $(e).find(`[data-test-selector="awarded-drop__drop-name"]`).text().trim());

            log("Drops: ", drops);
            log("Percentages: ", percentages);
            sendMessage("drops", { type: "TWITCH", drops, percentages });
            window.close();
        } else if (location.host == "www.twitch.tv" && /^\/[a-z0-9-_]+$/i.test(location.pathname) && params.has("rustdrops")) {
            let alreadyQueried = {};

            onMessage("drops", (msg) => {
                if (window.stopped) return;
                log(`${msg.type} MSG: `, msg);
                if (msg.type == "CLAIMED") sendNotification("Drop Claimed!", `Claimed ${msg.name}!`, msg.image);
                if (msg.type == "FACEPUNCH") window.fpDrops = msg.drops;
                if (msg.type == "TWITCH") window.twDrops = msg.drops;

                if (msg.type == "FACEPUNCH" && window.fpDrops.length == 0) {
                    sendNotification("No Drops Available", "Didn't find any Drops", null, false);
                    stop();
                }

                if (msg.type == "TWITCH" && window.fpDrops.length > 0) {
                    if (!alreadyQueried.TWITCH) sendNotification("Watching for Drops", "Auto claiming/switching for Drops", null, false);

                    window.remainingDrops = window.fpDrops.filter((fp) => !window.twDrops.some((tw) => isSameFpTw(fp, tw)));
                    window.remainingDropsLive = window.remainingDrops.filter((drop) => drop.isTwitch && drop.isLive);
                    window.fpDrops = window.fpDrops.map((fp) => {
                        const claimed = !window.remainingDrops.find((e) => e.name == fp.name);
                        return { ...fp, progress: (msg.percentages.find((percentage) => isSameFpTw(fp, percentage.name)) ?? { percentage: claimed ? 100 : 0 }).percentage };
                    });

                    const key = window.fpDrops.map((fp) => new URL(fp.url).pathname.substring(1)).join("-");
                    const currentDrop = window.remainingDropsLive.find((drop) => new URL(drop.url).pathname == location.pathname);
                    window.currentDrop = window.fpDrops.find((drop) => new URL(drop.url).pathname == location.pathname);

                    updatePopup();

                    if (!currentDrop && window.remainingDrops.length > 0) {
                        if (window.remainingDropsLive.length > 0) {
                            location.assign(window.remainingDropsLive[0].url);
                        } else {
                            sendNotification("Nobody Online :(", `It seems like nobody with Drops is online. ${window.remainingDrops.length} Drops remaining`, null, false);
                        }
                    } else if (!currentDrop && window.remainingDrops.length == 0) {
                        if (GM_getValue("claimed", []).includes(key)) {
                            sendNotification("All Drops Claimed!", "Drops have already been claimed!", null, false);
                        } else {
                            sendNotification("All Drops Claimed!", "All Drops have been claimed!");
                            GM_setValue("claimed", [...GM_getValue("claimed", []), key]);
                        }

                        stop();
                    }
                }

                alreadyQueried[msg.type] = true;
            });

            const categoryObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (!mutation.addedNodes) return;
                    mutation.addedNodes.forEach((node) => {
                        if ($(node).attr("data-a-target") == "stream-game-link") {
                            if ($(node).text() == "Rust") {
                                openQueryTabs();
                                window.queryInterval = setInterval(openQueryTabs, 5 * 60000); // Check for Drops every 5min
                                window.reloadTimeout = setTimeout(location.reload, 30 * 60000); // Reload every 30min (Just to make sure Stream is Running)
                            } else {
                                const url = new URL(location.href);
                                url.searchParams.delete("rustdrops");
                                history.replaceState({}, document.title, url.toString());
                            }
                            categoryObserver.disconnect();
                        }
                    });
                });
            });
            categoryObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    });
})();
