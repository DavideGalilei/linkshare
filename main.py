from collections import defaultdict
import secrets
import string
from dataclasses import dataclass
from uuid import UUID, uuid4

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


Token = str


class Rendezvous:
    def __init__(self, uuid: UUID):
        self.uuid = uuid
        self.streams: dict[Token, Client] = {}
        rendezvous_nodes[uuid] = self

    async def add(self, client: "Client"):
        client.rendezvous = self
        self.streams[client.token] = client
        logger.info(
            "Rendezvous {uuid} has {n} streams",
            uuid=self.uuid,
            n=len(self.streams),
        )

    async def broadcast(self, data: dict):
        for client in self.streams.values():
            try:
                await client.conn.send_json(data)
            except Exception as e:
                logger.error("Disposing bad client", e)
                await self.dispose(client)

    async def dispose(self, client: "Client"):
        client.rendezvous = None
        self.streams.pop(client, None)
        if not self.streams:
            rendezvous_nodes.pop(self.uuid, None)
            logger.info("Rendezvous {uuid} disposed", uuid=self.uuid)
        else:
            logger.info(
                "Rendezvous {uuid} has {n} streams",
                uuid=self.uuid,
                n=len(self.streams),
            )

        try:
            await client.conn.send_json({"@type": "disconnected"})
            await client.conn.close()
        except Exception as e:
            logger.error("Ignoring {e}", e)

        # If there is only one stream left, dispose it too
        if len(self.streams) == 1:
            for client in self.streams.values():
                await self.dispose(client)


@dataclass(init=True, repr=True)
class Client:
    conn: WebSocket
    token: Token
    received: bool = False
    rendezvous: Rendezvous = None

    def __hash__(self):
        return hash(self.token)


rendezvous_nodes: dict[UUID, Rendezvous] = {}
connections: defaultdict[Token, Client] = {}


@app.websocket("/ws/new")
async def new(ws: WebSocket):
    for _ in range(10):
        token = generate_token()
        if token not in connections:
            break
    else:
        await ws.close(reason="Failed to generate token")
        logger.error("Failed to generate token")
        return

    try:
        await ws.accept()
        logger.info("Client connected")
        this = Client(conn=ws, token=token)
        connections[token] = this

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
                        await ws.send_json(
                            {
                                "@type": "code-not-found",
                                "code": target,
                            }
                        )
                        continue

                    if target == token:
                        logger.warning("Client sent itself its own token")
                        continue

                    other = connections[target]
                    if other.rendezvous:
                        await other.rendezvous.add(this)
                    else:
                        this.rendezvous = Rendezvous(uuid=uuid4())
                        await this.rendezvous.add(this)
                        await this.rendezvous.add(other)
                        await other.conn.send_json({"@type": "connected"})

                    await ws.send_json({"@type": "connected"})
                case "content":
                    await this.rendezvous.broadcast(
                        {
                            "@type": "content",
                            "data": data["content"],
                        }
                    )
                case unknown:
                    logger.info("Unknown type received: {unknown}", unknown=unknown)
    except WebSocketDisconnect:
        logger.info("Client disconnected")
    finally:
        try:
            if this.rendezvous:
                await this.rendezvous.dispose(this)
            await this.conn.close()
        except Exception as e:
            logger.error("Ignoring {e}", e)
        connections.pop(token, None)


# IMPORTANT: keep this mount here
# https://github.com/tiangolo/fastapi/issues/5939#issuecomment-1410052176
# https://fastapi.tiangolo.com/tutorial/path-params/?h=order+matters#order-matters
app.mount("/", StaticFiles(directory="static", html=True), name="static")
