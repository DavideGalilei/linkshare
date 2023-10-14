import QrScanner from "./qr-scanner.min.js";
import hljs from "https://unpkg.com/@highlightjs/cdn-assets@11.8.0/es/highlight.min.js";

hljs.safeMode();

let qr = document.getElementById("qr");
const action = document.querySelector(".action");
let appState = {
  action: 0,
  token: undefined,
};

let ws;

function showToast(div, text) {
  let toast = document.createElement("div");
  toast.classList.add("toast");
  toast.innerText = text;
  document.querySelector(div)?.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 5000);
}

function getTemplate(id) {
  let template = document.getElementById(id);
  return template.content.cloneNode(true);
}

function cleanErrors() {
  let errors = action.querySelectorAll(".error");
  errors.forEach((e) => e?.remove());
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

    if (window.location.protocol.includes("https")) {
      protocol = "wss";
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
          cleanErrors();
          action.innerHTML = "";
          appState.token = data["token"];
          makeQR(appState.token);
          qr?.animateQRCode(FadeInTopDown);
          break;
        }
        case "connected": {
          document.querySelector(".use-code")?.remove();
          cleanErrors();

          let elem = getTemplate("code-editor");
          action.appendChild(elem);
          let notepad = action.querySelector(".notepad");

          async function sendData(e) {
            if (!notepad.value.trim()) {
              return;
            }

            await ws.send(
              JSON.stringify({
                "@type": "content",
                content: notepad.value,
              })
            );

            notepad.value = "";
            // action.innerHTML = "";
            showToast(".action", "Sent!");
          }

          // textarea Ctrl+Enter
          notepad.addEventListener("keydown", async (e) => {
            if (e.ctrlKey && e.keyCode === 13) {
              e.preventDefault();
              throttle(sendData, 500);
            }
          });

          let send = action.querySelector(".send-button");
          send.addEventListener("click", () => throttle(sendData, 500));
          break;
        }
        case "content": {
          let container = action.querySelector(".content-container");
          container.classList.remove("spin");

          container.querySelector(".waiting-for-link")?.remove();

          let pre = document.createElement("pre");
          let copyButton = document.createElement("button");
          let code = document.createElement("code");
          copyButton.classList.add("copy-button");
          copyButton.innerText = "Copy";
          copyButton.addEventListener("click", async () => {
            await navigator.clipboard.writeText(data["data"]);
            showToast(".action", "Copied to clipboard!");
          });
          pre.append(copyButton);
          pre.append(code);
          container.append(pre);
          code.textContent = data["data"];
          hljs.highlightElement(code);
          break;
        }
        case "code-not-found": {
          cleanErrors();
          let elem = getTemplate("code-not-found");
          action.appendChild(elem);
          action.querySelector(".code").innerText = data["code"];
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
      } else {
        appState.token = undefined;
        const tokenElem = action.querySelector(".token");
        if (tokenElem) {
          tokenElem.value = "CONNECTING...";
        }
      }

      ws = null;
      console.log("🟡 Reconnection in 1 second.", e.reason);
      setTimeout(async () => {
        await connect();
      }, 1000);
    });

    ws.addEventListener("error", (e) => {
      reject(ws);
      console.error("🔴 Socket error: ", e.message);
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

async function makeQR(token) {
  if (!token) {
    console.log("No token found...");
    return;
  }

  let center = document.createElement("div");
  let container = document.createElement("div");
  container.classList.add("qr-container");
  center.classList.add("center");

  qr = document.createElement("qr-code");
  qr.setAttribute("id", "qr");
  qr.setAttribute("contents", token);
  qr.setAttribute("module-color", "black");
  qr.setAttribute("position-ring-color", "black");
  qr.setAttribute("position-center-color", "black");
  qr.setAttribute("mask-x-to-y-ratio", "1");
  qr.setAttribute("squares", "false");
  qr.setAttribute(
    "style",
    `
        background-color: #fff;
        margin: 0;
        width: 100%;
        height: 100%;
    `
  );
  container.append(qr);
  center.append(container);
  action.append(center);

  // let interval;
  qr.addEventListener("codeRendered", () => {
    qr.animateQRCode("FadeInCenterOut");
    // clearInterval(interval);
    // interval = setInterval(() => qr.animateQRCode('RadialRipple'), 5000);
  });

  // show code
  let elem = getTemplate("copy-code");
  action.appendChild(elem);
  let tokenElem = action.querySelector(".token");
  tokenElem.value = token;
  let submit = action.querySelector(".go-button");
  let input = action.querySelector(".code-input");

  async function copyText(e) {
    e.preventDefault();
    console.log(`Copying ${token} to clipboard`);
    await navigator.clipboard.writeText(token);
    showToast(".action", "Copied to clipboard!");
    tokenElem.focus();
    tokenElem.select();
    tokenElem.setSelectionRange(0, tokenElem.value.length);
  }

  async function callback(token) {
    if (token === appState.token) {
      cleanErrors();
      action.appendChild(getTemplate("this-is-your-code"));
      return;
    }
    console.log("Sending pair request", ws);
    await ws.send(
      JSON.stringify({
        "@type": "pair",
        target: token,
      })
    );
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

  let scanner = document.createElement("video");
  scanner.classList.add("scanner");

  let qrScanner;
  try {
    qrScanner = new QrScanner(
      scanner,
      async (result) => {
        console.log("decoded qr code: ", result);
        await callback(result["data"]); // scanned token
      },
      {
        returnDetailedScanResult: true,
        highlightScanRegion: true,
        highlightCodeOutline: true,
      }
    );

    await qrScanner.start();
    center.append(scanner);
  } catch (e) {
    let info = document.createElement("p");
    info.classList.add("error");
    info.innerText = `Camera unavailable: ${e}`;
    action.append(info);
    scanner.remove();
    qrScanner?.stop();
    qrScanner?.destroy();
  }

  action
    .querySelector(".copy-button")
    .addEventListener("click", copyText, false);
  tokenElem.addEventListener("click", copyText);
  return qr;
}

connect();
