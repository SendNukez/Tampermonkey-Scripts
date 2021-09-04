// ==UserScript==
// @name         Twitch Prime Auto Rust Drops
// @homepage     https://twitch.facepunch.com/
// @version      2.7.1
// @downloadURL  https://github.com/ErikS270102/Tampermonkey-Scripts/raw/master/scripts/Twitch%20Prime%20Auto%20Rust%20Drops.user.js
// @description  Automatically switches to Rust Streamers that have Drops enabled if url has the "drops" parameter set. (Just klick on a Streamer on https://twitch.facepunch.com/)
// @author       Send_Nukez
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

var RustAutoDrops = {
    isLoggedIn: false,
    isRustCategory: false,
    hasPopup: false,
    popupShown: false,
    currentDrop: null,
    fpDrops: [],
    remainingDrops: [],
    remainingDropsLive: [],
    queryInterval: null,
    reloadTimeout: null,
    stopped: false
};

(async () => {
    "use strict";

    GM_registerMenuCommand("Open Drops Page", () => {
        GM_openInTab("https://twitch.facepunch.com/", { active: true, insert: true });
    });

    GM_config.init({
        id: "Config",
        fields: {
            popupopen: {
                label: "Open Popup by default",
                type: "checkbox",
                default: false
            },
            progressonfp: {
                label: "Show Progress on the Facepunch Drops Site",
                type: "checkbox",
                default: true
            },
            debug: {
                label: "Debug Mode",
                type: "checkbox",
                default: false
            }
        }
    });
    GM_registerMenuCommand("Settings", () => {
        GM_config.open();
    });

    function log(...data) {
        console.log("%cAuto Rust Drops:", "color: #1e2020; background-color: #cd412b; padding: 2px 5px; border-radius: 5px; font-weight: bold;", ...data);
    }

    function logDebug(...data) {
        if (GM_config.get("debug")) console.log("%cDEBUG%cAuto Rust Drops:", "color: #1e2020; background-color: #109909; padding: 2px 5px; border-radius: 5px; font-weight: bold; margin-right: 5px;", "color: #1e2020; background-color: #cd412b; padding: 2px 5px; border-radius: 5px; font-weight: bold;", ...data);
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

    function start() {
        if (RustAutoDrops.queryInterval != null) return; // So it dosen't open Query Tabs every time start() is called
        if (RustAutoDrops.isLoggedIn && RustAutoDrops.isRustCategory) {
            openQueryTabs();
            RustAutoDrops.queryInterval = setInterval(openQueryTabs, 5 * 60000); // Check for Drops every 5min
            RustAutoDrops.reloadTimeout = setTimeout(location.reload, 30 * 60000); // Reload every 30min (Just to make sure Stream is Running)
        }
    }

    function stop() {
        RustAutoDrops.stopped = true;
        clearInterval(RustAutoDrops.queryInterval);
        clearTimeout(RustAutoDrops.reloadTimeout);

        const url = new URL(location.href);
        if (url.searchParams.has("rustdrops")) {
            url.searchParams.delete("rustdrops");
            history.replaceState({}, document.title, url.toString());
        }
    }

    function updatePopup(toggle = false) {
        if (!RustAutoDrops.hasPopup) {
            GM_addStyle(/*css*/ `
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
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                    grid-area: Current;
                }

                .rustdrops-popup-name-container {
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                }

                .rustdrops-popup-name-container .live {
                    height: 100%;
                    line-height: initial;
                    font-size: 12px;
                    color: white;
                    background-color: red;
                    font-weight: bold;
                    padding: 1px 2px;
                    margin-left: 5px;
                    border-radius: 3px;
                }

                .rustdrops-popup-buttons {
                    grid-area: Buttons;
                    display: grid;
                    grid-auto-flow: column;
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

                .rustdrops-popup .rustdrops-popup-button-collapse {
                    transform: rotate(180deg);
                }

                .rustdrops-popup.collapsed .rustdrops-popup-button-collapse {
                    transform: rotate(0deg);
                }

                .rustdrops-popup-button-collapse > svg {
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

                .rustdrops-popup-list {
                    grid-area: List;
                    width: calc(100% - 20px); /* 100% - margin */
                    display: grid;
                    gap: 5px 15px;
                    margin: 0px 10px;
                    padding: 3px 0px; /* for the LIVE badges to on top/bottom not to be cut off bc of overflow: hidden */
                    overflow: hidden;
                    grid-template-columns: repeat(2, 1fr);
                    grid-auto-rows: auto;
                }

                .rustdrops-popup.collapsed .rustdrops-popup-list {
                    display: none;
                }

                .rustdrops-popup-list > div {
                    width: fit-content;
                    height: 1.2em;
                    line-height: 1.2em;
                    display: flex;
                    gap: 5px; 
                }

                .rustdrops-popup-list .link {
                    color: var(--color-text-link);
                }

                .rustdrops-popup-list .name {
                    overflow: hidden;
                    white-space: nowrap;
                    text-overflow: ellipsis;
                }

                .rustdrops-popup-list .badges {
                    display: flex;
                    gap: 5px;
                }

                .rustdrops-popup-list .badges > * {
                    display: inline-block;
                }

                .rustdrops-popup-list .badges > i {
                    position: relative;
                    top: 1px;
                }

                .rustdrops-popup-list .live {
                    line-height: initial;
                    font-size: 9px;
                    color: white;
                    background-color: red;
                    font-weight: bold;
                    padding: 2px 4px;
                    border-radius: 3px;
                }

                .rustdrops-popup-list .p-icon {
                    position: relative;
                    overflow: hidden;
                    border-radius: 50%;
                    width: 12px;
                    height: 12px;
                    border: 2px solid #ffbb00;
                    margin-bottom: -1px;
                }

                .rustdrops-popup-list .p-icon > div {
                    position: absolute;
                    width: calc(100% + 10px);
                    left: -5px;
                    bottom: 0px;
                    background-color: #ffbb00;
                }
            `);

            $(".top-nav__search-container").append(/*html*/ `
                <div class="rustdrops-popup${GM_config.get("popupopen") ? "" : " collapsed"}">
                    <div class="rustdrops-popup-current">
                        <div class="rustdrops-popup-name-container"><p class="rustdrops-popup-name">NAME</p><span class="live">LIVE</span></div>
                        <div class="rustdrops-popup-progress-container">
                            <div class="rustdrops-popup-progress-text muted">PRECENTAGE</div>
                            <div class="rustdrops-popup-progress-outer"><div class="rustdrops-popup-progress-inner" style="width: 0%;"></div></div>
                        </div>
                    </div>
                    <div class="rustdrops-popup-buttons">
                        <button class="rustdrops-popup-button-drops" title="Show List of Drops"><i class="fab fa-dropbox"></i></button>
                        <button class="rustdrops-popup-button-refresh" title="Refresh"><i class="fas fa-redo" style="font-size: 11px;"></i></button>
                        <button class="rustdrops-popup-button-collapse" title="Toggle Collapsed"><svg width="20px" height="20px" version="1.1" viewBox="0 0 20 20" x="0px" y="0px"><g><path d="M14.5 6.5L10 11 5.5 6.5 4 8l6 6 6-6-1.5-1.5z"></path></g></svg></button>
                    </div>
                    <div class="rustdrops-popup-list"></div>
                </div>
            `);

            $(".rustdrops-popup-button-refresh").on("click", (e) => {
                openQueryTabs();
            });

            $(".rustdrops-popup-button-collapse").on("click", (e) => {
                updatePopup(true);
            });

            $(".rustdrops-popup-button-drops").on("click", (e) => {
                GM_openInTab("https://twitch.facepunch.com/", { active: true, insert: true });
            });

            RustAutoDrops.hasPopup = true;
        }

        if (RustAutoDrops.currentDrop) {
            const progress = RustAutoDrops.currentDrop.progress;
            $(".rustdrops-popup-name-container .live").css("display", RustAutoDrops.currentDrop.isLive ? "inherit" : "none");
            $(".rustdrops-popup-name").text(RustAutoDrops.currentDrop.name);
            $(".rustdrops-popup-progress-text").html(`${progress < 100 ? `${progress}%` : "Done!"}${progress == 100 ? `<i class="fas fa-check-circle" style="color: #00c7ac; margin-left: 5px;"></i>` : ""}`);
            $(".rustdrops-popup-progress-inner").attr("style", `width: ${progress}%;${progress == 100 ? " background-color: #00c7ac;" : ""}`);
        }
        if (RustAutoDrops.fpDrops.length > 0) {
            $(".rustdrops-popup .rustdrops-popup-list").html(
                RustAutoDrops.fpDrops
                    .filter((drop) => new URL(drop.url).pathname != location.pathname)
                    .map((drop) => {
                        const isTwitchDrop = drop.url.includes("twitch.tv");
                        // The REPLACEME is for things like the "Trauzooka" where i can't just replace the first word bc there is only one word
                        const dropNameWithoutCreatorName = (drop.name.split(" ").length <= 1 ? "REPLACEME " + drop.name : drop.name).replace(/^\S*/i, "").trim();
                        // Add the /creatorX link
                        let dropNameWithLink;
                        if (isTwitchDrop) dropNameWithLink = `<a class="link" href="${drop.url}">${new URL(drop.url).pathname.toLowerCase()}</a><span class="name">${dropNameWithoutCreatorName}</span>`;
                        if (!isTwitchDrop) dropNameWithLink = `<span class="name">${drop.name}</span>`;
                        if (drop.url == location.href) return "";
                        if (drop.progress == 100) return `<div title="${drop.name} - Done!" class="small done">${dropNameWithLink}<div class="badges">${drop.isLive ? `<span class="live">LIVE</span>` : ""}<i class="fas fa-check-circle" style="color: #00c7ac;"></i></div></div>`;
                        return `<div title="${drop.name} - ${drop.progress}%" class="small">${dropNameWithLink}<div class="badges">${drop.isLive ? `<span class="live">LIVE</span>` : ""}${drop.progress > 0 ? `<div class="p-icon"><div style="height: ${drop.progress}%;"></div></div>` : ""}</div></div>`;
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
                GM_addStyle(/*css*/ `
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
                    if (msg.type == "FACEPUNCH") RustAutoDrops.fpDrops = msg.drops;
                    if (msg.type == "TWITCH") RustAutoDrops.twDrops = msg.drops;
                    if (msg.type != "TWITCH") return;

                    RustAutoDrops.twDrops = msg.drops;
                    RustAutoDrops.remainingDrops = RustAutoDrops.fpDrops.filter((fp) => !RustAutoDrops.twDrops.some((tw) => isSameFpTw(fp, tw)));
                    RustAutoDrops.remainingDropsLive = RustAutoDrops.remainingDrops.filter((drop) => drop.isTwitch && drop.isLive);
                    RustAutoDrops.fpDrops = RustAutoDrops.fpDrops.map((fp) => {
                        const claimed = !RustAutoDrops.remainingDrops.find((e) => e.name == fp.name);
                        return { ...fp, progress: (msg.percentages.find((percentage) => isSameFpTw(fp, percentage.name)) ?? { percentage: claimed ? 100 : 0 }).percentage };
                    });

                    $(".drop")
                        .toArray()
                        .forEach((e) => {
                            const drop = RustAutoDrops.fpDrops.find((fp) => fp.name == $(e).find(".drop-name").text());

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

            logDebug(drops);
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

            logDebug("Drops: ", drops);
            logDebug("Percentages: ", percentages);
            sendMessage("drops", { type: "TWITCH", drops, percentages });
            window.close();
            close();
        } else if (location.host == "www.twitch.tv" && /^\/[a-z0-9-_]+$/i.test(location.pathname) && params.has("rustdrops")) {
            let alreadyQueried = {};

            onMessage("drops", (msg) => {
                if (RustAutoDrops.stopped) return;
                logDebug(`${msg.type} MSG: `, msg);
                if (msg.type == "CLAIMED") log(`Claimed ${msg.name}!`);
                if (msg.type == "FACEPUNCH") RustAutoDrops.fpDrops = msg.drops;
                if (msg.type == "TWITCH") RustAutoDrops.twDrops = msg.drops;

                if (msg.type == "FACEPUNCH" && RustAutoDrops.fpDrops.length == 0) {
                    log("No Drops Available");
                    stop();
                }

                if (msg.type == "TWITCH" && RustAutoDrops.fpDrops.length > 0) {
                    if (!alreadyQueried.TWITCH) log("Watching for Drops...");

                    RustAutoDrops.remainingDrops = RustAutoDrops.fpDrops.filter((fp) => !RustAutoDrops.twDrops.some((tw) => isSameFpTw(fp, tw)));
                    RustAutoDrops.remainingDropsLive = RustAutoDrops.remainingDrops.filter((drop) => drop.isTwitch && drop.isLive);
                    RustAutoDrops.fpDrops = RustAutoDrops.fpDrops.map((fp) => {
                        const claimed = !RustAutoDrops.remainingDrops.find((e) => e.name == fp.name);
                        return { ...fp, progress: (msg.percentages.find((percentage) => isSameFpTw(fp, percentage.name)) ?? { percentage: claimed ? 100 : 0 }).percentage };
                    });

                    const key = RustAutoDrops.fpDrops.map((fp) => new URL(fp.url).pathname.substring(1)).join("-");
                    const currentDrop = RustAutoDrops.remainingDropsLive.find((drop) => new URL(drop.url).pathname == location.pathname);
                    RustAutoDrops.currentDrop = RustAutoDrops.fpDrops.find((drop) => new URL(drop.url).pathname == location.pathname);

                    updatePopup();

                    if (!currentDrop && RustAutoDrops.remainingDrops.length > 0) {
                        if (RustAutoDrops.remainingDropsLive.length > 0) {
                            location.assign(RustAutoDrops.remainingDropsLive[0].url);
                        } else {
                            log(`It seems like nobody with Drops is online. ${RustAutoDrops.remainingDrops.length} Drops remaining`);
                        }
                    } else if (!currentDrop && RustAutoDrops.remainingDrops.length == 0) {
                        if (GM_getValue("claimed", []).includes(key)) {
                            log("Drops have already been claimed!");
                        } else {
                            log("All Drops Claimed!");
                            GM_setValue("claimed", [...GM_getValue("claimed", []), key]);
                        }

                        stop();
                    }
                }

                alreadyQueried[msg.type] = true;
            });

            const categoryObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.target != null && mutation.target.nodeName.toLowerCase() == "body" && $(mutation.target).hasClass("logged-in")) {
                        RustAutoDrops.isLoggedIn = true;
                        start();
                    }
                    if (mutation.addedNodes) {
                        mutation.addedNodes.forEach((node) => {
                            if ($(node).attr("data-a-target") == "stream-game-link") {
                                if ($(node).text() == "Rust") {
                                    RustAutoDrops.isRustCategory = true;
                                    start();
                                } else {
                                    stop();
                                }
                            }
                        });
                    }

                    if (RustAutoDrops.isLoggedIn && RustAutoDrops.isRustCategory) categoryObserver.disconnect();
                });
            });
            categoryObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    });
})();
