import secrets
import string
from dataclasses import dataclass

from fastapi import FastAPI, WebSocket
from loguru import logger
from starlette.staticfiles import StaticFiles
from starlette.config import Config
from starlette.websockets import WebSocketDisconnect

config = Config(".env")

ENVIRONMENT = config("ENVIRONMENT")
SHOW_DOCS_ENVIRONMENT = ("local", "staging")

app_configs = {}
if ENVIRONMENT not in SHOW_DOCS_ENVIRONMENT:
    app_configs["openapi_url"] = None
    app_configs["docs_url"] = None
    app_configs["redoc_url"] = None
    app_configs[" swagger_ui_oauth2_redirect_url"] = None

app = FastAPI(
    title="LinkShare",
    **app_configs,
)


def generate_token(length: int = 5) -> str:
    return "".join(
        secrets.choice(string.ascii_uppercase + string.digits) for i in range(length)
    )


@dataclass(init=True, repr=True)
class Client:
    conn: WebSocket
    state: int = 0
    received: bool = False


connections: dict[str, Client] = {}


@app.websocket("/ws/new")
async def new(ws: WebSocket):
    while (token := generate_token(length=5)) in connections:
        pass

    other = None

    try:
        await ws.accept()
        logger.info("Client connected")
        connections[token] = Client(conn=ws, state=0)

        logger.info("Generated token: {token}", token=token)
        await ws.send_json(
            {
                "@type": "refresh",
                "token": token,
            }
        )

        while True:
            data = await ws.receive_json()
            if "@type" not in data:
                logger.warning("Client sent invalid data: missing @type")
                await ws.send_json({"@type": "disconnect"})
                await ws.close()
                return

            # logger.info("Received data: {data}", data=data)

            match data["@type"]:
                case "pair":
                    logger.info("Scanned token and connected")
                    target = data["target"]
                    if not isinstance(target, str):
                        logger.warning("Client sent invalid target: not a str")
                        await ws.close()
                        return

                    if target not in connections:
                        logger.warning("Client sent invalid data: target not found")
                        await ws.send_json({
                            "@type": "code-not-found",
                            "code": target,
                        })
                        continue

                    if target == token:
                        logger.warning("Client sent itself its own token")
                        continue

                    other = connections[target]
                    await other.conn.send_json(
                        {
                            "@type": "connected",
                        }
                    )
                    await ws.send_json(
                        {
                            "@type": "pair-completed",
                        }
                    )
                    other.received = False
                case "content":
                    other.received = True
                    await other.conn.send_json(
                        {
                            "@type": "content",
                            "data": data["content"],
                        }
                    )
                case "state":
                    connections[token].state = int(data["state"])

                    match data["state"]:
                        case 0:  # Receive
                            # User changed state, disconnect matching connection
                            try:
                                if other is not None:
                                    await other.conn.close()
                            except Exception as e:
                                logger.error("Ignoring", e)
                        case 1:  # Send
                            ...
                case unknown:
                    logger.info("Unknown type received: {unknown}", unknown=unknown)
    except WebSocketDisconnect:
        logger.info("Client disconnected")
    finally:
        try:
            if other is not None and other.state == 0 and not other.received:
                await other.conn.close()
        except Exception as e:
            logger.error("Ignoring", e)
        connections.pop(token, None)


# IMPORTANT: keep this mount here
# https://github.com/tiangolo/fastapi/issues/5939#issuecomment-1410052176
# https://fastapi.tiangolo.com/tutorial/path-params/?h=order+matters#order-matters
app.mount("/", StaticFiles(directory="static", html=True), name="static")
