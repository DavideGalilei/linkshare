FROM python:3.10-alpine
ENV PYTHONUNBUFFERED=1

ENV PYTHONFAULTHANDLER=1 \
  PYTHONUNBUFFERED=1 \
  PYTHONHASHSEED=random \
  PIP_NO_CACHE_DIR=off \
  PIP_DISABLE_PIP_VERSION_CHECK=on \
  PIP_DEFAULT_TIMEOUT=100

RUN apk add --no-cache curl
RUN curl -sSL https://install.python-poetry.org | python -
ENV PATH "${PATH}:/root/.local/bin"

WORKDIR /code
COPY pyproject.toml /code/
COPY poetry.lock /code/
RUN poetry config virtualenvs.create false
RUN poetry install --no-dev --no-interaction --no-ansi --no-cache

EXPOSE 80

COPY . /code/

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "80", "--proxy-headers", "--forwarded-allow-ips", "*"]
