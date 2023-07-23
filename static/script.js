import QrScanner from "./qr-scanner.min.js";
import hljs from 'https://unpkg.com/@highlightjs/cdn-assets@11.8.0/es/highlight.min.js';

hljs.safeMode();

let qr = document.getElementById("qr");
const action = document.querySelector(".action");
let appState = {};

let ws;

function getTemplate(id) {
    let template = document.getElementById(id);
    return template.content.firstElementChild.cloneNode(true);
}

async function disconnect() {
    if (ws) {
        try {
            ws.manuallyClosed = true;
            await ws.close();
        } catch (e) {
            console.log("Ignoring error while manually closing socket: ", e);
        } finally {
            // ws = null;
        }
    }
}

function connect() {
    return new Promise(async (resolve, reject) => {
        await disconnect();
        let protocol = "ws";

        if (window.location.protocol.includes('https')) {
            protocol = 'wss';
        }
        console.log("🟡 Connecting...");
        ws = new WebSocket(`${protocol}://${window.location.host}/ws/new`);

        ws.addEventListener("open", (e) => {
            resolve(ws);
            console.log("🟢 Connected.");
        });

        ws.addEventListener("message", async (e) => {
            let data = JSON.parse(e.data);
            console.log("data: ", data);

            switch (data["@type"]) {
                case "refresh": {
                    action.innerHTML = "";
                    appState.token = data["token"];
                    makeQR(appState.token);
                    qr.animateQRCode(FadeInTopDown);
                    break;
                }
                case "connected": {
                    action.innerHTML = "";
                    action.appendChild(getTemplate("receive-link"));
                    break;
                }
                case "pair-completed": {
                    action.innerHTML = "";
                    let elem = getTemplate("code-editor");
                    action.appendChild(elem);
                    let notepad = elem.querySelector(".notepad");

                    let send = elem.querySelector(".send-button");
                    send.addEventListener("click", async (e) => {
                        await ws.send(JSON.stringify({
                            "@type": "content",
                            "content": notepad.value,
                        }));

                        action.innerHTML = "";
                        action.appendChild(getTemplate("success"));
                    });
                    break;
                }
                case "content": {
                    let container = action.querySelector(".content-container");
                    container.classList.remove("spin");
                    container.innerHTML = "";
                    let pre = document.createElement("pre");
                    let code = document.createElement("code");
                    pre.append(code);
                    container.append(pre);
                    code.textContent = data["data"];
                    hljs.highlightElement(code);
                    break;
                }
                case "code-not-found": {
                    if (appState.action === 1) {
                        action.querySelectorAll(".error").forEach(e => e.remove());
                        let elem = getTemplate("code-not-found");
                        elem.querySelector(".code").innerText = data["code"];
                        action.appendChild(elem);
                    }
                    break;
                }
            }
        });

        ws.addEventListener("close", (e) => {
            reject(ws);
            console.log("🔴 Connection closed");
            qr.animateQRCode(FadeOutTopDown);

            if (ws.manuallyClosed) {
                console.log("🔘 Manually closed socket");
                ws = null;
                return;
            }

            ws = null;
            console.log('🟡 Reconnection in 1 second.', e.reason);
            setTimeout(async () => {
                await connect();
                await setState(0);
            }, 1000);
        });

        ws.addEventListener("error", (e) => {
            reject(ws);
            console.error('🔴 Socket error: ', e.message);
            ws.close();
        });
    });
}

const FadeInTopDown = (targets, _x, y, _count, _entity) => {
    return {
        targets,
        from: y * 20,
        duration: 400,
        web: {
            opacity: [0, 1],
        },
    };
};

const FadeOutTopDown = (targets, _x, y, _count, _entity) => {
    return {
        targets,
        from: y * 20,
        duration: 400,
        web: {
            opacity: [1, 0],
        },
    };
};


const switcher = document.querySelector(".switcher");
const selector = document.querySelector(".selector");
const inner = document.querySelector(".inner");

// https://webdesign.tutsplus.com/tutorials/javascript-debounce-and-throttle--cms-36783
let throttlePause;
const throttle = (callback, time) => {
    //don't run the function if throttlePause is true
    if (throttlePause) return;
    //set throttlePause to true after the if condition. This allows the function to be run once
    throttlePause = true;
    //setTimeout runs the callback within the specified time
    setTimeout(() => {
        callback();
        //throttlePause is set to false once the function has been called, allowing the throttle function to loop
        throttlePause = false;
    }, time);
};

function makeQR(token) {
    let container = document.createElement("div");
    container.classList.add("qr-container");
    qr = document.createElement("qr-code");
    qr.setAttribute("id", "qr");
    qr.setAttribute("contents", token);
    qr.setAttribute("module-color", "black");
    qr.setAttribute("position-ring-color", "black");
    qr.setAttribute("position-center-color", "black");
    qr.setAttribute("mask-x-to-y-ratio", "1");
    qr.setAttribute("squares", "false");
    qr.setAttribute("style", `
        background-color: #fff;
        margin: 0;
        width: 100%;
        height: 100%;
    `);
    container.append(qr);
    action.append(container);

    // let interval;
    qr.addEventListener('codeRendered', () => {
        qr.animateQRCode("FadeInCenterOut");
        // clearInterval(interval);
        // interval = setInterval(() => qr.animateQRCode('RadialRipple'), 5000);
    });

    // show code
    let elem = getTemplate("copy-code");
    action.appendChild(elem);
    let tokenElem = elem.querySelector(".token");
    tokenElem.value = token;
    let input = elem.querySelector("input");

    async function handler() {
        await navigator.clipboard.writeText(tokenElem.innerText.trim());
        input.focus();
        input.setSelectionRange(0, input.value.length);
    }

    elem.querySelector("button").addEventListener("click", handler);
    input.addEventListener("click", handler);
    return qr;
}

async function setState(state) {
    appState.action = state;
    switcher.setAttribute("data-state", state);
    let nthChild = inner.children.item(state);
    let box = nthChild.getBoundingClientRect();

    switcher.querySelector(".selected")?.classList.remove("selected");
    nthChild.classList.add("selected");

    let selectorStyle =
        selector.currentStyle || window.getComputedStyle(selector);
    selector.style.width = `${
        box.width -
        parseInt(selectorStyle.marginLeft) -
        parseInt(selectorStyle.marginRight)
    }px`;
    selector.style.height = `${
        box.height -
        parseInt(selectorStyle.marginTop) -
        parseInt(selectorStyle.marginBottom)
    }px`;

    let sBox = switcher.getBoundingClientRect();
    selector.style.transform = `
    translateX(${box.left - sBox.left}px)
    translateY(${box.top - sBox.top}px)
  `;

    await ws.send(JSON.stringify({
        "@type": "state",
        "state": state,
    }));

    // app specific code
    switch (state) {
        case 0: { // Receive
            action.innerHTML = "";
            makeQR(appState.token);
            // connect();
            break;
        }
        case 1: { // Send
            // disconnect();
            action.innerHTML = "";

            let scanner = document.createElement("video");
            scanner.classList.add("scanner");
            action.append(scanner);

            let elem = getTemplate("use-code");
            action.appendChild(elem);
            let input = elem.querySelector("input");
            let submit = elem.querySelector("button");

            async function callback(token) {
                if (token === appState.token) {
                    action.querySelectorAll(".error").forEach(e => e.remove());
                    action.appendChild(getTemplate("this-is-your-code"));
                    return;
                }
                console.log("Sending pair request", ws);
                await ws.send(JSON.stringify({
                    "@type": "pair",
                    "target": token,
                }));
            }

            async function done() {
                await callback(input.value.trim().toUpperCase());
            }
            submit.addEventListener("click", () => throttle(done, 500));
            input.addEventListener("keypress", async (e) => {
                e = e || window.event;
                if (e.keyCode === 13) {
                    e.preventDefault();
                    throttle(done, 500);
                }
            });

            try {
                const qrScanner = new QrScanner(
                    scanner,
                    async (result) => {
                        console.log('decoded qr code: ', result);
                        await callback(result["data"]);  // scanned token
                    },
                    {
                        returnDetailedScanResult: true,
                        highlightScanRegion: true,
                        highlightCodeOutline: true,
                    },
                );

                await qrScanner.start();
            } catch (e) {
                let info = document.createElement("p");
                info.innerText = `Camera not found: ${e}`;
                action.append(info);
            }
            break;
        }
    }
}

switcher.addEventListener("click", async (e) => {
    let current = parseInt(switcher.getAttribute("data-state")) || 0;
    let state = ++current % inner.children.length;

    await setState(state);
});

/* window.addEventListener("resize", () =>
    throttle(() => setState(currentState), 1000)
); */

let currentState = 0;
connect().then(async () => await setState(0));
